/**
	SPECIMEN SHEET — SEGMENTATION

	Turning an ink mask into an ordered list of glyph cells.

	Three steps, and only the third is interesting:

	  1. label connected components
	  2. band them into rows
	  3. group components into glyphs inside each row

	Step 3 is where `i` gets its dot back. A glyph is not a connected component:
	`i` and `j` and `!` and `?` are two pieces, `%` is three, `=` and `:` and
	`;` are two, and quote marks are two or more. They are reunited by x-range
	OVERLAP, which is the rule that also leaves `(` and `)` alone - a dot sits
	directly above its stem and shares its columns, while two adjacent glyphs
	occupy columns that do not intersect at all.

	Counters are NOT handled here. The bowl of an `A` is a hole, not a
	component, and the tracer resolves holes from contour nesting - so a filled
	`A` and a hollow `A` are one component either way.

	DOM-free by design, same as binarize.js.
*/

/**
 * Labels 8-connected runs of ink, two-pass with union-find.
 *
 * 8-connected rather than 4-connected because a rounded face joins strokes on
 * the diagonal all the time; 4-connectivity splits a thin diagonal join into
 * a row of separate specks.
 *
 * @param {Uint8Array} ink - one byte per pixel, 1 = ink
 * @param {Number} width
 * @param {Number} height
 * @returns {Object} { count, boxes } where boxes are { x0, y0, x1, y1, area }
 *   with x1/y1 INCLUSIVE, in reading order of first appearance
 */
export function labelComponents(ink, width, height) {
	const labels = new Int32Array(ink.length);
	// Grows as needed; index 0 is unused so a 0 in `labels` means background.
	let parent = new Int32Array(1024);
	let nextLabel = 1;

	const find = (x) => {
		let root = x;
		while (parent[root] !== root) root = parent[root];
		// Path compression, so the second pass stays near O(n).
		while (parent[x] !== root) {
			const next = parent[x];
			parent[x] = root;
			x = next;
		}
		return root;
	};

	const union = (a, b) => {
		const rootA = find(a);
		const rootB = find(b);
		if (rootA !== rootB) parent[Math.max(rootA, rootB)] = Math.min(rootA, rootB);
	};

	const newLabel = () => {
		if (nextLabel >= parent.length) {
			const grown = new Int32Array(parent.length * 2);
			grown.set(parent);
			parent = grown;
		}
		parent[nextLabel] = nextLabel;
		return nextLabel++;
	};

	// Pass one: provisional labels, recording equivalences.
	for (let y = 0; y < height; y++) {
		const row = y * width;
		const rowAbove = row - width;
		for (let x = 0; x < width; x++) {
			const index = row + x;
			if (!ink[index]) continue;

			// The four already-visited neighbours of an 8-connected scan.
			const west = x > 0 ? labels[index - 1] : 0;
			const north = y > 0 ? labels[rowAbove + x] : 0;
			const northWest = x > 0 && y > 0 ? labels[rowAbove + x - 1] : 0;
			const northEast = x < width - 1 && y > 0 ? labels[rowAbove + x + 1] : 0;

			let best = 0;
			if (west && (!best || west < best)) best = west;
			if (north && (!best || north < best)) best = north;
			if (northWest && (!best || northWest < best)) best = northWest;
			if (northEast && (!best || northEast < best)) best = northEast;

			if (!best) {
				labels[index] = newLabel();
				continue;
			}

			labels[index] = best;
			if (west) union(best, west);
			if (north) union(best, north);
			if (northWest) union(best, northWest);
			if (northEast) union(best, northEast);
		}
	}

	// Pass two: resolve to roots and accumulate bounding boxes in one sweep.
	const boxes = new Map();
	for (let y = 0; y < height; y++) {
		const row = y * width;
		for (let x = 0; x < width; x++) {
			const index = row + x;
			if (!labels[index]) continue;
			const root = find(labels[index]);
			labels[index] = root;

			const box = boxes.get(root);
			if (!box) {
				boxes.set(root, { x0: x, y0: y, x1: x, y1: y, area: 1 });
				continue;
			}
			if (x < box.x0) box.x0 = x;
			if (x > box.x1) box.x1 = x;
			if (y > box.y1) box.y1 = y;
			box.area++;
		}
	}

	return { count: boxes.size, boxes: [...boxes.values()], labels };
}

/**
 * Drops specks.
 *
 * A scan or a lossy export leaves single-pixel dirt that would otherwise be
 * counted as a glyph. The floor is relative to the sheet so it holds at any
 * resolution: anything under a thousandth of the median component area, or
 * only a few pixels across, is not a character.
 *
 * Note the median is taken over ALL components, so it already sits well below
 * a letter - the dots of `i` and `j` and the full stop are legitimate small
 * components and must survive.
 *
 * @param {Array} boxes - from labelComponents
 * @param {Object =} options
 * @param {Number =} options.minAreaRatio - of the median component area
 * @param {Number =} options.minSide - absolute pixel floor on the longer side
 * @returns {Array} the boxes worth keeping
 */
export function dropSpecks(boxes, { minAreaRatio = 0.002, minSide = 2 } = {}) {
	if (!boxes.length) return [];
	const areas = boxes.map((b) => b.area).sort((a, b) => a - b);
	const median = areas[Math.floor(areas.length / 2)];
	const floor = median * minAreaRatio;

	return boxes.filter((box) => {
		if (box.area < floor) return false;
		const w = box.x1 - box.x0 + 1;
		const h = box.y1 - box.y0 + 1;
		return Math.max(w, h) >= minSide;
	});
}

/**
 * Counts ink per scanline.
 *
 * @param {Uint8Array} ink - one byte per pixel, 1 = ink
 * @param {Number} width
 * @param {Number} height
 * @returns {Int32Array} one count per scanline
 */
export function inkProfile(ink, width, height) {
	const profile = new Int32Array(height);
	for (let y = 0; y < height; y++) {
		const row = y * width;
		let count = 0;
		for (let x = 0; x < width; x++) count += ink[row + x];
		profile[y] = count;
	}
	return profile;
}

/**
 * Cuts the ink profile into bands wherever it drops below a fraction of peak.
 *
 * @param {Int32Array} profile - from inkProfile
 * @param {Number} cut - absolute ink count below which a scanline is a gap
 * @returns {Array} bands, each { y0, y1 }
 */
function bandsAbove(profile, cut) {
	const bands = [];
	let start = -1;
	for (let y = 0; y < profile.length; y++) {
		if (profile[y] > cut) {
			if (start === -1) start = y;
		} else if (start !== -1) {
			bands.push({ y0: start, y1: y - 1 });
			start = -1;
		}
	}
	if (start !== -1) bands.push({ y0: start, y1: profile.length - 1 });
	return bands;
}

/**
 * Bands components into rows.
 *
 * The naive rule - break wherever a scanline is completely empty - does not
 * survive a real sheet. Measured on the reference specimen, the descenders of
 * `g` and `j` in the a-m row reach far enough down to touch the n-z row below,
 * so a blank-line rule finds five bands where there are six and hands two
 * rows' worth of letters to one row.
 *
 * What separates them is that a descender is a tail. Two glyphs' worth of
 * tail carries under 2% of the ink a full row of thirteen letters carries, so
 * cutting the profile at a small FRACTION of its peak parts the rows cleanly
 * while leaving every real row intact. On the reference sheet anything from 2%
 * to 8% gives exactly six bands; 3% sits in the middle of that range.
 *
 * The cut is then checked rather than trusted. A band is measured against the
 * MEDIAN COMPONENT HEIGHT rather than against the other bands, because the
 * other bands are no help when the whole sheet has come back as one: a row is
 * about as tall as the glyphs standing in it, so a band twice that is two rows
 * stuck together whatever its neighbours look like. Such a band is cut again
 * at its own emptiest scanline, and the check repeats until nothing is left
 * that is too tall. That way one constant does not have to be right for every
 * sheet.
 *
 * A component is filed by where its vertical middle falls, which keeps a `j`
 * with its own row rather than with the row its tail reaches toward.
 *
 * @param {Int32Array} profile - from inkProfile
 * @param {Array} boxes - from labelComponents, specks already dropped
 * @param {Number} height - of the sheet
 * @param {Object =} options
 * @param {Number =} options.cutRatio - of peak ink, below which is a gap
 * @param {Number =} options.splitAbove - band height, as a multiple of the
 *   median component height, that means the band is more than one row
 * @returns {Array} rows, each { y0, y1, boxes } top to bottom
 */
export function findRows(profile, boxes, height, { cutRatio = 0.03, splitAbove = 1.6 } = {}) {
	if (!boxes.length) return [];

	let peak = 0;
	for (let y = 0; y < profile.length; y++) if (profile[y] > peak) peak = profile[y];

	const componentHeights = boxes.map((b) => b.y1 - b.y0 + 1).sort((a, b) => a - b);
	const tooTall =
		componentHeights[Math.floor(componentHeights.length / 2)] * splitAbove;

	let bands = bandsAbove(profile, peak * cutRatio);

	// Re-split anything still holding more than one row. Bounded by the number
	// of bands it could possibly produce, so a pathological profile cannot spin.
	for (let pass = 0; pass < 8; pass++) {
		let cut = false;
		const split = [];
		for (const band of bands) {
			const bandHeight = band.y1 - band.y0 + 1;
			if (bandHeight <= tooTall) {
				split.push(band);
				continue;
			}
			// The emptiest scanline in the middle third - away from the ends,
			// where a row's own ascenders and descenders thin out anyway.
			const third = Math.round(bandHeight / 3);
			const from = band.y0 + third;
			const to = band.y1 - third;
			let at = from;
			let least = Infinity;
			for (let y = from; y <= to; y++) {
				if (profile[y] < least) {
					least = profile[y];
					at = y;
				}
			}
			if (at <= band.y0 || at >= band.y1) {
				split.push(band);
				continue;
			}
			split.push({ y0: band.y0, y1: at - 1 }, { y0: at + 1, y1: band.y1 });
			cut = true;
		}
		bands = split;
		if (!cut) break;
	}

	const rows = bands.map((band) => ({ ...band, boxes: [] }));
	for (const box of boxes) {
		const middle = (box.y0 + box.y1) / 2;
		let target = rows.findIndex((row) => middle >= row.y0 && middle <= row.y1);
		if (target === -1) {
			// A tall bracket can straddle a band edge; give it the nearest band.
			let bestDistance = Infinity;
			rows.forEach((row, index) => {
				const distance = middle < row.y0 ? row.y0 - middle : middle - row.y1;
				if (distance < bestDistance) {
					bestDistance = distance;
					target = index;
				}
			});
		}
		if (target >= 0) rows[target].boxes.push(box);
	}

	return rows.filter((row) => row.boxes.length);
}

/**
 * Groups a row's components into glyphs.
 *
 * Bare x-range intersection is not enough, and the reference sheet proves it:
 * in a bold face set this tight, neighbouring letters overlap by a few columns
 * all the time, and because grouping is transitive that is all it takes for a
 * whole row of thirteen letters to chain into one glyph. Measured: the a-m row
 * came back as a single 3245px-wide glyph with 25 pieces in it.
 *
 * What actually distinguishes a dot from a neighbour is not WHETHER the
 * columns intersect but HOW MUCH. A tittle sits squarely over its stem and
 * shares nearly all of its own width with it; two adjacent letters graze each
 * other by a few percent. So the test is the overlap as a fraction of the
 * NARROWER piece, which is scale-free and needs no pixel tolerance:
 *
 *   `i` `j` dot over stem      ~100%    joined
 *   `!` `?` dot under the bar  ~100%    joined
 *   `=` two bars                100%    joined
 *   `:` `;` stacked dots       ~100%    joined
 *   `a` grazing `b`             ~2%     left alone
 *
 * Grouping stays transitive so the three pieces of `%` chain together through
 * the slash even where the two rings do not meet each other directly.
 *
 * @param {Array} rowBoxes - components in one row
 * @param {Object =} options
 * @param {Number =} options.minOverlap - shared columns needed to join, as a
 *   fraction of the narrower component's width
 * @returns {Array} glyph cells, left to right, each { x0, y0, x1, y1, parts }
 */
export function groupIntoGlyphs(rowBoxes, { minOverlap = 0.5 } = {}) {
	if (!rowBoxes.length) return [];

	const sorted = [...rowBoxes].sort((a, b) => a.x0 - b.x0);
	const groups = [];

	for (const box of sorted) {
		const width = box.x1 - box.x0 + 1;
		let joined = null;

		// Against every group so far, not just the last one - a tall bracket can
		// sit between a glyph's two pieces without belonging to either.
		for (const group of groups) {
			const shared = Math.min(group.x1, box.x1) - Math.max(group.x0, box.x0) + 1;
			if (shared <= 0) continue;
			const narrower = Math.min(width, group.x1 - group.x0 + 1);
			if (shared / narrower >= minOverlap) {
				joined = group;
				break;
			}
		}

		if (joined) {
			joined.parts.push(box);
			if (box.x0 < joined.x0) joined.x0 = box.x0;
			if (box.x1 > joined.x1) joined.x1 = box.x1;
			if (box.y0 < joined.y0) joined.y0 = box.y0;
			if (box.y1 > joined.y1) joined.y1 = box.y1;
			continue;
		}

		groups.push({ x0: box.x0, y0: box.y0, x1: box.x1, y1: box.y1, parts: [box] });
	}

	return groups.sort((a, b) => a.x0 - b.x0);
}

/**
 * The whole segmentation stage, as one call.
 *
 * @param {Uint8Array} ink - one byte per pixel, 1 = ink
 * @param {Number} width
 * @param {Number} height
 * @param {Object =} options - passed through to the steps
 * @returns {Object} { rows, glyphCount, componentCount }
 */
export function segmentSheet(ink, width, height, options = {}) {
	const { boxes } = labelComponents(ink, width, height);
	const kept = dropSpecks(boxes, options);
	const profile = inkProfile(ink, width, height);
	const rows = findRows(profile, kept, height, options).map((row) => ({
		y0: row.y0,
		y1: row.y1,
		glyphs: groupIntoGlyphs(row.boxes, options),
	}));

	return {
		rows,
		componentCount: kept.length,
		glyphCount: rows.reduce((total, row) => total + row.glyphs.length, 0),
	};
}
