import { charToHex, validateAsHex } from '../common/character_ids.js';

/**
	METRIC KEYS
	-----------
	Spacing one glyph by naming another.

	The sidebearings of a text face are not independent numbers - they are a
	handful of decisions repeated. Every straight-sided lowercase letter is
	spaced like the `n`; every round one like the `o`. Typing those numbers in
	again for each letter means that when the `n` changes, forty other letters
	are quietly wrong until somebody notices.

	A metric key says the relationship instead of the number: `d`'s left
	sidebearing is `=o`, its right is `=n`. Change the `n` and the whole
	alphabet follows. This is the spacing counterpart to what anchors do for
	accents.

	The syntax is the one from Glyphs, because that is the one people who space
	type already know:

	    =n      the same side of the n
	    =|n     the OTHER side of the n, mirrored - what round letters want
	    =n+10   that, plus ten units
	    =o*0.9  or scaled
 */

/**
 * @typedef {Object} MetricKey
 * @property {String} reference - the glyph being referred to
 * @property {Boolean} mirrored - read the opposite side
 * @property {String} operator - '', '+', '-' or '*'
 * @property {Number} amount - the operand
 */

/**
 * Reads a key.
 *
 * @param {String} text - what the user typed
 * @returns {MetricKey | false} - false when it is not a key at all
 */
export function parseMetricKey(text) {
	const raw = String(text || '').trim();
	if (!raw.startsWith('=')) return false;

	// =|n+10  ->  mirrored, reference 'n', plus 10
	const match = raw.match(/^=\s*(\|)?\s*(.+?)\s*(?:([+\-*])\s*(-?[\d.]+))?$/);
	if (!match) return false;

	const [, mirror, reference, operator, amount] = match;
	if (!reference) return false;

	const parsed = operator ? Number(amount) : 0;
	if (operator && !isFinite(parsed)) return false;

	return {
		reference: reference,
		mirrored: !!mirror,
		operator: operator || '',
		amount: parsed,
	};
}

/**
 * Writes a key back out, so what is stored and what is shown agree.
 * @param {MetricKey} key - a parsed key
 * @returns {String}
 */
export function formatMetricKey(key) {
	if (!key) return '';
	const suffix = key.operator ? `${key.operator}${key.amount}` : '';
	return `=${key.mirrored ? '|' : ''}${key.reference}${suffix}`;
}

/**
 * Turns a key's reference into a glyph id.
 *
 * Three ways to name a glyph, because three are in use: the character itself
 * (`n`), the code point (`U+006E`), and the id the project uses internally.
 *
 * @param {String} reference - the text after the `=`
 * @returns {String} - a glyph id, or '' when it cannot be read
 */
export function referenceToGlyphID(reference) {
	const text = String(reference || '').trim();
	if (!text) return '';

	if (text.startsWith('glyph-')) return text;

	/*
		`U+006E` and `0x6E` are the same character, and the project writes its
		ids without the padding - so the normalising is left to the same
		function the project uses, rather than done again slightly differently
		here.
	*/
	const unicodeMatch = text.match(/^(?:U\+|0x)([0-9a-fA-F]{1,6})$/);
	if (unicodeMatch) {
		const hex = validateAsHex(`0x${unicodeMatch[1]}`);
		return hex ? `glyph-${hex}` : '';
	}

	// A single character - the common case, and the one people type.
	const characters = Array.from(text);
	if (characters.length === 1) {
		// charToHex reports failure as `false`, which would otherwise be
		// pasted straight into the id.
		const hex = charToHex(characters[0]);
		if (hex) return `glyph-${hex}`;
	}

	return '';
}

/**
 * Applies the arithmetic part of a key.
 * @param {Number} value - the referenced measurement
 * @param {MetricKey} key - the key
 * @returns {Number}
 */
export function applyKeyMath(value, key) {
	if (key.operator === '+') return value + key.amount;
	if (key.operator === '-') return value - key.amount;
	if (key.operator === '*') return value * key.amount;
	return value;
}

/**
 * The key stored on a glyph for one side, if any.
 * @param {Object} glyph - a Glyph
 * @param {String} side - 'left' or 'right'
 * @returns {String}
 */
export function getSideKey(glyph, side) {
	if (!glyph) return '';
	return (side === 'left' ? glyph.leftSideBearingKey : glyph.rightSideBearingKey) || '';
}

/**
 * Works out what a keyed sidebearing should be.
 *
 * Keys chain: `d` can be keyed to `o`, which is itself keyed to something
 * else. They can also, by accident, chain back round to where they started -
 * so the path taken is carried along and a repeat is reported rather than
 * followed.
 *
 * @param {Object} project - a GlyphrStudioProject
 * @param {String} glyphID - the glyph being resolved
 * @param {String} side - 'left' or 'right'
 * @param {Set=} visited - ids already on this path
 * @returns {Object} - {ok, value, reason}
 */
export function resolveSideBearing(project, glyphID, side, visited = new Set()) {
	const glyph = project?.glyphs ? project.glyphs[glyphID] : false;
	if (!glyph) return { ok: false, value: 0, reason: `No glyph ${glyphID}.` };

	const stamp = `${glyphID}:${side}`;
	if (visited.has(stamp)) {
		return { ok: false, value: 0, reason: 'These keys refer back to each other.' };
	}

	const keyText = getSideKey(glyph, side);
	if (!keyText) {
		// Not keyed - this is where a chain ends, with a real measurement.
		return { ok: true, value: side === 'left' ? glyph.leftSideBearing : glyph.rightSideBearing, reason: '' };
	}

	const key = parseMetricKey(keyText);
	if (!key) return { ok: false, value: 0, reason: `Could not read the key "${keyText}".` };

	const referenceID = referenceToGlyphID(key.reference);
	if (!referenceID) return { ok: false, value: 0, reason: `Could not read "${key.reference}".` };
	if (!project.glyphs[referenceID]) {
		return { ok: false, value: 0, reason: `No glyph for "${key.reference}".` };
	}

	/*
		A mirrored key reads the other side of the reference. That is what a
		round letter wants: `o` is symmetrical, so `d`'s left sidebearing is
		the `o`'s left, but `b`'s right sidebearing is also the `o`'s left seen
		from the other side.
	*/
	const referenceSide = key.mirrored ? (side === 'left' ? 'right' : 'left') : side;
	const resolved = resolveSideBearing(project, referenceID, referenceSide, new Set([...visited, stamp]));
	if (!resolved.ok) return resolved;

	return { ok: true, value: Math.round(applyKeyMath(resolved.value, key)), reason: '' };
}

/**
 * Every glyph in a project that has a key on either side.
 * @param {Object} project - a GlyphrStudioProject
 * @returns {Array<String>} - glyph ids
 */
export function findKeyedGlyphs(project) {
	if (!project?.glyphs) return [];

	return Object.keys(project.glyphs).filter(
		(id) => getSideKey(project.glyphs[id], 'left') || getSideKey(project.glyphs[id], 'right')
	);
}
