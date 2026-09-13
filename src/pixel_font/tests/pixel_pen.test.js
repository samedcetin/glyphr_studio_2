import { describe, expect, it } from 'vitest';
import { Tool_PixelPen } from '../../edit_canvas/tools/pixel_pen.js';
import { cellKey } from '../pixelate.js';

/**
	PIXEL PEN TESTS
	---------------
	The pen's own logic, tested without a canvas or a project: which cells a
	stroke covers, and whether it fills or clears them.

	The line walking is the part worth testing. A mouse moving fast reports
	only a few positions along its path, so a pen that fills exactly the cells
	it was told about draws a dotted line - which is a bug you cannot see in a
	unit test unless you go looking for it.
 */

/**
 * A pen with a working cell set, bypassing the canvas.
 * @param {Array<String>} startingCells - cells already filled
 * @param {String} mode - 'draw' or 'erase'
 * @returns {Object} - a Tool_PixelPen
 */
function makePen(startingCells = [], mode = 'draw') {
	const pen = new Tool_PixelPen();
	pen.cells = new Set(startingCells);
	pen.mode = mode;
	pen.unitsPerPixel = 128;
	return pen;
}

describe('Pixel pen: strokes', () => {
	it('fills a single cell', () => {
		const pen = makePen();
		expect(pen.applyTo(2, 3)).toBe(true);
		expect(pen.cells).toEqual(new Set([cellKey(2, 3)]));
	});

	it('reports nothing changed when a cell is already right', () => {
		const pen = makePen([cellKey(2, 3)]);
		expect(pen.applyTo(2, 3)).toBe(false);
	});

	it('clears cells in erase mode, and only cells that were filled', () => {
		const pen = makePen([cellKey(2, 3)], 'erase');
		expect(pen.applyTo(2, 3)).toBe(true);
		expect(pen.cells.size).toEqual(0);
		expect(pen.applyTo(9, 9)).toBe(false);
	});

	it('fills every cell between two points, not just the ends', () => {
		const pen = makePen();
		pen.applyAlongLine({ col: 0, row: 0 }, { col: 5, row: 0 });

		expect(pen.cells.size).toEqual(6);
		for (let col = 0; col <= 5; col++) {
			expect(pen.cells.has(cellKey(col, 0)), `column ${col}`).toBe(true);
		}
	});

	it('leaves no gaps on a diagonal', () => {
		/*
			A diagonal is where a naive implementation shows its holes - and
			where the line has to stay connected, or a drawn stroke leaks when
			the glyph is filled.
		*/
		const pen = makePen();
		pen.applyAlongLine({ col: 0, row: 0 }, { col: 6, row: 4 });

		const cells = [...pen.cells].map((key) => key.split(',').map(Number));
		cells.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

		cells.slice(1).forEach(([col, row], index) => {
			const [previousCol, previousRow] = cells[index];
			const step = Math.max(Math.abs(col - previousCol), Math.abs(row - previousRow));
			expect(step, `${previousCol},${previousRow} -> ${col},${row}`).toBeLessThanOrEqual(1);
		});
	});

	it('works backwards and downwards as well', () => {
		const pen = makePen();
		pen.applyAlongLine({ col: 4, row: 2 }, { col: -2, row: -3 });

		expect(pen.cells.has(cellKey(4, 2))).toBe(true);
		expect(pen.cells.has(cellKey(-2, -3))).toBe(true);
		expect(pen.cells.size).toBeGreaterThan(5);
	});

	it('handles a stroke that never moved', () => {
		const pen = makePen();
		pen.applyAlongLine({ col: 1, row: 1 }, { col: 1, row: 1 });
		expect(pen.cells).toEqual(new Set([cellKey(1, 1)]));
	});
});
