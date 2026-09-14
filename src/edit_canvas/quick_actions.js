import { getCurrentProjectEditor } from '../app/main.js';
import { addAsChildren, makeElement } from '../common/dom.js';
import { makeLineIcon } from '../common/icons.js';
import { makePopoverButton } from '../controls/menu-button/menu_button.js';
import {
	makeActionsArea_ComponentInstance,
	makeActionsArea_Glyph,
	makeActionsArea_KernGroup,
	makeActionsArea_OtherKernGroups,
	makeActionsArea_Path,
	makeActionsArea_PathPoint,
	makeActionsArea_Universal,
} from '../panels/actions.js';

/**
	QUICK ACTIONS
	-------------
	The action grids, in the toolbar rather than in Properties.

	Thirty-one icon buttons used to sit at the foot of the Properties panel,
	below the fields, in four grids that grew and shrank with the selection.
	That is a lot of a narrow column spent on things you reach for
	occasionally, in a panel whose name says it is for properties.

	They are one button on the toolbar now, which is where a tool goes.

	WHAT THIS IS NOT. The command palette already collects these same groups -
	allActions, pointActions, shapeActions, layerActions, alignShapeActions,
	boolActions, glyphActions - scoped the same way, with names and search, at
	Ctrl K and from the rail. This is not a second copy of that: a palette is a
	search surface and this is a recognition one, and for the fifth time you
	align two paths, a grid at a fixed position beats typing. Both read the
	same action data, so neither can drift from the other.

	The popover is makePopoverButton, which shares the tool menus' open set,
	their Escape and outside-click handling, and their CSS positioning. The
	grids inside it are the same `.panel__actions-area` the panel built, with
	the group headings the panel already had.
 */

/**
 * A kern group is a pair of character sets and one number, not an outline, so
 * none of the shape, point or glyph groups mean anything on that page - and
 * eighteen buttons for copying and flipping outlines, offered where there are
 * none, is worse than the panel grid this replaced.
 *
 * @param {Object} editor
 * @returns {Boolean}
 */
const isKerningPage = (editor) => editor.nav.page === 'Kerning';

/**
 * The groups, in the order they appear, and when each one has anything to say.
 *
 * Built fresh on every open rather than kept: `makeActionsArea_Path` and
 * friends read the selection as they run, and what is selected is exactly what
 * changes between one open and the next.
 */
const quickActionGroups = [
	{
		name: 'Kern group',
		isAvailable: isKerningPage,
		make: () => makeActionsArea_KernGroup(),
	},
	{
		/* Its own heading because it searches the project, not the selection. */
		name: 'All kern groups',
		isAvailable: isKerningPage,
		make: () => makeActionsArea_OtherKernGroups(),
	},
	{
		name: 'Edit',
		isAvailable: (editor) => !isKerningPage(editor),
		make: () => makeActionsArea_Universal(),
	},
	{
		name: 'Point',
		isAvailable: (editor) => editor.multiSelect.points.length > 0,
		make: () => makeActionsArea_PathPoint(),
	},
	{
		name: 'Shape',
		isAvailable: (editor) => editor.multiSelect.shapes.length > 0,
		make: () => makeActionsArea_Path(),
	},
	{
		name: 'Component instance',
		isAvailable: (editor) => editor.multiSelect.shapes.singleton?.objType === 'ComponentInstance',
		make: () => makeActionsArea_ComponentInstance(),
	},
	{
		name: 'Glyph',
		isAvailable: (editor) => !isKerningPage(editor),
		make: () => makeActionsArea_Glyph(),
	},
];

/**
 * The toolbar's quick actions button.
 * @returns {Object} - the makePopoverButton handle
 */
export function makeQuickActionsButton() {
	return makePopoverButton({
		icon: makeLineIcon('sparkle', 20),
		label: 'Quick actions',
		className: 'quick-actions',
		/* The bar sits at the bottom of the canvas, so this opens upward. */
		openUp: true,
		isDisabled: () => !getCurrentProjectEditor().selectedItemID,
		buildContent: makeQuickActionsContent,
	});
}

/**
 * Every group that has something to offer for what is selected right now.
 * @returns {HTMLElement}
 */
function makeQuickActionsContent() {
	const editor = getCurrentProjectEditor();
	const content = makeElement({ className: 'quick-actions__content' });

	quickActionGroups.forEach((group) => {
		if (!group.isAvailable(editor)) return;

		const area = group.make();
		/*
			A group can be available and still come back empty - Path builds one
			area for shape actions and another for the boolean ones, and only the
			second is empty with a single path selected. An empty heading over
			nothing is worse than no heading.
		*/
		if (!area) return;
		const areas = [].concat(area).filter((one) => one && one.childElementCount);
		if (!areas.length) return;

		addAsChildren(content, [
			makeElement({ tag: 'h3', content: group.name }),
			...areas,
		]);
	});

	if (!content.childElementCount) {
		content.appendChild(
			makeElement({
				className: 'quick-actions__empty',
				content: 'Select a path or a point to see what can be done to it.',
			})
		);
	}

	return content;
}
