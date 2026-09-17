import { getCurrentProject, getCurrentProjectEditor } from '../../app/main.js';
import { addAsChildren, makeElement } from '../../common/dom.js';
import { keyLabel } from '../../common/keyboard.js';
import { cycleThemePreference } from '../../common/theme.js';
import { showAtlasExportDialog } from '../../formats_io/atlas/atlas_export.js';
import { refreshEditToolsArea } from '../../edit_canvas/tools/tools.js';
import { showComposeDialog } from '../../anchors/compose_dialog.js';
import { applyAllMetricKeys } from '../../metrics/apply_keys.js';
import { showIconImportDialog, showIconMapDialog } from '../../icon_font/icon_dialogs.js';
import { getPixelMode } from '../../pixel_font/pixel_grid.js';
import { arePanelsHidden, setPanelsHidden } from '../../panels/sidebar.js';
import { addCommonLigaturesToProject } from '../../pages/ligatures.js';
import {
	ioFont_exportOTF,
	ioFont_exportTTF,
	ioFont_exportWOFF2,
} from '../../formats_io/otf/font_export.js';
import { makeActionButtonIcon } from '../../panels/action_buttons.js';
import { dropDuplicateLabels, getActionLabel } from '../../panels/action_labels.js';
import { getActionData } from '../../panels/actions.js';
import { closeEveryTypeOfDialog, showToast } from '../dialogs/dialogs.js';

/**
	COMMAND PALETTE
	---------------
	One place to reach everything, by typing.

	This app has more than forty commands, and until now every one of them
	lived only as a small unlabelled icon in a panel grid. You could not find
	"subtract shapes" unless you already knew which of those icons it was, and
	you could not jump to a glyph without going through two dropdowns.

	Commands come from the same `getActionData` groups the action buttons and
	the context menu use, so there is still one definition of what each command
	does. Glyphs, ligatures, components and pages are indexed too, which is the
	part that matters most day to day: in a font with a few hundred glyphs,
	typing the character you want beats scrolling for it.
 */

const MAX_RESULTS = 40;

/** @type {Element | false} - the palette element while it is open */
let paletteElement = false;

/** @type {Array} - commands matching the current query, in display order */
let visibleCommands = [];

/** @type {Number} - index into visibleCommands */
let activeIndex = 0;

// --------------------------------------------------------------
// Matching
// --------------------------------------------------------------

/**
 * Scores a command against a query.
 *
 * Subsequence matching rather than substring: "sbtr" finds "Subtract", and
 * "flh" finds "Flip Horizontal". Consecutive and word-initial matches score
 * higher so the obvious answer floats to the top.
 *
 * @param {String} text - the command's searchable text
 * @param {String} query - lowercase query
 * @returns {Number} - score, or -1 when it does not match at all
 */
function scoreMatch(text, query) {
	if (!query) return 0;

	const haystack = text.toLowerCase();
	if (haystack === query) return 1000;
	if (haystack.startsWith(query)) return 500 + (100 - Math.min(100, haystack.length));

	const directIndex = haystack.indexOf(query);
	if (directIndex > -1) return 300 - directIndex;

	// Subsequence walk
	let score = 0;
	let textIndex = 0;
	let lastMatchIndex = -2;

	for (let i = 0; i < query.length; i++) {
		const found = haystack.indexOf(query[i], textIndex);
		if (found === -1) return -1;

		if (found === lastMatchIndex + 1) score += 8;
		else score += 1;
		// Matching the start of a word is a strong signal.
		if (found === 0 || haystack[found - 1] === ' ') score += 6;

		lastMatchIndex = found;
		textIndex = found + 1;
	}

	return score;
}

// --------------------------------------------------------------
// Command sources
// --------------------------------------------------------------

/**
 * Commands built from an action group.
 * @param {String} groupName - a group name understood by getActionData
 * @param {String} category - which section of the palette these land in
 * @returns {Array}
 */
function commandsFromActionGroup(groupName, category) {
	let actions = getActionData(groupName);
	if (!Array.isArray(actions)) return [];

	return actions
		.filter((action) => action?.onClick && action?.title)
		.map((action) => {
			const iconMaker = makeActionButtonIcon[action.iconName];
			return {
				name: getActionLabel(action),
				category: category,
				iconMarkup: iconMaker ? iconMaker(action.iconOptions) : '',
				disabled: !!action.disabled,
				run: action.onClick,
			};
		})
		.filter((command) => !!command.name);
}

/**
 * Every command available right now, given the current page and selection.
 * @returns {Array}
 */
function collectCommands() {
	const editor = getCurrentProjectEditor();
	const project = editor.project;
	const onCanvasPage = editor.nav.isOnEditCanvasPage;
	const shapeCount = editor.multiSelect.shapes.length;
	const pointCount = editor.multiSelect.points.length;

	/** @type {Array} */
	let commands = [];

	// ---- Editing actions, scoped to what is selected ----
	if (onCanvasPage && editor.selectedItemID) {
		commands = commands.concat(commandsFromActionGroup('allActions', 'Edit'));
		if (pointCount) commands = commands.concat(commandsFromActionGroup('pointActions', 'Point'));
		if (shapeCount) {
			commands = commands.concat(commandsFromActionGroup('shapeActions', 'Shape'));
			commands = commands.concat(commandsFromActionGroup('layerActions', 'Arrange'));
			commands = commands.concat(commandsFromActionGroup('alignShapeActions', 'Align'));
		}
		if (shapeCount > 1)
			commands = commands.concat(commandsFromActionGroup('boolActions', 'Combine'));
		commands = commands.concat(commandsFromActionGroup('glyphActions', 'Glyph'));

		// Groups overlap - Copy is both a universal and a shape action - so the
		// first, most general occurrence of each label wins.
		commands = dropDuplicateLabels(commands);
	}

	// ---- Pages ----
	const toc = editor.nav.tableOfContents;
	Object.keys(toc).forEach((pageName) => {
		if (!toc[pageName]?.pageMaker) return;
		commands.push({
			name: `Go to ${pageName}`,
			category: 'Navigate',
			disabled: editor.nav.page === pageName,
			run: () => {
				editor.nav.page = pageName;
				editor.navigate();
			},
		});
	});

	// ---- Items: glyphs, ligatures, components ----
	// The single biggest reason to have a palette in a font editor.
	const itemGroups = [
		{ collection: project.glyphs, label: 'Character', page: 'Characters' },
		{ collection: project.ligatures, label: 'Ligature', page: 'Ligatures' },
		{ collection: project.components, label: 'Component', page: 'Components' },
	];

	itemGroups.forEach(({ collection, label, page }) => {
		Object.keys(collection || {}).forEach((id) => {
			const item = collection[id];
			const name = project.getItemName(id, true);
			// The character itself is what people type, so it is part of the
			// searchable text even though the name is what gets displayed.
			const chars = item?.chars || '';
			commands.push({
				name: name,
				searchText: `${name} ${chars} ${id}`,
				category: label,
				detail: chars ? `"${chars}"` : '',
				run: () => {
					editor.nav.page = page;
					editor.selectedItemID = id;
					editor.navigate();
				},
			});
		});
	});

	// ---- App-level ----
	commands.push(
		{
			name: 'Save project file',
			category: 'File',
			shortcut: ['Ctrl', 'S'],
			run: () => editor.saveProjectFile(),
		},
		{
			name: 'Save a copy of this project file',
			category: 'File',
			run: () => editor.saveProjectFile(true),
		},
		{ name: 'Export OTF file', category: 'File', shortcut: ['Ctrl', 'E'], run: ioFont_exportOTF },
		{ name: 'Export TTF file', category: 'File', run: ioFont_exportTTF },
		{ name: 'Export WOFF2 file', category: 'File', run: ioFont_exportWOFF2 },
		{
			name: 'Export font atlas',
			category: 'File',
			searchText:
				'Export font atlas bitmap MSDF BMFont fnt png texture game engine sprite signed distance field unity textmeshpro godot',
			run: showAtlasExportDialog,
		},
		{
			name: 'Update all metric keys',
			category: 'Edit',
			searchText: 'update metric keys sidebearings spacing linked metrics respace sync bearings',
			run: () => {
				const project = getCurrentProject();
				editor.history.addWholeProjectChangePreState('Update all metric keys');
				const result = applyAllMetricKeys(project);

				if (!result.updated.length) {
					showToast(
						result.unchanged.length
							? `All ${result.unchanged.length} keyed glyphs already agree.`
							: 'No metric keys in this project yet.'
					);
					return;
				}

				editor.history.addWholeProjectChangePostState();
				editor.publish('currentItem', editor.selectedItem);
				showToast(
					`Re-spaced ${result.updated.length} glyph${result.updated.length === 1 ? '' : 's'}` +
						(result.failed.length ? `<br>${result.failed.length} could not be resolved` : '')
				);
			},
		},
		{
			name: 'Compose accented characters',
			category: 'Edit',
			searchText:
				'compose accented characters diacritics accents anchors marks build umlaut acute grave circumflex tilde cedilla latin extended',
			run: showComposeDialog,
		},
		{
			name: 'Add the common Latin ligatures',
			category: 'Edit',
			searchText:
				'add common latin ligatures ae oe fi fl ff ffi ffl st multi-character sprite glyph substitution',
			run: addCommonLigaturesToProject,
		},
		{
			name: 'Import SVG icons',
			category: 'File',
			searchText: 'import svg icons icon font private use area PUA glyph set ui symbols game hud',
			run: showIconImportDialog,
		},
		{
			name: 'Export icon names',
			category: 'File',
			searchText: 'export icon names map json css code points private use area constants',
			run: showIconMapDialog,
		},
		{
			name: 'Toggle pixel font mode',
			category: 'View',
			searchText: 'pixel font mode bitmap grid retro 8-bit game sprite snap texel low resolution',
			run: () => {
				const project = getCurrentProject();
				const settings = getPixelMode(project);
				settings.enabled = !settings.enabled;
				project.settings.app.pixelMode = settings;

				// The toolbar gains or loses the pixel pen, so it is rebuilt
				// rather than just re-styled.
				refreshEditToolsArea();
				editor.publish('whichToolIsSelected', editor.selectedTool);
				editor.publish('currentItem', editor.selectedItem);
				if (editor.editCanvas) editor.editCanvas.redraw('pixelMode:toggled');

				// A tool that no longer exists cannot stay selected.
				if (!settings.enabled && editor.selectedTool === 'pixelPen') {
					editor.selectedTool = 'resize';
					editor.publish('whichToolIsSelected', 'resize');
					refreshEditToolsArea();
				}

				showToast(
					settings.enabled
						? `Pixel font mode on<br>${settings.pixelsPerEm} pixels per em`
						: 'Pixel font mode off'
				);
			},
		},
		{
			name: 'Switch theme',
			category: 'View',
			run: () => cycleThemePreference(),
		},
		{
			name: arePanelsHidden() ? 'Show panels' : 'Hide panels',
			category: 'View',
			searchText: 'Hide show panels sidebar full screen focus zen',
			shortcut: ['Ctrl', '\\'],
			disabled: !onCanvasPage,
			run: () => setPanelsHidden(),
		},
		{
			name: 'Toggle fill / outline display',
			category: 'View',
			disabled: !onCanvasPage,
			run: () => {
				const settings = project.settings.app;
				settings.canvasDisplayModeFilled = !settings.canvasDisplayModeFilled;
				editor.publish('editCanvasView', editor.view);
			},
		},
		{
			name: 'Keyboard shortcuts',
			category: 'Help',
			shortcut: ['Ctrl', '/'],
			run: () => showKeyboardShortcuts(),
		}
	);

	return commands;
}

// --------------------------------------------------------------
// Rendering
// --------------------------------------------------------------

/**
 * Filters and ranks commands for a query.
 * @param {Array} commands - all available commands
 * @param {String} query - raw query text
 * @returns {Array}
 */
function rankCommands(commands, query) {
	const trimmed = query.trim().toLowerCase();

	if (!trimmed) {
		// With no query, show the actionable things first and leave the long
		// tail of glyph names out - otherwise the list is just the alphabet.
		return commands
			.filter((command) => !['Character', 'Ligature', 'Component'].includes(command.category))
			.slice(0, MAX_RESULTS);
	}

	return commands
		.map((command) => ({
			command: command,
			score: scoreMatch(command.searchText || command.name, trimmed),
		}))
		.filter((entry) => entry.score > -1)
		.sort((a, b) => b.score - a.score)
		.slice(0, MAX_RESULTS)
		.map((entry) => entry.command);
}

/**
 * Draws the result list and keeps the active row in view.
 * @param {Element} list - the results container
 */
function renderResults(list) {
	list.innerHTML = '';

	if (!visibleCommands.length) {
		list.appendChild(
			makeElement({ className: 'command-palette__empty', content: 'No matching commands' })
		);
		return;
	}

	let lastCategory = '';

	visibleCommands.forEach((command, index) => {
		if (command.category && command.category !== lastCategory) {
			list.appendChild(
				makeElement({ className: 'command-palette__group', content: command.category })
			);
			lastCategory = command.category;
		}

		const row = makeElement({
			tag: 'div',
			className: 'command-palette__row',
			attributes: { role: 'option', 'data-index': String(index) },
		});
		if (index === activeIndex) row.setAttribute('active', '');
		if (command.disabled) row.setAttribute('disabled', '');

		row.appendChild(
			makeElement({ className: 'command-palette__row-icon', innerHTML: command.iconMarkup || '' })
		);
		row.appendChild(makeElement({ className: 'command-palette__row-name', content: command.name }));

		/*
			Detail and keys travel together in one cell.

			They used to be two grid columns of their own, and a row with keys
			but no detail still paid for the detail column's gap - so its
			shortcut sat 16px from the row's edge while a row's own padding is
			8. Which is only 8px, but it is the 8px that decides whether the
			cap's corner nests inside the row's or floats near it.
		*/
		const trailing = makeElement({ className: 'command-palette__row-trailing' });
		if (command.detail) {
			trailing.appendChild(
				makeElement({ className: 'command-palette__row-detail', content: command.detail })
			);
		}
		if (command.shortcut) {
			const keys = makeElement({ className: 'command-palette__row-keys' });
			command.shortcut.forEach((key) =>
				keys.appendChild(makeElement({ tag: 'code', content: keyLabel(key) }))
			);
			trailing.appendChild(keys);
		}
		if (trailing.firstChild) row.appendChild(trailing);

		// mousedown rather than click: the input keeps focus, so the palette
		// does not flicker closed on blur before the command runs.
		row.addEventListener('mousedown', (event) => {
			event.preventDefault();
			runCommand(command);
		});
		row.addEventListener('mouseenter', () => {
			activeIndex = index;
			list.querySelectorAll('.command-palette__row').forEach((otherRow) => {
				otherRow.toggleAttribute('active', otherRow === row);
			});
		});

		list.appendChild(row);
	});

	const active = list.querySelector('.command-palette__row[active]');
	if (active) active.scrollIntoView({ block: 'nearest' });
}

/**
 * Runs a command and closes the palette.
 * @param {Object} command - the command to run
 */
function runCommand(command) {
	if (!command || command.disabled) return;
	closeCommandPalette();
	try {
		command.run();
	} catch (error) {
		console.error(`Command "${command.name}" failed:`, error);
	}
}

// --------------------------------------------------------------
// Open / close
// --------------------------------------------------------------

/**
 * Opens the command palette. Safe to call when it is already open.
 */
export function showCommandPalette() {
	if (isCommandPaletteOpen()) return;
	// The element may have been torn out from under us - by a page navigation,
	// or by closeEveryTypeOfDialog - without closeCommandPalette running. Drop
	// the stale reference rather than refusing to open again.
	paletteElement = false;
	closeEveryTypeOfDialog();

	const allCommands = collectCommands();
	visibleCommands = rankCommands(allCommands, '');
	activeIndex = 0;

	const overlay = makeElement({ className: 'command-palette__overlay' });
	const panel = makeElement({
		className: 'command-palette',
		attributes: { role: 'dialog', 'aria-label': 'Command palette', 'aria-modal': 'true' },
	});

	const input = makeElement({
		tag: 'input',
		className: 'command-palette__input',
		attributes: {
			type: 'text',
			placeholder: 'Search commands, characters and pages…',
			spellcheck: 'false',
			autocomplete: 'off',
			'aria-label': 'Search commands',
		},
	});

	const list = makeElement({
		className: 'command-palette__results',
		attributes: { role: 'listbox' },
	});

	const hint = makeElement({
		className: 'command-palette__hint',
		innerHTML: `<span><code>↑</code><code>↓</code> navigate</span><span><code>↵</code> run</span><span><code>esc</code> close</span>`,
	});

	addAsChildren(panel, [input, list, hint]);
	overlay.appendChild(panel);

	input.addEventListener('input', () => {
		// @ts-expect-error - input elements have a value
		visibleCommands = rankCommands(allCommands, input.value);
		activeIndex = 0;
		renderResults(list);
	});

	input.addEventListener('keydown', (/** @type {KeyboardEvent} */ event) => {
		if (event.key === 'ArrowDown' || (event.key === 'n' && event.ctrlKey)) {
			event.preventDefault();
			activeIndex = Math.min(activeIndex + 1, visibleCommands.length - 1);
			renderResults(list);
		} else if (event.key === 'ArrowUp' || (event.key === 'p' && event.ctrlKey)) {
			event.preventDefault();
			activeIndex = Math.max(activeIndex - 1, 0);
			renderResults(list);
		} else if (event.key === 'Enter') {
			event.preventDefault();
			runCommand(visibleCommands[activeIndex]);
		} else if (event.key === 'Escape') {
			event.preventDefault();
			closeCommandPalette();
		}
		// Every other key belongs to the text field.
		event.stopPropagation();
	});

	overlay.addEventListener('mousedown', (event) => {
		if (event.target === overlay) closeCommandPalette();
	});

	document.body.appendChild(overlay);
	paletteElement = overlay;
	renderResults(list);
	input.focus();
}

/**
 * Closes the palette if it is open.
 */
export function closeCommandPalette() {
	if (paletteElement) paletteElement.remove();
	paletteElement = false;
	visibleCommands = [];
	activeIndex = 0;
}

/**
 * Whether the palette is open *and still in the document*.
 *
 * Checking isConnected rather than the reference alone matters: a navigation
 * replaces the whole page, so the element can be gone while the module
 * variable still points at it.
 *
 * @returns {Boolean}
 */
export function isCommandPaletteOpen() {
	return !!paletteElement && paletteElement.isConnected;
}

// --------------------------------------------------------------
// Keyboard shortcut reference
// --------------------------------------------------------------

/**
 * Shortcut reference, grouped the way people look them up.
 *
 * These are documentation of what events_keyboard.js and tools.js bind. They
 * are written by hand and must be updated alongside those - there is not yet
 * a single registry both can read from.
 */
const shortcutReference = [
	{
		group: 'Tools',
		items: [
			['Select and transform', ['V']],
			['Edit path', ['P']],
			['Add path point', ['E']],
			['Pen — new path', ['W']],
			['Rectangle', ['R']],
			['Oval', ['O']],
			['Pan the canvas', ['Space', 'drag']],
		],
	},
	{
		group: 'Canvas',
		items: [
			['Pan', ['scroll']],
			['Pan sideways', ['Shift', 'scroll']],
			['Zoom to pointer', ['Ctrl', 'scroll']],
			['Zoom in / out', ['Ctrl', '+ / −']],
			['Fit to screen', ['Ctrl', '0']],
			['Context menu', ['right click']],
		],
	},
	{
		group: 'Editing',
		items: [
			['Undo', ['Ctrl', 'Z']],
			['Redo', ['Ctrl', 'Y']],
			['Copy', ['Ctrl', 'C']],
			['Paste', ['Ctrl', 'V']],
			['Select all', ['Ctrl', 'A']],
			['Delete selection', ['Del']],
			['Nudge', ['arrow keys']],
			['Reset handles', ['Ctrl', 'R']],
		],
	},
	{
		group: 'Selection',
		items: [
			['Next shape', [']']],
			['Previous shape', ['[']],
			['Add next shape to selection', ['Shift', '}']],
			['Move shape up / down a layer', ['Ctrl', '] / [']],
			['Move shape to the top / bottom', ['Ctrl', 'Shift', '] / [']],
			['Next / previous glyph', ['Ctrl', '. / ,']],
		],
	},
	{
		group: 'App',
		items: [
			['Command palette', ['Ctrl', 'K']],
			['Hide / show panels', ['Ctrl', '\\']],
			['This list', ['Ctrl', '/']],
			['Save project', ['Ctrl', 'S']],
			['Export font', ['Ctrl', 'E']],
			['Close dialogs', ['Esc']],
		],
	},
];

/**
 * Shows the keyboard shortcut reference.
 */
export function showKeyboardShortcuts() {
	closeEveryTypeOfDialog();
	closeCommandPalette();

	const overlay = makeElement({ className: 'command-palette__overlay' });
	const panel = makeElement({
		className: 'command-palette shortcut-sheet',
		attributes: { role: 'dialog', 'aria-label': 'Keyboard shortcuts', tabindex: '-1' },
	});

	const header = makeElement({
		className: 'shortcut-sheet__header',
		innerHTML: `<h2>Keyboard shortcuts</h2><span class="shortcut-sheet__note">Press <code>esc</code> to close</span>`,
	});

	const columns = makeElement({ className: 'shortcut-sheet__columns' });

	shortcutReference.forEach((section) => {
		const group = makeElement({ className: 'shortcut-sheet__group' });
		group.appendChild(makeElement({ tag: 'h3', content: section.group }));

		section.items.forEach(([label, keys]) => {
			const row = makeElement({ className: 'shortcut-sheet__row' });
			row.appendChild(makeElement({ className: 'shortcut-sheet__label', content: String(label) }));
			const keyWrapper = makeElement({ className: 'shortcut-sheet__keys' });
			/** @type {Array} */ (keys).forEach((key) =>
				keyWrapper.appendChild(makeElement({ tag: 'code', content: keyLabel(key) }))
			);
			row.appendChild(keyWrapper);
			group.appendChild(row);
		});

		columns.appendChild(group);
	});

	addAsChildren(panel, [header, columns]);
	overlay.appendChild(panel);

	overlay.addEventListener('mousedown', (event) => {
		if (event.target === overlay) overlay.remove();
	});

	const onKeyDown = (/** @type {KeyboardEvent} */ event) => {
		if (event.key === 'Escape') {
			overlay.remove();
			document.removeEventListener('keydown', onKeyDown, true);
		}
	};
	document.addEventListener('keydown', onKeyDown, true);

	document.body.appendChild(overlay);
	panel.focus();
}

/**
 * Registers the global shortcuts that open these.
 * Called once at app startup.
 */
export function addCommandPaletteListeners() {
	document.addEventListener(
		'keydown',
		(event) => {
			const isModifier = event.metaKey || event.ctrlKey;
			if (!isModifier) return;

			if (event.key === 'k' || event.key === 'K') {
				event.preventDefault();
				event.stopPropagation();
				if (isCommandPaletteOpen()) closeCommandPalette();
				else showCommandPalette();
			}

			if (event.key === '/' || event.key === '?') {
				event.preventDefault();
				event.stopPropagation();
				showKeyboardShortcuts();
			}

			// Ctrl/Cmd + backslash clears the workspace down to the canvas.
			if (event.key === '\\') {
				const editor = getCurrentProjectEditor();
				if (!editor.nav?.isOnEditCanvasPage) return;
				event.preventDefault();
				event.stopPropagation();
				setPanelsHidden();
			}
		},
		// Capture, so the canvas and panel key handlers never see these first.
		true
	);
}
