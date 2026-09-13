import { describe, expect, it } from 'vitest';
import {
	closestParameter,
	cross,
	derivativeAt,
	endDirection,
	length,
	normalize,
	pointAt,
	pseudoDistance,
	signedDistance,
	startDirection,
	subtract,
} from '../bezier.js';

/**
 * A straight line as a cubic, which is how the project stores lines:
 * control points sitting on the endpoints.
 * @param {Number} x1 - start x
 * @param {Number} y1 - start y
 * @param {Number} x2 - end x
 * @param {Number} y2 - end y
 * @returns {Object}
 */
function line(x1, y1, x2, y2) {
	return {
		p1: { x: x1, y: y1 },
		p2: { x: x1, y: y1 },
		p3: { x: x2, y: y2 },
		p4: { x: x2, y: y2 },
	};
}

/**
 * The standard cubic approximation of a quarter circle of radius r,
 * from (r, 0) counter-clockwise to (0, r).
 * @param {Number} r - radius
 * @returns {Object}
 */
function quarterCircle(r) {
	const k = 0.5522847498307936;
	return {
		p1: { x: r, y: 0 },
		p2: { x: r, y: r * k },
		p3: { x: r * k, y: r },
		p4: { x: 0, y: r },
	};
}

describe('Bezier: evaluation', () => {
	it('hits its endpoints exactly', () => {
		const curve = quarterCircle(100);
		expect(pointAt(curve, 0)).toEqual({ x: 100, y: 0 });

		const end = pointAt(curve, 1);
		expect(end.x).toBeCloseTo(0, 9);
		expect(end.y).toBeCloseTo(100, 9);
	});

	it('walks a straight line linearly in space', () => {
		const straight = line(0, 0, 100, 0);
		// A cubic with doubled endpoints is not linear in t, but it is
		// monotonic along the line and hits the midpoint at t = 0.5.
		expect(pointAt(straight, 0.5).x).toBeCloseTo(50, 9);
		expect(pointAt(straight, 0.5).y).toBeCloseTo(0, 9);
	});

	it('stays within a radius of the circle it approximates', () => {
		const curve = quarterCircle(100);
		for (let i = 0; i <= 20; i++) {
			const p = pointAt(curve, i / 20);
			// The standard k gives well under 0.03% radial error.
			expect(length(p)).toBeGreaterThan(99.9);
			expect(length(p)).toBeLessThan(100.1);
		}
	});
});

describe('Bezier: tangents', () => {
	it('points along a straight line', () => {
		const direction = startDirection(line(0, 0, 100, 0));
		expect(direction.x).toBeCloseTo(1, 9);
		expect(direction.y).toBeCloseTo(0, 9);
	});

	it('leaves and arrives at a quarter circle at right angles to the radius', () => {
		const curve = quarterCircle(100);
		// At (100, 0) heading counter-clockwise the tangent points +y.
		const start = startDirection(curve);
		expect(start.x).toBeCloseTo(0, 6);
		expect(start.y).toBeCloseTo(1, 6);

		// At (0, 100) it points -x.
		const end = endDirection(curve);
		expect(end.x).toBeCloseTo(-1, 6);
		expect(end.y).toBeCloseTo(0, 6);
	});

	it('falls back to the chord when a control point sits on its endpoint', () => {
		// This is exactly how the project encodes a line, so a zero
		// derivative here would break every straight edge.
		const straight = line(0, 0, 0, 50);
		const direction = derivativeAt(straight, 0);
		expect(length(direction)).toBeGreaterThan(0);
		expect(normalize(direction).y).toBeCloseTo(1, 9);
	});
});

describe('Bezier: closest point', () => {
	it('finds the foot of the perpendicular on a line', () => {
		const straight = line(0, 0, 100, 0);
		const t = closestParameter(straight, { x: 50, y: 30 });
		expect(pointAt(straight, t).x).toBeCloseTo(50, 4);
		expect(pointAt(straight, t).y).toBeCloseTo(0, 6);
	});

	it('clamps to an endpoint for points past the end', () => {
		const straight = line(0, 0, 100, 0);
		expect(closestParameter(straight, { x: -40, y: 0 })).toBeCloseTo(0, 6);
		expect(closestParameter(straight, { x: 400, y: 0 })).toBeCloseTo(1, 6);
	});

	it('does not settle into the wrong minimum on an S curve', () => {
		// Two lobes, so a naive single-seed Newton can land on the far one.
		const sCurve = {
			p1: { x: 0, y: 0 },
			p2: { x: 100, y: 100 },
			p3: { x: -100, y: 100 },
			p4: { x: 0, y: 200 },
		};
		const probe = { x: 60, y: 60 };
		const t = closestParameter(sCurve, probe);
		const found = length(subtract(pointAt(sCurve, t), probe));

		// Brute force the true minimum and require we are essentially on it.
		let best = Infinity;
		for (let i = 0; i <= 4000; i++) {
			best = Math.min(best, length(subtract(pointAt(sCurve, i / 4000), probe)));
		}
		expect(found).toBeLessThan(best + 0.01);
	});
});

describe('Bezier: signed distance', () => {
	const straight = line(0, 0, 100, 0);

	it('measures the perpendicular distance', () => {
		expect(Math.abs(signedDistance(straight, { x: 50, y: 30 }).distance)).toBeCloseTo(30, 4);
		expect(Math.abs(signedDistance(straight, { x: 50, y: -12 }).distance)).toBeCloseTo(12, 4);
	});

	it('gives opposite signs on opposite sides', () => {
		const above = signedDistance(straight, { x: 50, y: 30 }).distance;
		const below = signedDistance(straight, { x: 50, y: -30 }).distance;
		expect(Math.sign(above)).toBe(-Math.sign(below));
	});

	it('agrees with the geometric side for a known winding', () => {
		// Travelling +x, a point at +y is to the left. cross(tangent, delta)
		// is positive there, so the distance must be positive.
		expect(signedDistance(straight, { x: 50, y: 30 }).distance).toBeGreaterThan(0);
	});

	it('reports zero distance on the curve itself', () => {
		const curve = quarterCircle(100);
		const onCurve = pointAt(curve, 0.37);
		expect(Math.abs(signedDistance(curve, onCurve).distance)).toBeLessThan(0.01);
	});

	it('reports full orthogonality straight off the side, and none off the end', () => {
		expect(signedDistance(straight, { x: 50, y: 30 }).orthogonality).toBeCloseTo(1, 3);
		// Straight off the end, the point is in line with the tangent.
		expect(signedDistance(straight, { x: 160, y: 0 }).orthogonality).toBeCloseTo(0, 3);
	});
});

describe('Bezier: pseudo-distance', () => {
	const straight = line(0, 0, 100, 0);

	it('leaves the true distance alone inside the segment', () => {
		const sd = signedDistance(straight, { x: 50, y: 30 });
		expect(pseudoDistance(sd, straight, { x: 50, y: 30 })).toBeCloseTo(sd.distance, 9);
	});

	it('extends the edge along its tangent past the end', () => {
		// 60 units past the end and 30 above it. The true distance is the
		// diagonal to the endpoint; the pseudo-distance is the flat 30.
		const point = { x: 160, y: 30 };
		const sd = signedDistance(straight, point);

		expect(Math.abs(sd.distance)).toBeCloseTo(Math.hypot(60, 30), 3);
		expect(Math.abs(pseudoDistance(sd, straight, point))).toBeCloseTo(30, 6);
	});

	it('extends past the start as well', () => {
		const point = { x: -60, y: -30 };
		const sd = signedDistance(straight, point);
		expect(Math.abs(pseudoDistance(sd, straight, point))).toBeCloseTo(30, 6);
	});

	it('keeps the sign that the true distance had', () => {
		const above = { x: 160, y: 30 };
		const below = { x: 160, y: -30 };
		const sdAbove = signedDistance(straight, above);
		const sdBelow = signedDistance(straight, below);

		expect(Math.sign(pseudoDistance(sdAbove, straight, above))).toBe(Math.sign(sdAbove.distance));
		expect(Math.sign(pseudoDistance(sdBelow, straight, below))).toBe(Math.sign(sdBelow.distance));
	});
});

describe('Bezier: vector helpers', () => {
	it('normalizes a zero vector to zero rather than NaN', () => {
		expect(normalize({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
	});

	it('gives cross a sign that matches the turn direction', () => {
		expect(cross({ x: 1, y: 0 }, { x: 0, y: 1 })).toBeGreaterThan(0);
		expect(cross({ x: 1, y: 0 }, { x: 0, y: -1 })).toBeLessThan(0);
	});
});
