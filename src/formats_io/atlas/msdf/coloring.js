import { cross, dot, endDirection, startDirection } from './bezier.js';

/**
	EDGE COLORING
	-------------
	Assigns each edge of a contour a channel mask - which of red, green and
	blue will carry that edge's distance.

	This is the idea that makes a *multi*-channel distance field worth having.
	A single channel field stores one distance per pixel, so a sharp corner -
	where two edges meet at an angle - gets averaged into a rounded blob when
	the GPU interpolates between texels. If the two edges at a corner are
	written to different channels, each channel stays a clean straight field
	through the corner, and the shader taking the median of the three
	reconstructs the corner exactly.

	The rule is therefore: edges meeting at a corner must not share a channel;
	edges flowing smoothly into one another should.

	Ported from the coloring in Viktor Chlumsky's msdfgen, which is the
	reference implementation this format comes from.
 */

/** Channel masks. Bit 0 red, bit 1 green, bit 2 blue. */
export const BLACK = 0;
export const RED = 1;
export const GREEN = 2;
export const YELLOW = 3;
export const BLUE = 4;
export const MAGENTA = 5;
export const CYAN = 6;
export const WHITE = 7;

/** Two edges are a corner past this angle. 3 degrees, as in msdfgen. */
const DEFAULT_ANGLE_THRESHOLD = 3;

/**
 * Whether two consecutive directions form a corner rather than a smooth join.
 * @param {Object} incoming - unit direction arriving at the join
 * @param {Object} outgoing - unit direction leaving the join
 * @param {Number} crossThreshold - sin of the angle that counts as a corner
 * @returns {Boolean}
 */
export function isCorner(incoming, outgoing, crossThreshold) {
	// A negative dot means they double back - always a corner, however small
	// the cross product happens to be.
	return dot(incoming, outgoing) <= 0 || Math.abs(cross(incoming, outgoing)) > crossThreshold;
}

/**
 * Picks the next channel mask in the rotation.
 *
 * Kept faithful to msdfgen: the seed makes the choice vary between contours
 * so that neighbouring shapes do not systematically land on the same channel,
 * and `banned` lets the caller forbid a mask - used to stop the last spline
 * of a closed contour from matching the first.
 *
 * @param {Object} state - {color, seed}, mutated in place
 * @param {Number=} banned - a mask to avoid
 */
export function switchColor(state, banned = BLACK) {
	const combined = state.color & banned;

	if (combined === RED || combined === GREEN || combined === BLUE) {
		state.color = combined ^ WHITE;
		return;
	}

	if (state.color === BLACK || state.color === WHITE) {
		const start = [CYAN, MAGENTA, YELLOW];
		state.color = start[state.seed % 3];
		state.seed = Math.floor(state.seed / 3);
		return;
	}

	const shifted = state.color << (1 + (state.seed & 1));
	state.color = (shifted | (shifted >> 3)) & WHITE;
	state.seed = state.seed >> 1;
}

/**
 * Finds the indices of edges that start at a corner.
 * @param {Array} contour - cubic segments
 * @param {Number} crossThreshold - sin of the corner angle
 * @returns {Array<Number>}
 */
function findCorners(contour, crossThreshold) {
	const corners = [];
	if (!contour.length) return corners;

	let previousDirection = endDirection(contour[contour.length - 1]);

	contour.forEach((segment, index) => {
		if (isCorner(previousDirection, startDirection(segment), crossThreshold)) {
			corners.push(index);
		}
		previousDirection = endDirection(segment);
	});

	return corners;
}

/**
 * Assigns a channel mask to every edge of every contour.
 *
 * Returns a parallel structure rather than mutating the segments, so the
 * contour data stays plain geometry.
 *
 * @param {Array} contours - contours of cubic segments
 * @param {Object} [options] - coloring options
 * @param {Number} [options.angleThreshold] - degrees; smaller finds more corners
 * @param {Number} [options.seed] - varies the channel rotation
 * @returns {Array<Array<Number>>} - a mask per edge, per contour
 */
export function colorEdges(contours, { angleThreshold = DEFAULT_ANGLE_THRESHOLD, seed = 0 } = {}) {
	const crossThreshold = Math.sin((angleThreshold * Math.PI) / 180);
	const state = { color: BLACK, seed: seed };

	return contours.map((contour) => {
		const colors = new Array(contour.length).fill(WHITE);
		if (!contour.length) return colors;

		const corners = findCorners(contour, crossThreshold);

		if (corners.length === 0) {
			// A fully smooth loop - a circle, an O. There is no corner to keep
			// sharp, so every channel carries the same field.
			return colors.fill(WHITE);
		}

		if (corners.length === 1) {
			/*
				A teardrop: one corner, smooth everywhere else. Two colors
				would leave the corner sharing a channel with itself, so the
				contour is split into three parts around it.
			*/
			const parts = [WHITE, WHITE, WHITE];
			switchColor(state);
			parts[0] = state.color;
			parts[1] = WHITE;
			switchColor(state);
			parts[2] = state.color;

			const corner = corners[0];
			const count = contour.length;

			if (count >= 3) {
				for (let i = 0; i < count; i++) {
					const index = (corner + i) % count;
					const part = Math.floor((3 * i) / count);
					colors[index] = parts[part];
				}
			} else if (count === 2) {
				// Two edges: give each of them a different channel pair.
				colors[corner] = parts[0];
				colors[(corner + 1) % count] = parts[2];
			} else {
				colors[corner] = parts[0];
			}
			return colors;
		}

		/*
			The usual case. Walk the contour from its first corner, switching
			channel at every corner so the two edges meeting there never share
			one. The last spline is forbidden from matching the first, because
			the contour closes back onto it.
		*/
		const cornerCount = corners.length;
		const start = corners[0];
		let spline = 0;

		switchColor(state);
		const initialColor = state.color;
		let color = state.color;

		for (let i = 0; i < contour.length; i++) {
			const index = (start + i) % contour.length;

			if (spline + 1 < cornerCount && corners[spline + 1] === index) {
				spline += 1;
				switchColor(state, spline === cornerCount - 1 ? initialColor : BLACK);
				color = state.color;
			}

			colors[index] = color;
		}

		return colors;
	});
}
