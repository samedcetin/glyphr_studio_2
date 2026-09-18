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
		attributes: { type: 'button', title: `Give ${component.name || 'this shape'} a character` },
		onClick: () => chooseCharacterFor(id, component),
	});

	tile.appendChild(makeShapeThumbnail(component));
	tile.appendChild(
		makeElement({ tag: 'span', className: 'overview__loose-label', content: 'Assign' })
	);
	return tile;
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
		(itemID) => assignShapeToItem(id, component, itemID),
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
 * Moves a loose shape into a character.
 *
 * The shape BECOMES the character rather than being placed in it as a
 * component instance. An instance is an indirection the user did not ask for -
 * they said this shape is that letter - and it would leave the component in
 * the project as a second thing to understand.
 *
 * @param {String} id - the component id
 * @param {Object} component
 * @param {String} itemID - the glyph to become
 */
function assignShapeToItem(id, component, itemID) {
	const editor = getCurrentProjectEditor();
	const project = editor.project;

	/*
		Asked WITHOUT forceCreateItem on purpose. That flag makes getItem call
		addWholeProjectChangePostState itself, which would land a stray post
		state inside the pair opened below and split one action into two halves
		that undo separately. The character is made here instead, by the adder,
		which touches no history at all.
	*/
	let target = project.getItem(itemID);

	editor.history.addWholeProjectChangePreState(
		`Assign a traced shape to ${target?.name || itemID}`
	);

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
	showToast(`Assigned to ${target.name || itemID}`);
}
