import { getCurrentProjectEditor } from '../app/main.js';
import { makeElement } from '../common/dom.js';
import { deg, rad, resolveTransformOrigin, round } from '../common/functions.js';
import { makeLineIcon } from '../common/icons.js';
import { makeActionButton } from './action_buttons.js';
import { makeTransformOriginGrid, syncTransformOriginChoosers } from './transform_origin.js';

// --------------------------------------------------------------
// Transforms panel
// --------------------------------------------------------------

/*
	Transform, laid out the way a designer already knows how to read it.

	This was three cards - Horizontal skew, Offset path, Rotation - each with a
	heading restating the label underneath it, spending 280 pixels on four
	number fields. Then one card with a twelve-name dropdown for the origin,
	which came to 316.

	It is 180 now, and the saving is not compression for its own sake. It is
	Figma's transform idiom, which most designers arrive already fluent in:

		- Each field says what it is from the inside. A mark on the left for
		  the transform, the unit on the right. A label above every field cost
		  a whole row each and said no more than the mark does.

		- The origin is a grid of the twelve points, drawn as the em box they
		  sit in, rather than a list of twelve names. Illustrator and Figma
		  both put a reference point on a grid, and you can hit the corner you
		  want without reading anything.

		- Skew angle and skew distance share a row, because they are one
		  operation in two units and always show the same skew.

		- Apply is a 28px square at the end of its row rather than a word.
		  Enter does the same thing from the field, the way Enter commits
		  every other field in the app - it used to do nothing at all, so the
		  only way to act on a value was to notice a button that had appeared
		  while you were typing.

	What is not borrowed: Figma's alignment row aligns to a frame, and nothing
	here aligns shapes in the em box yet; its constraint dropdowns belong to
	auto-layout.

	The value stays in the field after applying, so pressing Enter twice
	rotates twice. Clearing it would read more like a verb and would cost the
	most common use of these controls.
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
		prefix: 'angle',
		suffix: '°',
		hint: 'Rotation angle\nPositive turns clockwise, negative counterclockwise, about the origin.\nEnter applies.',
		apply: (editor, value) => rotateSelection(editor, value),
	},
	{
		id: 'skewAngle',
		prefix: 'skew',
		suffix: '°',
		hint: 'Skew angle\nPositive leans right, negative leans left. The italicising transform.\nEnter applies.',
		apply: (editor, value) => {
			const count = skewSelectedPaths(editor, 'skewAngle', value);
			return `Skew ${count} ${count === 1 ? 'shape' : 'shapes'} by ${value}°`;
		},
	},
	{
		id: 'skewDistance',
		prefix: 'skewDistance',
		suffix: 'em',
		hint: 'Skew distance\nThe same skew, as how far the top of the path travels.\nTracks the angle beside it while one path is selected.\nEnter applies.',
		apply: (editor, value) => {
			const count = skewSelectedPaths(editor, 'skewDistance', value);
			return `Skew ${count} ${count === 1 ? 'shape' : 'shapes'} by ${value}em`;
		},
	},
	{
		id: 'offsetPath',
		prefix: 'offsetPath',
		suffix: 'em',
		hint: 'Offset distance\nPositive expands the path, negative contracts it.\nEnter applies.',
		apply: (editor, value) => offsetSelectedPaths(editor, value),
	},
];

/** Lookup by id, for the row builders below. */
const operationsById = Object.fromEntries(transformOperations.map((op) => [op.id, op]));

/** The rows, and which fields share each row's Apply. */
const transformRows = [['rotation'], ['skewAngle', 'skewDistance'], ['offsetPath']];

export function makePanel_Transforms() {
	const editor = getCurrentProjectEditor();
	const card = makeElement({ className: 'panel__card transform-card' });

	/*
		The header: the turns and flips that need no amount, and the origin
		every one of them pivots about, side by side.
	*/
	const header = makeElement({ className: 'transform-card__header' });
	header.appendChild(makeQuickTransformsArea());
	header.appendChild(
		makeTransformOriginGrid((origin) => {
			const current = getCurrentProjectEditor();
			transformOriginOwner(current).transformOrigin = origin;
			syncTransformOriginChoosers(origin);
			current.publish('editCanvasView', current.selectedItem);
		})
	);
	card.appendChild(header);

	transformRows.forEach((ids) => card.appendChild(makeTransformFieldRow(ids)));

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
 * A row of one or two fields and the Apply that commits them.
 *
 * Two fields share an Apply when they share an operation - skew angle and
 * skew distance are the same skew, so two buttons would have done the same
 * thing twice.
 *
 * @param {Array} ids - operation ids, left to right
 * @returns {HTMLElement}
 */
function makeTransformFieldRow(ids) {
	const row = makeElement({
		className: ids.length > 1 ? 'transform-card__row transform-card__row--pair' : 'transform-card__row',
	});

	const inputs = ids.map((id) => makeTransformField(operationsById[id]));
	inputs.forEach((input) => row.appendChild(input));

	/*
		Which field the button acts on: the one holding a value. With a pair
		they are the same skew in two units, so either will do - the angle is
		the one that reads as the transform, and it is preferred.
	*/
	const run = () => {
		if (applyButton.hasAttribute('disabled')) return;
		const active =
			inputs.find((input) => Number(input.getAttribute('value')) !== 0) || inputs[0];
		applyTransform(operationsById[active.dataset.operation], Number(active.getAttribute('value')));
	};

	const applyButton = makeElement({
		tag: 'button',
		className: 'transform-card__apply',
		title: 'Apply\nOr press Enter in the field.',
		content: makeLineIcon('check', 18),
		attributes: { id: `${ids[0]}_applyButton`, disabled: 'disabled' },
	});

	applyButton.addEventListener('click', run);

	inputs.forEach((input) => {
		input.addEventListener('change', () => {
			mirrorSkewUnits(operationsById[input.dataset.operation], input);
			refreshTransformControls();
		});

		/*
			input-number commits on blur, so on Enter the host attribute still
			holds the last committed value rather than what is on screen.
			commit() pushes the typed text through first, and this acts on the
			result.
		*/
		input.addEventListener('keydown', (event) => {
			if (event.key !== 'Enter') return;
			event.preventDefault();
			// @ts-expect-error 'method does exist on input-number'
			input.commit();
			if (applyButton.hasAttribute('disabled')) return;
			applyTransform(operationsById[input.dataset.operation], Number(input.getAttribute('value')));
		});
	});

	row.appendChild(applyButton);
	return row;
}

/**
 * One number field, wearing its own name and unit.
 * @param {Object} operation - an entry from transformOperations
 * @returns {HTMLElement}
 */
function makeTransformField(operation) {
	const input = makeElement({
		tag: 'input-number',
		title: operation.hint,
		attributes: {
			id: `${operation.id}_input`,
			value: '0',
			prefix: operation.prefix,
			suffix: operation.suffix,
			'data-operation': operation.id,
		},
	});

	return input;
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
 * Rotate the selection about the chosen origin.
 *
 * The one place rotation happens - the field and all three turns - so they
 * cannot disagree about where the pivot is. It used to be the centre of the
 * selection, always, whatever the origin said.
 *
 * @param {Object} editor - the current project editor
 * @param {Number} degreesClockwise - positive turns clockwise
 * @returns {String} the history state title
 */
function rotateSelection(editor, degreesClockwise) {
	const msShapes = editor.multiSelect.shapes;
	const count = msShapes.length;

	msShapes.rotate(rad(degreesClockwise * -1), selectionOrigin(editor));
	return `Rotated ${count} ${count === 1 ? 'shape' : 'shapes'} by ${degreesClockwise}°`;
}

/**
 * Mirror the selection about the chosen origin.
 *
 * The flips were the last transform still using an origin of their own - the
 * centre of the selection, whatever the origin said - which is the thing the
 * grid above them was put there to stop. flipEW mirrors about a vertical line,
 * so it takes the origin's x; flipNS about a horizontal one, so it takes the y.
 *
 * @param {Object} editor - the current project editor
 * @param {String} method - 'flipEW' mirrors left to right, 'flipNS' top to bottom
 * @param {String} direction - for the history state
 * @returns {String} the history state title
 */
function flipSelection(editor, method, direction) {
	const count = editor.multiSelect.shapes.length;
	const origin = selectionOrigin(editor);

	editor.multiSelect.shapes.virtualGlyph[method](method === 'flipEW' ? origin.x : origin.y);
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
 * They also take the point to skew away from, which used to be left at its
 * default of y = 0 whatever the origin said.
 *
 * @param {Object} editor - the current project editor
 * @param {String} method - 'skewAngle' or 'skewDistance'
 * @param {Number} amount - degrees, or em units travelled by the top edge
 * @returns {Number} how many paths were skewed
 */
function skewSelectedPaths(editor, method, amount) {
	const origin = selectionOrigin(editor);
	let count = 0;

	editor.multiSelect.shapes.members.forEach((shape) => {
		/* A component instance has no outline of its own to skew. */
		if (shape.objType !== 'Path') return;
		shape[method](amount, origin);
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
 * Whose transform origin applies.
 *
 * Exactly the object the Properties panel is showing: the one selected shape,
 * the virtual glyph standing in for several, or the glyph itself when nothing
 * is selected. Anything else and the origin on screen would belong to
 * something other than what is about to be transformed.
 *
 * @param {Object} editor - the current project editor
 * @returns {Object} the item carrying the transformOrigin
 */
function transformOriginOwner(editor) {
	const msShapes = editor.multiSelect.shapes;
	if (msShapes.length === 1) return msShapes.singleton;
	if (msShapes.length > 1) return msShapes.virtualGlyph;
	return editor.selectedItem;
}

/**
 * The chosen origin as a point, against the selection being transformed.
 * @param {Object} editor - the current project editor
 * @returns {Object} x and y of the point that stays put
 */
function selectionOrigin(editor) {
	return resolveTransformOrigin(
		editor.multiSelect.shapes.maxes,
		transformOriginOwner(editor).transformOrigin
	);
}

/**
 * Enable or disable every Apply button for what is currently selected, and
 * keep the origin chooser showing whose origin is in play.
 */
function refreshTransformControls() {
	const editor = getCurrentProjectEditor();
	const hasSelection = editor.multiSelect.shapes.length > 0;

	/*
		The owner changes with the selection, so the chooser follows rather than
		holding the value it was built with.
	*/
	syncTransformOriginChoosers(transformOriginOwner(editor).transformOrigin);

	quickTransforms.forEach((quickTransform) => {
		const button = document.getElementById(`quickTransform_${quickTransform.iconName}`);
		if (!button) return;
		if (hasSelection) button.removeAttribute('disabled');
		else button.setAttribute('disabled', 'disabled');
	});

	/*
		With nothing selected the fields go dead too, not just the buttons.
		Four live fields that do nothing was the old empty state, and it took an
		info bubble to explain itself.
	*/
	transformOperations.forEach((operation) => {
		const input = document.getElementById(`${operation.id}_input`);
		if (!input) return;
		if (hasSelection) input.removeAttribute('disabled');
		else input.setAttribute('disabled', '');
	});

	/* One Apply per row, enabled when any field in that row holds a value. */
	transformRows.forEach((ids) => {
		const applyButton = document.getElementById(`${ids[0]}_applyButton`);
		if (!applyButton) return;

		const hasValue = ids.some((id) => {
			const input = document.getElementById(`${id}_input`);
			return input && Number(input.getAttribute('value')) !== 0;
		});

		if (hasSelection && hasValue) applyButton.removeAttribute('disabled');
		else applyButton.setAttribute('disabled', 'disabled');
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
