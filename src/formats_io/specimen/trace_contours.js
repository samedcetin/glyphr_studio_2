/**
	SPECIMEN SHEET — CONTOUR EXTRACTION

	Marching squares on the GREY plane, not on the ink mask.

	This is the single highest-value decision in the tracer and it is worth
	stating plainly. Binarizing first and following the resulting pixel edge
	throws away the anti-aliasing, and the anti-aliasing is where the accuracy
	is: measured against known outlines, tracing a binary mask tops out around
	0.966 IoU while tracing the grey iso-contour reaches 0.9955 — and the loss
	happens one stage BEFORE any curve is fitted, so no amount of clever
	fitting gets it back.

	It also removes a whole stage. A binary contour is a staircase of unit
	steps, so its discrete curvature is +/-90 degrees at every single vertex,
	and a corner detector pointed at it flags a hundred corners down one
	diagonal. That is exactly why potrace has an "optimal polygon" phase. Come
	off the grey plane instead and there is no staircase to suppress: the
	contour arrives as a sub-pixel polyline that curve fitting can be pointed
	straight at.

	Output is closed contours of sub-pixel points, in image coordinates
	(y down). Winding is not normalised here — that decision belongs in font
	space, after the y-flip, and is made in trace_glyph.js.
*/

/**
 * Which edge of a cell a crossing sits on. Edges are named by the grid line
 * they lie on rather than by the cell, so the two cells either side of an edge
 * agree on its identity without any floating-point comparison.
 *
 * For cell (x, y): top = h(x,y), bottom = h(x,y+1), left = v(x,y), right = v(x+1,y)
 */
const TOP = 0;
const RIGHT = 1;
const BOTTOM = 2;
const LEFT = 3;

/**
 * Directed segments per marching-squares case, as [from, to] edge pairs.
 *
 * Bits: 1 = top-left inside, 2 = top-right, 4 = bottom-right, 8 = bottom-left.
 * Cases 5 and 10 are the saddles and are resolved by the caller from the
 * centre value, so they are left empty here.
 */
const CASES = [
	[], // 0  nothing inside
	[[LEFT, TOP]], // 1  TL
	[[TOP, RIGHT]], // 2  TR
	[[LEFT, RIGHT]], // 3  TL TR
	[[RIGHT, BOTTOM]], // 4  BR
	[], // 5  saddle
	[[TOP, BOTTOM]], // 6  TR BR
	[[LEFT, BOTTOM]], // 7  TL TR BR
	[[BOTTOM, LEFT]], // 8  BL
	[[BOTTOM, TOP]], // 9  TL BL
	[], // 10 saddle
	[[BOTTOM, RIGHT]], // 11 TL TR BL
	[[RIGHT, LEFT]], // 12 BR BL
	[[RIGHT, TOP]], // 13 TL BR BL
	[[TOP, LEFT]], // 14 TR BR BL
	[], // 15 everything inside
];

// A saddle whose middle is inside connects the two diagonal corners, so the
// boundary wraps the two OUTSIDE corners instead - which is the same pair of
// segments run backwards.
const SADDLE_5_OPEN = [
	[LEFT, TOP],
	[RIGHT, BOTTOM],
];
const SADDLE_5_JOINED = [
	[RIGHT, TOP],
	[LEFT, BOTTOM],
];
const SADDLE_10_OPEN = [
	[TOP, RIGHT],
	[BOTTOM, LEFT],
];
const SADDLE_10_JOINED = [
	[TOP, LEFT],
	[BOTTOM, RIGHT],
];

/**
 * Extracts closed sub-pixel contours at the zero crossing of a scalar field.
 *
 * The field is positive inside the shape and negative outside, so the caller
 * sets where the edge falls by how it builds the field - for a specimen sheet
 * that is `threshold - grey`, which puts the contour exactly on the grey level
 * Otsu chose.
 *
 * Anything off the edge of the buffer counts as outside, so a shape touching
 * the border still closes.
 *
 * @param {Float32Array} field - one value per pixel, positive = inside
 * @param {Number} width
 * @param {Number} height
 * @returns {Array} contours, each an array of { x, y } in image coordinates
 */
export function traceContours(field, width, height) {
	const at = (x, y) => (x < 0 || y < 0 || x >= width || y >= height ? -1 : field[y * width + x]);

	// Where a contour crosses each grid edge, found once and shared by the two
	// cells that meet there. Keyed by an integer so the two cells cannot
	// disagree about an edge through rounding.
	const crossings = new Map();

	/**
	 * @param {Number} x - cell column
	 * @param {Number} y - cell row
	 * @param {Number} side - TOP | RIGHT | BOTTOM | LEFT
	 * @returns {Number} a stable key for the grid edge that side lies on
	 */
	const edgeKey = (x, y, side) => {
		if (side === TOP) return (y * (width + 2) + x) * 2;
		if (side === BOTTOM) return ((y + 1) * (width + 2) + x) * 2;
		if (side === LEFT) return (y * (width + 2) + x) * 2 + 1;
		return (y * (width + 2) + x + 1) * 2 + 1;
	};

	/**
	 * The sub-pixel point where the field passes through zero on one edge.
	 * @param {Number} x - cell column
	 * @param {Number} y - cell row
	 * @param {Number} side - TOP | RIGHT | BOTTOM | LEFT
	 * @returns {Object} { x, y }
	 */
	const crossingAt = (x, y, side) => {
		const key = edgeKey(x, y, side);
		const known = crossings.get(key);
		if (known) return known;

		let a;
		let b;
		let point;
		if (side === TOP) {
			a = at(x, y);
			b = at(x + 1, y);
			point = { x: x + a / (a - b), y };
		} else if (side === BOTTOM) {
			a = at(x, y + 1);
			b = at(x + 1, y + 1);
			point = { x: x + a / (a - b), y: y + 1 };
		} else if (side === LEFT) {
			a = at(x, y);
			b = at(x, y + 1);
			point = { x, y: y + a / (a - b) };
		} else {
			a = at(x + 1, y);
			b = at(x + 1, y + 1);
			point = { x: x + 1, y: y + a / (a - b) };
		}

		crossings.set(key, point);
		return point;
	};

	// Walk every cell, including one ring outside the buffer so shapes that
	// touch the edge still close.
	const next = new Map(); // exit edge key -> { toKey, from, to }

	for (let y = -1; y < height; y++) {
		for (let x = -1; x < width; x++) {
			const topLeft = at(x, y);
			const topRight = at(x + 1, y);
			const bottomRight = at(x + 1, y + 1);
			const bottomLeft = at(x, y + 1);

			let index = 0;
			if (topLeft > 0) index |= 1;
			if (topRight > 0) index |= 2;
			if (bottomRight > 0) index |= 4;
			if (bottomLeft > 0) index |= 8;
			if (index === 0 || index === 15) continue;

			let segments = CASES[index];
			if (index === 5 || index === 10) {
				const centre = (topLeft + topRight + bottomRight + bottomLeft) / 4;
				if (index === 5) segments = centre > 0 ? SADDLE_5_JOINED : SADDLE_5_OPEN;
				else segments = centre > 0 ? SADDLE_10_JOINED : SADDLE_10_OPEN;
			}

			for (const [from, to] of segments) {
				next.set(edgeKey(x, y, from), {
					toKey: edgeKey(x, y, to),
					from: crossingAt(x, y, from),
					to: crossingAt(x, y, to),
				});
			}
		}
	}

	// Follow the links into closed loops.
	const contours = [];
	const used = new Set();

	for (const startKey of next.keys()) {
		if (used.has(startKey)) continue;

		const points = [];
		let key = startKey;
		while (!used.has(key)) {
			const step = next.get(key);
			if (!step) break;
			used.add(key);
			points.push(step.from);
			key = step.toKey;
		}

		// Three points is the smallest thing with an inside.
		if (points.length >= 3) contours.push(points);
	}

	return contours;
}

/**
 * Twice the signed area of a closed polygon.
 *
 * Sign tells you which way the points run, and nothing else - it does NOT say
 * whether a contour is an outer edge or a counter. A `%` has five contours and
 * an `i` has two disjoint outer ones, so that question needs containment, not
 * a sign. Magnitude is useful on its own for dropping specks.
 *
 * @param {Array} points - { x, y }
 * @returns {Number}
 */
export function signedArea(points) {
	let total = 0;
	for (let i = 0; i < points.length; i++) {
		const a = points[i];
		const b = points[(i + 1) % points.length];
		total += a.x * b.y - b.x * a.y;
	}
	return total;
}

/**
 * Whether a point lies inside a closed polygon, by ray casting.
 *
 * @param {Object} point - { x, y }
 * @param {Array} polygon - { x, y }
 * @returns {Boolean}
 */
export function pointInPolygon(point, polygon) {
	let inside = false;
	for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
		const a = polygon[i];
		const b = polygon[j];
		if (a.y > point.y !== b.y > point.y) {
			const at = ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
			if (point.x < at) inside = !inside;
		}
	}
	return inside;
}

/**
 * Sorts contours into outers and holes by how deeply each one is nested.
 *
 * A contour sitting inside an odd number of others is a hole; inside an even
 * number (including none) it is an outer edge. That is what separates the
 * counter of a `B` from the two disjoint pieces of an `i`, which a signed area
 * cannot tell apart.
 *
 * @param {Array} contours - from traceContours
 * @returns {Array} one entry per contour, { points, depth, isHole }
 */
export function nestContours(contours) {
	return contours.map((points) => {
		// Any vertex will do for the containment test - a polygon that contains
		// one vertex of a closed contour contains all of them, since contours
		// from marching squares never cross.
		const probe = points[0];
		let depth = 0;
		for (const other of contours) {
			if (other === points) continue;
			if (pointInPolygon(probe, other)) depth++;
		}
		return { points, depth, isHole: depth % 2 === 1 };
	});
}
