/**
	SPECIMEN SHEET — THE LOOSE SHAPES PANEL

	On the Overview, under the project snapshot: the shapes that came off a
	sheet and have not been given a character yet.

	It belongs next to the coverage card because it answers the same question
	from the other side. Coverage says how much of the alphabet is drawn; this
	says what is drawn and not yet part of the alphabet. A sheet almost never
	maps cleanly on the first go - a row miscounts, the punctuation row is left
	undeclared - and without somewhere for the remainder to sit, the user
	watches twenty-six shapes go past in the review and ends up with none.
*/

import { makeElement } from '../../common/dom.js';
import { Glyph } from '../../project_data/glyph.js';
import { getCurrentProjectEditor } from '../../app/main.js';
import { showModalDialog, closeEveryTypeOfDialog, showToast } from '../../controls/dialogs/dialogs.js';
import { makeAllItemTypeChooserContent } from '../../panels/item_chooser.js';
import { getUnicodeName } from '../../lib/unicode/unicode_names.js';
import { looseSheetShapes } from './leftovers.js';

/**
 * The card, or nothing at all when there is nothing loose.
 *
 * Returning null rather than an empty card is deliberate: a panel that says
 * "no loose shapes" on every project that never imported a sheet is a
 * permanent piece of furniture answering a question nobody asked.
 *
 * @returns {Element|null}
 */
export function makeLooseShapesCard() {
	const editor = getCurrentProjectEditor();
	const loose = looseSheetShapes(editor.project);
	if (!loose.length) return null;

	const card = makeElement({ className: 'studio-card overview__loose' });
	card.appendChild(
		makeElement({ tag: 'h2', className: 'studio-card__title', content: 'Shapes without a character' })
	);
	card.appendChild(
		makeElement({
			className: 'overview__loose-note',
			content:
				loose.length === 1
					? 'One shape from a specimen sheet is not assigned yet.'
					: `${loose.length} shapes from a specimen sheet are not assigned yet.`,
		})
	);

	const grid = makeElement({ className: 'overview__loose-grid' });
	loose.forEach(({ id, component }) => grid.appendChild(makeLooseTile(id, component)));
	card.appendChild(grid);

	return card;
}

/**
 * One loose shape: what it looks like, and the way to give it a character.
 * @param {String} id - the component id
 * @param {Object} component
 * @returns {Element}
 */
function makeLooseTile(id, component) {
	const tile = makeElement({
		tag: 'button',
		className: 'overview__loose-tile',
		attributes: {
			type: 'button',
			draggable: 'true',
			title: `Drag ${component.name || 'this shape'} onto a character, or press to pick one`,
		},
		onClick: () => chooseCharacterFor(id, component),
	});

	/*
		Dragging is the second way, never the only one. It cannot be done from a
		keyboard, so the tile stays a button that opens the same chooser - and
		the two end in the same function, so they cannot drift apart.
	*/
	tile.addEventListener('dragstart', (event) => {
		dragging = id;
		event.dataTransfer?.setData(DRAG_TYPE, id);
		event.dataTransfer?.setData('text/plain', component.name || id);
		if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
		document.body.setAttribute('dragging-sheet-shape', '');
	});

	tile.addEventListener('dragend', () => {
		dragging = null;
		document.body.removeAttribute('dragging-sheet-shape');
		clearDropTarget();
	});

	tile.appendChild(makeShapeThumbnail(component));
	tile.appendChild(
		makeElement({ tag: 'span', className: 'overview__loose-label', content: 'Assign' })
	);
	return tile;
}

/* --------------------------------------------------------
	Dropping one on a character
-------------------------------------------------------- */

/** What the drag carries. A private type, so nothing else answers to it. */
const DRAG_TYPE = 'application/x-glyva-sheet-shape';

/**
 * The component being dragged.
 *
 * Kept here rather than read back off the event, because `getData` is only
 * readable on drop - during dragover the payload is deliberately unreadable,
 * and dragover is where a target has to decide whether it wants it.
 */
let dragging = null;

/** The tile currently under the pointer, so it can be un-marked. */
let markedTile = null;

function clearDropTarget() {
	markedTile?.removeAttribute('sheet-shape-target');
	markedTile = null;
}

/**
 * Lets a loose shape be dropped onto any character in a grid.
 *
 * Delegated to the container rather than bound per tile: the grid rebuilds
 * itself whenever the range or the search changes, and per-tile listeners
 * would go with it.
 *
 * @param {Element} root - a container holding glyph-tile elements
 */
export function enableShapeDropTargets(root) {
	if (!root) return;

	const tileUnder = (event) => {
		const target = event.target;
		if (!(target instanceof Element)) return null;
		// Events from inside a glyph-tile are retargeted to the host, so this
		// finds the tile whether the pointer is over its canvas or its caption.
		return target.closest('glyph-tile[displayed-item-id]');
	};

	root.addEventListener('dragover', (event) => {
		if (!dragging) return;
		const tile = tileUnder(event);
		if (!tile) return;
		event.preventDefault();
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
		if (tile !== markedTile) {
			clearDropTarget();
			tile.setAttribute('sheet-shape-target', '');
			markedTile = tile;
		}
	});

	root.addEventListener('dragleave', (event) => {
		const tile = tileUnder(event);
		if (tile && tile === markedTile) clearDropTarget();
	});

	root.addEventListener('drop', (event) => {
		if (!dragging) return;
		const tile = tileUnder(event);
		if (!tile) return;
		event.preventDefault();
		const itemID = tile.getAttribute('displayed-item-id');
		const id = dragging;
		dragging = null;
		document.body.removeAttribute('dragging-sheet-shape');
		clearDropTarget();
		if (itemID) assignShapeToItem(id, itemID);
	});
}

/**
 * The outline itself, drawn from the component's own shapes.
 *
 * Font space runs y up and SVG runs y down, so the whole thing is flipped once
 * on the way out rather than every coordinate being negated by hand.
 *
 * @param {Object} component
 * @returns {Element}
 */
function makeShapeThumbnail(component) {
	const box = makeElement({ className: 'overview__loose-thumb' });
	const maxes = component.maxes;
	if (!maxes || !Number.isFinite(maxes.xMin)) return box;

	const width = Math.max(1, maxes.xMax - maxes.xMin);
	const height = Math.max(1, maxes.yMax - maxes.yMin);
	const path = component.svgPathData;
	if (!path) return box;

	box.innerHTML =
		`<svg viewBox="${maxes.xMin} ${-maxes.yMax} ${width} ${height}" ` +
		`preserveAspectRatio="xMidYMid meet" aria-hidden="true">` +
		`<g transform="scale(1,-1)"><path d="${path}" fill="currentColor" fill-rule="nonzero"/></g></svg>`;
	return box;
}

/**
 * Asks which character this shape is, and makes it one.
 * @param {String} id - the component id
 * @param {Object} component
 */
function chooseCharacterFor(id, component) {
	const editor = getCurrentProjectEditor();

	const content = makeAllItemTypeChooserContent(
		(itemID) => assignShapeToItem(id, itemID),
		'Characters',
		editor,
		{ tileSize: 'large', countPlacement: 'inside' }
	);

	showModalDialog(content, 912, {
		title: 'Which character is this?',
		subtitle: 'The shape becomes that character, and leaves this list.',
	});
}

/**
 * The readable name of a character, from a project item id.
 * @param {String} itemID - such as glyph-0x21
 * @returns {String} the name, or an empty string when there is not one
 */
function unicodeNameFor(itemID) {
	const name = getUnicodeName(String(itemID).replace(/^glyph-/, ""));
	return !name || name.startsWith("[") ? "" : name;
}

/**
 * Moves a loose shape into a character.
 *
 * The shape BECOMES the character rather than being placed in it as a
 * component instance. An instance is an indirection the user did not ask for -
 * they said this shape is that letter - and it would leave the component in
 * the project as a second thing to understand.
 *
 * @param {String} id - the component id
 * @param {String} itemID - the glyph to become
 */
function assignShapeToItem(id, itemID) {
	const editor = getCurrentProjectEditor();
	const project = editor.project;
	// Looked up rather than passed in: a drop carries an id and nothing else.
	const component = project.components?.[id];
	if (!component) return;

	/*
		Asked WITHOUT forceCreateItem on purpose. That flag makes getItem call
		addWholeProjectChangePostState itself, which would land a stray post
		state inside the pair opened below and split one action into two halves
		that undo separately. The character is made here instead, by the adder,
		which touches no history at all.
	*/
	let target = project.getItem(itemID);

	/*
		Named from the id rather than from the item, because the item may not
		exist yet - and a history entry reading "glyph-0x21" is a worse answer
		to "what did I just do" than "Exclamation Mark".

		getUnicodeName wants a bare code point, and returns the string
		"[name not found]" rather than nothing when it cannot place one - so
		both the prefix and that sentinel have to be handled, or the entry ends
		up reading worse than the id it replaced.
	*/
	const targetName = target?.name || unicodeNameFor(itemID) || itemID;
	editor.history.addWholeProjectChangePreState(`Assign a traced shape to ${targetName}`);

	if (!target) target = project.addItemByType(new Glyph({ id: itemID }), 'Glyph', itemID);
	if (!target) {
		showToast('That character could not be created.');
		return;
	}

	target.shapes = component.shapes;
	if (component.advanceWidth) target.advanceWidth = component.advanceWidth;
	target.changed();
	delete project.components[id];

	editor.history.addWholeProjectChangePostState();

	closeEveryTypeOfDialog();
	editor.navigate();
	showToast(`Assigned to ${targetName}`);
}
