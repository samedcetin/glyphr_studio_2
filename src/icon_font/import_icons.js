import { ioSVG_convertSVGTagsToGlyph } from '../formats_io/svg_outlines/svg_outline_import.js';
import { Glyph } from '../project_data/glyph.js';
import { defaultIconBox, makeIconFit, scaleGlyphInPlace } from './fit_icon.js';
import { makeSlugs } from './icon_names.js';
import { findFreeCodePoints, glyphIDForCodePoint, isCodePointTaken, listIconGlyphs } from './pua.js';

/**
	IMPORTING ICONS
	---------------
	A folder of SVGs becomes a set of glyphs in the Private Use Area, each one
	named after its file.

	Planning and doing are separate on purpose. The plan says exactly which
	file becomes which code point under which name, and which files cannot be
	used and why - so the dialog can show all of that before anything is
	written, and the import is then just the plan carried out. It is the same
	reason the atlas export builds its preview with the code that writes the
	files: two paths that are supposed to agree eventually stop agreeing.
 */

/**
 * @typedef {Object} IconPlanEntry
 * @property {String} fileName - where it came from
 * @property {String} slug - the name it will be known by
 * @property {Number} codePoint - where it will live
 * @property {Boolean} ok - whether it can be imported
 * @property {String} reason - why not, when it cannot
 * @property {Object|false} glyph - the parsed shapes, ready to place
 */

/**
 * Works out what an import would do, without doing it.
 *
 * @param {Object} project - a GlyphrStudioProject
 * @param {Array<Object>} files - [{name, text}]
 * @param {Object=} options - {start, replaceExisting}
 * @returns {Array<IconPlanEntry>}
 */
export function planIconImport(project, files, options = {}) {
	const upm = Number(project?.settings?.font?.upm) || 1000;

	/*
		Names already spoken for. Reusing one would give the exported map two
		entries with the same key, so a repeat import of the same set lands on
		'heart-2' rather than quietly shadowing 'heart'.
	*/
	const takenNames = new Set(listIconGlyphs(project).map((entry) => entry.name));
	const slugs = makeSlugs(
		files.map((file) => file.name),
		takenNames
	);

	// Parse first, because a file with no drawable shapes should not consume a
	// code point that a later file could have had.
	const parsed = files.map((file, index) => {
		/** @type {Object | false} - the parsed Glyph, or false when unusable */
		let glyph = false;
		let reason = '';

		try {
			glyph = ioSVG_convertSVGTagsToGlyph(String(file.text || ''), false, upm);
		} catch {
			reason = 'Could not be read as SVG.';
		}

		if (glyph && !glyph.shapes.length) {
			glyph = false;
			reason = reason || 'No shapes found in the file.';
		}

		if (glyph && !hasDrawableArea(glyph)) {
			glyph = false;
			// A stroked line is the usual cause: it has length but no area, so
			// there is nothing to make a glyph out of until it is expanded.
			reason = 'No area to fill — expand strokes to outlines first.';
		}

		if (glyph && isStrokeOnly(String(file.text || ''))) {
			glyph = false;
			reason = 'Drawn with strokes and no fill — expand strokes to outlines first.';
		}

		return { fileName: file.name, slug: slugs[index], glyph: glyph, reason: reason };
	});

	const usable = parsed.filter((entry) => entry.glyph);
	const codePoints = findFreeCodePoints(project, usable.length, options.start);

	let next = 0;
	return parsed.map((entry) => {
		if (!entry.glyph) {
			return { ...entry, codePoint: 0, ok: false };
		}

		const codePoint = codePoints[next++];
		if (codePoint === undefined) {
			return { ...entry, codePoint: 0, ok: false, reason: 'No free code points left.' };
		}

		return { ...entry, codePoint: codePoint, ok: true, reason: '' };
	});
}

/**
 * Places one parsed SVG onto the em square.
 *
 * SVG has y running down the page and a font has it running up, so the shapes
 * are flipped - and flipping reverses which side of a contour is inside,
 * which is what the winding reversal puts right. Skip that and every icon
 * comes out as its own silhouette punched into a hole.
 *
 * @param {Object} glyph - a Glyph holding the parsed shapes
 * @param {Object} box - {boxHeight, boxBottom, advanceWidth, sidebearing}
 * @returns {Boolean} - whether it could be placed
 */
export function placeIconGlyph(glyph, box) {
	glyph.flipNS();
	glyph.reverseWinding();

	const source = glyph.maxes;
	const fit = makeIconFit(source, box);
	if (!fit) return false;

	/*
		One multiply per coordinate, rather than a size change followed by a
		move. An icon has to grow by a factor of eighty or so to fill an em,
		and the Glyph class's own scaling is not accurate at that factor - see
		scaleGlyphInPlace.
	*/
	scaleGlyphInPlace(
		glyph,
		fit.scale,
		fit.x - source.xMin * fit.scale,
		fit.y - source.yMin * fit.scale
	);
	glyph.advanceWidth = fit.advanceWidth;

	return true;
}

/**
 * Carries out a plan.
 *
 * @param {Object} project - a GlyphrStudioProject, written to
 * @param {Array<IconPlanEntry>} plan - from planIconImport
 * @param {Object=} box - icon box, defaults to the project's own proportions
 * @returns {Object} - {imported, skipped, entries}
 */
export function importIcons(project, plan, box = false) {
	const iconBox = box || defaultIconBox(project);
	const imported = [];
	const skipped = [];

	plan.forEach((entry) => {
		if (!entry.ok || !entry.glyph) {
			skipped.push(entry);
			return;
		}

		if (!placeIconGlyph(entry.glyph, iconBox)) {
			skipped.push({ ...entry, reason: 'Nothing to draw once parsed.' });
			return;
		}

		const id = glyphIDForCodePoint(entry.codePoint);
		const newGlyph = new Glyph({
			id: id,
			name: entry.slug,
			shapes: entry.glyph.shapes,
			advanceWidth: entry.glyph.advanceWidth,
		});

		project.addItemByType(newGlyph, 'Glyph', id);
		imported.push(entry);
	});

	return { imported: imported, skipped: skipped, entries: plan };
}

/**
 * Whether a code point in a plan would land on something that already exists.
 *
 * Only used for reporting - the planner never hands out an occupied code
 * point in the first place.
 *
 * @param {Object} project - a GlyphrStudioProject
 * @param {Array<IconPlanEntry>} plan - from planIconImport
 * @returns {Array<IconPlanEntry>}
 */
export function findCollisions(project, plan) {
	return plan.filter((entry) => entry.ok && isCodePointTaken(project, entry.codePoint));
}

/**
 * Whether a parsed icon has any area at all.
 *
 * A stroked line comes back as a path with length and no width, which cannot
 * be scaled to fill a box - and finding that out at import time rather than
 * while planning would mean the table said 'Ready' about a file that was
 * about to be skipped.
 *
 * @param {Object} glyph - a parsed Glyph
 * @returns {Boolean}
 */
function hasDrawableArea(glyph) {
	const maxes = glyph.maxes;
	if (!maxes) return false;
	return maxes.xMax - maxes.xMin > 0 && maxes.yMax - maxes.yMin > 0;
}

/**
 * Whether an SVG is drawn entirely with strokes.
 *
 * The parser keeps the geometry and throws away the paint, so by the time
 * there are shapes to look at there is no way to tell a filled circle from a
 * stroked one - both are the same outline, and the stroked one imports as a
 * solid blob. So the raw text is checked instead.
 *
 * The rule is deliberately narrow: a file is only rejected when it declares
 * fills and every one of them is `none`. A file with no fill declared at all
 * is filled black by default, which is exactly what an icon wants.
 *
 * @param {String} text - the SVG source
 * @returns {Boolean}
 */
function isStrokeOnly(text) {
	const fills = text.match(/fill\s*[=:]\s*["']?\s*([#\w()-]+)/gi);
	if (!fills || !fills.length) return false;

	const allNone = fills.every((fill) => /none\s*$/i.test(fill));
	// Without a stroke there would be nothing drawn at all, and that is a
	// different problem with a different answer.
	return allNone && /stroke\s*[=:]/i.test(text);
}
