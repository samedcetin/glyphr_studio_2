import { getCurrentProjectEditor } from '../app/main.js';
import { addAsChildren, makeElement } from '../common/dom.js';
import { clone, deg, rad, round } from '../common/functions.js';
import { makeActionButton } from './action_buttons.js';
import { makeSingleLabel } from './cards.js';

// --------------------------------------------------------------
// Transforms panel
// --------------------------------------------------------------

/*
	Transform.

	This was three cards - Horizontal skew, Offset path, Rotation - each with
	a heading restating the label underneath it, spending 280 pixels on four
	number fields. They are one card now. The section header already says
	Transform, so the three headings said nothing the panel had not said.

	The other half of the change is what these fields mean. They are not
	properties like x or width, they are verbs: "rotate by fifteen degrees".
	So:

		- Enter applies, the way Enter commits every other field in the app.
		  It used to do nothing at all - the only way to act on a value was to
		  notice a button that had appeared while you were typing.

		- The Apply button is always there, and disabled when there is nothing
		  to apply. It used to appear only once a shape was selected AND the
		  value was non-zero. The code meant to show it disabled in between;
		  two branches down, the else took that case and hid it again.
		  Standing disabled, it is also the panel's empty state: with nothing
		  selected, four greyed buttons say so.

		- The value stays after applying, so pressing Enter twice rotates
		  twice. Clearing the field would read more like a verb, and would
		  cost the most common use of these controls.
*/

/**
 * The turns and flips that have a single obvious amount, so no field is
 * needed to name it.
 *
 * The two flips used to live in the Properties action grid, which is where
 * you looked for them if you already knew. They are transforms, and this is
 * the Transform panel.
 */
const quickTransforms = [
	{
		iconName: 'rotateCounterclockwise',
		title: 'Rotate 90° counterclockwise',
		run: (editor) => rotateSelection(editor, -90),
	},
	{
		iconName: 'rotateClockwise',
		title: 'Rotate 90° clockwise',
		run: (editor) => rotateSelection(editor, 90),
	},
	{
		iconName: 'rotate180',
		title: 'Rotate 180°',
		run: (editor) => rotateSelection(editor, 180),
	},
	{
		iconName: 'flipHorizontal',
		title: 'Flip horizontally\nMirrors the selection about a vertical line.',
		run: (editor) => flipSelection(editor, 'flipEW', 'horizontally'),
	},
	{
		iconName: 'flipVertical',
		title: 'Flip vertically\nMirrors the selection about a horizontal line.',
		run: (editor) => flipSelection(editor, 'flipNS', 'vertically'),
	},
];

/**
 * The four transforms, in the order they get used: rotation first, then the
 * skew pair, then offset. Each one knows how to apply itself and what to call
 * the history state it leaves behind.
 */
const transformOperations = [
	{
		id: 'rotation',
		label: 'Rotation angle',
		info: `Select shapes, then enter an angle and press Enter, or use Apply.
			<br><br>
			A positive value rotates clockwise, a negative value counterclockwise.
			Rotation is about the centre of the selection.`,
		apply: (editor, value) => rotateSelection(editor, value),
	},
	{
		id: 'skewAngle',
		label: 'Skew angle',
		info: `Select shapes, then enter an angle and press Enter, or use Apply.
			<br><br>
			A positive value skews to the right, a negative value to the left.
			This is the italicising transform.`,
		apply: (editor, value) => {
			const count = skewSelectedPaths(editor, 'skewAngle', value);
			return `Skew ${count} ${count === 1 ? 'shape' : 'shapes'} by ${value}°`;
		},
	},
	{
		id: 'skewDistance',
		label: 'Skew distance',
		info: `The same skew, measured as how far the top of the path travels
			rather than as an angle.
			<br><br>
			The two fields track each other while a single path is selected. With
			several selected they cannot: each path is skewed against its own
			height, so one distance is a different angle for each of them.`,
		apply: (editor, value) => {
			const count = skewSelectedPaths(editor, 'skewDistance', value);
			return `Skew ${count} ${count === 1 ? 'shape' : 'shapes'} by ${value}em`;
		},
	},
	{
		id: 'offsetPath',
		label: 'Offset distance',
		info: `Select shapes, then enter a distance and press Enter, or use Apply.
			<br><br>
			A positive value expands the path, a negative value contracts it.`,
		apply: (editor, value) => offsetSelectedPaths(editor, value),
	},
];

export function makePanel_Transforms() {
	const editor = getCurrentProjectEditor();
	const card = makeElement({ className: 'panel__card' });

	card.appendChild(makeQuickTransformsArea());

	transformOperations.forEach((operation) => {
		addAsChildren(card, makeTransformRow(operation));
	});

	editor.subscribe({
		topic: 'whichShapeIsSelected',
		subscriberID: `transformsPanel.applyButtons`,
		callback: () => refreshTransformControls(),
	});

	/*
		The card is built before it is in the document, so a refresh now could
		not find its own controls by id.
	*/
	window.setTimeout(refreshTransformControls, 0);

	return [card];
}

/**
 * The row of one-click turns and flips at the top of the card.
 * @returns {HTMLElement}
 */
function makeQuickTransformsArea() {
	const area = makeElement({ className: 'panel__actions-area' });

	quickTransforms.forEach((quickTransform) => {
		const button = makeActionButton({
			iconName: quickTransform.iconName,
			title: quickTransform.title,
			disabled: true,
			id: `quickTransform_${quickTransform.iconName}`,
			onClick: () => {
				const editor = getCurrentProjectEditor();
				if (!editor.multiSelect.shapes.length) return;

				editor.history.addState(quickTransform.run(editor));
				editor.publish('currentItem', editor.selectedItem);
			},
		});

		area.appendChild(button);
	});

	return area;
}

/**
 * One label / field / Apply row.
 * @param {Object} operation - an entry from transformOperations
 * @returns {Array} the label and the row, for the card's two-column grid
 */
function makeTransformRow(operation) {
	const label = makeSingleLabel(operation.label, operation.info);

	const input = makeElement({
		tag: 'input-number',
		attributes: { id: `${operation.id}_input`, value: '0' },
	});

	const applyButton = makeElement({
		tag: 'fancy-button',
		attributes: { secondary: '', disabled: '', id: `${operation.id}_applyButton` },
		innerHTML: 'Apply',
	});

	/* A fancy-button is not a <button>, so `disabled` does not stop a click. */
	const run = () => {
		if (applyButton.hasAttribute('disabled')) return;
		applyTransform(operation, Number(input.getAttribute('value')));
	};

	applyButton.addEventListener('click', run);

	input.addEventListener('change', () => {
		mirrorSkewUnits(operation, input);
		refreshTransformControls();
	});

	/*
		input-number commits on blur, so on Enter the host attribute still holds
		the last committed value rather than what is on screen. commit() pushes
		the typed text through first, and this acts on the result.
	*/
	input.addEventListener('keydown', (event) => {
		if (event.key !== 'Enter') return;
		event.preventDefault();
		// @ts-expect-error 'method does exist on input-number'
		input.commit();
		run();
	});

	const row = makeElement({ className: 'doubleInput' });
	addAsChildren(row, [input, makeElement({ tag: 'span' }), applyButton]);

	return [label, row];
}

// --------------------------------------------------------------
// Applying
// --------------------------------------------------------------

/**
 * Run one transform over the selection and record it.
 * @param {Object} operation - an entry from transformOperations
 * @param {Number} value - the amount, in that transform's own units
 */
function applyTransform(operation, value) {
	const editor = getCurrentProjectEditor();
	if (!editor.multiSelect.shapes.length || !value) return;

	editor.history.addState(operation.apply(editor, value));
	editor.publish('currentItem', editor.selectedItem);
	refreshTransformControls();
}

/**
 * Rotate the selection about its own centre.
 *
 * The one origin every rotation here uses - the field and all three
 * turns - so they cannot disagree. It is not the Properties panel's
 * transform origin, which applies to resizing only.
 *
 * @param {Object} editor - the current project editor
 * @param {Number} degreesClockwise - positive turns clockwise
 * @returns {String} the history state title
 */
function rotateSelection(editor, degreesClockwise) {
	const msShapes = editor.multiSelect.shapes;
	const count = msShapes.length;

	msShapes.rotate(rad(degreesClockwise * -1), clone(msShapes.maxes.center));
	return `Rotated ${count} ${count === 1 ? 'shape' : 'shapes'} by ${degreesClockwise}°`;
}

/**
 * Mirror the selection about its own centre line.
 * @param {Object} editor - the current project editor
 * @param {String} method - 'flipEW' mirrors left to right, 'flipNS' top to bottom
 * @param {String} direction - for the history state
 * @returns {String} the history state title
 */
function flipSelection(editor, method, direction) {
	const count = editor.multiSelect.shapes.length;

	editor.multiSelect.shapes.virtualGlyph[method]();
	return `Flipped ${count} ${count === 1 ? 'shape' : 'shapes'} ${direction}`;
}

/**
 * Skew every selected path, in place.
 *
 * This used to build a new Path per shape, delete the originals, and append
 * the copies - which quietly moved every skewed shape to the top of the
 * stack. Skew a path that sits behind another and it jumped in front of it,
 * and undo did not put it back. Path.skewAngle and Path.skewDistance both
 * mutate the path they are called on, so there was never anything to replace.
 *
 * @param {Object} editor - the current project editor
 * @param {String} method - 'skewAngle' or 'skewDistance'
 * @param {Number} amount - degrees, or em units travelled by the top edge
 * @returns {Number} how many paths were skewed
 */
function skewSelectedPaths(editor, method, amount) {
	let count = 0;

	editor.multiSelect.shapes.members.forEach((shape) => {
		/* A component instance has no outline of its own to skew. */
		if (shape.objType !== 'Path') return;
		shape[method](amount);
		count++;
	});

	if (count) editor.selectedItem.changed();
	return count;
}

/**
 * Offset every selected path.
 *
 * Offsetting does produce a new path, so this one is a replacement - but a
 * replacement at the same index, carrying the old name, with the selection
 * rewritten to point at it. Deleting and appending reordered the layers.
 *
 * @param {Object} editor - the current project editor
 * @param {Number} distance - em units; positive expands
 * @returns {String} the history state title
 */
function offsetSelectedPaths(editor, distance) {
	const item = editor.selectedItem;
	/* A copy - the loop rewrites the selection as it goes. */
	const selShapes = editor.multiSelect.shapes.members.slice();
	const newSelection = [];
	let count = 0;

	selShapes.forEach((shape) => {
		const index = item.shapes.indexOf(shape);
		if (shape.objType !== 'Path' || index === -1) {
			newSelection.push(shape);
			return;
		}

		const offsetShape = shape.makePolySegment().makeOffsetPolySegment(distance).path;
		offsetShape.name = shape.name;
		offsetShape.parent = item;
		item.shapes[index] = offsetShape;
		newSelection.push(offsetShape);
		count++;
	});

	item.changed();
	editor.multiSelect.shapes.members = newSelection;
	return `Offset path for ${count} ${count === 1 ? 'shape' : 'shapes'}`;
}

// --------------------------------------------------------------
// Helpers
// --------------------------------------------------------------

/**
 * Enable or disable every Apply button for what is currently selected.
 */
function refreshTransformControls() {
	const editor = getCurrentProjectEditor();
	const hasSelection = editor.multiSelect.shapes.length > 0;

	quickTransforms.forEach((quickTransform) => {
		const button = document.getElementById(`quickTransform_${quickTransform.iconName}`);
		if (!button) return;
		if (hasSelection) button.removeAttribute('disabled');
		else button.setAttribute('disabled', 'disabled');
	});

	transformOperations.forEach((operation) => {
		const input = document.getElementById(`${operation.id}_input`);
		const applyButton = document.getElementById(`${operation.id}_applyButton`);
		if (!input || !applyButton) return;

		if (hasSelection && Number(input.getAttribute('value')) !== 0) {
			applyButton.removeAttribute('disabled');
		} else {
			applyButton.setAttribute('disabled', '');
		}
	});
}

/**
 * Keep skew angle and skew distance showing the same skew.
 *
 * They are one operation in two units - the distance is how far the top of the
 * path travels, so distance = yMax * tan(angle). Two fields that never spoke
 * to each other read as two different transforms.
 *
 * Path.skewDistance measures against the path's own yMax, so the conversion
 * only holds while there is exactly one path to measure. With several
 * selected, the other field is left alone rather than shown a number that is
 * true of none of them.
 *
 * @param {Object} operation - the operation whose field just changed
 * @param {HTMLElement} input - that field
 */
function mirrorSkewUnits(operation, input) {
	if (operation.id !== 'skewAngle' && operation.id !== 'skewDistance') return;

	const selected = getCurrentProjectEditor().multiSelect.shapes.members;
	if (selected.length !== 1 || selected[0].objType !== 'Path') return;

	const yMax = selected[0].maxes.yMax;
	if (!yMax) return;

	const value = Number(input.getAttribute('value'));

	if (operation.id === 'skewAngle') {
		const distanceInput = document.getElementById('skewDistance_input');
		if (distanceInput) {
			distanceInput.setAttribute('value', `${round(yMax * Math.tan(rad(value)), 2)}`);
		}
	} else {
		const angleInput = document.getElementById('skewAngle_input');
		if (angleInput) {
			angleInput.setAttribute('value', `${round(deg(Math.atan(value / yMax)), 2)}`);
		}
	}
}
