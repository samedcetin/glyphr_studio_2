/**
	SPECIMEN SHEET — WORKING OUT WHAT IS ON IT

	Asking the user to type the character set was honest but backwards: they
	uploaded a picture of an alphabet, and being made to describe it before
	anything happens is a form the feature does not need.

	It does not need it because a sheet announces itself. The number of shapes
	in each row is a fingerprint - the reference sheet's is [13, 13, 13, 13,
	10, 26], which no other common layout produces - and the pieces each shape
	is drawn in check that fingerprint against the characters it implies:
	whatever `abcdefghijklm` is, it contains exactly two characters drawn in
	two pieces, and no run of thirteen capitals contains any.

	So the layout is DETECTED and shown, and typing one stays as the way to
	correct it rather than the way to begin.

	WHAT THIS DELIBERATELY DOES NOT DO. It does not guess at rows it cannot
	account for. The reference sheet's punctuation row is twenty-six shapes in
	an order nothing standard predicts - and three of them are quote marks that
	no amount of geometry distinguishes - so it is left undeclared, traced, and
	handed to the panel on the Overview for the user to place. A confident
	wrong answer there would be worse than no answer.
*/

import { LAYOUT_TEMPLATES, expectedPieces, parseLayout } from './layout_templates.js';

/** Every row the template declares lines up with a row of the sheet. */
export const DETECTED = 'detected';
/** Nothing matched; the user will have to say. */
export const UNDETECTED = 'undetected';

/**
 * How many of a row's shapes are drawn in the number of pieces the characters
 * assigned to them should be.
 *
 * This is the check that stops a fingerprint match being a coincidence. It
 * costs nothing - segmentation has already counted the pieces - and it is
 * structural rather than stylistic: the dot of an `i` is separate in every
 * face there has ever been.
 *
 * @param {Array} characters - what the template says this row holds
 * @param {Array} glyphs - the row's segmented shapes
 * @returns {Object} { agree, total }
 */
export function piecesAgreement(characters, glyphs) {
	let agree = 0;
	for (let i = 0; i < characters.length && i < glyphs.length; i++) {
		if (glyphs[i].parts.length === expectedPieces(characters[i])) agree++;
	}
	return { agree, total: Math.min(characters.length, glyphs.length) };
}

/**
 * Scores one template against the sheet.
 *
 * A template has to account for its own rows completely - every row it
 * declares must find a row with exactly that many shapes, in order, starting
 * at the top. Rows of the sheet past the end of the template are not a
 * failure; they are the part the template does not cover.
 *
 * @param {Object} template - from LAYOUT_TEMPLATES
 * @param {Array} rows - from segmentSheet
 * @returns {Object|null} a scored match, or null when the counts rule it out
 */
export function scoreTemplate(template, rows) {
	const layout = parseLayout(template.rows.join('\n'));
	if (layout.length > rows.length) return null;

	let agree = 0;
	let total = 0;
	const rowReports = [];

	for (let index = 0; index < layout.length; index++) {
		const characters = layout[index];
		const glyphs = rows[index].glyphs;
		if (characters.length !== glyphs.length) return null;

		const pieces = piecesAgreement(characters, glyphs);
		agree += pieces.agree;
		total += pieces.total;
		rowReports.push({
			index,
			characters: characters.join(''),
			found: glyphs.length,
			piecesAgree: pieces.agree,
			piecesTotal: pieces.total,
		});
	}

	return {
		template,
		layout,
		rowReports,
		covered: layout.length,
		undeclaredRows: rows.length - layout.length,
		confidence: total ? agree / total : 0,
	};
}

/**
 * Works out what is on a sheet.
 *
 * Candidates are ranked by how much of the sheet they account for, and ties
 * are broken by how well the pieces agree - so a template covering five rows
 * beats one covering two, and between two that cover the same rows the one
 * whose characters actually look like the shapes wins.
 *
 * @param {Object} segmentation - from segmentSheet
 * @param {Object =} options
 * @param {Array =} options.templates - candidates to try
 * @returns {Object} { status, template, layout, confidence, rowReports, undeclaredRows }
 */
export function detectLayout(segmentation, { templates = LAYOUT_TEMPLATES } = {}) {
	const rows = segmentation?.rows ?? [];
	if (!rows.length) {
		return { status: UNDETECTED, template: null, layout: [], confidence: 0, rowReports: [], undeclaredRows: 0 };
	}

	const scored = templates
		.map((template) => scoreTemplate(template, rows))
		.filter(Boolean)
		.sort((a, b) => b.covered - a.covered || b.confidence - a.confidence);

	if (!scored.length) {
		return {
			status: UNDETECTED,
			template: null,
			layout: [],
			confidence: 0,
			rowReports: [],
			undeclaredRows: rows.length,
		};
	}

	return { status: DETECTED, ...scored[0] };
}

/**
 * One line saying what was found, for the wizard to show.
 * @param {Object} detection - from detectLayout
 * @returns {String}
 */
export function describeDetection(detection) {
	if (detection.status !== DETECTED) {
		return 'This sheet does not match a layout we know. Tell us what is on it.';
	}

	const characters = detection.layout.reduce((total, row) => total + row.length, 0);
	const parts = [`${characters} characters across ${detection.covered} rows`];
	if (detection.undeclaredRows) {
		const n = detection.undeclaredRows;
		parts.push(
			`${n} row${n === 1 ? '' : 's'} we cannot name — those shapes are traced and left for you to place`
		);
	}
	return parts.join('. ') + '.';
}
