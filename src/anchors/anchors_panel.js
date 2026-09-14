import { getCurrentProjectEditor } from '../app/main.js';
import { makeElement } from '../common/dom.js';
import { showToast } from '../controls/dialogs/dialogs.js';
import { attachTooltip } from '../controls/tooltip/tooltip.js';
import { makeActionButton } from '../panels/action_buttons.js';
import { setHighlightedAnchor } from './anchor_canvas.js';
import { showComposeDialog } from './compose_dialog.js';

/**
	ANCHORS PANEL
	-------------
	Where anchors are added, named and nudged.

	THE CANVAS IS THE CONTROL, this list is the register. An anchor is a point
	on a glyph; you put it roughly where it goes by dragging it there, and the
	numbers here are for the last few units. So the list's job is to say which
	point is which, and to stay out of the way - which is why hovering a row
	lights its anchor up on the canvas, and why the shapes in the list are the
	same shapes the canvas draws.

	The quick-add buttons matter more than they look, and now come first. An
	anchor put in roughly the right place is most of the work: `top` belongs at
	the middle of the letter's ink, level with the top of it, and a mark's
	`_top` belongs at the middle of its own foot. Placing those by hand for
	every glyph is the thing that stops people using anchors at all.

	WHY THIS PANEL DOES NOT REBUILD ITSELF. It used to call refreshPanel() on
	every change, which rebuilds the whole sidebar - so typing a name and
	pressing Tab lost focus to the body, and nudging a coordinate with the
	arrow keys worked once and then stopped, because the second press landed on
	an input that had been replaced between presses. The section opts out of
	the sidebar refresh now and keeps itself up to date: the list is rebuilt
	only when the set of anchors changes, and a coordinate that moved on the
	canvas is written into its field without touching the DOM around it.
 */

/** The names the quick-add row offers, in the order they are usually needed. */
const quickAddNames = ['top', 'bottom', '_top', '_bottom'];

/**
 * Sensible starting positions, by anchor name.
 *
 * @param {String} name - the anchor's name
 * @param {Object} maxes - the glyph's bounds
 * @returns {Object} - {x, y}
 */
export function suggestAnchorPosition(name, maxes) {
	const centerX = Math.round((maxes.xMin + maxes.xMax) / 2);

	switch (name) {
		case 'top':
			return { x: centerX, y: Math.round(maxes.yMax) };
		case 'bottom':
			return { x: centerX, y: Math.round(maxes.yMin) };
		// A mark's own attachment point is the part of it that touches the
		// letter - the foot of an accent above, the head of one below.
		case '_top':
			return { x: centerX, y: Math.round(maxes.yMin) };
		case '_bottom':
			return { x: centerX, y: Math.round(maxes.yMax) };
		default:
			return { x: centerX, y: Math.round((maxes.yMin + maxes.yMax) / 2) };
	}
}

/**
 * The Anchors section of the sidebar.
 * @returns {Element}
 */
export function makePanel_Anchors() {
	const editor = getCurrentProjectEditor();
	const item = editor.selectedItem;
	const card = makeElement({ className: 'panel__card anchors-card' });

	if (!item) {
		card.appendChild(makeElement({ className: 'anchors__empty', content: 'Nothing selected.' }));
		return card;
	}

	card.appendChild(makeAddRow());
	card.appendChild(makeElement({ className: 'anchors__list' }));

	const composeButton = makeElement({
		tag: 'button',
		className: 'anchors__compose',
		attributes: { type: 'button' },
		content: 'Compose accented characters…',
		title:
			'Compose accented characters\nBuilds à, é, ş and the rest from the letters and marks that already have anchors.',
	});
	composeButton.addEventListener('click', showComposeDialog);
	attachTooltip(composeButton);
	card.appendChild(composeButton);

	fillAnchorList(card);

	/*
		One subscription, doing as little as it can get away with: the anchor
		set is compared to what is on screen, and the DOM is only rebuilt when
		they differ. A drag on the canvas just writes two numbers.
	*/
	editor.subscribe({
		topic: 'currentItem',
		subscriberID: 'anchorsPanel.list',
		callback: () => {
			if (!card.isConnected) return;
			fillAnchorList(card);
		},
	});

	return card;
}

// --------------------------------------------------------------
// The list
// --------------------------------------------------------------

/**
 * What the list is showing, so a rebuild can be skipped when nothing structural
 * has changed. Names and order, which is everything the DOM depends on.
 *
 * @param {Object} item - the glyph
 * @returns {String}
 */
function listSignature(item) {
	return `${item?.id || ''}|${(item?.anchors || []).map((anchor) => anchor.name).join(',')}`;
}

/**
 * Bring the list up to date, rebuilding only if it has to.
 * @param {Element} card - the panel card
 */
function fillAnchorList(card) {
	const item = getCurrentProjectEditor().selectedItem;
	const list = card.querySelector('.anchors__list');
	if (!list || !item) return;

	refreshAddRow(card, item);

	const signature = listSignature(item);
	if (list.getAttribute('data-signature') === signature) {
		updateAnchorFields(list, item);
		return;
	}

	list.setAttribute('data-signature', signature);
	list.innerHTML = '';

	if (!item.anchors.length) {
		/*
			The explanation lives here rather than above the list, because after
			the second glyph it is furniture. An empty panel is the one moment
			it is worth reading.
		*/
		list.appendChild(
			makeElement({
				className: 'anchors__empty',
				innerHTML: `No anchors yet. Anchors join letters to marks: a letter carries
					<code>top</code>, an accent carries <code>_top</code>, and composing moves
					the accent until the two meet.`,
			})
		);
		return;
	}

	item.anchors.forEach((anchor) => list.appendChild(makeAnchorRow(item, anchor)));
}

/**
 * Write moved coordinates into the fields without disturbing anything else.
 *
 * A field the user is currently in is left alone - taking the caret out from
 * under someone mid-edit to show them a number they are in the middle of
 * typing is worse than being a frame behind.
 *
 * @param {Element} list - the list element
 * @param {Object} item - the glyph
 */
function updateAnchorFields(list, item) {
	item.anchors.forEach((anchor) => {
		const row = list.querySelector(`.anchors__row[data-anchor="${cssEscape(anchor.name)}"]`);
		if (!row) return;

		['x', 'y'].forEach((axis) => {
			const input = row.querySelector(`.anchors__number[data-axis="${axis}"]`);
			if (!input || document.activeElement === input) return;
			const wanted = String(Math.round(anchor[axis]));
			// @ts-expect-error 'inputs have a value'
			if (input.value !== wanted) input.value = wanted;
		});
	});
}

/**
 * One anchor: what kind it is, its name, where it is, and how to be rid of it.
 * @param {Object} item - the glyph
 * @param {Object} anchor - the anchor
 * @returns {Element}
 */
function makeAnchorRow(item, anchor) {
	const row = makeElement({
		className: `anchors__row${anchor.isMarkAnchor ? ' anchors__row--mark' : ''}`,
		attributes: { 'data-anchor': anchor.name },
	});

	/*
		The same two shapes the canvas draws: a ring is a place something can
		land, a filled dot is the thing that lands. The canvas was already
		careful about this and the list was not, so the one explanation of the
		difference was a paragraph of prose.
	*/
	const kind = makeElement({
		className: 'anchors__kind',
		title: anchor.isMarkAnchor
			? `Mark anchor\nThis glyph is a mark, and attaches to a letter by this point.`
			: `Base anchor\nMarks attach to this glyph here.`,
	});
	attachTooltip(kind);
	row.appendChild(kind);

	const nameInput = makeElement({
		tag: 'input',
		className: 'anchors__name',
		attributes: { type: 'text', value: anchor.name, spellcheck: 'false', 'aria-label': 'Anchor name' },
	});

	nameInput.addEventListener('change', (event) => {
		// @ts-expect-error - inputs have a value
		const wanted = String(event.target.value).replace(/[^a-zA-Z0-9._]/g, '');

		/*
			Renaming onto a name that is already here would leave the glyph with
			two anchors the composer cannot tell apart, so the rename is refused
			- and said out loud. It used to put the field back and say nothing,
			which reads as the app having dropped the keystrokes.
		*/
		const clash = item.anchors.find((other) => other !== anchor && other.name === wanted);

		if (clash) {
			// @ts-expect-error - inputs have a value
			event.target.value = anchor.name;
			showToast(`This glyph already has an anchor called ${wanted}`);
			return;
		}

		const from = anchor.name;
		anchor.name = wanted;
		row.setAttribute('data-anchor', anchor.name);
		finishChange(`Renamed anchor: ${from} to ${anchor.name}`);
	});

	row.appendChild(nameInput);
	row.appendChild(makeNumberInput(anchor, 'x'));
	row.appendChild(makeNumberInput(anchor, 'y'));

	const deleteButton = makeActionButton({
		iconName: 'delete',
		title: `Delete anchor\nRemoves ${anchor.name} from this glyph.`,
		onClick: () => {
			item.removeAnchor(anchor.name);
			highlight(false);
			finishChange(`Deleted anchor: ${anchor.name}`);
		},
	});
	/*
		makeActionButton leaves sizing to whatever contains it, and its icon is
		drawn at 100% of the button - so without a size of its own it grows to
		fill the row.
	*/
	deleteButton.classList.add('anchors__delete');
	row.appendChild(deleteButton);

	/*
		Pointing at a row points at its anchor. Four crosses on one glyph look
		alike, and this is the only thing that says which is which without
		reading coordinates off the canvas.
	*/
	row.addEventListener('mouseenter', () => highlight(anchor.name));
	row.addEventListener('mouseleave', () => highlight(false));
	row.addEventListener('focusin', () => highlight(anchor.name));

	return row;
}

/**
 * A number bound straight to one of the anchor's coordinates.
 *
 * Not input-number, and not for want of trying: this field is about sixty
 * pixels wide, and that control spends twenty-four on a prefix and another
 * twenty-four on its steppers, which leaves seventeen for a four-digit
 * coordinate. So it is a plain field wearing the same clothes - the same
 * height, padding, mono face and right alignment, the browser’s own
 * spinners hidden, and the axis mark the rest of the panel now carries.
 *
 * @param {Object} anchor - the anchor
 * @param {String} axis - 'x' or 'y'
 * @returns {Element}
 */
function makeNumberInput(anchor, axis) {
	const field = makeElement({ className: 'anchors__field' });
	field.appendChild(
		makeElement({ className: 'anchors__axis', content: axis.toUpperCase() })
	);

	const input = makeElement({
		tag: 'input',
		className: 'anchors__number',
		attributes: {
			type: 'number',
			value: String(Math.round(anchor[axis])),
			'data-axis': axis,
			'aria-label': axis === 'x' ? 'Anchor x' : 'Anchor y',
		},
	});

	input.addEventListener('change', (event) => {
		// @ts-expect-error - inputs have a value
		anchor[axis] = Number(event.target.value);
		finishChange(`Moved anchor: ${anchor.name}`);
	});

	field.appendChild(input);
	return field;
}

// --------------------------------------------------------------
// Adding
// --------------------------------------------------------------

/**
 * The quick-add row, above the list because on an empty glyph it is the only
 * thing there is to do.
 *
 * @returns {Element}
 */
function makeAddRow() {
	const wrapper = makeElement({ className: 'anchors__add' });

	quickAddNames.forEach((name) => {
		const button = makeElement({
			tag: 'button',
			className: `anchors__add-button${name.startsWith('_') ? ' anchors__add-button--mark' : ''}`,
			attributes: { type: 'button', 'data-anchor-name': name },
			content: name,
			title: name.startsWith('_')
				? `Add ${name}\nA mark anchor: this glyph attaches to a letter by this point. Placed at the middle of its own ${
						name === '_top' ? 'foot' : 'head'
				  }.`
				: `Add ${name}\nA base anchor: marks attach to this glyph here. Placed at the middle of the ink, level with its ${
						name === 'top' ? 'top' : 'bottom'
				  }.`,
		});

		button.addEventListener('click', () => {
			const item = getCurrentProjectEditor().selectedItem;
			const position = suggestAnchorPosition(name, item.maxes);
			item.setAnchor(name, position.x, position.y);
			highlight(name);
			finishChange(`Added anchor: ${name}`);
		});

		attachTooltip(button);
		wrapper.appendChild(button);
	});

	return wrapper;
}

/**
 * Grey out whichever names this glyph already carries.
 * @param {Element} card - the panel card
 * @param {Object} item - the glyph
 */
function refreshAddRow(card, item) {
	quickAddNames.forEach((name) => {
		const button = card.querySelector(`.anchors__add-button[data-anchor-name="${name}"]`);
		if (!button) return;
		if (item.getAnchor(name)) button.setAttribute('disabled', 'disabled');
		else button.removeAttribute('disabled');
	});
}

// --------------------------------------------------------------
// Helpers
// --------------------------------------------------------------

/**
 * Light one anchor up on the canvas, or none.
 * @param {String | false} name
 */
function highlight(name) {
	if (!setHighlightedAnchor(name)) return;
	const editor = getCurrentProjectEditor();
	if (editor.editCanvas) editor.editCanvas.redraw('anchorsPanel.highlight');
}

/**
 * An anchor name is restricted to letters, digits, dot and underscore, so this
 * only has to survive an attribute selector rather than be a general escape.
 *
 * @param {String} value
 * @returns {String}
 */
function cssEscape(value) {
	return String(value).replace(/["\\]/g, '\\$&');
}

/**
 * Records the change and tells everything that draws anchors.
 *
 * No refreshPanel(): this panel updates itself from the same publish, and
 * rebuilding the sidebar was what took focus out of the field being typed in.
 *
 * @param {String} title - history entry title
 */
function finishChange(title) {
	const editor = getCurrentProjectEditor();
	editor.selectedItem.changed();
	editor.history.addState(title);
	editor.publish('currentItem', editor.selectedItem);
}
