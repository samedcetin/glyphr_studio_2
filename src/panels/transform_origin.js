import { makeElement } from '../common/dom.js';

// --------------------------------------------------------------
// Transform origin
// --------------------------------------------------------------

/*
	The point every transform holds still, and the two controls that set it.

	It appears twice: as a chooser beside width and height in Properties, and
	as a grid at the top of the Transform panel, where rotation, skew and the
	one-click turns read it. Two views of one property on one object, so this
	module owns both the names and the job of keeping them showing the same
	thing - neither panel is rebuilt on the other's account.
*/

/** Top to bottom. `baseline` is y = 0, not the bottom of the shape. */
const yNames = ['top', 'middle', 'baseline', 'bottom'];

/** Left to right. */
const xNames = ['left', 'center', 'right'];

/**
 * "baseline-left" as "baseline left".
 * @param {String} origin - a transformOrigins name
 * @returns {String}
 */
export function transformOriginName(origin) {
	return `${origin}`.replace(/-/g, ' ');
}

/**
 * Show the same origin in every control on screen that sets it.
 * @param {String} origin - a transformOrigins name
 */
export function syncTransformOriginChoosers(origin) {
	const name = transformOriginName(origin);

	document.querySelectorAll('.transform-origin-chooser').forEach((chooser) => {
		/* selected-name only - writing selected-id fires a change event back out. */
		chooser.setAttribute('selected-name', name);
	});

	document.querySelectorAll('.origin-grid__cell').forEach((cell) => {
		const isCurrent = cell.getAttribute('data-origin') === `${origin}`;
		cell.setAttribute('aria-checked', `${isCurrent}`);
		if (isCurrent) cell.setAttribute('selected', '');
		else cell.removeAttribute('selected');
	});
}

/**
 * The origin as a grid of the twelve points, drawn as the em box they sit in.
 *
 * Twelve names in a dropdown asked the reader to hold a coordinate system in
 * their head and then find its name in a list. Illustrator and Figma both put
 * this on a reference-point grid instead, and a designer can hit the corner
 * they want without reading anything.
 *
 * @param {Function} onPick - called with the chosen origin name
 * @returns {HTMLElement}
 */
export function makeTransformOriginGrid(onPick) {
	const grid = makeElement({
		tag: 'div',
		className: 'origin-grid',
		attributes: { role: 'radiogroup', 'aria-label': 'Transform origin' },
	});

	yNames.forEach((y) => {
		xNames.forEach((x) => {
			const origin = `${y}-${x}`;
			const cell = makeElement({
				tag: 'button',
				className: 'origin-grid__cell',
				title: transformOriginName(origin),
				attributes: {
					'data-origin': origin,
					role: 'radio',
					'aria-checked': 'false',
					'aria-label': transformOriginName(origin),
				},
			});

			cell.addEventListener('click', () => onPick(origin));
			grid.appendChild(cell);
		});
	});

	return grid;
}
