/**
	PIXEL GRID
	----------
	The numbers behind pixel font mode.

	A pixel font is not a font that happens to look blocky - it is a font whose
	every edge lands exactly on a texel boundary at one specific size. Miss that
	by a fraction of a unit and the rasteriser hands you a grey seam down the
	side of every letter, which is the thing pixel art cannot survive.

	So everything here works in whole cells. The origin is the baseline at x=0,
	because that is the one point the renderer and the font agree on: cell
	(0, 0) sits directly above and to the right of it, negative rows are the
	descender.

	Pure arithmetic - no project, no DOM. The project-shaped wrappers are the
	first three functions and nothing else depends on them.
 */

/** What a project gets when it has never been told otherwise. */
export const defaultPixelMode = {
	enabled: false,
	/*
		16 is a common body size for a UI font in a game, and it divides both
		of the usual em squares (1000 and 2048) - though 1000/16 is 62.5, which
		is exactly why the code below never assumes a whole number of units.
	*/
	pixelsPerEm: 16,
	snapToGrid: true,
	showGrid: true,
	gridTransparency: 88,
};

/**
 * Reads a project's pixel mode settings, filling in anything missing.
 * @param {Object} project - a GlyphrStudioProject
 * @returns {Object} - the settings, never undefined
 */
export function getPixelMode(project) {
	return { ...defaultPixelMode, ...(project?.settings?.app?.pixelMode || {}) };
}

/**
 * @param {Object} project - a GlyphrStudioProject
 * @returns {Boolean}
 */
export function isPixelModeOn(project) {
	return !!getPixelMode(project).enabled;
}

/**
 * How many em units one pixel covers.
 *
 * This is the number everything else is expressed in. It is deliberately not
 * rounded: an em of 1000 at 16 pixels gives 62.5 units per pixel, and rounding
 * that to 63 would put the right edge of the em square 8 units off the grid.
 *
 * @param {Object} project - a GlyphrStudioProject
 * @returns {Number} - em units per pixel, always > 0
 */
export function getUnitsPerPixel(project) {
	const upm = Number(project?.settings?.font?.upm) || 1000;
	const pixelsPerEm = Number(getPixelMode(project).pixelsPerEm) || 1;
	return upm / pixelsPerEm;
}

/**
 * Snaps one coordinate to the nearest grid line.
 * @param {Number} value - em units
 * @param {Number} unitsPerPixel - grid size
 * @returns {Number}
 */
export function snapValue(value, unitsPerPixel) {
	if (!(unitsPerPixel > 0)) return value;
	return Math.round(value / unitsPerPixel) * unitsPerPixel;
}

/**
 * Which column a coordinate falls in.
 *
 * A coordinate sitting exactly on a grid line belongs to the cell above or to
 * the right of it, which is what `floor` gives - so a shape that spans cells
 * 0 to 3 has its right edge at the line that starts cell 4, not inside it.
 *
 * @param {Number} x - em units
 * @param {Number} unitsPerPixel - grid size
 * @returns {Number} - an integer, may be negative
 */
export function cellIndex(x, unitsPerPixel) {
	if (!(unitsPerPixel > 0)) return 0;
	return Math.floor(x / unitsPerPixel);
}

/**
 * The em-unit bounds of one cell.
 * @param {Number} col - column index
 * @param {Number} row - row index
 * @param {Number} unitsPerPixel - grid size
 * @returns {Object} - {xMin, yMin, xMax, yMax}
 */
export function cellBounds(col, row, unitsPerPixel) {
	return {
		xMin: col * unitsPerPixel,
		yMin: row * unitsPerPixel,
		xMax: (col + 1) * unitsPerPixel,
		yMax: (row + 1) * unitsPerPixel,
	};
}

/**
 * The middle of one cell - the point a fill test is taken at.
 * @param {Number} col - column index
 * @param {Number} row - row index
 * @param {Number} unitsPerPixel - grid size
 * @returns {Object} - {x, y}
 */
export function cellCenter(col, row, unitsPerPixel) {
	return {
		x: (col + 0.5) * unitsPerPixel,
		y: (row + 0.5) * unitsPerPixel,
	};
}

/**
 * Whether a coordinate already sits on a grid line.
 *
 * The tolerance is there because coordinates arrive from transforms and file
 * round-trips, where 128 can come back as 127.99999999999999. That is on the
 * grid by any reasonable reading, and reporting it as an error would bury the
 * genuinely off-grid points in noise.
 *
 * @param {Number} value - em units
 * @param {Number} unitsPerPixel - grid size
 * @param {Number=} tolerance - how far off still counts as on, in em units
 * @returns {Boolean}
 */
export function isOnGrid(value, unitsPerPixel, tolerance = 0.01) {
	if (!(unitsPerPixel > 0)) return true;
	return Math.abs(value - snapValue(value, unitsPerPixel)) <= tolerance;
}

/**
 * The cell range that covers a bounding box.
 *
 * Used to decide which cells to test when reading a glyph. The box is grown
 * outwards to whole cells, so a shape ending a hair inside a cell still gets
 * that cell looked at.
 *
 * @param {Object} maxes - {xMin, yMin, xMax, yMax} in em units
 * @param {Number} unitsPerPixel - grid size
 * @returns {Object} - {colMin, rowMin, colMax, rowMax} inclusive
 */
export function cellRangeForBounds(maxes, unitsPerPixel) {
	return {
		colMin: cellIndex(maxes.xMin, unitsPerPixel),
		rowMin: cellIndex(maxes.yMin, unitsPerPixel),
		// The max edge is exclusive, so a box ending exactly on a grid line
		// must not claim the cell that starts there.
		colMax: Math.ceil(maxes.xMax / unitsPerPixel) - 1,
		rowMax: Math.ceil(maxes.yMax / unitsPerPixel) - 1,
	};
}

/**
 * Whether an export at this pixel size lands on whole texels.
 *
 * The rule is simple and worth stating plainly: a glyph whose edges sit on
 * multiples of one grid cell is rasterised exactly when the output size is a
 * whole multiple of the grid. At 16 pixels per em, 16 / 32 / 48 are crisp and
 * 21 is not - the edges fall between texels and the rasteriser does the only
 * thing it can, which is to shade them grey.
 *
 * @param {Object} project - a GlyphrStudioProject
 * @param {Number} pixelSize - the em size an atlas is being exported at
 * @returns {Boolean}
 */
export function isPixelPerfectSize(project, pixelSize) {
	const pixelsPerEm = Number(getPixelMode(project).pixelsPerEm) || 1;
	const ratio = Number(pixelSize) / pixelsPerEm;
	return ratio >= 1 && Number.isInteger(ratio);
}
