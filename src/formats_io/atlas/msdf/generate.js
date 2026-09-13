import { pseudoDistance, signedDistance } from './bezier.js';
import { colorEdges } from './coloring.js';
import { contourBounds, extractContours, isPointInside } from './contours.js';

/**
	MSDF GENERATION
	---------------
	Renders a glyph's outline into a multi-channel signed distance field.

	For every pixel, and separately for each of the three channels, the nearest
	edge carrying that channel is found and its distance recorded. Because
	edges meeting at a corner were given different channels, each channel's
	field stays smooth through that corner, and a shader taking the median of
	the three gets the corner back exactly.

	The output is RGB bytes where 0.5 is the outline: above is inside, below is
	outside. That is the convention Unity TextMeshPro, Godot 4 and the
	msdf-atlas-gen ecosystem all expect.

	Not implemented: msdfgen's error correction pass, which hunts down the
	occasional pixel where the three channels disagree in a way the median
	cannot resolve. Those show as isolated specks at very small sizes or very
	tight details. Noted rather than approximated, because a bad correction
	pass does more damage than none.
 */

/**
 * @typedef {Object} MsdfResult
 * @property {Uint8ClampedArray} data - RGBA bytes, width * height * 4
 * @property {Number} width - in pixels
 * @property {Number} height - in pixels
 * @property {Object} bounds - the em-space box that was rendered
 */

/**
 * Chooses the better of two candidate edges for one channel.
 *
 * Closer wins. On a tie - which happens at every corner, where two edges are
 * exactly equidistant - the more perpendicular one wins, because that is the
 * edge whose region the point actually falls in.
 *
 * @param {Object | false} best - current best {sd, segment}
 * @param {Object} candidate - {sd, segment}
 * @returns {Boolean} - true if the candidate should replace the best
 */
function isBetter(best, candidate) {
	if (!best) return true;

	const bestDistance = Math.abs(best.sd.distance);
	const candidateDistance = Math.abs(candidate.sd.distance);

	if (candidateDistance < bestDistance - 1e-12) return true;
	if (candidateDistance > bestDistance + 1e-12) return false;

	return candidate.sd.orthogonality > best.sd.orthogonality;
}

/**
 * Maps a signed distance to a byte, with 0.5 sitting on the outline.
 * @param {Number} distance - signed distance in em units
 * @param {Number} range - the em distance that spans the full 0..1 output
 * @returns {Number} - 0 to 255
 */
function encode(distance, range) {
	const normalized = distance / range + 0.5;
	return Math.max(0, Math.min(255, Math.round(normalized * 255)));
}

/**
 * Renders one glyph to an MSDF bitmap.
 *
 * @param {Object} glyph - a Glyph
 * @param {Object} options - rendering options
 * @param {Number} options.width - output width in pixels
 * @param {Number} options.height - output height in pixels
 * @param {Number} options.scale - em units to pixels
 * @param {Number} options.translateX - em offset applied before scaling
 * @param {Number} options.translateY - em offset applied before scaling
 * @param {Number} options.range - the field's spread, in em units
 * @param {Number=} options.angleThreshold - corner detection, in degrees
 * @param {Number=} options.seed - varies channel assignment between glyphs
 * @returns {MsdfResult | false} - false when the glyph has no outline
 */
export function generateGlyphMSDF(glyph, options) {
	const {
		width,
		height,
		scale,
		translateX,
		translateY,
		range,
		angleThreshold = 3,
		seed = 0,
	} = options;

	if (width <= 0 || height <= 0) return false;

	const contours = extractContours(glyph);
	if (!contours.length) return false;

	const bounds = contourBounds(contours);
	if (!bounds) return false;

	const colors = colorEdges(contours, { angleThreshold: angleThreshold, seed: seed });

	// Flatten to a single list, so each pixel walks every edge once.
	/** @type {Array} */
	const edges = [];
	contours.forEach((contour, contourIndex) => {
		contour.forEach((segment, edgeIndex) => {
			edges.push({ segment: segment, color: colors[contourIndex][edgeIndex] });
		});
	});

	const data = new Uint8ClampedArray(width * height * 4);

	for (let py = 0; py < height; py++) {
		for (let px = 0; px < width; px++) {
			/*
				Pixel centres, and y flipped: font space runs up from the
				baseline, bitmaps run down from the top.
			*/
			const point = {
				x: (px + 0.5) / scale - translateX,
				y: (height - py - 0.5) / scale - translateY,
			};

			/** @type {Object | false} - {sd, segment} of the nearest edge in the channel */
			let red = false;
			/** @type {Object | false} */
			let green = false;
			/** @type {Object | false} */
			let blue = false;

			for (let i = 0; i < edges.length; i++) {
				const edge = edges[i];
				const sd = signedDistance(edge.segment, point);
				const candidate = { sd: sd, segment: edge.segment };

				if (edge.color & 1 && isBetter(red, candidate)) red = candidate;
				if (edge.color & 2 && isBetter(green, candidate)) green = candidate;
				if (edge.color & 4 && isBetter(blue, candidate)) blue = candidate;
			}

			const offset = (py * width + px) * 4;
			data[offset + 0] = red ? encode(pseudoDistance(red.sd, red.segment, point), range) : 0;
			data[offset + 1] = green
				? encode(pseudoDistance(green.sd, green.segment, point), range)
				: 0;
			data[offset + 2] = blue ? encode(pseudoDistance(blue.sd, blue.segment, point), range) : 0;
			data[offset + 3] = 255;
		}
	}

	return { data: data, width: width, height: height, bounds: bounds };
}

/**
 * The median of three values - what a shader does to read an MSDF.
 *
 * Exposed so the tests can check a generated field the same way a GPU will,
 * rather than only checking that bytes were written.
 *
 * @param {Number} a - first channel
 * @param {Number} b - second channel
 * @param {Number} c - third channel
 * @returns {Number}
 */
export function median(a, b, c) {
	return Math.max(Math.min(a, b), Math.min(Math.max(a, b), c));
}

/**
 * Reads a generated field the way a shader would: median of RGB, above the
 * halfway point meaning inside.
 *
 * @param {MsdfResult} result - a generated field
 * @param {Number} px - pixel x
 * @param {Number} py - pixel y
 * @returns {Boolean}
 */
export function sampleIsInside(result, px, py) {
	const offset = (py * result.width + px) * 4;
	return median(result.data[offset], result.data[offset + 1], result.data[offset + 2]) > 127.5;
}

/**
 * Whether a point in em space falls inside the glyph, by winding.
 * Re-exported so callers testing a field have the ground truth to compare to.
 */
export { isPointInside };
