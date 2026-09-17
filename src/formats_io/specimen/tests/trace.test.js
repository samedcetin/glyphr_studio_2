import { describe, expect, it } from 'vitest';
import {
	nestContours,
	pointInPolygon,
	signedArea,
	traceContours,
} from '../trace_contours.js';
import {
	extremaOf,
	findCorners,
	fitContour,
	pointOnCubic,
	splitAtExtrema,
	splitCubic,
} from '../fit_curves.js';

/**
 * Builds a scalar field from a function, positive inside the shape.
 * @param {Number} width
 * @param {Number} height
 * @param {Function} shape - (x, y) => signed value
 * @returns {Float32Array}
 */
function field(width, height, shape) {
	const values = new Float32Array(width * height);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) values[y * width + x] = shape(x, y);
	}
	return values;
}

const disc = (cx, cy, r) => (x, y) => r - Math.hypot(x - cx, y - cy);

/**
 * Worst distance from a set of points to a set of fitted cubics.
 * @param {Array} points - { x, y }
 * @param {Array} beziers - [p0, h2|false, h1|false, p3]
 * @returns {Number}
 */
function worstGap(points, beziers) {
	const samples = [];
	for (const b of beziers) {
		const c1 = b[1] || b[0];
		const c2 = b[2] || b[3];
		for (let i = 0; i <= 120; i++) samples.push(pointOnCubic([b[0], c1, c2, b[3]], i / 120));
	}
	let worst = 0;
	for (const p of points) {
		let best = Infinity;
		for (const s of samples) {
			const d = (s.x - p.x) ** 2 + (s.y - p.y) ** 2;
			if (d < best) best = d;
		}
		worst = Math.max(worst, Math.sqrt(best));
	}
	return worst;
}

describe('traceContours', () => {
	it('lands on the true edge, not on the pixel grid', () => {
		// The whole reason for tracing the grey plane rather than a mask: the
		// contour is free to sit between samples.
		const contours = traceContours(field(200, 200, disc(100, 100, 60)), 200, 200);
		expect(contours).toHaveLength(1);
		let worst = 0;
		for (const p of contours[0]) {
			worst = Math.max(worst, Math.abs(Math.hypot(p.x - 100, p.y - 100) - 60));
		}
		expect(worst).toBeLessThan(0.01);
	});

	it('holds accuracy on a counter-sized feature', () => {
		const contours = traceContours(field(60, 60, disc(30, 30, 12)), 60, 60);
		expect(contours).toHaveLength(1);
		for (const p of contours[0]) {
			expect(Math.abs(Math.hypot(p.x - 30, p.y - 30) - 12)).toBeLessThan(0.05);
		}
	});

	it('keeps corners square', () => {
		const square = field(100, 100, (x, y) =>
			Math.min(Math.min(x - 20, 80 - x), Math.min(y - 20, 80 - y))
		);
		const contours = traceContours(square, 100, 100);
		const xs = contours[0].map((p) => p.x);
		const ys = contours[0].map((p) => p.y);
		expect(Math.min(...xs)).toBeCloseTo(20, 5);
		expect(Math.max(...xs)).toBeCloseTo(80, 5);
		expect(Math.min(...ys)).toBeCloseTo(20, 5);
		expect(Math.max(...ys)).toBeCloseTo(80, 5);
	});

	it('closes a shape that runs off the edge of the buffer', () => {
		const contours = traceContours(field(50, 50, disc(0, 25, 20)), 50, 50);
		expect(contours).toHaveLength(1);
		expect(contours[0].length).toBeGreaterThan(8);
	});
});

describe('nestContours', () => {
	it('calls the counter of a ring a hole', () => {
		const ring = field(200, 200, (x, y) => {
			const d = Math.hypot(x - 100, y - 100);
			return Math.min(70 - d, d - 35);
		});
		const nested = nestContours(traceContours(ring, 200, 200));
		expect(nested).toHaveLength(2);
		expect(nested.filter((n) => n.isHole)).toHaveLength(1);
		expect(nested.find((n) => n.isHole).depth).toBe(1);
	});

	it('calls two separate marks two outers', () => {
		// The `i` case. A signed area alone cannot tell this from a counter,
		// which is why depth is what decides.
		const two = field(200, 200, (x, y) =>
			Math.max(disc(60, 100, 25)(x, y), disc(140, 100, 25)(x, y))
		);
		const nested = nestContours(traceContours(two, 200, 200));
		expect(nested).toHaveLength(2);
		expect(nested.filter((n) => n.isHole)).toHaveLength(0);
	});

	it('handles an island inside a hole', () => {
		const target = field(240, 240, (x, y) => {
			const d = Math.hypot(x - 120, y - 120);
			return Math.max(Math.min(100 - d, d - 60), 30 - d);
		});
		const nested = nestContours(traceContours(target, 240, 240));
		expect(nested).toHaveLength(3);
		expect(nested.map((n) => n.depth).sort()).toEqual([0, 1, 2]);
		expect(nested.filter((n) => n.isHole)).toHaveLength(1);
	});
});

describe('signedArea and pointInPolygon', () => {
	it('flips sign with direction', () => {
		const square = [
			{ x: 0, y: 0 },
			{ x: 10, y: 0 },
			{ x: 10, y: 10 },
			{ x: 0, y: 10 },
		];
		expect(signedArea(square)).toBe(200);
		expect(signedArea([...square].reverse())).toBe(-200);
	});

	it('knows inside from outside', () => {
		const square = [
			{ x: 0, y: 0 },
			{ x: 10, y: 0 },
			{ x: 10, y: 10 },
			{ x: 0, y: 10 },
		];
		expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true);
		expect(pointInPolygon({ x: 15, y: 5 }, square)).toBe(false);
	});
});

describe('findCorners', () => {
	it('finds four on a square and no more', () => {
		const square = field(100, 100, (x, y) =>
			Math.min(Math.min(x - 20, 80 - x), Math.min(y - 20, 80 - y))
		);
		expect(findCorners(traceContours(square, 100, 100)[0])).toHaveLength(4);
	});

	it('finds none on a circle', () => {
		expect(findCorners(traceContours(field(200, 200, disc(100, 100, 60)), 200, 200)[0])).toHaveLength(0);
	});

	it('finds none on a rounded rectangle', () => {
		// The case that matters for this typeface: rounded joins are not corners
		// and must not be cut into separate runs.
		const rounded = field(160, 160, (x, y) => {
			const dx = Math.max(Math.abs(x - 80) - 50, 0);
			const dy = Math.max(Math.abs(y - 80) - 50, 0);
			return 8 - Math.hypot(dx, dy);
		});
		expect(findCorners(traceContours(rounded, 160, 160)[0])).toHaveLength(0);
	});
});

describe('splitCubic', () => {
	it('splits without moving the curve', () => {
		const cubic = [
			{ x: 0, y: 0 },
			{ x: 10, y: 30 },
			{ x: 40, y: 30 },
			{ x: 50, y: 0 },
		];
		const [head, tail] = splitCubic(cubic, 0.4);
		expect(head[3]).toEqual(tail[0]);
		for (const t of [0.1, 0.5, 0.9]) {
			const before = pointOnCubic(cubic, t * 0.4);
			const after = pointOnCubic(head, t);
			expect(after.x).toBeCloseTo(before.x, 10);
			expect(after.y).toBeCloseTo(before.y, 10);
		}
	});
});

describe('extremaOf and splitAtExtrema', () => {
	it('finds the top of an arch', () => {
		const arch = [
			{ x: 0, y: 0 },
			{ x: 0, y: 30 },
			{ x: 50, y: 30 },
			{ x: 50, y: 0 },
		];
		const roots = extremaOf(arch);
		expect(roots).toHaveLength(1);
		expect(roots[0]).toBeCloseTo(0.5, 6);
	});

	it('finds nothing on a straight line', () => {
		expect(
			extremaOf([
				{ x: 0, y: 0 },
				{ x: 10, y: 10 },
				{ x: 20, y: 20 },
				{ x: 30, y: 30 },
			])
		).toHaveLength(0);
	});

	it('adds nodes without moving the outline', () => {
		const arch = [
			{ x: 0, y: 0 },
			{ x: 0, y: 30 },
			{ x: 50, y: 30 },
			{ x: 50, y: 0 },
		];
		const split = splitAtExtrema([arch]);
		expect(split).toHaveLength(2);
		// The join sits exactly at the top of the arch.
		expect(split[0][3].y).toBeCloseTo(22.5, 6);
		expect(split[0][3]).toEqual(split[1][0]);
	});
});

describe('fitContour', () => {
	it('fits a circle inside tolerance', () => {
		const points = traceContours(field(200, 200, disc(100, 100, 60)), 200, 200)[0];
		const beziers = fitContour(points, { tolerance: 0.4 });
		expect(beziers.length).toBeGreaterThan(3);
		expect(beziers.length).toBeLessThan(24);
		expect(worstGap(points, beziers)).toBeLessThan(0.6);
	});

	it('emits the project format, with false for a straight run', () => {
		const square = field(100, 100, (x, y) =>
			Math.min(Math.min(x - 20, 80 - x), Math.min(y - 20, 80 - y))
		);
		const beziers = fitContour(traceContours(square, 100, 100)[0], { tolerance: 0.4 });
		for (const b of beziers) {
			expect(b).toHaveLength(4);
			expect(typeof b[0].x).toBe('number');
			expect(typeof b[3].y).toBe('number');
			expect(b[1] === false || typeof b[1].x === 'number').toBe(true);
			expect(b[2] === false || typeof b[2].x === 'number').toBe(true);
		}
	});

	it('closes the loop it was given', () => {
		const points = traceContours(field(200, 200, disc(100, 100, 60)), 200, 200)[0];
		const beziers = fitContour(points, { tolerance: 0.4 });
		const start = beziers[0][0];
		const end = beziers[beziers.length - 1][3];
		expect(Math.hypot(start.x - end.x, start.y - end.y)).toBeLessThan(0.001);
	});

	it('spends more nodes for a tighter tolerance', () => {
		const points = traceContours(field(200, 200, disc(100, 100, 60)), 200, 200)[0];
		const loose = fitContour(points, { tolerance: 1.5 });
		const tight = fitContour(points, { tolerance: 0.1 });
		expect(tight.length).toBeGreaterThan(loose.length);
	});
});
