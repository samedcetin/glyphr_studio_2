/**
	SPECIMEN SHEET — CURVE FITTING

	Closed sub-pixel polylines in, cubic Beziers out, in the format the project
	already speaks:

	  bezier = [ {x,y}, {x,y}|false, {x,y}|false, {x,y} ]   // p0, h2, h1, p3

	Three passes, and they are separate on purpose.

	  1. CORNERS. Find where the outline genuinely turns a corner, so fitting
	     never smooths one away. This is an ANGLE test, measured over a window
	     of arc length rather than a count of points, because points coming off
	     marching squares are not evenly spaced.

	  2. FIT. Schneider's algorithm on each smooth run between corners: fit one
	     cubic, find the worst point, split there and recurse. With a guard the
	     textbook version does not have - at tight tolerances the least-squares
	     solve can and does diverge, throwing handles tens of pixels away, so an
	     implausible solution falls back to the chord-thirds cubic instead.

	  3. EXTREMA. Split every curve at its own horizontal and vertical tangents.
	     This costs nothing in accuracy - the split is exact - and it is what
	     separates an outline a type designer would accept from one they would
	     not. It does raise the node count, which is the honest trade.
*/

const EPSILON = 1e-9;

const subtract = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
const scale = (v, s) => ({ x: v.x * s, y: v.y * s });
const dot = (a, b) => a.x * b.x + a.y * b.y;
const length = (v) => Math.hypot(v.x, v.y);

/**
 * @param {Object} v - { x, y }
 * @returns {Object} the same direction at length 1, or a zero vector
 */
function normalize(v) {
	const len = length(v);
	return len < EPSILON ? { x: 0, y: 0 } : { x: v.x / len, y: v.y / len };
}

/**
 * Finds the vertices where an outline genuinely turns a corner.
 *
 * The turn is measured between the chord arriving at a point and the chord
 * leaving it, each taken over a fixed arc length rather than a fixed number of
 * vertices. That matters because a rounded join and a real corner differ by
 * how much they turn over a given DISTANCE, not over a given number of
 * samples, and marching squares hands over samples spaced anywhere between a
 * fraction of a pixel and a pixel apart.
 *
 * @param {Array} points - a closed contour of { x, y }
 * @param {Object =} options
 * @param {Number =} options.window - arc length each chord spans, in pixels
 * @param {Number =} options.angle - turn, in radians, that counts as a corner
 * @returns {Array} indices into points, ascending
 */
export function findCorners(points, { window = 4, angle = Math.PI / 3 } = {}) {
	const count = points.length;
	if (count < 8) return [];

	let perimeter = 0;
	for (let i = 0; i < count; i++) {
		perimeter += length(subtract(points[(i + 1) % count], points[i]));
	}

	const reach = Math.max(window, perimeter / count);

	/**
	 * @param {Number} from - index to walk from
	 * @param {Number} direction - +1 forward, -1 back
	 * @returns {Number} the index `reach` of arc length away
	 */
	const walk = (from, direction) => {
		let travelled = 0;
		let at = from;
		for (let n = 0; n < count; n++) {
			const next = (at + direction + count) % count;
			travelled += length(subtract(points[next], points[at]));
			at = next;
			if (travelled >= reach) break;
		}
		return at;
	};

	const turn = new Float64Array(count);
	for (let i = 0; i < count; i++) {
		const before = normalize(subtract(points[i], points[walk(i, -1)]));
		const after = normalize(subtract(points[walk(i, 1)], points[i]));
		if (!before.x && !before.y) continue;
		if (!after.x && !after.y) continue;
		const cross = before.x * after.y - before.y * after.x;
		turn[i] = Math.abs(Math.atan2(cross, dot(before, after)));
	}

	// Keep only local maxima, so one corner does not become a cluster of them.
	// The window either side has to cover the whole arc the turn is spread
	// over, or a corner comes back as the two vertices that flank it. Ties are
	// broken toward the earlier index - comparing strictly on both sides lets
	// both members of a tie survive, which is exactly how a square came back
	// with eight corners instead of four.
	const spread = Math.max(3, Math.ceil((reach * count) / perimeter));
	const corners = [];
	for (let i = 0; i < count; i++) {
		if (turn[i] < angle) continue;
		let peak = true;
		for (let d = 1; d <= spread; d++) {
			if (turn[(i - d + count) % count] > turn[i]) peak = false;
			if (turn[(i + d) % count] >= turn[i]) peak = false;
		}
		if (peak) corners.push(i);
	}

	return corners;
}

/**
 * Chord-length parameterisation: where each point falls along the run, 0 to 1.
 * @param {Array} points - { x, y }
 * @returns {Float64Array}
 */
function parameterize(points) {
	const u = new Float64Array(points.length);
	for (let i = 1; i < points.length; i++) {
		u[i] = u[i - 1] + length(subtract(points[i], points[i - 1]));
	}
	const total = u[u.length - 1];
	if (total < EPSILON) return u;
	for (let i = 1; i < u.length; i++) u[i] /= total;
	return u;
}

/**
 * A point on a cubic.
 * @param {Array} bezier - [p0, c1, c2, p3]
 * @param {Number} t - 0 to 1
 * @returns {Object} { x, y }
 */
export function pointOnCubic(bezier, t) {
	const s = 1 - t;
	const a = s * s * s;
	const b = 3 * s * s * t;
	const c = 3 * s * t * t;
	const d = t * t * t;
	return {
		x: a * bezier[0].x + b * bezier[1].x + c * bezier[2].x + d * bezier[3].x,
		y: a * bezier[0].y + b * bezier[1].y + c * bezier[2].y + d * bezier[3].y,
	};
}

/**
 * Least-squares handle lengths for a cubic through a run of points.
 *
 * Solves for how far the two handles reach along the given end tangents. The
 * guard is the part worth keeping: at tight tolerances on noisy samples the
 * 2x2 system is near-singular and the textbook solution flings a handle tens
 * of pixels off the outline. Anything negative, or longer than the run itself,
 * is not a fit - it is a diverged solve - so fall back to chord-thirds, which
 * is always sane and is what the recursion will refine anyway.
 *
 * @param {Array} points - { x, y }
 * @param {Float64Array} u - parameterisation
 * @param {Object} leftTangent - unit vector leaving the first point
 * @param {Object} rightTangent - unit vector entering the last point
 * @returns {Array} [p0, c1, c2, p3]
 */
function generateBezier(points, u, leftTangent, rightTangent) {
	const first = points[0];
	const last = points[points.length - 1];
	const chord = length(subtract(last, first));

	let c00 = 0;
	let c01 = 0;
	let c11 = 0;
	let x0 = 0;
	let x1 = 0;

	for (let i = 0; i < points.length; i++) {
		const t = u[i];
		const s = 1 - t;
		const b1 = 3 * s * s * t;
		const b2 = 3 * s * t * t;
		const a1 = scale(leftTangent, b1);
		const a2 = scale(rightTangent, b2);

		c00 += dot(a1, a1);
		c01 += dot(a1, a2);
		c11 += dot(a2, a2);

		const base = {
			x: first.x * (s * s * s + b1) + last.x * (b2 + t * t * t),
			y: first.y * (s * s * s + b1) + last.y * (b2 + t * t * t),
		};
		const gap = subtract(points[i], base);
		x0 += dot(a1, gap);
		x1 += dot(a2, gap);
	}

	const determinant = c00 * c11 - c01 * c01;
	let alphaLeft = chord / 3;
	let alphaRight = chord / 3;

	if (Math.abs(determinant) > EPSILON) {
		const left = (x0 * c11 - x1 * c01) / determinant;
		const right = (c00 * x1 - c01 * x0) / determinant;
		// A handle may not point backwards, and may not outrun the chord it is
		// spanning. Either means the solve diverged.
		const sane = (value) => value > EPSILON && value < chord * 2;
		if (sane(left) && sane(right)) {
			alphaLeft = left;
			alphaRight = right;
		}
	}

	return [
		first,
		add(first, scale(leftTangent, alphaLeft)),
		add(last, scale(rightTangent, alphaRight)),
		last,
	];
}

/**
 * The worst distance from the sample points to a fitted cubic.
 * @param {Array} points - { x, y }
 * @param {Array} bezier - [p0, c1, c2, p3]
 * @param {Float64Array} u - parameterisation
 * @returns {Object} { error, index }
 */
function maxError(points, bezier, u) {
	let error = 0;
	let index = Math.floor(points.length / 2);
	for (let i = 1; i < points.length - 1; i++) {
		const on = pointOnCubic(bezier, u[i]);
		const distance = length(subtract(on, points[i]));
		if (distance > error) {
			error = distance;
			index = i;
		}
	}
	return { error, index };
}

/**
 * Fits one run of points with as few cubics as the tolerance allows.
 *
 * @param {Array} points - { x, y }, at least two
 * @param {Object} leftTangent - unit vector leaving the first point
 * @param {Object} rightTangent - unit vector entering the last point
 * @param {Number} tolerance - largest allowed deviation, in pixels
 * @param {Number =} depth - recursion guard
 * @returns {Array} cubics, each [p0, c1, c2, p3]
 */
export function fitRun(points, leftTangent, rightTangent, tolerance, depth = 0) {
	if (points.length < 2) return [];

	if (points.length === 2) {
		const chord = length(subtract(points[1], points[0])) / 3;
		return [
			[
				points[0],
				add(points[0], scale(leftTangent, chord)),
				add(points[1], scale(rightTangent, chord)),
				points[1],
			],
		];
	}

	const u = parameterize(points);
	const bezier = generateBezier(points, u, leftTangent, rightTangent);
	const { error, index } = maxError(points, bezier, u);

	if (error <= tolerance || depth > 16) return [bezier];

	// Split at the worst point, with a tangent that runs through it.
	const centre = normalize(subtract(points[index - 1], points[index + 1]));
	const back = { x: -centre.x, y: -centre.y };
	return [
		...fitRun(points.slice(0, index + 1), leftTangent, centre, tolerance, depth + 1),
		...fitRun(points.slice(index), back, rightTangent, tolerance, depth + 1),
	];
}

/**
 * Splits a cubic at t, exactly, by de Casteljau.
 * @param {Array} bezier - [p0, c1, c2, p3]
 * @param {Number} t - 0 to 1
 * @returns {Array} two cubics
 */
export function splitCubic(bezier, t) {
	const [p0, c1, c2, p3] = bezier;
	const lerp = (a, b) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
	const a = lerp(p0, c1);
	const b = lerp(c1, c2);
	const c = lerp(c2, p3);
	const d = lerp(a, b);
	const e = lerp(b, c);
	const f = lerp(d, e);
	return [
		[p0, a, d, f],
		[f, e, c, p3],
	];
}

/**
 * Where a cubic's tangent goes horizontal or vertical.
 * @param {Array} bezier - [p0, c1, c2, p3]
 * @returns {Array} t values strictly inside (0, 1), ascending
 */
export function extremaOf(bezier) {
	const roots = [];
	for (const axis of ['x', 'y']) {
		const p0 = bezier[0][axis];
		const p1 = bezier[1][axis];
		const p2 = bezier[2][axis];
		const p3 = bezier[3][axis];
		const a = -p0 + 3 * p1 - 3 * p2 + p3;
		const b = 2 * (p0 - 2 * p1 + p2);
		const c = p1 - p0;

		if (Math.abs(a) < EPSILON) {
			if (Math.abs(b) > EPSILON) roots.push(-c / b);
			continue;
		}
		const discriminant = b * b - 4 * a * c;
		if (discriminant < 0) continue;
		const root = Math.sqrt(discriminant);
		roots.push((-b + root) / (2 * a), (-b - root) / (2 * a));
	}

	return roots
		.filter((t) => t > 0.002 && t < 0.998)
		.sort((m, n) => m - n)
		.filter((t, i, all) => i === 0 || t - all[i - 1] > 0.002);
}

/**
 * Splits every cubic at its own horizontal and vertical tangents.
 *
 * Exact, so it adds no error at all - and a font wants a node at every
 * extreme, because that is what makes outlines predictable to hint, to
 * interpolate and to edit. Half of what a tracer emits otherwise hides an
 * extreme in the middle of a segment.
 *
 * @param {Array} cubics - each [p0, c1, c2, p3]
 * @returns {Array} cubics
 */
export function splitAtExtrema(cubics) {
	const out = [];
	for (const cubic of cubics) {
		let remaining = cubic;
		let consumed = 0;
		for (const t of extremaOf(cubic)) {
			// Each split renormalises the parameter onto what is left.
			const local = (t - consumed) / (1 - consumed);
			if (local <= 0.002 || local >= 0.998) continue;
			const [head, tail] = splitCubic(remaining, local);
			out.push(head);
			remaining = tail;
			consumed = t;
		}
		out.push(remaining);
	}
	return out;
}

/**
 * Fits a closed contour and returns it in the project's Bezier path format.
 *
 * @param {Array} points - a closed contour of { x, y }
 * @param {Object =} options
 * @param {Number =} options.tolerance - largest allowed deviation, in pixels
 * @param {Number =} options.cornerWindow - arc length for the corner test
 * @param {Number =} options.cornerAngle - turn that counts as a corner
 * @param {Boolean =} options.addExtrema - split at horizontal/vertical tangents
 * @returns {Array} beziers, each [p0, h2|false, h1|false, p3]
 */
export function fitContour(points, options = {}) {
	const {
		tolerance = 0.4,
		cornerWindow = 4,
		cornerAngle = Math.PI / 3,
		addExtrema = true,
	} = options;

	if (points.length < 4) return [];

	const corners = findCorners(points, { window: cornerWindow, angle: cornerAngle });
	const count = points.length;
	let cubics = [];

	if (corners.length < 2) {
		// No corners worth keeping: one closed run, cut anywhere. Starting and
		// ending at the same vertex would leave the fitter with no tangent, so
		// the run is closed by repeating the first point at the end.
		const run = [...points, points[0]];
		const tangent = normalize(subtract(points[1], points[count - 1]));
		const back = normalize(subtract(points[count - 1], points[1]));
		cubics = fitRun(run, tangent, back, tolerance);
	} else {
		for (let c = 0; c < corners.length; c++) {
			const from = corners[c];
			const to = corners[(c + 1) % corners.length];
			const run = [];
			let i = from;
			for (let n = 0; n < count + 1; n++) {
				run.push(points[i]);
				if (i === to && run.length > 1) break;
				i = (i + 1) % count;
			}
			if (run.length < 2) continue;

			const leftTangent = normalize(subtract(run[1], run[0]));
			const rightTangent = normalize(subtract(run[run.length - 2], run[run.length - 1]));
			cubics.push(...fitRun(run, leftTangent, rightTangent, tolerance));
		}
	}

	if (addExtrema) cubics = splitAtExtrema(cubics);

	// A handle sitting on its own anchor is a straight line, and the project's
	// format says so with a literal false rather than a duplicated point.
	return cubics.map(([p0, c1, c2, p3]) => [
		{ x: p0.x, y: p0.y },
		length(subtract(c1, p0)) < 0.01 ? false : { x: c1.x, y: c1.y },
		length(subtract(c2, p3)) < 0.01 ? false : { x: c2.x, y: c2.y },
		{ x: p3.x, y: p3.y },
	]);
}
