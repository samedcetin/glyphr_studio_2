/**
	SPECIMEN SHEET — LAYOUT

	What characters are on the sheet, and in what order.

	This is declared, not guessed. Working out which letter a shape is, from the
	shape alone, is optical character recognition - and doing that without a
	trained model, on a display face nobody has ever seen, is not a problem
	classical geometry solves. What it DOES solve, exactly and every time, is
	reading order: if the sheet holds the characters the user says it holds, in
	the order they say, then the third shape in the second row is the third
	character of the second row and there is nothing to get wrong.

	So the layout is the input, and geometry is used only to CHECK it - to say
	"this row has twelve shapes where you declared thirteen" and put that in
	front of the user rather than quietly shifting every letter after it.
*/

/**
 * Sheets people actually make. Punctuation is deliberately absent from the
 * general templates: which marks a sheet carries, and in what order, varies
 * far more than the alphabet does, so it is better typed in than guessed.
 */
export const LAYOUT_TEMPLATES = [
	{
		id: 'caps-lower-digits',
		name: 'Capitals, lowercase, digits',
		note: 'Five rows, thirteen letters to a row',
		rows: ['ABCDEFGHIJKLM', 'NOPQRSTUVWXYZ', 'abcdefghijklm', 'nopqrstuvwxyz', '0123456789'],
	},
	{
		id: 'alphabet-two-rows',
		name: 'Alphabet in two rows',
		note: 'Capitals then lowercase, twenty-six to a row',
		rows: ['ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'],
	},
	{
		id: 'caps-only',
		name: 'Capitals only',
		rows: ['ABCDEFGHIJKLM', 'NOPQRSTUVWXYZ'],
	},
	{
		id: 'digits-only',
		name: 'Digits only',
		rows: ['0123456789'],
	},
];

/**
 * Reads a layout the user typed in: one row per line.
 *
 * Whitespace inside a line is dropped rather than treated as a character,
 * because people space a row out to match how the sheet looks. A sheet that
 * genuinely contains a space has nothing to trace there anyway.
 *
 * Characters outside the Basic Multilingual Plane are kept whole - splitting
 * on code units would cut an emoji in half and put two entries where the sheet
 * has one shape.
 *
 * @param {String} text - one row per line
 * @returns {Array} rows, each an array of single-character strings
 */
export function parseLayout(text) {
	return String(text ?? '')
		.split(/\r?\n/)
		.map((line) => [...line].filter((character) => !/\s/.test(character)))
		.filter((row) => row.length);
}

/**
 * Writes a layout back out for editing.
 * @param {Array} rows - arrays of single-character strings
 * @returns {String}
 */
export function layoutToText(rows) {
	return rows.map((row) => row.join('')).join('\n');
}

/**
 * How many separate pieces a character is normally drawn in.
 *
 * Only the ones that are STRUCTURAL rather than stylistic are listed. The dot
 * of an `i` is a separate piece in every face there has ever been; whether a
 * `4` is closed is a design decision, so it is not here. Anything absent is
 * one piece.
 *
 * This is a check, not an instruction - a face that joins the slash of its `%`
 * to both rings is unusual, not wrong, so a disagreement asks the user to look
 * rather than refusing the import.
 */
export const EXPECTED_PIECES = {
	i: 2,
	j: 2,
	'!': 2,
	'?': 2,
	':': 2,
	';': 2,
	'=': 2,
	'%': 3,
	'"': 2,
	'…': 3,
	'ö': 3,
	'ü': 3,
	'ä': 3,
	'Ö': 3,
	'Ü': 3,
	'Ä': 3,
	'İ': 2,
	'ğ': 2,
	'Ğ': 2,
	'é': 2,
	'è': 2,
	'ñ': 2,
	'å': 2,
};

/**
 * @param {String} character
 * @returns {Number} how many pieces to expect
 */
export function expectedPieces(character) {
	return EXPECTED_PIECES[character] ?? 1;
}
