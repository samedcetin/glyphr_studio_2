import { getCurrentProjectEditor } from '../app/main.js';
import { makeElement } from '../common/dom.js';
import { attachTooltip } from '../controls/tooltip/tooltip.js';

/**
	HISTORY PANEL
	-------------
	What you have done, newest first, and the way back to any of it.

	Every entry used to be two separate children of a card that collapses to
	one column in a sidebar this narrow - the description, and then the time
	on the line below it - so one change took two rows and the times ran down
	the left edge under the text rather than lining up in a column of their
	own. Each entry is a row now: what happened, and when.
 */

/**
 * One change: what it was, when it was, and the way back to it.
 *
 * @param {Object} args
 * @param {String} args.title - what happened
 * @param {Boolean} args.strong - whether it was a whole-project change
 * @param {Number | false} args.timeStamp
 * @param {Boolean} args.isCurrent - whether this is where you are now
 * @param {Number | false} args.stepsToUndo - false if it cannot be jumped to
 * @param {String =} args.className - an extra class
 * @returns {HTMLElement}
 */
function makeHistoryRow({
	title,
	strong = false,
	timeStamp = false,
	isCurrent = false,
	stepsToUndo = false,
	className = '',
}) {
	const editor = getCurrentProjectEditor();
	const clickable = stepsToUndo !== false && !isCurrent;

	const row = makeElement({
		className:
			'history-list__row' +
			(isCurrent ? ' history-list__row--current' : '') +
			(clickable ? ' history-list__row--clickable' : '') +
			(className ? ' ' + className : ''),
	});

	const text = makeElement({ className: 'history-list__title' });
	text.innerHTML = strong ? `<strong>${title}</strong>` : title;
	row.appendChild(text);

	if (isCurrent) {
		row.appendChild(
			makeElement({ className: 'history-list__current-tag', content: 'now' })
		);
	} else if (timeStamp !== false) {
		const time = makeElement({ className: 'history-list__date' });
		time.textContent = new Date(timeStamp).toLocaleTimeString();
		attachTooltip(time, { name: new Date(timeStamp).toLocaleString() });
		row.appendChild(time);
	}

	if (clickable) {
		const steps = /** @type {Number} */ (stepsToUndo);
		attachTooltip(row, {
			name: 'Revert to here',
			body: `Undoes ${steps} step${steps === 1 ? '' : 's'}.`,
		});
		row.addEventListener('click', () => editor.history.jumpToState(steps));
	}

	return row;
}

export function makePanel_History() {
	const editor = getCurrentProjectEditor();
	const historyArea = makeElement({ className: 'panel__card history-list' });

	const length = editor.history.length;
	const redoLength = editor.history.redoQueue.length;

	// --------------------------------------------------------------
	// Undo and redo
	// --------------------------------------------------------------

	const buttonRow = makeElement({ className: 'history-list__button-row' });
	historyArea.appendChild(buttonRow);

	const undoButton = makeElement({
		tag: 'button',
		className: length > 0 ? 'button__call-to-action number' : 'number',
		innerHTML: `undo ${length}`,
	});
	buttonRow.appendChild(undoButton);

	const redoButton = makeElement({
		tag: 'button',
		className: redoLength > 0 ? 'button__call-to-action number' : 'number',
		innerHTML: `redo ${redoLength}`,
	});
	buttonRow.appendChild(redoButton);

	if (length > 0) undoButton.addEventListener('click', () => editor.history.restoreState());
	else undoButton.setAttribute('disabled', '');

	if (redoLength > 0) redoButton.addEventListener('click', () => editor.history.redoState());
	else redoButton.setAttribute('disabled', '');

	// --------------------------------------------------------------
	// The list
	// --------------------------------------------------------------

	if (length === 0) {
		historyArea.appendChild(
			makeElement({
				tag: 'h3',
				innerHTML: editor.project.getItemName(editor.selectedItemID || '', true) || '',
			})
		);
	}

	let currentItemID = 'initial';
	let visibleIndex = 0;

	editor.history.queue.forEach((entry) => {
		if (entry.title === '_whole_project_change_post_state_') return;

		/* One heading per run of changes to the same item. */
		if (entry.itemID && entry.itemID !== currentItemID) {
			historyArea.appendChild(
				makeElement({
					tag: 'h3',
					innerHTML: editor.project.getItemName(entry.itemID, true) || '',
				})
			);
			currentItemID = entry.itemID;
		}

		historyArea.appendChild(
			makeHistoryRow({
				title: entry.title,
				strong: !!entry.wholeProjectSave,
				timeStamp: entry.timeStamp,
				isCurrent: visibleIndex === 0,
				stepsToUndo: visibleIndex,
			})
		);

		visibleIndex++;
	});

	historyArea.appendChild(
		makeHistoryRow({
			title: 'Initial state',
			timeStamp: editor.history.initialTimeStamp,
			stepsToUndo: editor.history.queue.length > 0 ? editor.history.queue.length : false,
			className: 'history-list__initial-entry',
		})
	);

	// History object calls to refresh the panel - no subscribers here

	return historyArea;
}
