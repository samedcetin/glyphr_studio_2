/**
	SPECIMEN SHEET — METRICS

	Where the baseline is, how tall the capitals are, and how many font units a
	source pixel is worth.

	Two rules carry this file, and both exist because the obvious thing is
	wrong.

	ONE SCALE FOR THE WHOLE SHEET. The tempting formula is per row: take the
	row's cap height and stretch it to the project's. It falls apart on its own
	terms, because only the capital rows HAVE a cap height - the a-m row's
	tallest ink is an ascender, the n-z row's is a `t`, the digit row's is a
	digit. Normalising each row to whatever its tallest ink happens to be gives
	every row a different scale, and the font comes out with lowercase that does
	not match its capitals. So the scale is measured once, from the capitals,
	and every row is measured against it. Rows only contribute their own
	vertical OFFSET.

	THE BASELINE IS NOT THE BOTTOM OF THE ROW. The a-m row has `g` and `j` in
	it. Taking the lowest ink would put the baseline at the bottom of a
	descender and sink the whole row. And the bottom of a round letter is not
	the baseline either: `O` and `o` and `0` overshoot it by one or two percent,
	on purpose, because a curve that stops exactly on the line looks short.
	Snapping every bottom to the baseline would flatten that out of the face.

	So the baseline comes from the characters that genuinely sit on it, which
	the layout already names. When a row has too few of those to be sure, it
	falls back to a low quantile of the non-descender bottoms, which lands on
	the flat sitters for the same reason.
*/

/** Characters whose bottom rests flat on the baseline, with no overshoot. */
const FLAT_BOTTOM = new Set(
	'BDEFHIKLMNPRTZbdhiklmnrz1247'.split('')
);

/** Capitals whose top is flat at the cap line, with no overshoot. */
const FLAT_TOP_CAP = new Set('BDEFHIKLMNPRTZ'.split(''));

/** Lowercase whose top is flat at the x-height, with no overshoot. */
const FLAT_TOP_X = new Set('vwxyzrnmu'.split(''));

/** Characters that reach below the baseline. */
const DESCENDER = new Set('gjpqyQ,;'.split(''));

/** Characters that reach above the x-height. */
const ASCENDER = new Set('bdfhklt'.split(''));

/**
 * @param {Array} values
 * @param {Number} fraction - 0 to 1
 * @returns {Number} the value at that position once sorted
 */
function quantile(values, fraction) {
	if (!values.length) return NaN;
	const sorted = [...values].sort((a, b) => a - b);
	const at = (sorted.length - 1) * fraction;
	const low = Math.floor(at);
	const high = Math.ceil(at);
	if (low === high) return sorted[low];
	return sorted[low] + (sorted[high] - sorted[low]) * (at - low);
}

const median = (values) => quantile(values, 0.5);

/**
 * Measures one row of assigned cells.
 *
 * Everything is in image pixels, y down, so a LARGER y is lower on the page.
 *
 * @param {Array} cells - { cell, character } from assignGlyphs
 * @returns {Object} { baseline, capTop, xTop, descender, confident }
 */
export function measureRow(cells) {
	const known = cells.filter((entry) => entry.character);

	const bottomsOf = (test) =>
		known.filter((entry) => test(entry.character)).map((entry) => entry.cell.y1);
	const topsOf = (test) =>
		known.filter((entry) => test(entry.character)).map((entry) => entry.cell.y0);

	const flatBottoms = bottomsOf((c) => FLAT_BOTTOM.has(c));
	let baseline;
	let confident = true;

	if (flatBottoms.length >= 3) {
		baseline = median(flatBottoms);
	} else {
		// Not enough flat sitters to be sure - a punctuation row, or a row of
		// round digits. The flat ones are still the HIGHEST bottoms among
		// everything that does not descend, so a low quantile finds them.
		const bottoms = bottomsOf((c) => !DESCENDER.has(c));
		baseline = bottoms.length ? quantile(bottoms, 0.25) : NaN;
		confident = false;
	}

	const flatCapTops = topsOf((c) => FLAT_TOP_CAP.has(c));
	const flatXTops = topsOf((c) => FLAT_TOP_X.has(c));
	const ascenderTops = topsOf((c) => ASCENDER.has(c));
	const descenderBottoms = bottomsOf((c) => DESCENDER.has(c));

	return {
		baseline,
		capTop: flatCapTops.length >= 2 ? median(flatCapTops) : NaN,
		xTop: flatXTops.length >= 2 ? median(flatXTops) : NaN,
		ascenderTop: ascenderTops.length >= 2 ? median(ascenderTops) : NaN,
		descenderBottom: descenderBottoms.length >= 2 ? median(descenderBottoms) : NaN,
		confident,
		sitters: flatBottoms.length,
	};
}

/**
 * Measures the whole sheet and works out the one scale it will be imported at.
 *
 * @param {Object} assignment - from assignGlyphs
 * @param {Object} targets - the project's own metrics
 * @param {Number} targets.upm
 * @param {Number} targets.capHeight
 * @param {Number} targets.xHeight
 * @returns {Object} { unitsPerPixel, rows, capHeightPx, xHeightPx, source, warnings }
 */
export function measureSheet(assignment, targets) {
	const rows = assignment.rows.map((row) => ({ index: row.index, ...measureRow(row.cells) }));
	const warnings = [];

	// Rows that carry a real cap height: both a flat cap top and a baseline.
	const capRows = rows.filter((row) => Number.isFinite(row.capTop) && Number.isFinite(row.baseline));
	const xRows = rows.filter((row) => Number.isFinite(row.xTop) && Number.isFinite(row.baseline));

	const capHeightPx = capRows.length
		? median(capRows.map((row) => row.baseline - row.capTop))
		: NaN;
	const xHeightPx = xRows.length ? median(xRows.map((row) => row.baseline - row.xTop)) : NaN;

	let unitsPerPixel;
	let source;

	if (Number.isFinite(capHeightPx) && capHeightPx > 0) {
		unitsPerPixel = targets.capHeight / capHeightPx;
		source = 'cap-height';
	} else if (Number.isFinite(xHeightPx) && xHeightPx > 0) {
		unitsPerPixel = targets.xHeight / xHeightPx;
		source = 'x-height';
		warnings.push(
			'No capitals on this sheet, so the scale comes from the x-height instead of the cap height.'
		);
	} else {
		// Nothing to measure against. Fall back to the tallest row so the import
		// is at least the right order of magnitude, and say so.
		const tallest = Math.max(
			...assignment.rows.flatMap((row) => row.cells.map((c) => c.cell.y1 - c.cell.y0 + 1)),
			1
		);
		unitsPerPixel = targets.capHeight / tallest;
		source = 'guessed';
		warnings.push(
			'Could not find a baseline or a cap height on this sheet. The size is a guess and should be checked.'
		);
	}

	for (const row of rows) {
		if (!row.confident) {
			warnings.push(
				`Row ${row.index + 1} has too few flat-bottomed characters to place its baseline exactly.`
			);
		}
	}

	/*
		The proportions belong to the SHEET, not to the project.

		The project's defaults are a starting point for a blank file, not a
		description of the face someone drew. Measured on the reference sheet the
		x-height is 0.643 of the cap height, where the project's defaults assume
		0.743 - so levelling every lowercase onto the project's line would make
		the lowercase a tenth of a cap taller than it was drawn, which is not
		tidying a typeface up, it is redesigning it.

		So the scale is anchored on the project's cap height, because something
		has to fix the size, and every other line is measured off the sheet at
		that scale. What comes back here is what the project's own metrics should
		be SET to once the import lands.
	*/
	const ascenderRows = rows.filter(
		(row) => Number.isFinite(row.ascenderTop) && Number.isFinite(row.baseline)
	);
	const descenderRows = rows.filter(
		(row) => Number.isFinite(row.descenderBottom) && Number.isFinite(row.baseline)
	);

	const derived = {
		upm: targets.upm,
		capHeight: targets.capHeight,
		xHeight: Number.isFinite(xHeightPx)
			? Math.round(xHeightPx * unitsPerPixel)
			: targets.xHeight,
		ascent: ascenderRows.length
			? Math.round(median(ascenderRows.map((row) => row.baseline - row.ascenderTop)) * unitsPerPixel)
			: targets.ascent,
		descent: descenderRows.length
			? -Math.round(
					median(descenderRows.map((row) => row.descenderBottom - row.baseline)) * unitsPerPixel
				)
			: targets.descent,
	};

	return { unitsPerPixel, rows, capHeightPx, xHeightPx, source, warnings, derived };
}

/**
	LEVELLING

	A specimen sheet drawn by hand or generated by a model does not sit on a
	line. Measured on the reference sheet, the bottoms of the capitals in one
	row span 29 source pixels and in the next row 43 - about 120 to 170 font
	units at 2048 upm, six to eleven percent of the cap height. Nothing in the
	tracer causes that and nothing in the tracer can fix it: it is in the image.
	Left alone it is the most visible defect in the finished font, because
	every line of text bounces.

	What fixes it is knowing what each character is, which the layout already
	says. A `B` has a flat foot and belongs exactly on the baseline. An `O` has
	a round one and belongs a whisker below it, because a curve that stops on
	the line reads as short - that overshoot is deliberate and levelling must
	put it back, not flatten it. A `p` cannot be placed by its foot at all, so
	it goes by its shoulder at the x-height instead.

	Anything not in these tables keeps whatever the row's own baseline gave it.
	Guessing at a character we have no rule for would be worse than the wander.
*/

/**
	The four tables below say, per character, which line each edge belongs on
	and whether that edge is flat or round. Every character appears in at most
	one table per edge - a character in two would take whichever was tested
	first, which is a bug waiting to be written rather than a rule.
*/

/** Flat foot: belongs exactly on the baseline. */
const FOOT_FLAT = new Set('BDEFHIKLMNPRTZbdhiklmnrxz1247'.split(''));

/** Round or pointed foot: belongs a touch below the baseline. */
const FOOT_ROUND = new Set('ACGJOQSUVWYaceosuvw035689'.split(''));

/** Foot descends below the baseline, so the glyph is placed by its top. */
const FOOT_DESCENDS = new Set('gpqy'.split(''));

/**
 * Where a character's top edge belongs.
 * @param {String} character
 * @param {Object} targets - the project's metrics
 * @param {Number} overshoot - font units a round edge passes its line by
 * @returns {Number|null} font units
 */
export function expectedTop(character, targets, overshoot) {
	if (TOP_CAP_FLAT.has(character)) return targets.capHeight;
	if (TOP_CAP_ROUND.has(character)) return targets.capHeight + overshoot;
	if (TOP_X_FLAT.has(character)) return targets.xHeight;
	if (TOP_X_ROUND.has(character)) return targets.xHeight + overshoot;
	if (TOP_ASCENDER.has(character)) return targets.ascent;
	return null;
}

/**
 * Where a character's bottom edge belongs.
 * @param {String} character
 * @param {Object} targets - the project's metrics
 * @param {Number} overshoot - font units a round edge passes its line by
 * @returns {Number|null} font units
 */
export function expectedBottom(character, targets, overshoot) {
	if (FOOT_FLAT.has(character)) return 0;
	if (FOOT_ROUND.has(character)) return -overshoot;
	if (FOOT_DESCENDS.has(character)) return targets.descent;
	return null;
}

/**
 * Where a character's outline should touch once the sheet's wander is removed.
 *
 * A glyph is placed by its foot where it has one to stand on, and by its top
 * where it does not - `p` and `g` and `y` reach down to the descender, which
 * is a line nothing else in the row touches and so a poor thing to register
 * against. Both answers come from the same tables as expectedExtent, so the
 * two can never disagree about where an edge belongs.
 *
 * @param {String} character
 * @param {Object} targets - the project's metrics
 * @param {Number} overshoot - font units a round edge passes the line by
 * @returns {Object|null} { edge: 'bottom' | 'top', y } or null to leave alone
 */
export function verticalTarget(character, targets, overshoot) {
	if (FOOT_DESCENDS.has(character)) {
		const top = expectedTop(character, targets, overshoot);
		return top === null ? null : { edge: 'top', y: top };
	}
	const bottom = expectedBottom(character, targets, overshoot);
	return bottom === null ? null : { edge: 'bottom', y: bottom };
}

/** Flat top at the cap line. Digits stand at cap height in this face. */
const TOP_CAP_FLAT = new Set('BDEFHIKLMNPRTZ1457'.split(''));
/** Round or pointed top, a whisker above the cap line. */
const TOP_CAP_ROUND = new Set('ACGJOQSUVWXY023689'.split(''));
/** Flat top at the x-height. */
const TOP_X_FLAT = new Set('nmruvwxyz'.split(''));
/** Round top, a whisker above the x-height. */
const TOP_X_ROUND = new Set('aceogps'.split(''));
/** Reaches the ascender. */
const TOP_ASCENDER = new Set('bdfhklt'.split(''));

/**
 * Where a character's top and bottom belong, in font units.
 *
 * Only characters covered at BOTH ends get an answer. Half a rule is worse
 * than none here: scaling a glyph to an extent we only half know would stretch
 * it to fit a line we invented.
 *
 * @param {String} character
 * @param {Object} targets - the project's metrics
 * @param {Number} overshoot - font units a round edge passes its line by
 * @returns {Object|null} { top, bottom }
 */
export function expectedExtent(character, targets, overshoot) {
	const top = expectedTop(character, targets, overshoot);
	const bottom = expectedBottom(character, targets, overshoot);
	if (top === null || bottom === null) return null;
	return { top, bottom };
}

/**
 * How far a round edge should pass the line it sits on.
 * @param {Object} targets - the project's metrics
 * @param {Number =} fraction - of cap height
 * @returns {Number} font units
 */
export function defaultOvershoot(targets, fraction = 0.012) {
	return Math.round(targets.capHeight * fraction);
}

/**
 * How much the sheet's own baseline wanders, in font units.
 *
 * Worth reporting rather than silently correcting: it is a property of the
 * image the user supplied, and it tells them whether their sheet is good.
 *
 * @param {Object} assignment - from assignGlyphs
 * @param {Object} metrics - from measureSheet
 * @returns {Object} { spread, worstRow }
 */
export function measureBaselineWander(assignment, metrics) {
	let spread = 0;
	let worstRow = -1;

	assignment.rows.forEach((row, index) => {
		const bottoms = row.cells
			.filter((entry) => entry.character && FOOT_FLAT.has(entry.character))
			.map((entry) => entry.cell.y1);
		if (bottoms.length < 3) return;
		const range = (Math.max(...bottoms) - Math.min(...bottoms)) * metrics.unitsPerPixel;
		if (range > spread) {
			spread = range;
			worstRow = index;
		}
	});

	return { spread, worstRow };
}

/**
 * The sidebearing to give every glyph, in font units.
 *
 * A specimen sheet carries NO spacing information. The gaps on it are how
 * whoever made the image chose to set the line; they are not the font's
 * sidebearings, and no amount of measuring will turn one into the other. What
 * is true is that the sheet was set with ONE tracking for all of it, so one
 * sidebearing for all of it is the consistent choice - and it has to be said
 * out loud in the UI that this is generated rather than recovered.
 *
 * @param {Object} targets - the project's metrics
 * @param {Number =} fraction - of cap height
 * @returns {Number} font units
 */
export function defaultSidebearing(targets, fraction = 0.05) {
	return Math.round(targets.capHeight * fraction);
}

export const METRIC_SETS = { FLAT_BOTTOM, FLAT_TOP_CAP, FLAT_TOP_X, DESCENDER, ASCENDER };
