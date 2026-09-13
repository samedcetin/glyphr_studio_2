import { glyphIDForCodePoint } from '../icon_font/pua.js';
import { ComponentInstance } from '../project_data/component_instance.js';
import { addLinkToUsedIn } from '../project_editor/cross_item_actions.js';
import { planComposition } from './compose.js';

/**
	BUILDING COMPOSED GLYPHS
	------------------------
	Carrying out a composition plan.

	The pieces go in as component instances rather than as copied outlines,
	which is the whole point: fix the shape of the `a` afterwards and every
	one of `à á â ã ä å ā ă ą` follows it. Copied outlines would have to be
	rebuilt one at a time, which in practice means they never are.
 */

/**
 * Whether a glyph has anything in it worth keeping.
 *
 * Composition never quietly writes over work. A glyph that is already drawn
 * is left alone unless the caller says otherwise.
 *
 * @param {Object} project - a GlyphrStudioProject
 * @param {String} id - glyph id
 * @returns {Boolean}
 */
export function glyphHasContent(project, id) {
	const glyph = project?.glyphs ? project.glyphs[id] : false;
	return !!(glyph && glyph.shapes && glyph.shapes.length);
}

/**
 * Builds one character from its plan.
 *
 * @param {Object} project - a GlyphrStudioProject, written to
 * @param {Object} plan - one entry from planComposition
 * @param {Boolean=} replaceExisting - overwrite a glyph that already has shapes
 * @returns {Object} - {ok, id, reason}
 */
export function composeCharacter(project, plan, replaceExisting = false) {
	if (!plan.ok) return { ok: false, id: '', reason: plan.reason };

	const codePoint = plan.character.codePointAt(0);
	const id = glyphIDForCodePoint(codePoint);

	if (!replaceExisting && glyphHasContent(project, id)) {
		return { ok: false, id: id, reason: 'Already drawn — left alone.' };
	}

	// `true` creates the glyph if this is the first time it has been built.
	const target = project.getItem(id, true);
	const baseGlyph = project.glyphs[plan.baseID];

	const shapes = [];

	const baseInstance = new ComponentInstance({
		link: plan.baseID,
		name: `Instance of ${baseGlyph.name}`,
	});
	shapes.push(baseInstance);
	addLinkToUsedIn(baseGlyph, id);

	plan.steps.forEach((step) => {
		const markGlyph = project.glyphs[step.markID];
		shapes.push(
			new ComponentInstance({
				link: step.markID,
				name: `Instance of ${markGlyph.name}`,
				translateX: step.translateX,
				translateY: step.translateY,
			})
		);
		addLinkToUsedIn(markGlyph, id);
	});

	target.shapes = shapes;

	/*
		A combining mark has no advance of its own - it is drawn over the
		letter before it - so a composed character is exactly as wide as its
		base. Taking the width from the assembled outlines instead would make
		every accented letter wider than the letter it came from.
	*/
	target.advanceWidth = baseGlyph.advanceWidth;
	target.changed();

	return { ok: true, id: id, reason: '' };
}

/**
 * Plans and builds a whole set.
 *
 * @param {Object} project - a GlyphrStudioProject, written to
 * @param {String|Array} characters - what to build
 * @param {Boolean=} replaceExisting - overwrite glyphs that are already drawn
 * @returns {Object} - {built, skipped, results}
 */
export function composeCharacters(project, characters, replaceExisting = false) {
	const plans = planComposition(project, characters);
	const built = [];
	const skipped = [];

	plans.forEach((plan) => {
		const result = composeCharacter(project, plan, replaceExisting);
		if (result.ok) built.push({ ...plan, id: result.id });
		else skipped.push({ ...plan, reason: result.reason });
	});

	return { built: built, skipped: skipped, results: plans };
}
