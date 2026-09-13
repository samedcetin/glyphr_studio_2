import { cross, EPSILON, length, pointAt, subtract } from './bezier.js';

/**
	GLYPH TO CONTOURS
	-----------------
	Turns a Glyph into the shape a distance field generator needs: a list of
	closed contours, each an ordered list of cubic segments in em units.

	The project already converts a Path into ordered cubic segments for its
	boolean operations, so this reuses that rather than re-deriving beziers
	from path points.

	Winding is normalised here, and that is the part that matters. The sign of
	a distance field comes from which side of an edge a point falls on, so if
	one contour runs the other way its interior reads as exterior and the
	glyph comes out inside-out.
 */

/** Straight-line steps used when approximating a curve's area. */
const AREA_SAMPLES = 16;

/**
 * Converts one of the project's Segment objects into the plain shape the
 * distance math works with.
 * @param {Object} segment - a project Segment
 * @returns {Object} - {p1, p2, p3, p4} of {x, y}
 */
function toCubic(segment) {
	return {
		p1: { x: segment.p1x, y: segment.p1y },
		p2: { x: segment.p2x, y: segment.p2y },
		p3: { x: segment.p3x, y: segment.p3y },
		p4: { x: segment.p4x, y: segment.p4y },
	};
}

/**
 * Twice the signed area enclosed by a contour, by the shoelace formula over a
 * polyline approximation.
 *
 * In font space, which is y-up, a positive result means counter-clockwise.
 *
 * @param {Array} contour - cubic segments
 * @returns {Number}
 */
export function signedArea(contour) {
	let total = 0;
	let previous = null;

	contour.forEach((segment) => {
		for (let i = 0; i <= AREA_SAMPLES; i++) {
			const point = pointAt(segment, i / AREA_SAMPLES);
			if (previous) total += previous.x * point.y - point.x * previous.y;
			previous = point;
		}
	});

	return total / 2;
}

/**
 * Reverses a contour's direction, keeping it a valid closed loop.
 * @param {Array} contour - cubic segments
 * @returns {Array}
 */
export function reverseContour(contour) {
	return contour
		.slice()
		.reverse()
		.map((segment) => ({ p1: segment.p4, p2: segment.p3, p3: segment.p2, p4: segment.p1 }));
}

/**
 * Drops segments too short to carry a meaningful tangent.
 *
 * A zero-length segment has no direction, so it would contribute a garbage
 * side to the sign of the field, and it can sit between two edges that should
 * have been treated as a corner.
 *
 * @param {Array} contour - cubic segments
 * @returns {Array}
 */
function dropDegenerateSegments(contour) {
	return contour.filter((segment) => {
		const span = length(subtract(segment.p4, segment.p1));
		const control1 = length(subtract(segment.p2, segment.p1));
		const control2 = length(subtract(segment.p3, segment.p4));
		return span > EPSILON || control1 > EPSILON || control2 > EPSILON;
	});
}

/**
 * Extracts every contour of a glyph, in em units.
 *
 * Component instances are resolved to their transformed outlines first, so a
 * glyph built out of components generates the same field as one drawn
 * directly.
 *
 * @param {Object} glyph - a Glyph
 * @returns {Array} - contours, each an array of cubic segments
 */
export function extractContours(glyph) {
	/** @type {Array} */
	const contours = [];

	const addPath = (path) => {
		if (!path?.pathPoints || path.pathPoints.length < 2) return;
		let polySegment;
		try {
			polySegment = path.makePolySegment();
		} catch (error) {
			console.warn('Could not convert a path to segments for MSDF:', error);
			return;
		}
		const contour = dropDegenerateSegments((polySegment?.segments || []).map(toCubic));
		if (contour.length) contours.push(contour);
	};

	const walk = (shapes) => {
		(shapes || []).forEach((shape) => {
			if (shape.objType === 'ComponentInstance') {
				// Resolve the instance to real outlines before measuring.
				const resolved = shape.transformedGlyph;
				if (resolved) walk(resolved.visibleShapes ?? resolved.shapes);
				return;
			}
			addPath(shape);
		});
	};

	walk(glyph?.visibleShapes ?? glyph?.shapes);

	return normalizeWinding(contours);
}

/**
 * Makes every contour agree on which way is "inside".
 *
 * The outer contour is taken to be the one enclosing the most area. If it
 * runs clockwise, every contour is flipped, so that afterwards the interior
 * is always on the left of the direction of travel - which is the convention
 * the signed distance sign depends on.
 *
 * Holes keep their opposite direction relative to the outer contour, which is
 * what makes a counter read as a hole rather than as a second solid.
 *
 * @param {Array} contours - contours to normalise
 * @returns {Array}
 */
export function normalizeWinding(contours) {
	if (!contours.length) return contours;

	let outerIndex = 0;
	let largest = -Infinity;
	const areas = contours.map((contour, index) => {
		const area = signedArea(contour);
		if (Math.abs(area) > largest) {
			largest = Math.abs(area);
			outerIndex = index;
		}
		return area;
	});

	if (areas[outerIndex] >= 0) return contours;

	return contours.map((contour) => reverseContour(contour));
}

/**
 * The bounding box of a set of contours, in em units.
 * @param {Array} contours - contours to measure
 * @param {Number=} samples - steps per segment
 * @returns {Object | false} - {xMin, xMax, yMin, yMax}, or false when empty
 */
export function contourBounds(contours, samples = 16) {
	let xMin = Infinity;
	let xMax = -Infinity;
	let yMin = Infinity;
	let yMax = -Infinity;
	let found = false;

	contours.forEach((contour) => {
		contour.forEach((segment) => {
			for (let i = 0; i <= samples; i++) {
				const point = pointAt(segment, i / samples);
				xMin = Math.min(xMin, point.x);
				xMax = Math.max(xMax, point.x);
				yMin = Math.min(yMin, point.y);
				yMax = Math.max(yMax, point.y);
				found = true;
			}
		});
	});

	return found ? { xMin, xMax, yMin, yMax } : false;
}

/**
 * Whether a point is inside the shape, by the non-zero winding rule.
 *
 * Used to settle the sign of the field where the closest-edge test is
 * ambiguous - most often exactly on a corner, where two edges are equidistant
 * and disagree about which side the point is on.
 *
 * @param {Array} contours - the shape
 * @param {Object} point - {x, y} in em units
 * @param {Number=} samples - polyline steps per segment
 * @returns {Boolean}
 */
export function isPointInside(contours, point, samples = 12) {
	let winding = 0;

	contours.forEach((contour) => {
		let previous = null;
		contour.forEach((segment) => {
			for (let i = 0; i <= samples; i++) {
				const current = pointAt(segment, i / samples);
				if (previous) winding += crossingContribution(previous, current, point);
				previous = current;
			}
		});
	});

	return winding !== 0;
}

/**
 * One edge's contribution to the winding number around `point`.
 * @param {Object} a - edge start
 * @param {Object} b - edge end
 * @param {Object} point - the point being tested
 * @returns {Number} - +1, -1 or 0
 */
function crossingContribution(a, b, point) {
	if (a.y <= point.y) {
		if (b.y > point.y && cross(subtract(b, a), subtract(point, a)) > 0) return 1;
	} else if (b.y <= point.y && cross(subtract(b, a), subtract(point, a)) < 0) {
		return -1;
	}
	return 0;
}
