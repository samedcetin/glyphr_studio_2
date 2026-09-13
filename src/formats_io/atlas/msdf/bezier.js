/**
	CUBIC BEZIER MATH FOR DISTANCE FIELDS
	-------------------------------------
	Everything a signed distance field needs from one curve segment: evaluate
	it, differentiate it, find the closest point on it, and measure a signed
	distance to it.

	Pure functions over plain {x, y} objects and {p1, p2, p3, p4} segments.
	No project types, no DOM - so this is unit testable on its own, which
	matters because distance field bugs are invisible until a glyph renders
	with chewed corners.

	Every segment is treated as a cubic. Straight lines arrive as cubics whose
	control points sit on their endpoints, which the project's Segment class
	already guarantees.
 */

/** Curves shorter than this are treated as degenerate and skipped. */
export const EPSILON = 1e-9;

/**
 * @typedef {Object} Point
 * @property {Number} x
 * @property {Number} y
 */

/**
 * @typedef {Object} CubicSegment
 * @property {Point} p1 - start
 * @property {Point} p2 - first control
 * @property {Point} p3 - second control
 * @property {Point} p4 - end
 */

// --------------------------------------------------------------
// Vector helpers
// --------------------------------------------------------------

/**
 * @param {Point} a - first point
 * @param {Point} b - second point
 * @returns {Point} - a - b
 */
export function subtract(a, b) {
	return { x: a.x - b.x, y: a.y - b.y };
}

/**
 * @param {Point} a - first vector
 * @param {Point} b - second vector
 * @returns {Number} - dot product
 */
export function dot(a, b) {
	return a.x * b.x + a.y * b.y;
}

/**
 * 2D cross product - the z component of the 3D cross product.
 * Its sign says which side of `a` the vector `b` falls on.
 * @param {Point} a - first vector
 * @param {Point} b - second vector
 * @returns {Number}
 */
export function cross(a, b) {
	return a.x * b.y - a.y * b.x;
}

/**
 * @param {Point} a - vector
 * @returns {Number} - length
 */
export function length(a) {
	return Math.sqrt(a.x * a.x + a.y * a.y);
}

/**
 * @param {Point} a - vector
 * @returns {Point} - unit vector, or {x:0,y:0} for a zero vector
 */
export function normalize(a) {
	const len = length(a);
	if (len < EPSILON) return { x: 0, y: 0 };
	return { x: a.x / len, y: a.y / len };
}

// --------------------------------------------------------------
// Curve evaluation
// --------------------------------------------------------------

/**
 * The point on a cubic at parameter t.
 * @param {CubicSegment} segment - the curve
 * @param {Number} t - 0 to 1
 * @returns {Point}
 */
export function pointAt(segment, t) {
	const mt = 1 - t;
	const a = mt * mt * mt;
	const b = 3 * mt * mt * t;
	const c = 3 * mt * t * t;
	const d = t * t * t;

	return {
		x: a * segment.p1.x + b * segment.p2.x + c * segment.p3.x + d * segment.p4.x,
		y: a * segment.p1.y + b * segment.p2.y + c * segment.p3.y + d * segment.p4.y,
	};
}

/**
 * The first derivative - the tangent direction, unnormalized.
 *
 * A cubic whose control point sits exactly on its endpoint has a zero
 * derivative there, which would leave the tangent undefined. In that case the
 * chord to the next distinct control point is used instead, which is the
 * direction the curve actually leaves in.
 *
 * @param {CubicSegment} segment - the curve
 * @param {Number} t - 0 to 1
 * @returns {Point}
 */
export function derivativeAt(segment, t) {
	const mt = 1 - t;
	const a = 3 * mt * mt;
	const b = 6 * mt * t;
	const c = 3 * t * t;

	const d1 = subtract(segment.p2, segment.p1);
	const d2 = subtract(segment.p3, segment.p2);
	const d3 = subtract(segment.p4, segment.p3);

	const result = {
		x: a * d1.x + b * d2.x + c * d3.x,
		y: a * d1.y + b * d2.y + c * d3.y,
	};

	if (length(result) > EPSILON) return result;

	// Degenerate tangent at an endpoint: fall back to the chord.
	if (t < 0.5) {
		const chord = length(d1) > EPSILON ? d1 : length(d2) > EPSILON ? d2 : d3;
		return { ...chord };
	}
	const chord = length(d3) > EPSILON ? d3 : length(d2) > EPSILON ? d2 : d1;
	return { ...chord };
}

/**
 * The unit tangent leaving the start of the segment.
 * @param {CubicSegment} segment - the curve
 * @returns {Point}
 */
export function startDirection(segment) {
	return normalize(derivativeAt(segment, 0));
}

/**
 * The unit tangent arriving at the end of the segment.
 * @param {CubicSegment} segment - the curve
 * @returns {Point}
 */
export function endDirection(segment) {
	return normalize(derivativeAt(segment, 1));
}

// --------------------------------------------------------------
// Closest point
// --------------------------------------------------------------

/** How many points to sample before refining. More samples, fewer misses. */
const COARSE_SAMPLES = 16;
/** Newton refinement steps. Converges fast; four is plenty at font scale. */
const REFINE_STEPS = 8;

/**
 * The parameter t of the point on the curve nearest to `point`.
 *
 * A coarse scan followed by Newton refinement. The scan matters: minimising
 * |B(t) - P|² on a cubic can have up to three local minima, so starting
 * Newton from a single guess can settle into the wrong one and produce a
 * distance that is plainly too large.
 *
 * The result is clamped to [0, 1] - handling the region beyond an endpoint is
 * the job of the pseudo-distance, not of this function.
 *
 * @param {CubicSegment} segment - the curve
 * @param {Point} point - the point to measure from
 * @returns {Number} - t in [0, 1]
 */
export function closestParameter(segment, point) {
	let bestT = 0;
	let bestDistanceSquared = Infinity;

	for (let i = 0; i <= COARSE_SAMPLES; i++) {
		const t = i / COARSE_SAMPLES;
		const delta = subtract(pointAt(segment, t), point);
		const distanceSquared = dot(delta, delta);
		if (distanceSquared < bestDistanceSquared) {
			bestDistanceSquared = distanceSquared;
			bestT = t;
		}
	}

	// Newton on f(t) = (B(t) - P) · B'(t), whose root is the closest point.
	let t = bestT;
	for (let step = 0; step < REFINE_STEPS; step++) {
		const delta = subtract(pointAt(segment, t), point);
		const d1 = derivativeAt(segment, t);
		const d2 = secondDerivativeAt(segment, t);

		const numerator = dot(delta, d1);
		const denominator = dot(d1, d1) + dot(delta, d2);
		if (Math.abs(denominator) < EPSILON) break;

		const next = t - numerator / denominator;
		if (!isFinite(next)) break;

		t = Math.max(0, Math.min(1, next));
	}

	// Newton can wander to a worse spot than the scan found; keep the better.
	const refined = subtract(pointAt(segment, t), point);
	return dot(refined, refined) <= bestDistanceSquared ? t : bestT;
}

/**
 * The second derivative, needed by the Newton step.
 * @param {CubicSegment} segment - the curve
 * @param {Number} t - 0 to 1
 * @returns {Point}
 */
export function secondDerivativeAt(segment, t) {
	const a = 6 * (1 - t);
	const b = 6 * t;

	const d1 = {
		x: segment.p3.x - 2 * segment.p2.x + segment.p1.x,
		y: segment.p3.y - 2 * segment.p2.y + segment.p1.y,
	};
	const d2 = {
		x: segment.p4.x - 2 * segment.p3.x + segment.p2.x,
		y: segment.p4.y - 2 * segment.p3.y + segment.p2.y,
	};

	return { x: a * d1.x + b * d2.x, y: a * d1.y + b * d2.y };
}

// --------------------------------------------------------------
// Signed distance
// --------------------------------------------------------------

/**
 * @typedef {Object} SignedDistance
 * @property {Number} distance - signed; positive outside, negative inside,
 *                               relative to the contour's winding
 * @property {Number} t - where on the curve the closest point was found
 * @property {Number} orthogonality - |sin(angle)| between the tangent and the
 *                                    vector to the point, used to break ties
 *                                    between segments at equal distance
 */

/**
 * Signed distance from a point to one curve segment.
 *
 * The sign comes from which side of the tangent the point falls on. That is
 * consistent along a contour as long as all contours wind the same way, which
 * is why the caller normalises winding before generating.
 *
 * @param {CubicSegment} segment - the curve
 * @param {Point} point - the point to measure from
 * @returns {SignedDistance}
 */
export function signedDistance(segment, point) {
	const t = closestParameter(segment, point);
	const nearest = pointAt(segment, t);
	const delta = subtract(point, nearest);
	const distance = length(delta);
	const tangent = normalize(derivativeAt(segment, t));

	const side = cross(tangent, delta);
	const sign = side >= 0 ? 1 : -1;

	// How square-on the point sits to the curve. When two segments report the
	// same distance - which happens at every corner - the more orthogonal one
	// is the one that actually owns that region.
	const orthogonality = distance < EPSILON ? 1 : Math.abs(side) / distance;

	return { distance: sign * distance, t: t, orthogonality: orthogonality };
}

/**
 * Extends a segment's distance beyond its endpoints along the tangent.
 *
 * This is what makes MSDF corners sharp. Inside the segment the true distance
 * is correct, but past an endpoint the true distance curves around that point,
 * and interpolating two such fields across a corner rounds it off. Measuring
 * against the infinite tangent line instead keeps each channel's field flat
 * through the corner, so the median reconstructs a crisp edge.
 *
 * @param {SignedDistance} sd - result of signedDistance for this segment
 * @param {CubicSegment} segment - the curve
 * @param {Point} point - the point being measured
 * @returns {Number} - signed pseudo-distance
 */
export function pseudoDistance(sd, segment, point) {
	// Inside the segment, the true distance is already the right answer.
	if (sd.t > 0 && sd.t < 1) return sd.distance;

	const isStart = sd.t <= 0;
	const anchor = isStart ? segment.p1 : segment.p4;
	const direction = isStart ? startDirection(segment) : endDirection(segment);

	if (length(direction) < EPSILON) return sd.distance;

	const toPoint = subtract(point, anchor);
	const along = dot(toPoint, direction);

	// Only extend outwards. A point that projects back onto the segment is
	// already handled by the true distance.
	if ((isStart && along > 0) || (!isStart && along < 0)) return sd.distance;

	const perpendicular = cross(direction, toPoint);
	return perpendicular;
}
