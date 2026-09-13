/**
	PRIVATE USE AREA
	----------------
	Unicode sets aside three ranges that it promises never to assign a meaning
	to. That is where icon fonts live: Font Awesome, Material Icons, Nerd Fonts
	and every game's own UI set all park their glyphs there, because a code
	point in the Private Use Area will never one day turn out to be a letter.

	Unicode has no names for these code points, which is the thing that makes
	an icon font awkward to work with - `U+E047` tells you nothing. Everything
	in this folder exists to keep a real name attached to each one.
 */

/**
 * The three Private Use ranges, in the order icons are usually assigned.
 *
 * The first is the one anything BMP-based should use - a lot of engines and
 * text layout code still assume 16-bit code points, and the supplementary
 * planes need surrogate pairs that not every pipeline handles.
 */
export const puaRanges = [
	{ begin: 0xe000, end: 0xf8ff, name: 'Private Use Area' },
	{ begin: 0xf0000, end: 0xffffd, name: 'Supplementary Private Use Area-A' },
	{ begin: 0x100000, end: 0x10fffd, name: 'Supplementary Private Use Area-B' },
];

/** Where icon assignment starts unless told otherwise. */
export const DEFAULT_ICON_START = 0xe000;

/**
 * @param {Number} codePoint - a code point
 * @returns {Boolean}
 */
export function isPrivateUse(codePoint) {
	return puaRanges.some((range) => codePoint >= range.begin && codePoint <= range.end);
}

/**
 * The glyph id for a code point.
 * @param {Number} codePoint - a code point
 * @returns {String}
 */
export function glyphIDForCodePoint(codePoint) {
	return `glyph-0x${codePoint.toString(16).toUpperCase()}`;
}

/**
 * Whether a project already has a glyph at this code point.
 *
 * Reads the glyph table directly rather than going through `getItem`, which
 * can be asked to create what it cannot find - not what you want from a
 * function whose whole job is to report emptiness.
 *
 * @param {Object} project - a GlyphrStudioProject
 * @param {Number} codePoint - a code point
 * @returns {Boolean}
 */
export function isCodePointTaken(project, codePoint) {
	return !!(project?.glyphs && project.glyphs[glyphIDForCodePoint(codePoint)]);
}

/**
 * Finds the next free Private Use code points.
 *
 * Assignment is stable: it always starts from the same place and walks
 * upwards, so importing the same icons into the same project twice puts them
 * in the same order. Anything else would reshuffle the numbers already baked
 * into a game's source.
 *
 * @param {Object} project - a GlyphrStudioProject
 * @param {Number} count - how many are needed
 * @param {Number=} start - where to start looking
 * @returns {Array<Number>} - as many as could be found, possibly fewer
 */
export function findFreeCodePoints(project, count, start = DEFAULT_ICON_START) {
	const found = [];
	if (count <= 0) return found;

	puaRanges.forEach((range) => {
		if (found.length >= count) return;
		// A range entirely below the starting point has nothing to offer.
		if (start > range.end) return;

		for (let codePoint = Math.max(range.begin, start); codePoint <= range.end; codePoint++) {
			if (found.length >= count) return;
			if (isCodePointTaken(project, codePoint)) continue;
			found.push(codePoint);
		}
	});

	return found;
}

/**
 * Every Private Use glyph in a project, with whatever it is called.
 *
 * @param {Object} project - a GlyphrStudioProject
 * @returns {Array<Object>} - [{codePoint, id, name, glyph}] sorted by code point
 */
export function listIconGlyphs(project) {
	if (!project?.glyphs) return [];

	return Object.keys(project.glyphs)
		.map((id) => {
			const codePoint = parseInt(id.replace('glyph-', ''), 16);
			return { id: id, codePoint: codePoint, glyph: project.glyphs[id] };
		})
		.filter((entry) => isFinite(entry.codePoint) && isPrivateUse(entry.codePoint))
		.map((entry) => ({ ...entry, name: entry.glyph.name }))
		.sort((a, b) => a.codePoint - b.codePoint);
}
