import { makeLineIcon, wrapLineIcon } from './icons.js';

// --------------------------------------------------------------
// Icons
// --------------------------------------------------------------

/**
 * Makes an icon.
 *
 * Delegates to the line set. The old body built its own SVG with a fixed
 * `rgb(76,81,86)` default fill, which is why every caller that forgot to pass
 * a colour drew a mid-grey icon that ignored the theme.
 *
 * @param {Object} oa - options: { name, color }
 * @returns {String} - SVG code
 */
export function makeIcon(oa = {}) {
	/*
		page_ and panel_ icons used to be drawn on a 24 box and everything else on
		a 20 box. The line set is one 24 viewBox throughout, so this is only the
		rendered size, and the two families keep the presence they had.
	*/
	const size = oa.name && (oa.name.startsWith('page_') || oa.name.startsWith('panel_')) ? 24 : 20;
	return makeLineIcon(oa.name, size);
}

// --------------------------------------------------------------
// Panels
// --------------------------------------------------------------

/**
 * Programmatically create all the Transform Origin icons, since they
 * are very similar, only differing in what point is highlighted
 * @param {String} corner - name of the location to highlight
 * @returns {String} - SVG code of the icon
 */
export function makeTransformOriginIcon(corner = 'baseline-left') {
	const x = corner.includes('center') ? 11.5 : corner.includes('right') ? 20 : 3;
	let y = 3; // top
	if (corner.includes('middle')) y = 10.5;
	if (corner.includes('baseline')) y = 14.5;
	if (corner.includes('bottom')) y = 18;

	/*
		The marker is filled on purpose. An outlined ring reads as a handle to
		grab, which is the opposite of this one's job - it says which of the nine
		points the transform currently pivots around.

		It used to be two nested squares in hardcoded grey and blue, so the
		marker was the same colour in dark theme as in light and told the theme
		nothing.
	*/
	return wrapLineIcon(
		'<path d="M3 3h17v15H3z"/><path d="M3 14.5h17"/>' +
			`<circle cx="${x}" cy="${y}" r="2" fill="currentColor" stroke="none"/>`
	);
}
