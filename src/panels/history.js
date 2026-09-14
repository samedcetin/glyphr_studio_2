import { getCurrentProjectEditor } from '../app/main.js';
import { makeElement } from '../common/dom.js';
import { makeIconButton } from '../controls/icon-toggle/icon_toggle.js';
import { attachTooltip } from '../controls/tooltip/tooltip.js';

/**
	HISTORY PANEL
	-------------
	Everything you have done, with where you are marked, and every point on
	it one click away.

	THE THING THIS PANEL GOT WRONG. Undoing removed those changes from the
	list. They still existed - they were sitting in the redo queue - but the
	only trace of them on screen was a number on a `redo 0` pill, and the
	only way back to one was to press it and watch. So the panel answered
	"what led to here" when the question people open it with is "where can I
	get back to".

	The undone changes are entries now, above the current one and dimmed,
	and clicking one goes there - see History.jumpForward. One list, one
	position marked on it, both directions reachable.

	Two other things were in the way. The item headings repeated what the
	`Navigated to X` entries already say, twice on screen for one fact. And
	the times were wall clocks: three changes made in the same second all
	read 16:07:08, which is three rows of a column carrying no information.
	They are relative now, which is the only form that distinguishes them.
 */

/**
 * How long ago, in the shortest form that still distinguishes two entries.
 *
 * @param {Number} timeStamp
 * @param {Number} now
 * @returns {String}
 */
function timeAgo(timeStamp, now) {
	const seconds = Math.max(0, Math.round((now - timeStamp) / 1000));
	if (seconds < 45) return 'just now';
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours}h`;
	return `${Math.round(hours / 24)}d`;
}

/**
 * One point on the timeline.
 *
 * @param {Object} args
 * @param {String} args.title - what happened
 * @param {String} args.state - 'ahead' | 'now' | 'past'
 * @param {Boolean=} args.isNavigation - a move between items rather than an edit
 * @param {Number | false} [args.timeStamp]
 * @param {Number} args.now
 * @param {String=} args.itemName - which item it happened to
 * @param {(() => void) | false} [args.onClick]
 * @returns {HTMLElement}
 */
function makeHistoryRow({
	title,
	state,
	isNavigation = false,
	timeStamp = false,
	now,
	itemName = '',
	onClick = false,
}) {
	const row = makeElement({
		tag: onClick ? 'button' : 'div',
		className:
			`history-list__row history-list__row--${state}` +
			(isNavigation ? ' history-list__row--navigation' : ''),
		attributes: onClick ? { type: 'button' } : {},
	});

	/*
		The marker column is what makes this read as a timeline rather than as
		a list of sentences: one filled dot at where you are, hollow above it
		for what you undid, small and quiet below for what led here.
	*/
	row.appendChild(makeElement({ className: 'history-list__dot' }));

	/*
		A navigation entry says the item and nothing else. 'Navigated to Latin
		Capital Letter A' does not fit the column and the first two words are the
		part that is the same on every one of them - what it marks is the item.
		The full sentence stays in the tooltip.
	*/
	const text = makeElement({ className: 'history-list__title' });
	text.textContent = isNavigation ? title.replace(/^Navigated to /, '') : title;
	row.appendChild(text);

	const when = makeElement({ className: 'history-list__date' });
	when.textContent = state === 'now' ? 'now' : timeStamp ? timeAgo(timeStamp, now) : '';
	row.appendChild(when);

	/*
		The item and the wall clock go in the tooltip. Both matter when you are
		looking for one particular point and neither is worth a column: the
		item is usually the same as the row above, and the clock is usually the
		same second.
	*/
	const detail = [itemName, timeStamp ? new Date(timeStamp).toLocaleTimeString() : '']
		.filter(Boolean)
		.join(' · ');
	attachTooltip(row, {
		name: title,
		body: [detail, onClick ? (state === 'ahead' ? 'Click to go forward to here.' : 'Click to go back to here.') : '']
			.filter(Boolean)
			.join(' '),
	});

	if (onClick) row.addEventListener('click', () => onClick());
	return row;
}

export function makePanel_History() {
	const editor = getCurrentProjectEditor();
	const history = editor.history;
	const historyArea = makeElement({ className: 'panel__card history-list' });
	const now = Date.now();

	const nameOf = (itemID) =>
		(itemID && editor.project.getItemName(itemID, true)) || '';
	const isNavigation = (title) => `${title}`.startsWith('Navigated to');

	// --------------------------------------------------------------
	// Undo and redo, as the two ends of the same line
	// --------------------------------------------------------------

	const undoCount = history.length;
	const redoCount = history.redoQueue.length;

	const head = makeElement({ className: 'history-list__head' });
	const summary = makeElement({ className: 'history-list__summary' });
	summary.textContent = undoCount
		? `${undoCount} change${undoCount === 1 ? '' : 's'}`
		: 'Nothing yet';
	head.appendChild(summary);

	const undoButton = makeIconButton({
		icon: 'undo',
		name: 'Undo',
		body: undoCount ? `${undoCount} to go back through.` : 'Nothing to undo.',
		onClick: () => history.restoreState(),
	});
	if (!undoCount) undoButton.setAttribute('disabled', 'disabled');

	const redoButton = makeIconButton({
		icon: 'redo',
		name: 'Redo',
		body: redoCount ? `${redoCount} to go forward through.` : 'Nothing to redo.',
		onClick: () => history.redoState(),
	});
	if (!redoCount) redoButton.setAttribute('disabled', 'disabled');

	const headButtons = makeElement({ className: 'history-list__head-buttons' });
	headButtons.appendChild(undoButton);
	headButtons.appendChild(redoButton);
	head.appendChild(headButtons);
	historyArea.appendChild(head);

	/*
		The rows go in a container of their own. The rail is drawn by each row and
		trimmed at the two ends of the list - and the ends were being found with
		:first-of-type, which matches per element type. Half these rows are
		buttons and half are not, so the first DIV and the first BUTTON both
		counted as a start; the current row, being the only DIV, was both the
		first and the last of its type and had its rail trimmed away entirely.
	*/
	const timeline = makeElement({ className: 'history-list__timeline' });
	historyArea.appendChild(timeline);

	// --------------------------------------------------------------
	// What you undid, furthest ahead first
	// --------------------------------------------------------------

	/*
		Reversed. redoQueue[0] is the next redo - the nearest future - and the
		list runs newest first, so it belongs at the bottom of this section,
		touching the row that says where you are. Rendered in queue order the
		section read backwards in time against the rest of the panel.
	*/
	[...history.redoQueue].reverse().forEach((entries, reverseIndex) => {
		const entry = entries[0];
		if (!entry) return;
		const stepsForward = history.redoQueue.length - reverseIndex;
		timeline.appendChild(
			makeHistoryRow({
				title: entry.title,
				state: 'ahead',
				isNavigation: isNavigation(entry.title),
				timeStamp: entry.timeStamp,
				now: now,
				itemName: nameOf(entry.itemID),
				onClick: () => history.jumpForward(stepsForward),
			})
		);
	});

	// --------------------------------------------------------------
	// Where you are, and what led here
	// --------------------------------------------------------------

	let visibleIndex = 0;

	history.queue.forEach((entry) => {
		if (entry.title === '_whole_project_change_post_state_') return;

		const steps = visibleIndex;
		timeline.appendChild(
			makeHistoryRow({
				title: entry.title,
				state: steps === 0 ? 'now' : 'past',
				isNavigation: isNavigation(entry.title),
				timeStamp: entry.timeStamp,
				now: now,
				itemName: nameOf(entry.itemID),
				onClick: steps === 0 ? false : () => history.jumpToState(steps),
			})
		);

		visibleIndex++;
	});

	timeline.appendChild(
		makeHistoryRow({
			title: 'Opened this project',
			state: history.queue.length ? 'past' : 'now',
			timeStamp: history.initialTimeStamp,
			now: now,
			onClick: history.queue.length ? () => history.jumpToState(history.queue.length) : false,
		})
	);

	// History object calls to refresh the panel - no subscribers here

	return historyArea;
}
