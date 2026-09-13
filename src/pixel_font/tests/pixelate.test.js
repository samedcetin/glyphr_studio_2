import { describe, expect, it } from 'vitest';
import { Glyph } from '../../project_data/glyph.js';
import { importGlyphrProjectFromText } from '../../project_editor/import_project.js';
import obleggProject from '../../samples/oblegg.gs2?raw';
import { cellBounds, isOnGrid } from '../pixel_grid.js';
import {
	cellKey,
	makeCellRectPath,
	mergeCells,
	pixelateGlyph,
	readGlyphCells,
	writeGlyphCells,
} from '../pixelate.js';

const project = importGlyphrProjectFromText(obleggProject);

/**
 * A working copy of a glyph.
 *
 * `GlyphElement.clone()` hands back the saved plain object rather than a live
 * element, so a real Glyph has to be built from it.
 *
 * @param {String} id - glyph id
 * @returns {Object} - a Glyph
 */
function copyOfGlyph(id) {
	return new Glyph(project.getItem(id).save(true));
}
/** Oblegg's em is 2048, so 16 pixels per em is a round 128 units. */
const UNITS = 128;

/**
 * Expands merged rectangles back into the cells they cover.
 * @param {Array} rectangles - output of mergeCells
 * @returns {Array<String>} - cell keys, with duplicates kept so overlap shows
 */
function expandRectangles(rectangles) {
	const cells = [];
	rectangles.forEach((rectangle) => {
		for (let row = 0; row < rectangle.height; row++) {
			for (let col = 0; col < rectangle.width; col++) {
				cells.push(cellKey(rectangle.col + col, rectangle.row + row));
			}
		}
	});
	return cells;
}

/**
 * @param {Object} glyph - a Glyph
 * @returns {Array<Number>} - every point coordinate in it
 */
function allCoordinates(glyph) {
	const values = [];
	glyph.shapes.forEach((shape) => {
		shape.pathPoints.forEach((point) => {
			values.push(point.p.x, point.p.y);
		});
	});
	return values;
}

describe('Pixelate: merging cells', () => {
	it('collapses a solid block into one rectangle', () => {
		const cells = [];
		for (let row = 0; row < 3; row++) {
			for (let col = 0; col < 3; col++) cells.push(cellKey(col, row));
		}

		expect(mergeCells(cells)).toEqual([{ col: 0, row: 0, width: 3, height: 3 }]);
	});

	it('splits a shape that is not a rectangle into as few as it can', () => {
		// An L: a 1x3 stem with a 2x1 foot beside it.
		const cells = [
			cellKey(0, 0),
			cellKey(1, 0),
			cellKey(2, 0),
			cellKey(0, 1),
			cellKey(0, 2),
		];

		const rectangles = mergeCells(cells);
		expect(rectangles.length).toEqual(2);
	});

	it('covers exactly the cells it was given, with nothing doubled', () => {
		/*
			This is the property that matters - a merge that loses or repeats a
			cell would silently change the letter, and on a checkerboard, the
			worst case for merging, there is nowhere for a mistake to hide.
		*/
		const cells = [];
		for (let row = 0; row < 9; row++) {
			for (let col = 0; col < 9; col++) {
				if ((row + col) % 2 === 0) cells.push(cellKey(col, row));
			}
		}

		const covered = expandRectangles(mergeCells(cells));
		expect(covered.length).toEqual(cells.length);
		expect(new Set(covered)).toEqual(new Set(cells));
	});

	it('handles a ragged shape with holes and negative rows', () => {
		const cells = [
			cellKey(-2, -3),
			cellKey(-1, -3),
			cellKey(-2, -2),
			cellKey(4, 7),
			cellKey(5, 7),
			cellKey(4, 8),
			cellKey(5, 8),
		];

		const covered = expandRectangles(mergeCells(cells));
		expect(new Set(covered)).toEqual(new Set(cells));
		expect(covered.length).toEqual(cells.length);
	});

	it('returns nothing for nothing', () => {
		expect(mergeCells([])).toEqual([]);
	});
});

describe('Pixelate: cell rectangles', () => {
	it('lands exactly on the cell edges', () => {
		const path = makeCellRectPath({ col: 2, row: -1, width: 3, height: 2 }, UNITS);
		const start = cellBounds(2, -1, UNITS);
		const end = cellBounds(4, 0, UNITS);

		expect(path.maxes.xMin).toEqual(start.xMin);
		expect(path.maxes.yMin).toEqual(start.yMin);
		expect(path.maxes.xMax).toEqual(end.xMax);
		expect(path.maxes.yMax).toEqual(end.yMax);
	});

	it('is four straight-sided corners', () => {
		const path = makeCellRectPath({ col: 0, row: 0, width: 1, height: 1 }, UNITS);
		expect(path.pathPoints.length).toEqual(4);
		path.pathPoints.forEach((point) => {
			// No handles in use means every segment is a line, which is the
			// only thing a pixel edge can be.
			expect(point.h1.use).toBe(false);
			expect(point.h2.use).toBe(false);
		});
	});
});

describe('Pixelate: reading a real glyph', () => {
	const capitalH = project.getItem('glyph-0x48');

	it('finds the cells a letter covers', () => {
		const cells = readGlyphCells(capitalH, UNITS);
		expect(cells.size).toBeGreaterThan(20);
	});

	it('keeps the letter inside its own bounding box', () => {
		const cells = readGlyphCells(capitalH, UNITS);
		const maxes = capitalH.maxes;

		cells.forEach((key) => {
			const [col, row] = key.split(',').map(Number);
			const bounds = cellBounds(col, row, UNITS);
			expect(bounds.xMin).toBeGreaterThanOrEqual(maxes.xMin - UNITS);
			expect(bounds.xMax).toBeLessThanOrEqual(maxes.xMax + UNITS);
			expect(bounds.yMin).toBeGreaterThanOrEqual(maxes.yMin - UNITS);
			expect(bounds.yMax).toBeLessThanOrEqual(maxes.yMax + UNITS);
		});
	});

	it('reads an H as two stems joined by a bar', () => {
		/*
			Checked against the shape rather than a count, because a count
			would pass just as happily on a blob. Two full-height columns with
			a gap between them, and the gap filled at the crossbar.
		*/
		const cells = readGlyphCells(capitalH, UNITS);
		const columns = new Set([...cells].map((key) => Number(key.split(',')[0])));
		const rowsIn = (col) => [...cells].filter((key) => Number(key.split(',')[0]) === col).length;

		const sorted = [...columns].sort((a, b) => a - b);
		const leftStem = sorted[0];
		const rightStem = sorted[sorted.length - 1];
		const middle = sorted[Math.floor(sorted.length / 2)];

		expect(rowsIn(leftStem)).toBeGreaterThan(rowsIn(middle));
		expect(rowsIn(rightStem)).toBeGreaterThan(rowsIn(middle));
		expect(rowsIn(middle)).toBeGreaterThan(0);
	});
});

describe('Pixelate: writing cells back', () => {
	it('rebuilds a glyph whose every coordinate is on the grid', () => {
		const glyph = copyOfGlyph('glyph-0x48');
		pixelateGlyph(glyph, UNITS);

		allCoordinates(glyph).forEach((value) => {
			expect(isOnGrid(value, UNITS), `${value} is off the grid`).toBe(true);
		});
	});

	it('is idempotent - pixelating twice changes nothing', () => {
		/*
			The real test of the whole round trip. If reading and writing
			disagree by so much as half a cell, the letter would creep or
			thicken every time it went through, and this is where that shows.
		*/
		const glyph = copyOfGlyph('glyph-0x41');

		pixelateGlyph(glyph, UNITS);
		const first = readGlyphCells(glyph, UNITS);

		pixelateGlyph(glyph, UNITS);
		const second = readGlyphCells(glyph, UNITS);

		expect(second).toEqual(first);
		expect(first.size).toBeGreaterThan(20);
	});

	it('keeps the cells it was given', () => {
		const glyph = copyOfGlyph('glyph-0x41');
		const cells = new Set([cellKey(0, 0), cellKey(1, 0), cellKey(1, 1), cellKey(3, 5)]);

		writeGlyphCells(glyph, cells, UNITS);
		expect(readGlyphCells(glyph, UNITS)).toEqual(cells);
	});

	it('snaps the advance width, so text does not drift off the grid', () => {
		const glyph = copyOfGlyph('glyph-0x41');
		glyph.advanceWidth = 1000;

		pixelateGlyph(glyph, UNITS);
		expect(isOnGrid(glyph.advanceWidth, UNITS)).toBe(true);
		expect(glyph.advanceWidth).toEqual(1024);
	});

	it('never rounds a narrow character away to nothing', () => {
		const glyph = copyOfGlyph('glyph-0x41');
		glyph.advanceWidth = 20;

		pixelateGlyph(glyph, UNITS);
		expect(glyph.advanceWidth).toEqual(UNITS);
	});

	it('leaves a zero advance at zero', () => {
		const glyph = copyOfGlyph('glyph-0x41');
		glyph.advanceWidth = 0;

		pixelateGlyph(glyph, UNITS);
		expect(glyph.advanceWidth).toEqual(0);
	});
});
