import { makeElement } from '../../common/dom.js';
import { makeKernGroupCharChips } from '../../pages/kerning.js';
import settingsMap from '../../pages/settings_data.js';
import { copyShapesFromTo } from '../../project_editor/actions.js';
import { makeArrow, makeThumbnail } from './item_table.js';
import {
	copyGlyphForTransfer,
	copyKernGroupForTransfer,
	describeEmScaling,
	emRatioBetween,
	ensureItem,
} from './transfer.js';

/**
	THE FIVE ACTIONS
	----------------
	Each action is data: what it is called, what it does in a sentence, which
	options it offers, which rows it lists, and one function that does the
	work. The page reads these and builds the same screen five times over.

	They used to be five files that each rebuilt the page by hand - the same
	row builder, the same toggle-all, the same guard, the same history
	bracket - and each copy had drifted from the others by a little. One shape
	means one place to be right.

	Two rules every action here follows:

	- Everything it writes lands between the destination's own history pre-
	  and post-state, so one Undo in the destination takes all of it back.
	- Nothing it reads from the source is handed over live: items go through
	  copy*ForTransfer, which breaks every shared reference.
 */

/**
 * @typedef {Object} ActionContext
 * @property {Object} source - the ProjectEditor items come from
 * @property {Object} destination - the ProjectEditor items go to
 * @property {Object|String|false} range - a CharacterRange, 'Ligatures',
 *     'Components' or 'Kern groups'
 * @property {Object} options - {id: Boolean} of the ticked options
 */

/**
 * @typedef {Object} ActionResult
 * @property {Number} count - how many items were written
 * @property {String} noun - what they were, singular
 * @property {Number=} skipped - how many were left alone, and why in `reason`
 * @property {String=} reason - shown after the count when items were skipped
 */

/** The em-scaling option, shared by the three actions that move outlines. */
function scaleOption(context) {
	const ratio = emRatioBetween(context.source.project, context.destination.project);
	if (ratio === 1) return [];
	return [
		{
			id: 'scale',
			label: 'Scale to the destination em',
			hint: describeEmScaling(context.source.project, context.destination.project),
		},
	];
}

const reverseOption = {
	id: 'reverseWindings',
	label: 'Reverse fill direction',
	hint: 'Turns every contour the other way round. Use it when a copied glyph comes out as a hole.',
};

/**
 * The ids in the chosen range, as the source project has them.
 * @param {ActionContext} context
 * @returns {Array<String>}
 */
function idsInRange(context) {
	const project = context.source.project;
	if (context.range === 'Ligatures') return Object.keys(project.ligatures);
	if (context.range === 'Components') return Object.keys(project.components);
	if (context.range === 'Kern groups') return Object.keys(project.kerning);
	if (context.range && typeof context.range.getMemberIDs === 'function') {
		return context.range.getMemberIDs().map((id) => `glyph-${id}`);
	}
	return [];
}

/**
 * Rows for a glyph-like table: name, id, source thumbnail, arrow, destination.
 * @param {ActionContext} context
 * @returns {Array<Object>}
 */
function glyphRows(context) {
	return idsInRange(context)
		.map((id) => {
			const sourceItem = context.source.project.getItem(id);
			if (!sourceItem) return false;
			const destinationItem = context.destination.project.getItem(id);
			return {
				id: id,
				name: `Select ${sourceItem.name}`,
				cells: [
					sourceItem.name,
					id,
					makeThumbnail(context.source.project, sourceItem),
					makeArrow(),
					makeThumbnail(context.destination.project, destinationItem),
				],
			};
		})
		.filter(Boolean);
}

const glyphColumns = [
	{ label: 'Name', track: 'minmax(0, 1fr)', className: 'cross-project__name' },
	{ label: 'ID', track: 'minmax(96px, max-content)', className: 'cross-project__id' },
	{
		label: 'Source',
		track: 'minmax(var(--tool-size), max-content)',
		className: 'cross-project__glyph',
	},
	{ label: '', track: 'var(--icon-size)' },
	{
		label: 'Destination',
		track: 'minmax(var(--tool-size), max-content)',
		className: 'cross-project__glyph',
	},
];

/**
 * Brackets a write in the destination's history and runs it.
 * @param {ActionContext} context
 * @param {String} title - history title
 * @param {Function} work - does the writing
 */
function inDestinationHistory(context, title, work) {
	const from = context.source.project.settings.project.name;
	context.destination.history.addWholeProjectChangePreState(`${title} from ${from}`);
	work();
	context.destination.history.addWholeProjectChangePostState();
}

// --------------------------------------------------------------
// 1. Copy shapes
// --------------------------------------------------------------

const copyShapes = {
	id: 'copy-shapes',
	label: 'Copy shapes',
	icon: 'pastePathsFromAnotherProject',
	verb: 'Copy shapes into',
	noun: 'item',
	destructive: false,
	ranges: { ligatures: true },
	describe: () =>
		'Adds a copy of every path in each selected item to the same item in the destination. Component links are resolved to plain paths on the way. What the destination already has stays.',
	options: (context) => [
		...scaleOption(context),
		{
			id: 'keepRSB',
			label: 'Keep the right sidebearing',
			hint: 'Widens or narrows the advance so the space after the glyph stays what it was.',
		},
		reverseOption,
	],
	columns: glyphColumns,
	rows: glyphRows,
	emptyMessage: 'Nothing in this range exists in the source project.',
	run: (context, ids) => {
		const ratio = emRatioBetween(context.source.project, context.destination.project);
		inDestinationHistory(context, `Copied shapes from ${ids.length} items`, () => {
			ids.forEach((id) => {
				const sourceItem = context.source.project.getItem(id);
				if (!sourceItem) return;
				const copy = copyGlyphForTransfer(sourceItem, {
					emRatio: ratio,
					scale: !!context.options.scale,
					reverseWindings: !!context.options.reverseWindings,
				});
				const existed = !!context.destination.project.getItem(id);
				const destinationItem = ensureItem(context.destination.project, id);
				const oldRSB = destinationItem.rightSideBearing;
				copyShapesFromTo(copy, destinationItem);
				if (!existed) {
					// A slot that did not exist has no width of its own to keep,
					// so it takes the source's - scaled with the paths.
					destinationItem.advanceWidth = copy.advanceWidth;
				} else if (context.options.keepRSB) {
					destinationItem.rightSideBearing = oldRSB;
				}
			});
		});
		return { count: ids.length, noun: 'item' };
	},
};

// --------------------------------------------------------------
// 2. Overwrite items
// --------------------------------------------------------------

const overwriteItems = {
	id: 'overwrite-items',
	label: 'Overwrite items',
	icon: 'paste',
	verb: 'Overwrite',
	noun: 'item',
	destructive: true,
	ranges: { ligatures: true, components: true },
	describe: () =>
		'Replaces each selected item in the destination with a copy of the source item — paths, advance width, everything. An item the destination does not have yet is created.',
	options: (context) => [...scaleOption(context), reverseOption],
	columns: glyphColumns,
	rows: glyphRows,
	emptyMessage: 'Nothing in this range exists in the source project.',
	run: (context, ids) => {
		const ratio = emRatioBetween(context.source.project, context.destination.project);
		inDestinationHistory(context, `Overwrote ${ids.length} items`, () => {
			ids.forEach((id) => {
				const sourceItem = context.source.project.getItem(id);
				if (!sourceItem) return;
				const copy = copyGlyphForTransfer(sourceItem, {
					emRatio: ratio,
					scale: !!context.options.scale,
					reverseWindings: !!context.options.reverseWindings,
				});
				/*
					The destination's own usedIn is kept: it records where
					*this* project uses the item, which overwriting the outline
					does not change.
				*/
				const existing = context.destination.project.getItem(id);
				if (existing) copy.usedIn = [...existing.usedIn];
				context.destination.project.addItemByType(copy, sourceItem.objType, id);
			});
		});
		return { count: ids.length, noun: 'item' };
	},
};

// --------------------------------------------------------------
// 3. Add components
// --------------------------------------------------------------

const addComponents = {
	id: 'add-components',
	label: 'Add components',
	icon: 'addComponentInstance',
	verb: 'Add',
	noun: 'component',
	destructive: false,
	ranges: false,
	describe: () =>
		'Adds a copy of each selected component root to the destination as a new component, with a new ID, so nothing already there is touched. Instances that used it in the source are not carried over.',
	options: (context) => [...scaleOption(context), reverseOption],
	columns: [
		{ label: 'Name', track: 'minmax(0, 1fr)', className: 'cross-project__name' },
		{ label: 'Source ID', track: 'minmax(96px, max-content)', className: 'cross-project__id' },
		{
			label: 'Source',
			track: 'minmax(var(--tool-size), max-content)',
			className: 'cross-project__glyph',
		},
	],
	rows: (context) =>
		Object.keys(context.source.project.components).map((id) => {
			const item = context.source.project.getItem(id);
			return {
				id: id,
				name: `Select ${item.name}`,
				cells: [item.name, id, makeThumbnail(context.source.project, item)],
			};
		}),
	emptyMessage: 'The source project has no components.',
	run: (context, ids) => {
		const ratio = emRatioBetween(context.source.project, context.destination.project);
		inDestinationHistory(context, `Added ${ids.length} components`, () => {
			ids.forEach((id) => {
				const sourceItem = context.source.project.getItem(id);
				if (!sourceItem) return;
				const copy = copyGlyphForTransfer(sourceItem, {
					emRatio: ratio,
					scale: !!context.options.scale,
					reverseWindings: !!context.options.reverseWindings,
				});
				// No id: the destination counts one in its own table.
				context.destination.project.addItemByType(copy, 'Component');
			});
		});
		return { count: ids.length, noun: 'component' };
	},
};

// --------------------------------------------------------------
// 4. Add kern groups
// --------------------------------------------------------------

/**
 * Whether the destination already has a group with these members.
 * @param {Object} project - destination project
 * @param {Object} group - a KernGroup
 * @returns {Boolean}
 */
function destinationHasGroup(project, group) {
	const key = (members) => [...members].sort().join(',');
	const left = key(group.leftGroup);
	const right = key(group.rightGroup);
	return Object.values(project.kerning).some(
		(other) => key(other.leftGroup) === left && key(other.rightGroup) === right
	);
}

const addKernGroups = {
	id: 'add-kern-groups',
	label: 'Add kern groups',
	icon: 'createNewKernGroup',
	verb: 'Add',
	noun: 'kern group',
	destructive: false,
	ranges: false,
	describe: () =>
		'Adds a copy of each selected kern group to the destination as a new group. A group the destination already has, with the same members on both sides, is left as it is.',
	options: (context) => scaleOption(context),
	columns: [
		{ label: 'Members', track: 'minmax(0, 1fr)' },
		{ label: 'ID', track: 'minmax(80px, max-content)', className: 'cross-project__id' },
		{ label: 'Value', track: '72px', className: 'cross-project__value' },
	],
	rows: (context) =>
		Object.keys(context.source.project.kerning).map((id) => {
			const group = context.source.project.getItem(id);
			const members = makeElement({ className: 'cross-project__members' });
			members.appendChild(makeKernGroupCharChips(group.leftGroup, context.source.project));
			members.appendChild(
				makeElement({ tag: 'span', className: 'cross-project__members-divider', content: '·' })
			);
			members.appendChild(makeKernGroupCharChips(group.rightGroup, context.source.project));
			return {
				id: id,
				name: `Select kern group ${id}`,
				cells: [members, id, `${group.value}`],
			};
		}),
	emptyMessage: 'The source project has no kern groups.',
	run: (context, ids) => {
		const ratio = emRatioBetween(context.source.project, context.destination.project);
		let added = 0;
		let skipped = 0;
		inDestinationHistory(context, `Added kern groups`, () => {
			ids.forEach((id) => {
				const group = context.source.project.getItem(id);
				if (!group) return;
				if (destinationHasGroup(context.destination.project, group)) {
					skipped++;
					return;
				}
				const copy = copyKernGroupForTransfer(group, {
					emRatio: ratio,
					scale: !!context.options.scale,
				});
				context.destination.project.addItemByType(copy, 'KernGroup');
				added++;
			});
		});
		return {
			count: added,
			noun: 'kern group',
			skipped: skipped,
			reason: 'already in the destination with the same members',
		};
	},
};

// --------------------------------------------------------------
// 5. Overwrite settings
// --------------------------------------------------------------

/** Which settings can be carried across, in the order they are listed. */
const TRANSFERABLE_SETTINGS = [
	['project', 'name'],
	['font', 'family'],
	['font', 'style'],
	['font', 'version'],
	['font', 'description'],
	['font', 'panose'],
	['font', 'upm'],
	['font', 'ascent'],
	['font', 'descent'],
	['font', 'capHeight'],
	['font', 'xHeight'],
	['font', 'overshoot'],
	['font', 'lineGap'],
	['font', 'weight'],
	['font', 'italicAngle'],
	['font', 'designer'],
	['font', 'designerURL'],
	['font', 'manufacturer'],
	['font', 'manufacturerURL'],
	['font', 'license'],
	['font', 'licenseURL'],
	['font', 'copyright'],
	['font', 'trademark'],
	['font', 'variant'],
	['font', 'stretch'],
	['font', 'stemv'],
	['font', 'stemh'],
	['font', 'slope'],
	['font', 'underlinePosition'],
	['font', 'underlineThickness'],
	['font', 'strikethroughPosition'],
	['font', 'strikethroughThickness'],
	['font', 'overlinePosition'],
	['font', 'overlineThickness'],
	['app', 'stopPageNavigation'],
	['app', 'formatSaveFile'],
	['app', 'saveLivePreviews'],
	['app', 'autoSave'],
	['app', 'unlinkComponentInstances'],
	['app', 'showNonCharPoints'],
	['app', 'itemChooserPageSize'],
	['app', 'previewText'],
	['app', 'exportLigatures'],
	['app', 'exportKerning'],
	['app', 'moveShapesOnSVGDragDrop'],
	['app', 'autoSideBearingsOnSVGDragDrop'],
	['app', 'autoRightBearingOnFirstShape'],
];

/**
 * A setting's value, written the way the Settings page would show it.
 * @param {*} value
 * @returns {String}
 */
function showValue(value) {
	if (value === true) return 'on';
	if (value === false) return 'off';
	if (value === '' || value === undefined || value === null) return '—';
	return String(value);
}

const overwriteSettings = {
	id: 'overwrite-settings',
	label: 'Overwrite settings',
	icon: 'settings',
	verb: 'Overwrite',
	noun: 'setting',
	destructive: true,
	ranges: false,
	describe: () =>
		'Copies the value of each selected setting from the source over the destination’s. Only settings whose values differ are listed.',
	options: () => [],
	columns: [
		{ label: 'Setting', track: 'minmax(0, 1fr)', className: 'cross-project__name' },
		{ label: 'Source', track: 'minmax(0, 1fr)', className: 'cross-project__value' },
		{ label: 'Destination', track: 'minmax(0, 1fr)', className: 'cross-project__value' },
	],
	rows: (context) =>
		TRANSFERABLE_SETTINGS.map(([group, key]) => {
			const from = context.source.project.settings[group][key];
			const to = context.destination.project.settings[group][key];
			if (JSON.stringify(from) === JSON.stringify(to)) return false;
			const label = settingsMap[group]?.[key]?.label || `${group} / ${key}`;
			return {
				id: `${group}.${key}`,
				name: `Select ${label}`,
				cells: [label, showValue(from), showValue(to)],
			};
		}).filter(Boolean),
	emptyMessage: 'Every setting already has the same value in both projects.',
	run: (context, ids) => {
		inDestinationHistory(context, `Overwrote ${ids.length} settings`, () => {
			ids.forEach((id) => {
				const [group, key] = id.split('.');
				if (!(group in context.destination.project.settings)) return;
				const value = context.source.project.settings[group][key];
				context.destination.project.settings[group][key] = JSON.parse(JSON.stringify(value));
			});
		});
		return { count: ids.length, noun: 'setting' };
	},
};

/** In the order they are offered. */
export const crossProjectActions = [
	copyShapes,
	overwriteItems,
	addComponents,
	addKernGroups,
	overwriteSettings,
];

/**
 * @param {String} id - action id
 * @returns {Object|undefined}
 */
export function getCrossProjectAction(id) {
	return crossProjectActions.find((action) => action.id === id);
}
