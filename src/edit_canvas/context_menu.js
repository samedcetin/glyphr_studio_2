import { getCurrentProjectEditor } from '../app/main.js';
import { closeEveryTypeOfDialog, makeContextMenu } from '../controls/dialogs/dialogs.js';
import { makeActionButtonIcon } from '../panels/action_buttons.js';
import { dropDuplicateLabels, getActionLabel } from '../panels/action_labels.js';
import { getActionData } from '../panels/actions.js';

/**
	CANVAS CONTEXT MENU
	-------------------
	Right-clicking the edit canvas used to do nothing at all - every command
	lived only in an unlabelled icon grid in the panel area. This surfaces the
	commands that apply to whatever is under the pointer, with their keyboard
	shortcuts alongside, which is how people find shortcuts in the first place.

	Rows are built from the same `getActionData` groups the action buttons use,
	so there is one definition of what each command does and menu and buttons
	cannot drift apart.
 */

/**
 * Keyboard shortcuts shown next to menu rows.
 *
 * Keyed by the action's `id` from panels/actions.js. These are display only -
 * the bindings themselves live in events_keyboard.js, and the two have to be
 * kept in step by hand until there is a single shortcut registry.
 */
const shortcutsByActionID = {
	actionButtonCopy: ['Ctrl', 'C'],
	actionButtonPaste: ['Ctrl', 'V'],
	actionButtonUndo: ['Ctrl', 'Z'],
	actionButtonRedo: ['Ctrl', 'Y'],
	actionButtonDeleteShape: ['Del'],
	actionButtonDeletePathPoint: ['Del'],
	actionButtonSelectPreviousPathPoint: ['['],
	actionButtonSelectNextPathPoint: [']'],
	actionButtonResetPathPoint: ['Ctrl', 'R'],
};

/**
 * Turns one action-button definition into a context menu row.
 * @param {Object} action - an entry from getActionData
 * @returns {Object | false} - a context menu row, or false if unusable
 */
function actionToMenuRow(action) {
	if (!action || !action.onClick) return false;

	// Action titles are "Name\nLonger description" - the menu wants the name.
	const label = getActionLabel(action);
	if (!label) return false;

	const iconMaker = makeActionButtonIcon[action.iconName];

	return {
		id: action.id,
		name: label,
		iconMarkup: iconMaker ? iconMaker(action.iconOptions) : '',
		note: shortcutsByActionID[action.id] || '',
		disabled: !!action.disabled,
		onClick: action.onClick,
	};
}

/**
 * Maps a whole action group into menu rows, dropping any that cannot be shown.
 * @param {String} groupName - a group name understood by getActionData
 * @param {Array=} only - optional allow-list of action ids, in menu order
 * @returns {Array}
 */
function rowsFromGroup(groupName, only = []) {
	let actions = getActionData(groupName);
	if (!Array.isArray(actions)) return [];

	if (only.length) {
		actions = only
			.map((id) => actions.find((action) => action.id === id))
			.filter((action) => !!action);
	}

	return actions.map(actionToMenuRow).filter((row) => !!row);
}

/**
 * Appends a separator, but only between two groups that both have rows.
 * @param {Array} rows - rows built so far
 */
function addSeparator(rows) {
	if (rows.length && rows[rows.length - 1].name !== 'hr') rows.push({ name: 'hr' });
}

/**
 * Builds the menu for the current selection.
 * @returns {Array} - context menu rows
 */
function makeCanvasMenuRows() {
	const editor = getCurrentProjectEditor();
	const shapeCount = editor.multiSelect.shapes.length;
	const pointCount = editor.multiSelect.points.length;
	const rows = [];

	// Points win over shapes: if the user has points selected, that is the
	// level they are working at.
	if (pointCount) {
		rows.push(...rowsFromGroup('pointActions'));
		addSeparator(rows);
	}

	if (shapeCount) {
		rows.push(...rowsFromGroup('shapeActions'));
		addSeparator(rows);

		if (shapeCount > 1) {
			rows.push(...rowsFromGroup('boolActions'));
			addSeparator(rows);
			rows.push(...rowsFromGroup('layerActions'));
			addSeparator(rows);
		}
	}

	// Clipboard and history apply whatever is selected.
	rows.push(
		...rowsFromGroup('allActions', [
			'actionButtonCopy',
			'actionButtonPaste',
			'actionButtonUndo',
			'actionButtonRedo',
		])
	);

	if (!shapeCount && !pointCount) {
		addSeparator(rows);
		rows.push(...rowsFromGroup('addShapeActions'));
	}

	const deduped = dropDuplicateLabels(rows, 'hr');

	// Deduping can leave two separators next to each other, or one at the end.
	const cleaned = deduped.filter(
		(row, index) => !(row.name === 'hr' && deduped[index - 1]?.name === 'hr')
	);
	while (cleaned.length && cleaned[cleaned.length - 1].name === 'hr') cleaned.pop();
	while (cleaned.length && cleaned[0].name === 'hr') cleaned.shift();

	return cleaned;
}

/**
 * Opens the canvas context menu at the pointer.
 * @param {MouseEvent} event - the contextmenu event
 */
export function handleCanvasContextMenu(event) {
	const editor = getCurrentProjectEditor();
	if (!editor.nav.isOnEditCanvasPage) return;

	event.preventDefault();
	event.stopPropagation();
	closeEveryTypeOfDialog();

	const rows = makeCanvasMenuRows();
	if (!rows.length) return;

	// Keep the menu on screen: an estimated height is enough here, since the
	// menu is not in the DOM yet and cannot be measured.
	const estimatedHeight = rows.length * 28 + 16;
	const menuWidth = 280;
	const x = Math.min(event.clientX, window.innerWidth - menuWidth - 8);
	const y = Math.min(event.clientY, Math.max(8, window.innerHeight - estimatedHeight - 8));

	const menu = makeContextMenu(rows, x, y, menuWidth);
	document.body.appendChild(menu);
	menu.focus();
}
