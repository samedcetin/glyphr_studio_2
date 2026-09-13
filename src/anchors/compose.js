import { glyphIDForCodePoint } from '../icon_font/pua.js';
import { getUnicodeName } from '../lib/unicode/unicode_names.js';

/**
	COMPOSING ACCENTED CHARACTERS
	-----------------------------
	Building `á` out of the `a` and the acute that are already drawn.

	Which characters break into which pieces is not a table kept here - it is
	Unicode's own normalisation data, which every JavaScript runtime already
	carries. `'á'.normalize('NFD')` is `a` followed by U+0301, and that is
	authoritative in a way a hand-written list never could be.

	What this file adds on top of that is the geometry: where the pieces go.
	That comes from the anchors - the base's `top` and the mark's `_top` are
	the two halves of one connection, and composing is moving the mark until
	they coincide.
 */

/** A single combining mark, by Unicode's own classification. */
const COMBINING_MARK = /^\p{Mn}$/u;

/**
 * Breaks a character into the pieces it is made of.
 *
 * @param {String} character - one character
 * @returns {Object | false} - {base, marks} or false if it is already atomic
 */
export function decomposeCharacter(character) {
	const decomposed = String(character || '').normalize('NFD');
	const parts = Array.from(decomposed);

	// One code point in, one out - nothing to build it from.
	if (parts.length < 2) return false;

	const [base, ...rest] = parts;

	/*
		Every piece after the first has to be a combining mark. A pair like
		'ﬁ' normalises to two letters, which is a ligature and a different
		problem with a different answer.
	*/
	if (!rest.every((part) => COMBINING_MARK.test(part))) return false;

	return { base: base, marks: rest };
}

/**
 * Finds which glyph in a project draws each combining mark.
 *
 * Two ways a project can carry a mark, and both are common:
 *
 * - the combining code point itself, U+0301
 * - the spacing clone, U+00B4 acute - what most keyboard-driven character
 *   sets contain
 *
 * The second is found rather than listed: a spacing clone is exactly a
 * character whose compatibility decomposition is a space followed by the
 * combining mark, so Unicode's own data says which is which.
 *
 * @param {Object} project - a GlyphrStudioProject
 * @returns {Map<Number, String>} - combining code point to glyph id
 */
export function findMarkGlyphs(project) {
	const found = new Map();
	if (!project?.glyphs) return found;

	Object.keys(project.glyphs).forEach((id) => {
		const codePoint = parseInt(id.replace('glyph-', ''), 16);
		if (!isFinite(codePoint)) return;

		const character = String.fromCodePoint(codePoint);

		// The mark itself always wins over a spacing clone of it.
		if (COMBINING_MARK.test(character)) {
			found.set(codePoint, id);
			return;
		}

		const compatibility = Array.from(character.normalize('NFKD'));
		if (compatibility.length === 2 && compatibility[0] === ' ' && COMBINING_MARK.test(compatibility[1])) {
			const markPoint = compatibility[1].codePointAt(0);
			if (!found.has(markPoint)) found.set(markPoint, id);
		}
	});

	return found;
}

/**
 * Finds the anchor pair joining a base to a mark.
 *
 * A mark can carry several attachment points - a cedilla under, an acute over
 * - so the pair is whichever of the mark's own attachment anchors the base
 * also offers a home for.
 *
 * @param {Object} baseGlyph - the letter
 * @param {Object} markGlyph - the mark
 * @returns {Object | false} - {baseAnchor, markAnchor}
 */
export function findAnchorPair(baseGlyph, markGlyph) {
	if (!baseGlyph?.anchors?.length || !markGlyph?.anchors?.length) return false;

	const markAnchors = markGlyph.anchors.filter((anchor) => anchor.isMarkAnchor);

	for (const markAnchor of markAnchors) {
		const baseAnchor = baseGlyph.getAnchor(markAnchor.pairName);
		if (baseAnchor) return { baseAnchor: baseAnchor, markAnchor: markAnchor };
	}

	return false;
}

/**
 * How far a mark has to move for its anchor to land on the base's.
 *
 * @param {Object} baseAnchor - where it is going
 * @param {Object} markAnchor - where it is now
 * @returns {Object} - {translateX, translateY}
 */
export function computeMarkPlacement(baseAnchor, markAnchor) {
	return {
		translateX: baseAnchor.x - markAnchor.x,
		translateY: baseAnchor.y - markAnchor.y,
	};
}

/**
 * @typedef {Object} CompositionStep
 * @property {String} markID - the mark glyph's id
 * @property {Number} translateX - where to put it
 * @property {Number} translateY - where to put it
 * @property {String} anchorName - which connection was used
 */

/**
 * Works out how one character would be built, without building it.
 *
 * Marks stack: in `ế` the acute sits on the circumflex, not on the `e`. So
 * after each mark is placed, if that mark offers a base-style anchor of its
 * own, the next mark attaches to that instead - moved along with the mark it
 * belongs to.
 *
 * @param {Object} project - a GlyphrStudioProject
 * @param {String} character - the character to build
 * @param {Map<Number, String> | null} [markGlyphs] - output of findMarkGlyphs, built if not given
 * @returns {Object} - {ok, character, baseID, steps, reason}
 */
export function planCharacter(project, character, markGlyphs = null) {
	const marks = markGlyphs || findMarkGlyphs(project);
	const pieces = decomposeCharacter(character);

	const fail = (reason) => ({ ok: false, character: character, reason: reason, steps: [] });

	if (!pieces) return fail('Not made of a letter plus marks.');

	const baseID = glyphIDForCodePoint(pieces.base.codePointAt(0));
	const baseGlyph = project.glyphs ? project.glyphs[baseID] : false;
	if (!baseGlyph) return fail(`No glyph for the base letter ${pieces.base}.`);

	/** @type {Array<CompositionStep>} */
	const steps = [];

	// Where the next mark attaches, and how far the glyph carrying that
	// anchor has already been moved.
	let attachTo = baseGlyph;
	let attachOffset = { x: 0, y: 0 };

	for (const mark of pieces.marks) {
		const markPoint = mark.codePointAt(0);
		const markID = marks.get(markPoint);
		if (!markID) {
			/*
				Naming the mark turns the message into an instruction. "No
				glyph for U+0301" says something is wrong; "draw Combining
				Acute Accent" says what to do about it.
			*/
			const hex = markPoint.toString(16).toUpperCase().padStart(4, '0');
			return fail(`Missing mark: ${getUnicodeName(`0x${hex}`)} (U+${hex}).`);
		}

		const markGlyph = project.glyphs[markID];
		const pair = findAnchorPair(attachTo, markGlyph);
		if (!pair) {
			return fail(
				`No matching anchors — ${attachTo.name} needs one the mark can attach to.`
			);
		}

		const placement = computeMarkPlacement(
			{ x: pair.baseAnchor.x + attachOffset.x, y: pair.baseAnchor.y + attachOffset.y },
			pair.markAnchor
		);

		steps.push({
			markID: markID,
			translateX: placement.translateX,
			translateY: placement.translateY,
			anchorName: pair.baseAnchor.name,
		});

		/*
			If this mark offers the same connection onwards - a circumflex with
			its own `top` - the next mark goes there, shifted by however far
			this one moved.
		*/
		const onward = markGlyph.getAnchor(pair.baseAnchor.name);
		if (onward) {
			attachTo = markGlyph;
			attachOffset = { x: placement.translateX, y: placement.translateY };
		}
	}

	return { ok: true, character: character, baseID: baseID, steps: steps, reason: '' };
}

/**
 * Plans a whole set of characters.
 * @param {Object} project - a GlyphrStudioProject
 * @param {String|Array} characters - what to build
 * @returns {Array<Object>}
 */
export function planComposition(project, characters) {
	const marks = findMarkGlyphs(project);
	const list = typeof characters === 'string' ? Array.from(characters) : characters;
	return list.map((character) => planCharacter(project, character, marks));
}
