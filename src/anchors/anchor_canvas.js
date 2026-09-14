import { getCanvasColors } from '../common/theme.js';
import { cXsX, cYsY, sXcX, sYcY } from '../edit_canvas/edit_canvas.js';

/**
	DRAWING ANCHORS
	---------------
	Anchors on the edit canvas, and picking one up.

	A base anchor is drawn as a ring - a place something can land. A mark
	anchor is drawn as a filled dot with a bar through it - the thing that
	lands. The shapes differ because the two are not interchangeable, and a
	single glyph often carries both.
 */

/** How close the pointer has to be, in canvas pixels. */
const HIT_RADIUS = 9;

/** Half the width of the drawn cross, in canvas pixels. */
const ARM = 7;

/**
 * The anchor the panel is pointing at, by name, or false.
 *
 * Four crosses on one glyph look alike, and the panel lists them by name
 * and coordinates - so without this there is no way to tell which row is
 * which point except by reading numbers off the canvas. Hovering a row
 * lights its anchor up; selecting one keeps it lit.
 */
let highlightedAnchorName = false;

/**
 * Point the canvas at one anchor, or at none.
 * @param {String | false} name - the anchor to light up
 * @returns {Boolean} - whether this changed anything worth redrawing
 */
export function setHighlightedAnchor(name) {
	const wanted = name || false;
	if (wanted === highlightedAnchorName) return false;
	highlightedAnchorName = wanted;
	return true;
}

/**
 * Draws every anchor on a glyph.
 *
 * @param {Object} ctx - canvas context
 * @param {Object} glyph - the item being edited
 * @param {Object} view - {dx, dy, dz}
 * @returns {Number} - how many were drawn
 */
export function drawAnchors(ctx, glyph, view) {
	const anchors = glyph?.anchors || [];
	if (!anchors.length) return 0;

	const colors = getCanvasColors();
	const color = colors.anchor;
	const accent = colors.selection || colors.pointSelected || color;
	ctx.save();

	anchors.forEach((anchor) => {
		const x = sXcX(anchor.x, view);
		const y = sYcY(anchor.y, view);

		const lit = anchor.name === highlightedAnchorName;

		ctx.strokeStyle = lit ? accent : color;
		ctx.fillStyle = lit ? accent : color;
		ctx.lineWidth = lit ? 2.5 : 1.5;

		/*
			A halo rather than a bigger cross: growing the mark would move its
			arms away from the point they are naming, and the point is the whole
			content of an anchor.
		*/
		if (lit) {
			ctx.save();
			ctx.globalAlpha = 0.18;
			ctx.beginPath();
			ctx.arc(x, y, ARM + 4, 0, Math.PI * 2);
			ctx.fill();
			ctx.restore();
		}

		// The cross says exactly where the point is; the ring or dot says
		// which kind of anchor it is.
		ctx.beginPath();
		ctx.moveTo(x - ARM, y);
		ctx.lineTo(x + ARM, y);
		ctx.moveTo(x, y - ARM);
		ctx.lineTo(x, y + ARM);
		ctx.stroke();

		ctx.beginPath();
		ctx.arc(x, y, 4, 0, Math.PI * 2);
		if (anchor.isMarkAnchor) ctx.fill();
		else ctx.stroke();

		ctx.font = `${lit ? 'bold ' : ''}10px ui-sans-serif, system-ui, sans-serif`;
		ctx.textAlign = 'left';
		ctx.textBaseline = 'middle';
		ctx.fillText(anchor.name, x + ARM + 4, y - ARM - 2);
	});

	ctx.restore();
	return anchors.length;
}

/**
 * Finds the anchor under the pointer.
 *
 * The search runs backwards, so the anchor drawn last - the one on top - is
 * the one picked up when two sit close together.
 *
 * @param {Number} canvasX - pointer position
 * @param {Number} canvasY - pointer position
 * @param {Object} glyph - the item being edited
 * @param {Object=} view - {dx, dy, dz}
 * @returns {Object | false}
 */
export function getAnchorAtLocation(canvasX, canvasY, glyph, view = undefined) {
	const anchors = glyph?.anchors || [];

	for (let i = anchors.length - 1; i >= 0; i--) {
		const anchor = anchors[i];
		const dx = sXcX(anchor.x, view) - canvasX;
		const dy = sYcY(anchor.y, view) - canvasY;
		if (dx * dx + dy * dy <= HIT_RADIUS * HIT_RADIUS) return anchor;
	}

	return false;
}

/**
 * Moves an anchor to wherever the pointer is.
 * @param {Object} anchor - the anchor being dragged
 * @param {Number} canvasX - pointer position
 * @param {Number} canvasY - pointer position
 * @param {Object=} view - {dx, dy, dz}
 */
export function dragAnchorTo(anchor, canvasX, canvasY, view = undefined) {
	anchor.x = Math.round(cXsX(canvasX, view));
	anchor.y = Math.round(cYsY(canvasY, view));
}
