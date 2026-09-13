import { getParentRange } from '../../lib/unicode/unicode_blocks.js';
import { getUnicodeName } from '../../lib/unicode/unicode_names.js';

/**
	COVERAGE AND SUBSETTING
	-----------------------
	Answers two questions a game developer actually has:

		"Which characters does my game draw?"
		"Which of them is my font missing?"

	Feed in the game's strings - a localisation file, a CSV of dialogue, a
	dump of every label - and get back the characters that need a glyph, split
	into the ones the font has and the ones it does not.

	The output feeds straight into the atlas character list, which is how a
	mobile build ships eighty glyphs instead of six hundred. On a size budget
	that difference is the whole game.

	Pure data in, pure data out. No DOM, no project mutation.
 */

/**
 * Characters that never need a glyph: control codes, and the separators that
 * a layout engine handles itself rather than drawing.
 *
 * The space is deliberately NOT here. It has no outline but it does have an
 * advance, and a font missing it lays text out with no gaps.
 */
const NON_RENDERING = new Set([
	0x09, // tab
	0x0a, // line feed
	0x0d, // carriage return
	0x0b,
	0x0c,
	0x85,
	0x200b, // zero width space
	0x200c,
	0x200d,
	0xfeff, // byte order mark
]);

/**
 * @typedef {Object} CharacterUsage
 * @property {Number} codePoint
 * @property {String} char - the character itself
 * @property {Number} count - how many times it appeared
 */

/**
 * Pulls every distinct character out of a blob of text.
 *
 * Array.from rather than split(''), so anything outside the basic plane -
 * emoji, rarer CJK - stays one character instead of two broken halves.
 *
 * @param {String} text - raw text
 * @returns {Array<CharacterUsage>} - sorted by code point
 */
export function extractCharacters(text) {
	const counts = new Map();

	Array.from(String(text || '')).forEach((char) => {
		const codePoint = char.codePointAt(0);
		if (codePoint === undefined) return;
		if (NON_RENDERING.has(codePoint)) return;
		// Everything below the space is a control code.
		if (codePoint < 0x20) return;

		counts.set(codePoint, (counts.get(codePoint) || 0) + 1);
	});

	return [...counts.entries()]
		.map(([codePoint, count]) => ({
			codePoint: codePoint,
			char: String.fromCodePoint(codePoint),
			count: count,
		}))
		.sort((a, b) => a.codePoint - b.codePoint);
}

/**
 * Walks a parsed JSON value and returns every string in it.
 *
 * Keys are skipped by default. A localisation file's keys are identifiers
 * like `menu.start`, never something the game draws, so counting them would
 * pad the subset with characters nobody needs.
 *
 * @param {*} value - parsed JSON
 * @param {Boolean=} includeKeys - also collect object keys
 * @returns {String} - every string found, concatenated
 */
export function collectJSONStrings(value, includeKeys = false) {
	const parts = [];

	const walk = (node) => {
		if (typeof node === 'string') {
			parts.push(node);
			return;
		}
		if (Array.isArray(node)) {
			node.forEach(walk);
			return;
		}
		if (node && typeof node === 'object') {
			Object.keys(node).forEach((key) => {
				if (includeKeys) parts.push(key);
				walk(node[key]);
			});
		}
	};

	walk(value);
	return parts.join('\n');
}

/**
 * Reduces a file's contents to just the text a game would draw.
 *
 * @param {String} raw - file contents
 * @param {String=} format - 'auto', 'text' or 'json'
 * @returns {Object} - {text, format} - which interpretation was used
 */
export function textFromSource(raw, format = 'auto') {
	const input = String(raw || '');

	if (format === 'text') return { text: input, format: 'text' };

	if (format === 'json' || format === 'auto') {
		try {
			const parsed = JSON.parse(input);
			// A bare string or number is not a localisation file; treat the
			// whole thing as plain text instead.
			if (parsed && typeof parsed === 'object') {
				return { text: collectJSONStrings(parsed), format: 'json' };
			}
		} catch {
			// Not JSON. Plain text it is - which is the right answer for CSV,
			// .properties, .po and anything else line based, because every
			// value in those is text the game draws.
		}
		if (format === 'json') return { text: input, format: 'text' };
	}

	return { text: input, format: 'text' };
}

/**
 * @typedef {Object} CoverageEntry
 * @property {Number} codePoint
 * @property {String} char
 * @property {Number} count
 * @property {String} name - the Unicode name
 * @property {String} block - the Unicode block name
 */

/**
 * @typedef {Object} CoverageReport
 * @property {Array<CoverageEntry>} covered - characters the font can draw
 * @property {Array<CoverageEntry>} missing - characters it cannot
 * @property {Number} totalCharacters - distinct characters found
 * @property {String} subsetString - the covered characters, ready to paste
 *                                   into the atlas character list
 */

/**
 * Compares a set of used characters against what the project actually has.
 *
 * A character counts as covered when the project has a glyph for it. A blank
 * glyph still counts - the space is covered by having an advance, not by
 * having an outline.
 *
 * @param {Object} project - a GlyphrStudioProject
 * @param {Array<CharacterUsage>} usage - output of extractCharacters
 * @returns {CoverageReport}
 */
export function analyzeCoverage(project, usage) {
	const covered = [];
	const missing = [];

	usage.forEach((entry) => {
		const id = `glyph-0x${entry.codePoint.toString(16).toUpperCase()}`;
		const glyph = project.getItem(id);

		const described = {
			codePoint: entry.codePoint,
			char: entry.char,
			count: entry.count,
			name: describeName(entry.codePoint),
			block: describeBlock(entry.codePoint),
		};

		if (glyph) covered.push(described);
		else missing.push(described);
	});

	return {
		covered: covered,
		missing: missing,
		totalCharacters: usage.length,
		subsetString: covered.map((entry) => entry.char).join(''),
	};
}

/**
 * Groups missing characters by Unicode block.
 *
 * Twenty missing characters that are all Latin Extended-A is one job - add
 * that block. Twenty scattered across five blocks is five. The grouping is
 * what turns a list into a plan.
 *
 * @param {Array<CoverageEntry>} entries - usually the missing list
 * @returns {Array} - [{block, characters}] sorted by how many are missing
 */
export function groupByBlock(entries) {
	const groups = new Map();

	entries.forEach((entry) => {
		const existing = groups.get(entry.block) || [];
		existing.push(entry);
		groups.set(entry.block, existing);
	});

	return [...groups.entries()]
		.map(([block, characters]) => ({ block: block, characters: characters }))
		.sort((a, b) => b.characters.length - a.characters.length);
}

/**
 * The Unicode name for a code point, falling back to the hex value.
 * @param {Number} codePoint - the character
 * @returns {String}
 */
function describeName(codePoint) {
	try {
		const name = getUnicodeName(`0x${codePoint.toString(16).toUpperCase()}`);
		if (name) return name;
	} catch {
		// The name tables do not cover every plane.
	}
	return `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`;
}

/**
 * The Unicode block a code point belongs to.
 * @param {Number} codePoint - the character
 * @returns {String}
 */
function describeBlock(codePoint) {
	/*
		getParentRange warns to the console for code points it does not cover,
		which would spam the log for a file full of unusual characters. The
		warning is not useful here - an unknown block is an expected answer -
		so it is silenced for the duration of the lookup.
	*/
	const originalWarn = console.warn;
	try {
		console.warn = () => {};
		const range = getParentRange(codePoint);
		if (range?.name) return range.name;
	} catch {
		// Unallocated or outside the tables.
	} finally {
		console.warn = originalWarn;
	}
	return 'Other';
}
