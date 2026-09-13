import { charToHex } from '../common/character_ids.js';
import { GlyphrStudioProject } from '../project_data/glyphr_studio_project.js';

/**
	PROJECT PREVIEW
	---------------
	Renders a short sample string from a project as a single inline SVG, for
	use as the thumbnail on a project card.

	A file browser needs its files to look like themselves. Showing the actual
	letterforms is what makes "Oblegg" and "My Font" distinguishable at a
	glance - a generic document icon would not.
 */

/** Sample string, in preference order. Falls back per glyph if one is empty. */
const PREFERRED_SAMPLE = 'Aa';

/** Anything drawn from these is used when the preferred sample is empty. */
const FALLBACK_CHARS = 'AaBbGgRnoe0123!?';

/**
 * Turns saved project data into a project instance.
 *
 * Auto-saves store the whole serialized project, so this is cheap enough for a
 * handful of cards but should not be called in a loop over hundreds.
 *
 * @param {Object} projectData - serialized project
 * @returns {GlyphrStudioProject | false}
 */
export function projectFromSavedData(projectData) {
	if (!projectData) return false;
	try {
		return new GlyphrStudioProject(projectData);
	} catch (error) {
		console.warn('Could not read saved project data for preview:', error);
		return false;
	}
}

/**
 * Picks glyphs that actually have outlines to draw.
 * @param {GlyphrStudioProject} project - the project
 * @param {Number} maxGlyphs - how many to return
 * @returns {Array} - glyph objects
 */
function pickSampleGlyphs(project, maxGlyphs) {
	const found = [];

	const tryChar = (char) => {
		if (found.length >= maxGlyphs) return;
		let glyph;
		try {
			glyph = project.getItem(`glyph-${charToHex(char)}`);
		} catch {
			return;
		}
		if (glyph?.shapes?.length && glyph.svgPathData) found.push(glyph);
	};

	PREFERRED_SAMPLE.split('').forEach(tryChar);
	if (found.length < maxGlyphs) FALLBACK_CHARS.split('').forEach(tryChar);

	return found;
}

/**
 * Builds an SVG preview of a project's letterforms.
 *
 * The glyphs are laid out on the baseline using their real advance widths, so
 * the preview also shows roughly how the font spaces - then the whole group is
 * flipped (font coordinates run upwards) and scaled to the requested box.
 *
 * @param {GlyphrStudioProject | false} project - project to preview
 * @param {Object} options - rendering options
 * @param {Number=} options.width - viewBox width
 * @param {Number=} options.height - viewBox height
 * @param {Number=} options.maxGlyphs - how many letters to draw
 * @returns {String} - SVG markup, or empty string when nothing can be drawn
 */
export function makeFontPreviewSVG(project, { width = 240, height = 120, maxGlyphs = 2 } = {}) {
	if (!project) return '';

	const glyphs = pickSampleGlyphs(project, maxGlyphs);
	if (!glyphs.length) return '';

	const ascent = Number(project.settings?.font?.ascent) || 700;
	const descent = Math.abs(Number(project.settings?.font?.descent) || 200);
	const emHeight = ascent + descent;
	if (!emHeight) return '';

	// Lay the glyphs out left to right in em units.
	let cursor = 0;
	const parts = [];
	glyphs.forEach((glyph) => {
		const pathData = glyph.svgPathData;
		if (pathData) parts.push(`<path transform="translate(${cursor},0)" d="${pathData}"/>`);
		cursor += glyph.advanceWidth || project.defaultAdvanceWidth || 500;
	});

	if (!parts.length) return '';

	const emWidth = cursor || 1;
	const padding = 0.12;
	const scale = Math.min(
		(width * (1 - padding * 2)) / emWidth,
		(height * (1 - padding * 2)) / emHeight
	);

	const drawnWidth = emWidth * scale;
	const drawnHeight = emHeight * scale;
	const offsetX = (width - drawnWidth) / 2;
	// Font space runs upward from the baseline, screen space runs down, so the
	// group is flipped on Y and the origin moved to where the baseline lands.
	const offsetY = (height - drawnHeight) / 2 + ascent * scale;

	return `
		<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
			<g fill="currentColor" transform="translate(${offsetX},${offsetY}) scale(${scale},-${scale})">
				${parts.join('')}
			</g>
		</svg>
	`;
}
