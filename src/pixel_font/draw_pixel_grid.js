import { cXsX, cYsY, sXcX, sYcY } from '../edit_canvas/edit_canvas.js';
import { getCanvasColors } from '../common/theme.js';
import { getPixelMode, getUnitsPerPixel } from './pixel_grid.js';

/**
	PIXEL GRID DRAWING
	------------------
	The grid behind the glyph when pixel font mode is on.

	It is drawn under the outlines rather than over them, because the point of
	the grid is to show where the edges should land - if it sat on top it would
	hide the very thing being checked.
 */

/**
	Below this, grid lines are closer together than they are wide and the
	canvas turns into a flat wash of grey. Zoomed out that far, the grid is not
	telling anyone anything, so it is left off.
 */
const MIN_SPACING = 5;

/**
 * Draws the pixel grid across the whole canvas.
 *
 * @param {Object} ctx - canvas context
 * @param {Object} project - a GlyphrStudioProject
 * @param {Object} view - {dx, dy, dz}
 * @param {Number} width - canvas width in CSS pixels
 * @param {Number} height - canvas height in CSS pixels
 * @returns {Boolean} - whether anything was drawn
 */
export function drawPixelGrid(ctx, project, view, width, height) {
	const settings = getPixelMode(project);
	if (!settings.enabled || !settings.showGrid) return false;

	const unitsPerPixel = getUnitsPerPixel(project);
	const spacing = unitsPerPixel * view.dz;
	if (!(spacing >= MIN_SPACING)) return false;

	// Only the lines that fall on screen, so the cost does not grow when the
	// glyph is small in a large canvas.
	const left = cXsX(0, view);
	const right = cXsX(width, view);
	const bottom = cYsY(height, view);
	const top = cYsY(0, view);

	const firstColumn = Math.floor(left / unitsPerPixel);
	const lastColumn = Math.ceil(right / unitsPerPixel);
	const firstRow = Math.floor(bottom / unitsPerPixel);
	const lastRow = Math.ceil(top / unitsPerPixel);

	ctx.save();
	ctx.globalAlpha = Math.max(0, Math.min(100, Number(settings.gridTransparency))) / 100;
	ctx.strokeStyle = getCanvasColors().grid;
	ctx.lineWidth = 1;
	ctx.beginPath();

	for (let col = firstColumn; col <= lastColumn; col++) {
		// The half pixel is what keeps a one pixel line one pixel wide
		// instead of two half-lit ones either side of the boundary.
		const x = Math.round(sXcX(col * unitsPerPixel, view)) + 0.5;
		ctx.moveTo(x, 0);
		ctx.lineTo(x, height);
	}

	for (let row = firstRow; row <= lastRow; row++) {
		const y = Math.round(sYcY(row * unitsPerPixel, view)) + 0.5;
		ctx.moveTo(0, y);
		ctx.lineTo(width, y);
	}

	ctx.stroke();
	ctx.restore();
	return true;
}
