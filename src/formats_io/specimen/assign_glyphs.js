/**
	SPECIMEN SHEET — ASSIGNMENT

	Which traced shape becomes which character.

	The rule is reading order against the declared layout, and the whole design
	rests on being honest about when that rule does not apply. When a row holds
	as many shapes as the layout says it should, every assignment in it is
	certain and there is nothing to review. When it does not - a glyph was
	missed, two ran together, a speck survived - then every character after the
	discrepancy is shifted, and there is NO way to work out where the fault is
	from position alone.

	So a row that does not match is not quietly patched. It is assigned as best
	we can, marked in full, and put in front of the user. The alternative -
	guessing at an alignment and rendering the result as confident - is how an
	importer silently writes a `k` into the `l` slot and nobody notices until
	the font is in a game.

	Piece count is used as a second opinion. It costs nothing (segmentation has
	already counted the pieces) and it localises a fault that the row count only
	detects: if the row is one short and the `i` is the first cell whose piece
	count is wrong, that is where to look.
*/

import { expectedPieces } from './layout_templates.js';

/** Every cell matched its character and its piece count. */
export const ROW_OK = 'ok';
/** The row holds a different number of shapes than the layout declares. */
export const ROW_COUNT_MISMATCH = 'count-mismatch';
/** Counts agree but at least one cell looks like the wrong character. */
export const ROW_CHECK = 'check';
/** The layout says nothing about this row. */
export const ROW_UNDECLARED = 'undeclared';

/**
 * Assigns traced glyph cells to characters.
 *
 * @param {Array} rows - from segmentSheet, each { y0, y1, glyphs }
 * @param {Array} layout - rows of single-character strings, from parseLayout
 * @returns {Object} { rows, assigned, needsReview, missingRows, extraRows }
 */
export function assignGlyphs(rows, layout) {
	const result = rows.map((row, index) => {
		const characters = layout[index];

		if (!characters) {
			return {
				index,
				status: ROW_UNDECLARED,
				expected: 0,
				found: row.glyphs.length,
				cells: row.glyphs.map((cell) => ({
					cell,
					character: null,
					status: ROW_UNDECLARED,
					note: 'No characters declared for this row',
				})),
			};
		}

		const countsAgree = characters.length === row.glyphs.length;
		const cells = row.glyphs.map((cell, position) => {
			const character = characters[position] ?? null;
			const want = character === null ? null : expectedPieces(character);
			const have = cell.parts.length;

			let status = ROW_OK;
			let note = '';

			if (!countsAgree) {
				status = ROW_COUNT_MISMATCH;
				note = character
					? 'The row count is wrong, so this position may be shifted'
					: 'More shapes than characters declared';
			} else if (want !== null && have !== want) {
				status = ROW_CHECK;
				note = `Drawn in ${have} ${have === 1 ? 'piece' : 'pieces'}, expected ${want}`;
			}

			return { cell, character, status, note };
		});

		let status = ROW_OK;
		if (!countsAgree) status = ROW_COUNT_MISMATCH;
		else if (cells.some((c) => c.status === ROW_CHECK)) status = ROW_CHECK;

		return {
			index,
			status,
			expected: characters.length,
			found: row.glyphs.length,
			cells,
		};
	});

	// Rows the layout declares that the sheet does not have. Worth saying out
	// loud - a layout with six rows against a sheet with five usually means the
	// row banding merged two, not that a row is genuinely absent.
	const missingRows = [];
	for (let index = rows.length; index < layout.length; index++) {
		missingRows.push({ index, characters: layout[index] });
	}

	const assigned = result.reduce(
		(total, row) => total + row.cells.filter((c) => c.character && c.status === ROW_OK).length,
		0
	);
	const needsReview = result.reduce(
		(total, row) => total + row.cells.filter((c) => c.status !== ROW_OK).length,
		0
	);

	return {
		rows: result,
		assigned,
		needsReview,
		missingRows,
		extraRows: result.filter((row) => row.status === ROW_UNDECLARED).length,
	};
}

/**
 * Every assignment that is safe to write into a project, flattened.
 *
 * A cell with no character - a speck the layout has no slot for - is dropped
 * rather than given one.
 *
 * @param {Object} assignment - from assignGlyphs
 * @param {Boolean =} includeReviewed - also take cells the user was warned about
 * @returns {Array} { character, cell, row, position }
 */
export function acceptedAssignments(assignment, includeReviewed = false) {
	const out = [];
	assignment.rows.forEach((row) => {
		row.cells.forEach((entry, position) => {
			if (!entry.character) return;
			if (!includeReviewed && entry.status !== ROW_OK) return;
			out.push({ character: entry.character, cell: entry.cell, row: row.index, position });
		});
	});
	return out;
}

/**
 * A one-line description of what the sheet turned out to hold, for the dialog.
 * @param {Object} assignment - from assignGlyphs
 * @returns {String}
 */
export function describeAssignment(assignment) {
	const { assigned, needsReview, missingRows } = assignment;
	const parts = [`${assigned} character${assigned === 1 ? '' : 's'} ready`];
	if (needsReview) parts.push(`${needsReview} to check`);
	if (missingRows.length) {
		parts.push(`${missingRows.length} declared row${missingRows.length === 1 ? '' : 's'} not found`);
	}
	return parts.join(', ');
}
