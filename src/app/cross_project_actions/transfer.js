import { scaleGlyphInPlace } from '../../icon_font/fit_icon.js';
import { Glyph } from '../../project_data/glyph.js';
import { KernGroup } from '../../project_data/kern_group.js';
import { makeGlyphWithResolvedLinks } from '../../project_editor/cross_item_actions.js';

/**
	TRANSFER
	--------
	Making a copy of an item that is safe to hand to another project.

	Three things have to be true of the copy, and none of them were:

	- It shares nothing with the source. `makeGlyphWithResolvedLinks` builds a
	  Glyph from the source glyph's own properties, and the `usedIn` and `gsub`
	  arrays came across by reference - so the destination's glyph and the
	  source's pointed at the same array, and editing one edited the other
	  project. The copy goes through `save()` and back, which is the one
	  serialisation this codebase already trusts.
	- Scaling to the destination's em is a scale, not a resize. The old code
	  fed an advance-width delta into `updateGlyphSize` as a bounding-box
	  change and never touched the advance width itself. A glyph from a 2048
	  em landing in a 1000 em is every coordinate times 1000/2048, advance
	  included, about the origin - which is what `scaleGlyphInPlace` does.
	- Nothing here touches history or the current editor. That is the caller's
	  job, and it has to be done on the destination's history.
 */

/**
 * How much bigger or smaller the destination's em is.
 * @param {Object} sourceProject - a GlyphrStudioProject
 * @param {Object} destinationProject - a GlyphrStudioProject
 * @returns {Number} - 1 when they match
 */
export function emRatioBetween(sourceProject, destinationProject) {
	const from = Number(sourceProject?.settings?.font?.upm) || 1000;
	const to = Number(destinationProject?.settings?.font?.upm) || 1000;
	return to / from;
}

/**
 * Says what scaling would do, in words the dialog can show.
 *
 * "49% smaller" was wrong twice over - 1000/2048 is 0.49, so the destination
 * is 51% smaller, and the sentence read as the ratio either way round. The
 * two em sizes and the factor between them are what a reader can check.
 *
 * @param {Object} sourceProject - a GlyphrStudioProject
 * @param {Object} destinationProject - a GlyphrStudioProject
 * @returns {String}
 */
export function describeEmScaling(sourceProject, destinationProject) {
	const from = Number(sourceProject?.settings?.font?.upm) || 1000;
	const to = Number(destinationProject?.settings?.font?.upm) || 1000;
	const ratio = to / from;
	const factor = Math.round(ratio * 1000) / 1000;
	return `The source em is ${from} units and the destination em is ${to} — every coordinate and advance width is multiplied by ${factor}.`;
}

/**
 * A standalone copy of a glyph-like item, with component links resolved to
 * plain paths, scaled and re-wound as asked.
 *
 * @param {Object} sourceItem - a Glyph, ligature or component from the source
 * @param {Object=} options - {emRatio, scale, reverseWindings}
 * @returns {Object} - a new Glyph that shares nothing with the source
 */
export function copyGlyphForTransfer(
	sourceItem,
	{ emRatio = 1, scale = false, reverseWindings = false } = {}
) {
	const resolved = makeGlyphWithResolvedLinks(sourceItem);

	/*
		Through save() and back. The saved form is plain data - no shared
		arrays, no parent pointers, no live references into the source project.
	*/
	const copy = new Glyph(JSON.parse(JSON.stringify(resolved.save(true))));
	copy.name = sourceItem.name;
	copy.usedIn = [];

	if (scale && emRatio !== 1) {
		scaleGlyphInPlace(copy, emRatio);
		copy.advanceWidth = Math.round(copy.advanceWidth * emRatio);
	}

	if (reverseWindings) copy.reverseWinding();

	return copy;
}

/**
 * A standalone copy of a kern group, scaled as asked.
 *
 * @param {Object} sourceGroup - a KernGroup from the source
 * @param {Object=} options - {emRatio, scale}
 * @returns {Object} - a new KernGroup
 */
export function copyKernGroupForTransfer(sourceGroup, { emRatio = 1, scale = false } = {}) {
	const copy = new KernGroup(JSON.parse(JSON.stringify(sourceGroup.save(true))));
	if (scale && emRatio !== 1) copy.value = Math.round(copy.value * emRatio);
	return copy;
}

/**
 * Finds an item in a project, creating an empty one if it is not there.
 *
 * `project.getItem(id, true)` does this too, and then adds a history entry to
 * whichever editor is *selected* - which, on a cross-project page, is not
 * necessarily the project being written to. So the creation is done here,
 * without touching any history at all.
 *
 * @param {Object} project - a GlyphrStudioProject, written to
 * @param {String} id - glyph-, liga- or comp- id
 * @returns {Object} - the item
 */
export function ensureItem(project, id) {
	const existing = project.getItem(id);
	if (existing) return existing;

	const objType = id.startsWith('liga-')
		? 'Ligature'
		: id.startsWith('comp-')
		? 'Component'
		: 'Glyph';
	return project.addItemByType(new Glyph({ id: id }), objType, id);
}
