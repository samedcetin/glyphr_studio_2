import { getCurrentProjectEditor } from '../app/main.js';
import { makeElement } from '../common/dom.js';
import { deg, rad, resolveTransformOrigin, round } from '../common/functions.js';
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

	It is Figma's transform idiom, which most designers arrive already fluent
	in, down to the shape of the block:

		- Fields stacked in a column on the left, the origin grid and the
		  one-click transforms stacked on the right, the icons under the grid
		  they pivot about.

		- Each field says what it is from the inside. A mark on the left for
		  the transform, the unit on the right. A label above every field cost
		  a whole row each and said no more than the mark does.

		- The origin is a grid of the twelve points, drawn as the em box they
		  sit in, rather than a list of twelve names. Illustrator and Figma
		  both put a reference point on a grid, and you can hit the corner you
		  want without reading anything.

		- No Apply. A field takes effect as you leave it, the way every other
		  field in this app does, and the number in it is how much of that
		  transform the selection is currently carrying - so it reads as a
		  state rather than as a pending instruction.

	That last one is what makes the rest of it work, and it is worth being
	precise about: these are relative operations, so applying a value twice
	would compound it. Each field remembers what it has already applied and
	acts on the difference. Nudge rotation from 15 to 16 and the shape turns
	one more degree, not sixteen more. The amounts reset when the selection
	changes, because a new selection is carrying none of them.

	What is not borrowed: Figma's alignment row aligns to a frame, and nothing
	here aligns shapes in the em box yet; its constraint dropdowns belong to
	auto-layout.
*/

/**
 * The turns and flips that have a single obvious amount, so no field is
 * needed to name it.
 *
 * Three, not five. A counterclockwise quarter turn and a half turn were each
 * a second way to reach somewhere this row already reaches - press the
 * clockwise turn again, or type the angle in the field below. Five buttons
 * that resolve to three moves is a row you have to read rather than one you
 * can aim at.
 *
 * The two flips used to live in the Properties action grid, which is where
 * you looked for them if you already knew. They are transforms, and this is
 * the Transform panel.
 */
const quickTransforms = [
	{
		iconName: 'rotateClockwise',
		title: 'Rotate 90° clockwise\nPress again for 180° and 270°.',
		run: (editor) => rotateSelection(editor, 90),
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
		hint: 'Rotation\nHow far the selection is turned from where it started.\nPositive is clockwise, about the origin.',
		/* Rotations compose, so the difference is the difference. */
		apply: (editor, value, applied) => rotateSelection(editor, value - applied, value),
	},
	{
		id: 'skewAngle',
		prefix: 'skew',
		suffix: '°',
		hint: 'Skew angle\nHow far the selection is leaning. Positive leans right.\nThe italicising transform.',
		/*
			Shears compose by their tangents rather than their angles, so the
			step that takes a lean of `applied` to a lean of `value` is the
			angle whose tangent is the difference of the two tangents. Taking
			value - applied would drift: tan 12 + tan 1 is not tan 13.
		*/
		apply: (editor, value, applied) => {
			const step = deg(Math.atan(Math.tan(rad(value)) - Math.tan(rad(applied))));
			const count = skewSelectedPaths(editor, 'skewAngle', step);
			return `Skew ${count} ${count === 1 ? 'shape' : 'shapes'} by ${value}°`;
		},
	},
	{
		id: 'skewDistance',
		prefix: 'skewDistance',
		suffix: 'em',
		hint: 'Skew distance\nThe same lean, as how far the top of the path has travelled.\nTracks the angle above it while one path is selected.',
		/* This one is a linear shift, so it does take the plain difference. */
		apply: (editor, value, applied) => {
			const count = skewSelectedPaths(editor, 'skewDistance', value - applied);
			return `Skew ${count} ${count === 1 ? 'shape' : 'shapes'} by ${value}em`;
		},
	},
	{
		id: 'offsetPath',
		prefix: 'offsetPath',
		suffix: 'em',
		hint: 'Offset\nHow far the outline has been pushed out. Negative pulls it in.\nEach step rebuilds the outline, so many small steps are not the same as one big one.',
		/*
			The one that does not compose cleanly: offsetting by 20 and then by
			1 rebuilds the outline twice and does not land exactly where a
			single offset of 21 would. There is no closed form for that, short
			of keeping the original path aside for the length of an edit.
		*/
		apply: (editor, value, applied) => offsetSelectedPaths(editor, value - applied, value),
	},
];

/**
 * How much of each transform the current selection is carrying.
 *
 * These fields are relative operations shown as absolute state, so a field
 * has to know what it has already done to work out what is left to do.
 */
let appliedAmounts = {};

/**
 * The point this run of transforms is pivoting about.
 *
 * Resolving the origin afresh on every step would move the pivot as the
 * shape moves - a bounding box's centre is not where it was once the shape
 * inside it has turned 45 degrees. Two steps of 45 then landed somewhere a
 * single step of 90 does not, and coming back to 0 did not come back.
 *
 * So the pivot is fixed the moment a field leaves zero, and released when
 * every field is back at zero, when the selection changes, or when the
 * origin itself is changed.
 */
let pinnedOrigin = null;

export function makePanel_Transforms() {
	const editor = getCurrentProjectEditor();
	const card = makeElement({ className: 'panel__card transform-card' });

	/*
		Fields down the left, the origin grid and the one-click transforms down
		the right - the icons under the grid they pivot about.
	*/
	const body = makeElement({ className: 'transform-card__body' });

	const fields = makeElement({ className: 'transform-card__fields' });
	transformOperations.forEach((operation) => fields.appendChild(makeTransformField(operation)));

	const aside = makeElement({ className: 'transform-card__aside' });
	aside.appendChild(
		makeTransformOriginGrid((origin) => {
			const current = getCurrentProjectEditor();
			transformOriginOwner(current).transformOrigin = origin;
			/* A new pivot is a new run: what is already applied was not about it. */
			clearAppliedAmounts();
			syncTransformOriginChoosers(origin);
			current.publish('editCanvasView', current.selectedItem);
		})
	);
	aside.appendChild(makeQuickTransformsArea());

	body.appendChild(fields);
	body.appendChild(aside);
	card.appendChild(body);

	editor.subscribe({
		topic: 'whichShapeIsSelected',
		subscriberID: `transformsPanel.fields`,
		callback: () => {
			/* A new selection is carrying none of these transforms yet. */
			clearAppliedAmounts();
			refreshTransformControls();
		},
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
		},
	});

	/* Leaving the field is what applies it. There is no button to press. */
	input.addEventListener('change', () => {
		const value = Number(input.getAttribute('value'));
		applyTransform(operation, value);
		mirrorSkewUnits(operation, value);
		refreshTransformControls();
	});

	/*
		input-number commits on blur, so on Enter the host attribute still
		holds the last committed value rather than what is on screen.
		commit() pushes the typed text through, which fires the change above.
	*/
	input.addEventListener('keydown', (event) => {
		if (event.key !== 'Enter') return;
		event.preventDefault();
		// @ts-expect-error 'method does exist on input-number'
		input.commit();
	});

	return input;
}

// --------------------------------------------------------------
// Applying
// --------------------------------------------------------------

/**
 * Move the selection to the amount the field now shows.
 *
 * The field is a state, not an instruction, so this applies the difference
 * between what is already on the shapes and what is being asked for. Setting
 * 16 on a field that says 15 turns one more degree.
 *
 * @param {Object} operation - an entry from transformOperations
 * @param {Number} value - the amount the field now shows
 */
function applyTransform(operation, value) {
	const editor = getCurrentProjectEditor();
	const applied = appliedAmounts[operation.id] || 0;
	if (!editor.multiSelect.shapes.length || value === applied) return;

	/* First step of a run fixes the pivot for the rest of it. */
	if (!pinnedOrigin) pinnedOrigin = selectionOrigin(editor);

	const title = operation.apply(editor, value, applied);
	appliedAmounts[operation.id] = value;

	/* Back to nothing applied, so the next run picks its pivot fresh. */
	if (transformOperations.every((each) => !appliedAmounts[each.id])) pinnedOrigin = null;

	editor.history.addState(title);
	editor.publish('currentItem', editor.selectedItem);
}

/**
 * Put every field back to nothing applied.
 */
function clearAppliedAmounts() {
	appliedAmounts = {};
	pinnedOrigin = null;

	transformOperations.forEach((operation) => {
		const input = document.getElementById(`${operation.id}_input`);
		if (input) input.setAttribute('value', '0');
	});
}

/**
 * Rotate the selection about the chosen origin.
 *
 * The one place rotation happens - the field and all three turns - so they
 * cannot disagree about where the pivot is. It used to be the centre of the
 * selection, always, whatever the origin said.
 *
 * @param {Object} editor - the current project editor
 * @param {Number} degreesClockwise - how far to turn now; positive is clockwise
 * @param {Number =} reportAs - the total to name in history, if it differs
 * @returns {String} the history state title
 */
function rotateSelection(editor, degreesClockwise, reportAs) {
	const msShapes = editor.multiSelect.shapes;
	const count = msShapes.length;
	const total = reportAs === undefined ? degreesClockwise : reportAs;

	msShapes.rotate(rad(degreesClockwise * -1), selectionOrigin(editor));
	return `Rotated ${count} ${count === 1 ? 'shape' : 'shapes'} by ${total}°`;
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
 * @param {Number} distance - em units to push out now; positive expands
 * @param {Number =} reportAs - the total to name in history, if it differs
 * @returns {String} the history state title
 */
function offsetSelectedPaths(editor, distance, reportAs) {
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
	const total = reportAs === undefined ? distance : reportAs;
	return `Offset ${count} ${count === 1 ? 'shape' : 'shapes'} by ${total}em`;
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
	if (pinnedOrigin) return pinnedOrigin;

	return resolveTransformOrigin(
		editor.multiSelect.shapes.maxes,
		transformOriginOwner(editor).transformOrigin
	);
}

/**
 * Wake or kill the controls for what is currently selected, and keep the
 * origin chooser showing whose origin is in play.
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
 * The mirrored field is showing a skew that has just been applied, so its
 * applied amount moves with its display. Otherwise touching it next would
 * apply the difference from zero and skew the shape a second time.
 *
 * @param {Object} operation - the operation whose field just changed
 * @param {Number} value - what that field now shows
 */
function mirrorSkewUnits(operation, value) {
	if (operation.id !== 'skewAngle' && operation.id !== 'skewDistance') return;

	const selected = getCurrentProjectEditor().multiSelect.shapes.members;
	if (selected.length !== 1 || selected[0].objType !== 'Path') return;

	const yMax = selected[0].maxes.yMax;
	if (!yMax) return;

	const mirrored =
		operation.id === 'skewAngle'
			? { id: 'skewDistance', amount: round(yMax * Math.tan(rad(value)), 2) }
			: { id: 'skewAngle', amount: round(deg(Math.atan(value / yMax)), 2) };

	const input = document.getElementById(`${mirrored.id}_input`);
	if (!input) return;

	/* setAttribute does not fire change, so this display move applies nothing. */
	input.setAttribute('value', `${mirrored.amount}`);
	appliedAmounts[mirrored.id] = mirrored.amount;
}
