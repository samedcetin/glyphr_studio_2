/**
	FITTING AN ICON
	---------------
	An SVG icon and a glyph do not agree on anything. The SVG is drawn in a
	24-by-24 box with y running down the screen; a glyph lives on an em square
	of a thousand-odd units with y running up from a baseline that the icon has
	never heard of.

	This works out the one transform that reconciles them, and it is kept apart
	from the importing so it can be reasoned about on its own: given a shape
	this size, where exactly does it go and how big is it.
 */

/**
 * @typedef {Object} IconFit
 * @property {Number} scale - multiply the source by this
 * @property {Number} x - where the left edge of the ink ends up
 * @property {Number} y - where the bottom edge of the ink ends up
 * @property {Number} width - the ink's width once scaled
 * @property {Number} height - the ink's height once scaled
 * @property {Number} advanceWidth - how far the pen moves after this icon
 */

/**
 * Works out where an icon should sit on the em square.
 *
 * Two layouts, and the choice matters more than it looks:
 *
 * - A **fixed advance** gives every icon the same width and centres it. Icons
 *   then line up in a column whatever they are, which is what a HUD, a toolbar
 *   or a menu wants, and what Material Icons ships.
 * - A **fitted advance** sizes each icon to its own ink. Icons set inline with
 *   text read better that way, because a narrow icon does not leave a hole.
 *
 * @param {Object} sourceMaxes - {xMin, yMin, xMax, yMax} of the source ink
 * @param {Object} options - how it should be placed
 * @param {Number} options.boxHeight - target height, in em units
 * @param {Number=} options.boxBottom - where the bottom of the icon sits
 * @param {Number|false} [options.advanceWidth] - fixed advance, or false to fit
 * @param {Number=} options.sidebearing - space either side, when fitting
 * @returns {IconFit | false} - false when the source has no area
 */
export function makeIconFit(
	sourceMaxes,
	{ boxHeight, boxBottom = 0, advanceWidth = false, sidebearing = 0 }
) {
	const sourceWidth = sourceMaxes.xMax - sourceMaxes.xMin;
	const sourceHeight = sourceMaxes.yMax - sourceMaxes.yMin;

	// A zero-area source has no meaningful scale - dividing by it would put
	// the icon at infinity, which is a much harder thing to notice later.
	if (!(sourceWidth > 0) || !(sourceHeight > 0)) return false;
	if (!(boxHeight > 0)) return false;

	const scale = boxHeight / sourceHeight;
	const width = sourceWidth * scale;

	if (advanceWidth === false) {
		return {
			scale: scale,
			x: sidebearing,
			y: boxBottom,
			width: width,
			height: boxHeight,
			advanceWidth: Math.round(width + sidebearing * 2),
		};
	}

	/*
		Centred in the fixed advance. An icon wider than the advance sticks out
		either side rather than being squashed - squashing it would be a
		silent, uneven distortion, and sticking out is at least visible.
	*/
	return {
		scale: scale,
		x: (advanceWidth - width) / 2,
		y: boxBottom,
		width: width,
		height: boxHeight,
		advanceWidth: Math.round(advanceWidth),
	};
}

/**
 * A sensible icon box for a font, from its own metrics.
 *
 * Icons want to sit on the same optical line as capitals rather than on the
 * baseline, so the box runs from a little below the baseline to a little above
 * the cap height - the proportions most icon sets are drawn to.
 *
 * @param {Object} project - a GlyphrStudioProject
 * @returns {Object} - {boxHeight, boxBottom, advanceWidth}
 */
export function defaultIconBox(project) {
	const font = project?.settings?.font || {};
	const upm = Number(font.upm) || 1000;
	const capHeight = Number(font.capHeight) || Math.round(upm * 0.7);

	/*
		A tenth of the cap height below the baseline. Icons drawn flush with
		the baseline look like they are floating next to text that has round
		letters overshooting it, and every icon set compensates the same way.
	*/
	const drop = Math.round(capHeight * 0.1);

	return {
		boxHeight: capHeight + drop,
		boxBottom: -drop,
		advanceWidth: upm,
	};
}

/**
 * Scales and moves every point of a glyph, exactly.
 *
 * The Glyph class has `setGlyphSize`, and it is right for the sizes it is used
 * at - dragging a resize handle around, where a shape changes by a fraction of
 * what it already was. Icons are the other case: a 24-unit SVG has to grow
 * eighty-fold to fill an em square, and at that factor the built-in path
 * scaling drifts badly (measured: 0.2% off at 2x, 37% at 20x, 450% at 81x).
 *
 * So the transform is applied here instead, as one multiply per coordinate.
 * Nothing to accumulate, nothing to drift.
 *
 * Coordinates are written through each point's `coord`, deliberately. Assigning
 * to a ControlPoint's own `x` drags its handles along when it is an on-curve
 * point, and switches a handle on when it is not - both wrong for what is meant
 * to be a plain change of units.
 *
 * @param {Object} glyph - a Glyph, modified in place
 * @param {Number} scale - multiplier
 * @param {Number=} dx - moved after scaling
 * @param {Number=} dy - moved after scaling
 * @returns {Object} - the same glyph
 */
export function scaleGlyphInPlace(glyph, scale, dx = 0, dy = 0) {
	glyph.shapes.forEach((shape) => {
		if (!shape.pathPoints) return;

		shape.pathPoints.forEach((point) => {
			[point.p, point.h1, point.h2].forEach((controlPoint) => {
				if (!controlPoint || !controlPoint.coord) return;
				const coord = controlPoint.coord;
				coord.x = coord.x * scale + dx;
				coord.y = coord.y * scale + dy;
			});
		});

		shape.changed();
	});

	glyph.changed();
	return glyph;
}
