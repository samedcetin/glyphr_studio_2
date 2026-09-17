/**
	SPECIMEN SHEET — ONE GLYPH

	Crop a cell out of the sheet, trace it, and put the result where a font
	wants it: y up, baseline at zero, sized in the project's units.

	The winding decision lives here, and only here, because it can only be made
	AFTER the vertical flip. Image space runs y down and font space runs y up,
	and that flip inverts the sign of every contour's area - so a direction
	chosen while looking at pixels comes out backwards in the font, and every
	counter exports filled solid. Checked against the project's own sample: in
	font space an outer contour runs counter-clockwise and a counter runs
	clockwise, and the `i` in that sample has two counter-clockwise contours,
	which is the case a signed area alone can never tell from a counter.
*/

import { fitContour } from './fit_curves.js';
import { nestContours, traceContours } from './trace_contours.js';

/** Rows of pixels kept around a cell, so a contour never runs off the crop. */
const PADDING = 3;

/**
 * Cuts one glyph cell out of the sheet as a scalar field.
 *
 * The field is the grey plane measured against the threshold, so its zero
 * crossing is exactly the edge Otsu chose - and it keeps the anti-aliasing,
 * which is where the sub-pixel accuracy comes from.
 *
 * @param {Uint8Array} grey - the whole sheet, one byte per pixel
 * @param {Number} width - of the sheet
 * @param {Number} height - of the sheet
 * @param {Object} cell - { x0, y0, x1, y1 }
 * @param {Number} threshold - from otsuThreshold
 * @param {Boolean =} inverted - true when the light side is the ink
 * @returns {Object} { field, width, height, originX, originY }
 */
export function cropCell(grey, width, height, cell, threshold, inverted = false) {
	const originX = cell.x0 - PADDING;
	const originY = cell.y0 - PADDING;
	const cropWidth = cell.x1 - cell.x0 + 1 + PADDING * 2;
	const cropHeight = cell.y1 - cell.y0 + 1 + PADDING * 2;
	const field = new Float32Array(cropWidth * cropHeight);

	for (let y = 0; y < cropHeight; y++) {
		for (let x = 0; x < cropWidth; x++) {
			const sx = originX + x;
			const sy = originY + y;
			if (sx < 0 || sy < 0 || sx >= width || sy >= height) {
				field[y * cropWidth + x] = -threshold;
				continue;
			}
			const value = threshold - grey[sy * width + sx];
			field[y * cropWidth + x] = inverted ? -value : value;
		}
	}

	return { field, width: cropWidth, height: cropHeight, originX, originY };
}

/**
 * Twice the signed area of a closed bezier path, from its anchor points.
 *
 * The anchors are enough to get the SIGN right, which is all this is for -
 * a contour's handles never reverse the direction it travels in.
 *
 * @param {Array} beziers - [p0, h2|false, h1|false, p3]
 * @returns {Number}
 */
export function pathArea(beziers) {
	let total = 0;
	for (const bezier of beziers) {
		total += bezier[0].x * bezier[3].y - bezier[3].x * bezier[0].y;
	}
	return total;
}

/**
 * Runs a bezier path the other way round.
 *
 * Both the order of the segments and the two handles inside each one have to
 * turn round: the handle that was leaving an anchor is the one arriving at it
 * when the path runs backwards.
 *
 * @param {Array} beziers - [p0, h2|false, h1|false, p3]
 * @returns {Array}
 */
export function reversePath(beziers) {
	return beziers
		.slice()
		.reverse()
		.map(([p0, h2, h1, p3]) => [p3, h1, h2, p0]);
}

/**
 * Traces one cell and places it in font space.
 *
 * @param {Object} crop - from cropCell
 * @param {Object} placement
 * @param {Number} placement.baseline - in SHEET pixels, y down
 * @param {Number} placement.unitsPerPixel
 * @param {Number} placement.sidebearing - font units either side
 * @param {Number =} placement.tolerance - curve fitting, in source pixels
 * @param {Object =} placement.fit - { top, bottom } to bring this glyph to the
 *   height its character should stand, from expectedExtent; omit to keep the
 *   size the sheet drew it at
 * @param {Object =} placement.snap - { edge: 'bottom' | 'top', y } to level this
 *   glyph onto a line, from verticalTarget; omit to keep the row's own baseline
 * @returns {Object} { bezierData, advanceWidth, contours, nodes, moved, scaled }
 */
export function traceCellToFontSpace(crop, placement) {
	const { baseline, unitsPerPixel, sidebearing, tolerance = 0.4, snap = null, fit = null } = placement;
	const nested = nestContours(traceContours(crop.field, crop.width, crop.height));

	const fitted = nested
		.map(({ points, isHole }) => ({ beziers: fitContour(points, { tolerance }), isHole }))
		.filter((entry) => entry.beziers.length);

	if (!fitted.length) return { bezierData: [], advanceWidth: 0, contours: 0, nodes: 0 };

	// The ink's own left edge, measured on the traced outline rather than on
	// the mask, so the sidebearing is applied to the real edge.
	let inkLeft = Infinity;
	let inkRight = -Infinity;
	for (const { beziers } of fitted) {
		for (const bezier of beziers) {
			for (const point of [bezier[0], bezier[3]]) {
				if (point.x < inkLeft) inkLeft = point.x;
				if (point.x > inkRight) inkRight = point.x;
			}
		}
	}

	const toFont = (point) => ({
		x: (point.x - inkLeft) * unitsPerPixel + sidebearing,
		y: (baseline - (point.y + crop.originY)) * unitsPerPixel,
	});

	const bezierData = [];
	let nodes = 0;

	for (const { beziers, isHole } of fitted) {
		let path = beziers.map(([p0, h2, h1, p3]) => [
			toFont(p0),
			h2 ? toFont(h2) : false,
			h1 ? toFont(h1) : false,
			toFont(p3),
		]);

		// Now that y runs up, the sign means what a font means by it.
		const area = pathArea(path);
		const wantsPositive = !isHole;
		if (area !== 0 && area > 0 !== wantsPositive) path = reversePath(path);

		nodes += path.length;
		bezierData.push(path);
	}

	// Every horizontal tangent is already a node - splitAtExtrema put one there
	// - so the glyph's real top and bottom are among the anchors and do not
	// have to be solved for.
	const extent = () => {
		let top = -Infinity;
		let bottom = Infinity;
		for (const path of bezierData) {
			for (const bezier of path) {
				for (const point of [bezier[0], bezier[3]]) {
					if (point.y > top) top = point.y;
					if (point.y < bottom) bottom = point.y;
				}
			}
		}
		return { top, bottom };
	};

	let inkWidth = (inkRight - inkLeft) * unitsPerPixel;
	let scaled = 1;

	// Sizing. The sheet's letters do not all stand the same height - measured on
	// the reference sheet the capitals in one row vary by 15% - so a glyph can
	// be brought to the height its character should be. The scale is UNIFORM:
	// stretching one axis would make the stems of a short letter thinner than
	// its neighbours, which reads worse than the height difference it fixes.
	if (fit) {
		const { top, bottom } = extent();
		const have = top - bottom;
		const want = fit.top - fit.bottom;
		if (have > 0 && want > 0) {
			scaled = want / have;
			for (const path of bezierData) {
				for (const bezier of path) {
					for (const point of bezier) {
						if (!point) continue;
						point.x = sidebearing + (point.x - sidebearing) * scaled;
						point.y *= scaled;
					}
				}
			}
			inkWidth *= scaled;
		}
	}

	// Levelling.
	let moved = 0;
	if (snap) {
		const { top, bottom } = extent();
		moved = snap.y - (snap.edge === 'top' ? top : bottom);
		if (moved) {
			for (const path of bezierData) {
				for (const bezier of path) {
					for (const point of bezier) {
						if (point) point.y += moved;
					}
				}
			}
		}
	}

	return {
		bezierData,
		advanceWidth: inkWidth + sidebearing * 2,
		contours: fitted.length,
		nodes,
		moved,
		scaled,
	};
}

/**
 * Crop, trace and place, in one call.
 *
 * @param {Object} sheet - { grey, width, height, threshold, inverted }
 * @param {Object} cell - { x0, y0, x1, y1 }
 * @param {Object} placement - see traceCellToFontSpace
 * @returns {Object} { bezierData, advanceWidth, contours, nodes }
 */
export function traceGlyphCell(sheet, cell, placement) {
	const crop = cropCell(
		sheet.grey,
		sheet.width,
		sheet.height,
		cell,
		sheet.threshold,
		sheet.inverted
	);
	return traceCellToFontSpace(crop, placement);
}
