import { addAsChildren, makeElement } from '../../common/dom.js';
import { createSelection } from './selection.js';

/**
	ITEM TABLE
	----------
	The one table every cross-project action shows: a row per item, a checkbox
	on each, one at the top for all of them, and a count of what is ticked.

	Five action files used to build this five times, line for line, each with
	its own copy of the toggle-all handler and its own copy of the bug in it.
	Now there is one, and an action describes its rows as data.

	The shape follows the dialog checklist that Global actions and the range
	pickers use - a head and rows on the same grid, a 32px row, the ring drawn
	round the whole row - so a list of things to tick looks the same wherever
	in the app it turns up. The columns are the action's own, because a glyph
	row and a settings row do not hold the same things.
 */

/**
 * @typedef {Object} TableColumn
 * @property {String} label - the column header; '' for the checkbox column
 * @property {String} track - the grid track, in CSS
 * @property {String=} className - a class for every cell in the column
 */

/**
 * @typedef {Object} TableRow
 * @property {String} id - what selecting the row selects
 * @property {String} name - the accessible name of the row's checkbox
 * @property {Array<Element|String>} cells - one per column after the checkbox
 */

/**
 * Builds the table.
 *
 * @param {Object} args
 * @param {Array<TableColumn>} args.columns - after the checkbox column
 * @param {Array<TableRow>} args.rows - what to show
 * @param {String} args.emptyMessage - shown when there are no rows
 * @param {Function=} args.onChange - called with the selection after any change
 * @param {Object=} args.selection - a selection to reuse across re-renders
 * @returns {Object} - {element, selection, summary}
 */
export function makeItemTable({
	columns,
	rows,
	emptyMessage,
	onChange = () => {},
	selection = createSelection(),
}) {
	const wrapper = makeElement({ className: 'cross-project__table-wrap' });

	// Only what is on screen can stay selected.
	selection.keepOnly(rows.map((row) => row.id));

	// --- Count and select-all -------------------------------------
	const toolbar = makeElement({ className: 'cross-project__toolbar' });
	const summary = makeElement({
		className: 'cross-project__summary',
		attributes: { role: 'status', 'aria-live': 'polite' },
	});
	const toggleAll = makeElement({
		tag: 'button',
		className: 'studio-link',
		attributes: { type: 'button' },
	});
	addAsChildren(toolbar, [summary, toggleAll]);

	// --- The grid -------------------------------------------------
	const tracks = [`var(--icon-size)`, ...columns.map((column) => column.track)].join(' ');
	const list = makeElement({ className: 'cross-project__table', attributes: { role: 'group' } });
	list.style.setProperty('--cross-project-columns', tracks);

	const head = makeElement({ className: 'cross-project__head' });
	head.appendChild(makeElement({ tag: 'span' }));
	columns.forEach((column) => {
		head.appendChild(
			makeElement({
				tag: 'span',
				className: column.className || '',
				content: column.label,
			})
		);
	});
	list.appendChild(head);

	/** @type {Array<HTMLInputElement>} */
	const boxes = [];

	rows.forEach((row) => {
		const line = makeElement({ tag: 'label', className: 'cross-project__row' });

		const box = /** @type {HTMLInputElement} */ (
			makeElement({
				tag: 'input',
				attributes: { type: 'checkbox', 'aria-label': row.name },
			})
		);
		box.checked = selection.has(row.id);
		box.addEventListener('change', () => {
			selection.set(row.id, box.checked);
			refreshSummary();
			onChange(selection);
		});
		boxes.push(box);
		line.appendChild(box);

		row.cells.forEach((cell, index) => {
			/** @type {TableColumn} */
			const column = columns[index] || { label: '', track: 'auto' };
			if (typeof cell === 'string') {
				const span = makeElement({ tag: 'span', className: column.className || '' });
				// textContent: names and values arrive as whatever was typed.
				span.textContent = cell;
				line.appendChild(span);
			} else {
				if (column.className) cell.classList.add(column.className);
				line.appendChild(cell);
			}
		});

		list.appendChild(line);
	});

	const empty = makeElement({ className: 'cross-project__empty' });
	empty.textContent = emptyMessage;

	/** Rewrites the count and the select-all label. */
	function refreshSummary() {
		const total = rows.length;
		const picked = selection.size;
		summary.textContent = total ? `${picked} of ${total} selected` : '';
		const allOn = total > 0 && picked === total;
		toggleAll.textContent = allOn ? 'Clear selection' : 'Select all';
		toggleAll.hidden = total === 0;
	}

	toggleAll.addEventListener('click', () => {
		const allOn = rows.length > 0 && selection.size === rows.length;
		selection.setAll(
			rows.map((row) => row.id),
			!allOn
		);
		boxes.forEach((box) => {
			box.checked = !allOn;
		});
		refreshSummary();
		onChange(selection);
	});

	refreshSummary();

	addAsChildren(wrapper, [toolbar, rows.length ? list : empty]);
	return { element: wrapper, selection: selection, summary: summary };
}

/**
 * A glyph drawn small, for a row.
 *
 * An empty destination slot is drawn as an empty box rather than left out, so
 * the arrow between the two thumbnails points at something and a row whose
 * destination does not exist yet reads as "this will be created".
 *
 * @param {Object} project - the project the item belongs to
 * @param {Object|false} item - the item, or false when there is none
 * @returns {Element}
 */
export function makeThumbnail(project, item) {
	const box = makeElement({ className: 'cross-project__thumb' });
	if (item) {
		box.innerHTML = project.makeItemThumbnail(item, 32);
	} else {
		box.classList.add('cross-project__thumb--empty');
		box.setAttribute('title', 'Nothing here yet — it will be created');
	}
	return box;
}

/**
 * The arrow between a source thumbnail and a destination one.
 * @returns {Element}
 */
export function makeArrow() {
	return makeElement({
		tag: 'span',
		className: 'cross-project__arrow',
		attributes: { 'aria-hidden': 'true' },
		innerHTML: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h10M9 4l4 4-4 4"/></svg>`,
	});
}
