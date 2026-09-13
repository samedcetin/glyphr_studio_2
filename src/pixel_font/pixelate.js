import { ControlPoint } from '../project_data/control_point.js';
import { Path } from '../project_data/path.js';
import { PathPoint } from '../project_data/path_point.js';
import { extractContours, isPointInside } from '../formats_io/atlas/msdf/contours.js';
import { cellBounds, cellCenter, cellRangeForBounds, snapValue } from './pixel_grid.js';

/**
	PIXELATE
	--------
	Turning glyph outlines into whole cells, and whole cells back into outlines.

	Both directions matter. Reading cells out of a glyph is how an imported
	typeface becomes a pixel font and how the pixel pen knows what is already
	filled; writing them back is how anything drawn in cells becomes real
	outlines that the OTF and atlas exporters already know how to handle.

	Cells are written back as merged rectangles rather than one square each.
	A 16-pixel capital H is about 60 filled cells; as separate squares that is
	60 contours and 240 points in a glyph that needs 3 rectangles.
 */

/**
 * @param {Number} col - column index
 * @param {Number} row - row index
 * @returns {String}
 */
export function cellKey(col, row) {
	return `${col},${row}`;
}

/**
 * @param {String} key - from cellKey
 * @returns {Object} - {col, row}
 */
export function parseCellKey(key) {
	const [col, row] = String(key).split(',');
	return { col: Number(col), row: Number(row) };
}

/**
 * Covers a set of filled cells with as few rectangles as possible.
 *
 * Two passes: join cells that sit next to each other in a row, then join runs
 * that sit directly above one another and are the same shape. That is not the
 * theoretically smallest cover - finding that is expensive - but it collapses
 * the shapes a font is actually made of (stems, bars, serifs) down to one
 * rectangle each, which is all that matters here.
 *
 * @param {Iterable<String>} cells - cell keys
 * @returns {Array<Object>} - [{col, row, width, height}]
 */
export function mergeCells(cells) {
	const filled = new Set(cells);
	if (!filled.size) return [];

	// ---- Pass one: horizontal runs ----
	const byRow = new Map();
	filled.forEach((key) => {
		const { col, row } = parseCellKey(key);
		const columns = byRow.get(row) || [];
		columns.push(col);
		byRow.set(row, columns);
	});

	/** @type {Array<Object>} */
	const runs = [];
	[...byRow.keys()]
		.sort((a, b) => a - b)
		.forEach((row) => {
			const columns = byRow.get(row).sort((a, b) => a - b);
			let start = columns[0];
			let previous = columns[0];

			columns.slice(1).forEach((col) => {
				if (col === previous + 1) {
					previous = col;
					return;
				}
				runs.push({ col: start, row: row, width: previous - start + 1 });
				start = col;
				previous = col;
			});

			runs.push({ col: start, row: row, width: previous - start + 1 });
		});

	// ---- Pass two: stack identical runs ----
	const byShape = new Map();
	runs.forEach((run) => {
		const shape = `${run.col}:${run.width}`;
		const stack = byShape.get(shape) || [];
		stack.push(run);
		byShape.set(shape, stack);
	});

	/** @type {Array<Object>} */
	const rectangles = [];
	byShape.forEach((stack) => {
		stack.sort((a, b) => a.row - b.row);
		let current = { col: stack[0].col, row: stack[0].row, width: stack[0].width, height: 1 };

		stack.slice(1).forEach((run) => {
			if (run.row === current.row + current.height) {
				current.height++;
				return;
			}
			rectangles.push(current);
			current = { col: run.col, row: run.row, width: run.width, height: 1 };
		});

		rectangles.push(current);
	});

	// Bottom-left first, so the shape list reads in a predictable order.
	return rectangles.sort((a, b) => a.row - b.row || a.col - b.col);
}

/**
 * Builds one rectangular path covering a block of cells.
 *
 * The points run upper-left, upper-right, lower-right, lower-left - the same
 * winding every other rectangle in this app is drawn with, so pixel shapes
 * combine with hand-drawn ones without one of them punching a hole in the
 * other.
 *
 * @param {Object} rectangle - {col, row, width, height}
 * @param {Number} unitsPerPixel - grid size
 * @param {String=} name - path name
 * @returns {Path}
 */
export function makeCellRectPath(rectangle, unitsPerPixel, name = 'Pixels') {
	const start = cellBounds(rectangle.col, rectangle.row, unitsPerPixel);
	const end = cellBounds(
		rectangle.col + rectangle.width - 1,
		rectangle.row + rectangle.height - 1,
		unitsPerPixel
	);

	const corners = [
		{ x: start.xMin, y: end.yMax },
		{ x: end.xMax, y: end.yMax },
		{ x: end.xMax, y: start.yMin },
		{ x: start.xMin, y: start.yMin },
	];

	return new Path({
		name: name,
		pathPoints: corners.map((corner) => new PathPoint({ p: new ControlPoint({ coord: corner }) })),
	});
}

/**
 * Reads which cells a glyph's outlines cover.
 *
 * A cell counts as filled when its centre is inside the outline. Sampling the
 * centre - rather than, say, any overlap - is what a rasteriser does, so what
 * you see here is what the atlas will contain.
 *
 * @param {Object} glyph - a Glyph
 * @param {Number} unitsPerPixel - grid size
 * @returns {Set<String>} - cell keys
 */
export function readGlyphCells(glyph, unitsPerPixel) {
	const filled = new Set();
	if (!glyph || !unitsPerPixel) return filled;

	const contours = extractContours(glyph);
	if (!contours.length) return filled;

	const maxes = glyph.maxes;
	if (!maxes) return filled;

	const range = cellRangeForBounds(maxes, unitsPerPixel);

	for (let row = range.rowMin; row <= range.rowMax; row++) {
		for (let col = range.colMin; col <= range.colMax; col++) {
			if (isPointInside(contours, cellCenter(col, row, unitsPerPixel))) {
				filled.add(cellKey(col, row));
			}
		}
	}

	return filled;
}

/**
 * Replaces a glyph's shapes with rectangles covering the given cells.
 *
 * @param {Object} glyph - a Glyph, modified in place
 * @param {Iterable<String>} cells - cell keys
 * @param {Number} unitsPerPixel - grid size
 * @returns {Object} - the same glyph
 */
export function writeGlyphCells(glyph, cells, unitsPerPixel) {
	const rectangles = mergeCells(cells);

	// The shapes setter marks the glyph as changed on the way in.
	glyph.shapes = rectangles.map((rectangle, index) =>
		makeCellRectPath(rectangle, unitsPerPixel, `Pixels ${index + 1}`)
	);

	return glyph;
}

/**
 * Snaps a glyph's outlines to whole cells.
 *
 * This is destructive and meant to be: a curve that has been pixelated is a
 * staircase, and there is no reading of the result that keeps the curve. It is
 * an explicit action, never something that happens while drawing.
 *
 * The advance width goes to the grid too. A pixel font whose advance is half a
 * pixel wide lays out text that drifts off the grid a little more with every
 * character, which is the version of this bug that is hardest to see and
 * worst to live with.
 *
 * @param {Object} glyph - a Glyph, modified in place
 * @param {Number} unitsPerPixel - grid size
 * @returns {Object} - the same glyph
 */
export function pixelateGlyph(glyph, unitsPerPixel) {
	const cells = readGlyphCells(glyph, unitsPerPixel);
	writeGlyphCells(glyph, cells, unitsPerPixel);

	const snappedAdvance = snapValue(glyph.advanceWidth, unitsPerPixel);
	/*
		A glyph with an advance of less than one pixel would collapse to zero
		and stack every following character on top of it, so anything that
		started with an advance keeps at least one pixel of it.
	*/
	glyph.advanceWidth =
		snappedAdvance === 0 && glyph.advanceWidth > 0 ? unitsPerPixel : snappedAdvance;

	// The advance width setter does not announce itself, and the metrics
	// panels read it, so the glyph is marked changed once at the end.
	glyph.changed();

	return glyph;
}
