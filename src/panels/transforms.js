import { getCurrentProjectEditor } from '../app/main.js';
import { makeElement } from '../common/dom.js';
import { clone, rad } from '../common/functions.js';

// --------------------------------------------------------------
// Transforms panel
// --------------------------------------------------------------

export function makePanel_Transforms() {
	// log(`makePanel_Transforms`, 'start');

	let skewCard = makeSkewCard();
	let offsetPathCard = makeOffsetCard();
	let rotationCard = makeRotationCard();

	// log(`makePanel_Transforms`, 'end');
	return [skewCard, offsetPathCard, rotationCard];
}

// --------------------------------------------------------------
// Skew
// --------------------------------------------------------------

function makeSkewCard() {
	const editor = getCurrentProjectEditor();
	// Skew
	let skewCard = makeElement({
		className: 'panel__card',
		innerHTML: `
				<h3>Horizontal skew</h3>
				<label class="info">
					<span>Skew angle</span>
					<info-bubble>
						Select shapes, then provide a skew angle to apply. <br><br>
						A positive value will skew the path to the right, and a negative value will skew the path to the left.
					</info-bubble>
				</label>
				<div class="doubleInput">
					<input-number id="skewAngle_input"></input-number>
					<span></span>
					<fancy-button
						secondary
						id="skewAngle_applyButton"
						style="display: none;"
					>
					Apply</fancy-button>
				</div>
				<label class="info">
					<span>Skew distance</span>
					<info-bubble>
						Select shapes, then provide a skew distance to apply. <br><br>
						A positive value will skew the path to the right, and a negative value will skew the path to the left.
					</info-bubble>
				</label>
				<div class="doubleInput">
					<input-number id="skewDistance_input"></input-number>
					<span></span>
					<fancy-button
						secondary
						id="skewDistance_applyButton"
						style="display: none;"
					>
					Apply</fancy-button>
				</div>
				`,
	});

	const skewAngleApplyButton = skewCard.querySelector('#skewAngle_applyButton');
	editor.subscribe({
		topic: 'whichShapeIsSelected',
		subscriberID: `transformsPanel.skewAngleApplyButton`,
		callback: () => {
			updateApplyButtion('skewAngle');
		},
	});

	const skewInput = skewCard.querySelector('#skewAngle_input');
	skewInput.addEventListener('change', () => {
		updateApplyButtion('skewAngle');
	});
	skewInput.addEventListener('keydown', () => {
		updateApplyButtion('skewAngle');
	});

	const skewDistanceApplyButton = skewCard.querySelector('#skewDistance_applyButton');
	editor.subscribe({
		topic: 'whichShapeIsSelected',
		subscriberID: `transformsPanel.skewDistanceApplyButton`,
		callback: () => {
			updateApplyButtion('skewDistance');
		},
	});

	const skewDistanceInput = skewCard.querySelector('#skewDistance_input');
	skewDistanceInput.addEventListener('change', () => {
		updateApplyButtion('skewDistance');
	});
	skewDistanceInput.addEventListener('keydown', () => {
		updateApplyButtion('skewDistance');
	});

	skewAngleApplyButton.addEventListener('click', () => {
		const editor = getCurrentProjectEditor();
		const skewAngle = Number(skewInput.getAttribute('value'));
		const count = skewSelectedPaths(editor, 'skewAngle', skewAngle);

		editor.history.addState(
			`Skew ${count} ${count === 1 ? 'shape' : 'shapes'} by ${skewAngle}°`
		);
		editor.publish('currentItem', editor.selectedItem);
	});

	skewDistanceApplyButton.addEventListener('click', () => {
		const editor = getCurrentProjectEditor();
		const skewDistance = Number(skewDistanceInput.getAttribute('value'));
		const count = skewSelectedPaths(editor, 'skewDistance', skewDistance);

		editor.history.addState(
			`Skew ${count} ${count === 1 ? 'shape' : 'shapes'} by ${skewDistance}em`
		);
		editor.publish('currentItem', editor.selectedItem);
	});

	return skewCard;
}

// --------------------------------------------------------------
// Offset path
// --------------------------------------------------------------

function makeOffsetCard() {
	const editor = getCurrentProjectEditor();
	// Offset path
	let offsetPathCard = makeElement({
		className: 'panel__card',
		innerHTML: `
				<h3>Offset path</h3>
				<label class="info">
					<span>Offset distance</span>
					<info-bubble>
						Select shapes, then provide an offset distance to apply. <br><br>
						A positive value will expand the path, and a negative value will
						contract the path.
					</info-bubble>
				</label>
				<div class="doubleInput">
					<input-number id="offsetPath_input"></input-number>
					<span></span>
					<fancy-button
						secondary
						id="offsetPath_applyButton"
						style="display: none;"
					>
					Apply</fancy-button>
				</div>
				`,
	});

	const offsetPathApplyButton = offsetPathCard.querySelector('#offsetPath_applyButton');
	editor.subscribe({
		topic: 'whichShapeIsSelected',
		subscriberID: `transformsPanel.offsetPathApplyButton`,
		callback: () => {
			updateApplyButtion('offsetPath');
		},
	});

	const offsetPathInput = offsetPathCard.querySelector('#offsetPath_input');
	offsetPathInput.addEventListener('change', () => {
		updateApplyButtion('offsetPath');
	});
	offsetPathInput.addEventListener('keydown', () => {
		updateApplyButtion('offsetPath');
	});

	offsetPathApplyButton.addEventListener('click', () => {
		const editor = getCurrentProjectEditor();
		/*
			Number, not the raw attribute. This one handed a string to the offset
			maths, where only the unary minus in the counter-clockwise branch
			coerced it back.
		*/
		const offsetDistance = Number(offsetPathInput.getAttribute('value'));
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

			/*
				Offsetting does produce a new path, so this one is a replacement -
				but a replacement at the same index, not a delete and an append.
			*/
			const offsetShape = shape.makePolySegment().makeOffsetPolySegment(offsetDistance).path;
			offsetShape.name = shape.name;
			offsetShape.parent = item;
			item.shapes[index] = offsetShape;
			newSelection.push(offsetShape);
			count++;
		});

		item.changed();
		editor.multiSelect.shapes.members = newSelection;
		editor.history.addState(
			`Offset path for ${count} ${count === 1 ? 'shape' : 'shapes'}`
		);
		editor.publish('currentItem', editor.selectedItem);
	});

	return offsetPathCard;
}

// --------------------------------------------------------------
// Rotation
// --------------------------------------------------------------

function makeRotationCard() {
	const editor = getCurrentProjectEditor();
	// Rotation
	let rotationCard = makeElement({
		className: 'panel__card',
		innerHTML: `
				<h3>Rotation</h3>
				<label class="info">
					<span>Rotation angle</span>
					<info-bubble>
						Select shapes, then provide a rotation angle to apply. <br><br>
						A positive value will rotate the path clockwise, and a negative value will
						rotate the path counterclockwise. Rotation is applied around the shape's center.
					</info-bubble>
				</label>
				<div class="doubleInput">
					<input-number id="rotation_input"></input-number>
					<span></span>
					<fancy-button
						secondary
						id="rotation_applyButton"
						style="display: none;"
					>
					Apply</fancy-button>
				</div>
				`,
	});

	const rotationApplyButton = rotationCard.querySelector('#rotation_applyButton');
	editor.subscribe({
		topic: 'whichShapeIsSelected',
		subscriberID: `transformsPanel.rotationApplyButton`,
		callback: () => {
			updateApplyButtion('rotation');
		},
	});

	const rotationInput = rotationCard.querySelector('#rotation_input');
	rotationInput.addEventListener('change', () => {
		updateApplyButtion('rotation');
	});
	rotationInput.addEventListener('keydown', () => {
		updateApplyButtion('rotation');
	});

	rotationApplyButton.addEventListener('click', () => {
		const editor = getCurrentProjectEditor();
		const rotationInputValue = Number(rotationInput.getAttribute('value'));
		const rotationAngle = rad(rotationInputValue * -1);
		const msShapes = editor.multiSelect.shapes;
		const rotationCenter = clone(msShapes.maxes.center);

		msShapes.rotate(rotationAngle, rotationCenter);

		editor.history.addState(
			`Rotated ${msShapes.length} ${
				msShapes.length === 1 ? 'shape' : 'shapes'
			} by ${rotationInputValue}°`
		);
		editor.publish('currentItem', editor.selectedItem);
	});

	return rotationCard;
}

// --------------------------------------------------------------
// Helpers
// --------------------------------------------------------------

/**
 * Skew every selected path, in place.
 *
 * This used to build a new Path per shape, delete the originals, and append
 * the copies - which quietly moved every skewed shape to the top of the
 * stack. Skew a path that sits behind another and it jumped in front of it,
 * and undo did not put it back. Path.skewAngle and Path.skewDistance both
 * mutate the path they are called on, so there was never anything to
 * replace.
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

function updateApplyButtion(baseID = '') {
	// log(`updateApplyButton`, 'start');
	// log(`baseID: ${baseID}`);
	const editor = getCurrentProjectEditor();
	const input = document.getElementById(`${baseID}_input`);
	const applyButton = document.getElementById(`${baseID}_applyButton`);

	if (!input || !applyButton) return;

	const hasShapes = editor.multiSelect.shapes.length > 0;
	// log(`hasShapes: ${hasShapes}`);
	const inputValue = Number(input.getAttribute('value'));
	// log(`inputValue: ${inputValue}`);
	const hasValidInput = inputValue !== 0;
	// log(`hasValidInput: ${hasValidInput}`);

	if (hasShapes && !hasValidInput) {
		applyButton.style.display = 'block';
		applyButton.setAttribute('disabled', '');
	}

	if (hasShapes && hasValidInput) {
		applyButton.style.display = 'block';
		applyButton.removeAttribute('disabled');
	} else {
		applyButton.style.display = 'none';
	}
	// log(`updateApplyButton`, 'end');
}
