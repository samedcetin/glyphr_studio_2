import { describe, expect, it } from 'vitest';
import {
	DETECTED,
	UNDETECTED,
	describeDetection,
	detectLayout,
	piecesAgreement,
	scoreTemplate,
} from '../detect_layout.js';
import { LAYOUT_TEMPLATES, expectedPieces } from '../layout_templates.js';

/**
 * A segmented row, where each shape is drawn in the number of pieces the
 * character it stands for should be - so a correct sheet by construction.
 * @param {String} characters
 * @returns {Object}
 */
function row(characters) {
	return {
		y0: 0,
		y1: 100,
		glyphs: [...characters].map((character) => ({
			x0: 0,
			y0: 0,
			x1: 10,
			y1: 100,
			parts: Array.from({ length: expectedPieces(character) }, () => ({})),
		})),
	};
}

/**
 * A row of shapes that stand for nothing in particular.
 * @param {Number} count
 * @param {Number =} pieces
 * @returns {Object}
 */
function anonymousRow(count, pieces = 1) {
	return {
		y0: 0,
		y1: 100,
		glyphs: Array.from({ length: count }, () => ({
			x0: 0,
			y0: 0,
			x1: 10,
			y1: 100,
			parts: Array.from({ length: pieces }, () => ({})),
		})),
	};
}

const STANDARD = {
	rows: [
		row('ABCDEFGHIJKLM'),
		row('NOPQRSTUVWXYZ'),
		row('abcdefghijklm'),
		row('nopqrstuvwxyz'),
		row('0123456789'),
	],
};

describe('piecesAgreement', () => {
	it('counts the shapes drawn in the number of pieces they should be', () => {
		const result = piecesAgreement([...'abcdefghijklm'], row('abcdefghijklm').glyphs);
		expect(result).toEqual({ agree: 13, total: 13 });
	});

	it('notices when a shape is drawn in the wrong number', () => {
		// An `i` in one piece is either not an `i` or a bad trace. Either way
		// it is worth knowing before anything is written.
		const glyphs = row('abcdefghijklm').glyphs;
		glyphs[8].parts = [{}];
		const result = piecesAgreement([...'abcdefghijklm'], glyphs);
		expect(result.agree).toBe(12);
	});
});

describe('scoreTemplate', () => {
	const template = LAYOUT_TEMPLATES.find((t) => t.id === 'caps-lower-digits');

	it('matches a sheet whose rows hold what it declares', () => {
		const scored = scoreTemplate(template, STANDARD.rows);
		expect(scored).not.toBe(null);
		expect(scored.covered).toBe(5);
		expect(scored.confidence).toBe(1);
	});

	it('refuses a sheet whose counts disagree, however close', () => {
		const rows = [...STANDARD.rows];
		rows[2] = row('abcdefghijkl'); // twelve, not thirteen
		expect(scoreTemplate(template, rows)).toBe(null);
	});

	it('refuses a sheet with fewer rows than it declares', () => {
		expect(scoreTemplate(template, STANDARD.rows.slice(0, 3))).toBe(null);
	});

	it('does not mind rows it has nothing to say about', () => {
		const scored = scoreTemplate(template, [...STANDARD.rows, anonymousRow(26)]);
		expect(scored.covered).toBe(5);
		expect(scored.undeclaredRows).toBe(1);
	});

	it('scores lower when the shapes do not look like the characters', () => {
		const rows = [...STANDARD.rows];
		// Thirteen shapes, but every one in two pieces - the right count for
		// a-m and the wrong shapes for it.
		rows[2] = anonymousRow(13, 2);
		const scored = scoreTemplate(template, rows);
		expect(scored).not.toBe(null);
		expect(scored.confidence).toBeLessThan(1);
	});
});

describe('detectLayout', () => {
	it('works out the reference sheet without being told', () => {
		const detection = detectLayout(STANDARD);
		expect(detection.status).toBe(DETECTED);
		expect(detection.template.id).toBe('caps-lower-digits');
		expect(detection.confidence).toBe(1);
		expect(detection.layout).toHaveLength(5);
	});

	it('leaves a row it cannot name alone rather than guessing', () => {
		// The reference sheet's punctuation row: twenty-six shapes in an order
		// nothing standard predicts. Those go to the panel on the Overview.
		const detection = detectLayout({ rows: [...STANDARD.rows, anonymousRow(26)] });
		expect(detection.status).toBe(DETECTED);
		expect(detection.covered).toBe(5);
		expect(detection.undeclaredRows).toBe(1);
		expect(describeDetection(detection)).toContain('cannot name');
	});

	it('prefers the template that accounts for more of the sheet', () => {
		// Both 'caps-only' and 'caps-lower-digits' fit the first two rows.
		const detection = detectLayout(STANDARD);
		expect(detection.template.id).toBe('caps-lower-digits');
		expect(detection.covered).toBeGreaterThan(2);
	});

	it('says so when nothing fits', () => {
		const detection = detectLayout({ rows: [anonymousRow(7), anonymousRow(4)] });
		expect(detection.status).toBe(UNDETECTED);
		expect(detection.layout).toEqual([]);
		expect(describeDetection(detection)).toContain('Tell us');
	});

	it('survives a sheet with nothing on it', () => {
		const detection = detectLayout({ rows: [] });
		expect(detection.status).toBe(UNDETECTED);
		expect(detection.undeclaredRows).toBe(0);
	});
});
