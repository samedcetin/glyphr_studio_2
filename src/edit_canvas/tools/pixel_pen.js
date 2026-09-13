import { getCurrentProject, getCurrentProjectEditor } from '../../app/main.js';
import { cellIndex, cellKey, getUnitsPerPixel } from '../../pixel_font/index.js';
import { isOnGrid } from '../../pixel_font/pixel_grid.js';
import { readGlyphCells, writeGlyphCells } from '../../pixel_font/pixelate.js';
import { showToast } from '../../controls/dialogs/dialogs.js';
import { cXsX, cYsY } from '../edit_canvas.js';
import { eventHandlerData } from '../events.js';

/**
	// ----------------------------------------------------------------
	// Pixel Pen - fills and clears whole cells of the pixel grid
	// ----------------------------------------------------------------

	Drawing a pixel font by dragging bezier handles onto a grid is the wrong
	tool for the job. This is the right one: click a cell to fill it, drag to
	fill a run, start on a filled cell to erase instead.

	The cells are read out of the glyph once, when the stroke starts, and held
	here for the length of the stroke. Re-reading them on every mouse move
	would mean rasterising the glyph a hundred times a second, and the whole
	point of a pixel tool is that it feels immediate.
 */
export class Tool_PixelPen {
	constructor() {
		this.drawing = false;
		/** @type {Set<String>} - the stroke's working copy of the cells */
		this.cells = new Set();
		/** 'draw' or 'erase', decided by the cell the stroke starts on */
		this.mode = 'draw';
		this.unitsPerPixel = 0;
		/** @type {Object | false} - the last cell the stroke touched */
		this.lastCell = false;
	}

	/**
	 * The cell under the pointer right now.
	 * @returns {Object} - {col, row}
	 */
	cellUnderMouse() {
		const ehd = eventHandlerData;
		return {
			col: cellIndex(cXsX(ehd.mousePosition.x), this.unitsPerPixel),
			row: cellIndex(cYsY(ehd.mousePosition.y), this.unitsPerPixel),
		};
	}

	/**
	 * Applies the stroke's mode to every cell between two points.
	 *
	 * A mouse moving quickly reports a handful of positions along the way, not
	 * one per cell, so filling only the cells it landed on leaves a dotted
	 * line. Walking the line between them is what makes a fast drag draw a
	 * solid stroke.
	 *
	 * @param {Object} from - {col, row}
	 * @param {Object} to - {col, row}
	 * @returns {Boolean} - whether anything changed
	 */
	applyAlongLine(from, to) {
		// Bresenham, in cells.
		let col = from.col;
		let row = from.row;
		const stepCol = to.col > col ? 1 : -1;
		const stepRow = to.row > row ? 1 : -1;
		const spanCol = Math.abs(to.col - col);
		const spanRow = -Math.abs(to.row - row);
		let error = spanCol + spanRow;
		let changed = false;

		for (;;) {
			if (this.applyTo(col, row)) changed = true;
			if (col === to.col && row === to.row) break;

			const doubled = 2 * error;
			if (doubled >= spanRow) {
				error += spanRow;
				col += stepCol;
			}
			if (doubled <= spanCol) {
				error += spanCol;
				row += stepRow;
			}
		}

		return changed;
	}

	/**
	 * Applies the stroke's mode to one cell.
	 * @param {Number} col - column index
	 * @param {Number} row - row index
	 * @returns {Boolean} - whether anything changed
	 */
	applyTo(col, row) {
		const key = cellKey(col, row);
		const wasFilled = this.cells.has(key);

		if (this.mode === 'draw') {
			if (wasFilled) return false;
			this.cells.add(key);
		} else {
			if (!wasFilled) return false;
			this.cells.delete(key);
		}

		return true;
	}

	/** Pushes the working cells back into the glyph and redraws. */
	commitToGlyph() {
		const editor = getCurrentProjectEditor();
		const item = editor.selectedItem;
		if (!item) return;

		writeGlyphCells(item, this.cells, this.unitsPerPixel);
		editor.publish('currentItem', item);
	}

	mousedown() {
		const editor = getCurrentProjectEditor();
		const item = editor.selectedItem;
		if (!item) return;

		this.unitsPerPixel = getUnitsPerPixel(getCurrentProject());
		this.cells = readGlyphCells(item, this.unitsPerPixel);

		const { col, row } = this.cellUnderMouse();

		/*
			Starting on a filled cell erases, starting on an empty one fills.
			One tool, both jobs, and it matches what every pixel art editor
			does - which matters more here than inventing something tidier.
		*/
		this.mode = this.cells.has(cellKey(col, row)) ? 'erase' : 'draw';
		this.drawing = true;
		this.lastCell = { col: col, row: row };

		/*
			Writing cells back replaces the glyph's shapes wholesale, so a
			glyph that was not already made of pixels loses its curves on the
			first click. That is unavoidable - the two cannot both be true -
			but it should never be a surprise.
		*/
		if (!isGlyphAlreadyPixels(item, this.unitsPerPixel)) {
			showToast(`${item.name || 'This glyph'} was redrawn as pixels<br>Ctrl+Z puts the curves back.`);
		}

		// Whole shapes get rebuilt under this tool, so a stale shape
		// selection would point at paths that no longer exist.
		editor.multiSelect.shapes.clear();
		editor.multiSelect.points.clear();

		if (this.applyTo(col, row)) {
			this.commitToGlyph();
			eventHandlerData.undoQueueHasChanged = true;
		}
	}

	mousemove() {
		if (!this.drawing) return;

		const current = this.cellUnderMouse();
		const previous = this.lastCell || current;
		this.lastCell = current;

		if (!this.applyAlongLine(previous, current)) return;

		this.commitToGlyph();
		eventHandlerData.undoQueueHasChanged = true;
	}

	mouseup() {
		if (!this.drawing) return;
		this.drawing = false;
		this.lastCell = false;

		if (eventHandlerData.undoQueueHasChanged) {
			const editor = getCurrentProjectEditor();
			editor.history.addState(this.mode === 'erase' ? 'Erased pixels' : 'Drew pixels');
			eventHandlerData.undoQueueHasChanged = false;
		}
	}
}

/**
 * Whether a glyph is already drawn on whole cells.
 *
 * Used only to decide whether the pen is about to destroy something. A glyph
 * with no shapes counts as pixels - there is nothing there to lose.
 *
 * @param {Object} glyph - a Glyph
 * @param {Number} unitsPerPixel - grid size
 * @returns {Boolean}
 */
function isGlyphAlreadyPixels(glyph, unitsPerPixel) {
	return glyph.shapes.every((shape) => {
		// A component instance is not something the pen can express, so it
		// always counts as something that would be lost.
		if (!shape.pathPoints) return false;

		return shape.pathPoints.every(
			(point) =>
				!point.h1.use &&
				!point.h2.use &&
				isOnGrid(point.p.x, unitsPerPixel) &&
				isOnGrid(point.p.y, unitsPerPixel)
		);
	});
}
