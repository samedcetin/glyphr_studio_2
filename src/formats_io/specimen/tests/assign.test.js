import { describe, expect, it } from 'vitest';
import {
	LAYOUT_TEMPLATES,
	expectedPieces,
	layoutToText,
	parseLayout,
} from '../layout_templates.js';
import {
	ROW_CHECK,
	ROW_COUNT_MISMATCH,
	ROW_OK,
	ROW_UNDECLARED,
	acceptedAssignments,
	assignGlyphs,
	describeAssignment,
} from '../assign_glyphs.js';
import {
	defaultOvershoot,
	defaultSidebearing,
	expectedBottom,
	expectedExtent,
	expectedTop,
	measureBaselineWander,
	measureRow,
	measureSheet,
	verticalTarget,
} from '../sheet_metrics.js';
import { pathArea, reversePath, traceCellToFontSpace } from '../trace_glyph.js';

const TARGETS = { upm: 2048, capHeight: 1480, xHeight: 1100, ascent: 1550, descent: -440 };

/**
 * A glyph cell, as segmentation produces them.
 * @param {Number} x0
 * @param {Number} y0
 * @param {Number} x1
 * @param {Number} y1
 * @param {Number =} parts
 * @returns {Object}
 */
function cell(x0, y0, x1, y1, parts = 1) {
	return { x0, y0, x1, y1, parts: Array.from({ length: parts }, () => ({})) };
}

/**
 * A segmented row of cells for the given characters, all the same size.
 * @param {String} characters
 * @param {Object =} options
 * @returns {Object}
 */
function row(characters, { top = 100, bottom = 400, pieces = {} } = {}) {
	return {
		y0: top,
		y1: bottom,
		glyphs: [...characters].map((character, index) =>
			cell(index * 100, top, index * 100 + 80, bottom, pieces[character] ?? expectedPieces(character))
		),
	};
}

describe('parseLayout', () => {
	it('takes one row per line and drops the spacing', () => {
		expect(parseLayout('A B C\nd e f')).toEqual([
			['A', 'B', 'C'],
			['d', 'e', 'f'],
		]);
	});

	it('ignores blank lines', () => {
		expect(parseLayout('AB\n\n\nCD')).toHaveLength(2);
	});

	it('keeps a character outside the basic plane whole', () => {
		expect(parseLayout('A😀B')[0]).toEqual(['A', '😀', 'B']);
	});

	it('round-trips through text', () => {
		const rows = parseLayout('ABC\ndef');
		expect(parseLayout(layoutToText(rows))).toEqual(rows);
	});

	it('survives nothing at all', () => {
		expect(parseLayout('')).toEqual([]);
		expect(parseLayout(null)).toEqual([]);
	});
});

describe('expectedPieces', () => {
	it('knows the characters drawn in more than one piece', () => {
		expect(expectedPieces('i')).toBe(2);
		expect(expectedPieces('%')).toBe(3);
		expect(expectedPieces('=')).toBe(2);
	});

	it('assumes one piece otherwise', () => {
		expect(expectedPieces('H')).toBe(1);
		expect(expectedPieces('☃')).toBe(1);
	});

	it('ships templates that parse', () => {
		for (const template of LAYOUT_TEMPLATES) {
			expect(template.rows.length).toBeGreaterThan(0);
			expect(parseLayout(template.rows.join('\n'))).toHaveLength(template.rows.length);
		}
	});
});

describe('assignGlyphs', () => {
	it('assigns in reading order when the counts agree', () => {
		const result = assignGlyphs([row('ABC')], parseLayout('ABC'));
		expect(result.rows[0].status).toBe(ROW_OK);
		expect(result.rows[0].cells.map((c) => c.character)).toEqual(['A', 'B', 'C']);
		expect(result.assigned).toBe(3);
		expect(result.needsReview).toBe(0);
	});

	it('marks the WHOLE row when a glyph is missing', () => {
		// The point of the design: one missing shape shifts every character
		// after it, and nothing in the geometry says where the fault is. Half a
		// row quietly assigned wrong is worse than a row the user looks at.
		const result = assignGlyphs([row('ABC')], parseLayout('ABCD'));
		expect(result.rows[0].status).toBe(ROW_COUNT_MISMATCH);
		expect(result.rows[0].cells.every((c) => c.status === ROW_COUNT_MISMATCH)).toBe(true);
		expect(result.assigned).toBe(0);
		expect(result.needsReview).toBe(3);
	});

	it('flags a cell whose piece count is wrong', () => {
		const single = assignGlyphs([row('Hi', { pieces: { i: 1 } })], parseLayout('Hi'));
		expect(single.rows[0].status).toBe(ROW_CHECK);
		expect(single.rows[0].cells[1].status).toBe(ROW_CHECK);
		expect(single.rows[0].cells[1].note).toContain('1 piece');
		expect(single.rows[0].cells[0].status).toBe(ROW_OK);
	});

	it('leaves a row the layout says nothing about alone', () => {
		const result = assignGlyphs([row('AB'), row('CD')], parseLayout('AB'));
		expect(result.rows[1].status).toBe(ROW_UNDECLARED);
		expect(result.rows[1].cells.every((c) => c.character === null)).toBe(true);
	});

	it('reports rows the layout declares that the sheet does not have', () => {
		const result = assignGlyphs([row('AB')], parseLayout('AB\nCD'));
		expect(result.missingRows).toHaveLength(1);
		expect(result.missingRows[0].characters).toEqual(['C', 'D']);
	});

	it('only hands over what is safe, unless asked', () => {
		const result = assignGlyphs([row('ABC')], parseLayout('ABCD'));
		expect(acceptedAssignments(result)).toHaveLength(0);
		expect(acceptedAssignments(result, true)).toHaveLength(3);
	});

	it('says what happened in one line', () => {
		const result = assignGlyphs([row('ABC')], parseLayout('ABCD'));
		expect(describeAssignment(result)).toContain('to check');
	});
});

describe('vertical tables', () => {
	const overshoot = defaultOvershoot(TARGETS);

	it('never gives one character two different answers for an edge', () => {
		// Two tables claiming the same character is how a glyph ends up placed
		// by whichever rule happened to be tested first.
		const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.split('');
		for (const character of characters) {
			const target = verticalTarget(character, TARGETS, overshoot);
			const extent = expectedExtent(character, TARGETS, overshoot);
			if (!target || !extent) continue;
			const fromExtent = target.edge === 'top' ? extent.top : extent.bottom;
			expect(`${character}:${target.y}`).toBe(`${character}:${fromExtent}`);
		}
	});

	it('puts a flat foot on the baseline and a round one below it', () => {
		expect(expectedBottom('H', TARGETS, overshoot)).toBe(0);
		expect(expectedBottom('O', TARGETS, overshoot)).toBe(-overshoot);
	});

	it('keeps the overshoot instead of flattening it', () => {
		expect(verticalTarget('O', TARGETS, overshoot).y).toBeLessThan(0);
		expect(verticalTarget('B', TARGETS, overshoot).y).toBe(0);
	});

	it('places a descender by its shoulder, not its tail', () => {
		expect(verticalTarget('p', TARGETS, overshoot).edge).toBe('top');
		expect(verticalTarget('H', TARGETS, overshoot).edge).toBe('bottom');
	});

	it('has no answer for a character it has no rule for', () => {
		expect(verticalTarget('@', TARGETS, overshoot)).toBe(null);
		expect(expectedExtent('@', TARGETS, overshoot)).toBe(null);
		expect(expectedTop('@', TARGETS, overshoot)).toBe(null);
	});
});

describe('measureRow', () => {
	const at = (character, top, bottom) => ({ character, cell: cell(0, top, 50, bottom) });

	it('takes the baseline from the characters that sit on it', () => {
		const cells = [
			at('H', 100, 400),
			at('B', 100, 402),
			at('N', 100, 398),
			at('g', 150, 520), // a descender must not drag it down
		];
		const measured = measureRow(cells);
		expect(measured.baseline).toBeCloseTo(400, 0);
		expect(measured.confident).toBe(true);
	});

	it('falls back when a row has too few flat feet', () => {
		const measured = measureRow([at('O', 100, 410), at('C', 100, 408)]);
		expect(measured.confident).toBe(false);
		expect(Number.isFinite(measured.baseline)).toBe(true);
	});

	it('finds the cap line from flat-topped capitals', () => {
		const measured = measureRow([at('H', 100, 400), at('B', 102, 400), at('E', 98, 400)]);
		expect(measured.capTop).toBeCloseTo(100, 0);
	});
});

describe('measureSheet', () => {
	/**
	 * Two rows of capitals and one of lowercase, drawn to a known scale.
	 * @returns {Object}
	 */
	function sheet() {
		const make = (characters, baseline, height, top) => ({
			index: 0,
			status: ROW_OK,
			cells: [...characters].map((character, i) => ({
				character,
				cell: cell(i * 100, baseline - height, i * 100 + 80, baseline - (top ?? 0)),
			})),
		});
		const caps = make('HBENT', 500, 300, 0);
		const lower = { ...make('nruvwxz', 900, 150, 0), index: 1 };
		return { rows: [caps, lower] };
	}

	it('takes one scale for the whole sheet, from the capitals', () => {
		const metrics = measureSheet(sheet(), TARGETS);
		expect(metrics.source).toBe('cap-height');
		expect(metrics.capHeightPx).toBeCloseTo(300, 0);
		expect(metrics.unitsPerPixel).toBeCloseTo(TARGETS.capHeight / 300, 4);
	});

	it('takes the face proportions from the sheet, not from the project', () => {
		// The sheet's x-height is half its cap height; the project's default
		// assumes about three quarters. The sheet wins - the other way round
		// redesigns the typeface rather than importing it.
		const metrics = measureSheet(sheet(), TARGETS);
		expect(metrics.derived.capHeight).toBe(TARGETS.capHeight);
		expect(metrics.derived.xHeight).toBeCloseTo(TARGETS.capHeight / 2, -1);
		expect(metrics.derived.xHeight).not.toBe(TARGETS.xHeight);
	});

	it('says so when it had nothing to measure', () => {
		const metrics = measureSheet({ rows: [{ index: 0, cells: [] }] }, TARGETS);
		expect(metrics.source).toBe('guessed');
		expect(metrics.warnings.join(' ')).toContain('guess');
	});

	it('measures how much the source wanders', () => {
		const wobbly = {
			rows: [
				{
					index: 0,
					cells: [
						{ character: 'H', cell: cell(0, 200, 80, 500) },
						{ character: 'B', cell: cell(100, 200, 180, 520) },
						{ character: 'N', cell: cell(200, 200, 280, 480) },
					],
				},
			],
		};
		const metrics = measureSheet(wobbly, TARGETS);
		const wander = measureBaselineWander(wobbly, metrics);
		expect(wander.spread).toBeGreaterThan(0);
		expect(wander.worstRow).toBe(0);
	});
});

describe('pathArea and reversePath', () => {
	const square = [
		[{ x: 0, y: 0 }, false, false, { x: 10, y: 0 }],
		[{ x: 10, y: 0 }, false, false, { x: 10, y: 10 }],
		[{ x: 10, y: 10 }, false, false, { x: 0, y: 10 }],
		[{ x: 0, y: 10 }, false, false, { x: 0, y: 0 }],
	];

	it('changes sign when the path turns round', () => {
		expect(pathArea(square)).toBeGreaterThan(0);
		expect(pathArea(reversePath(square))).toBeLessThan(0);
	});

	it('keeps the path joined up when reversing', () => {
		const back = reversePath(square);
		for (let i = 0; i < back.length; i++) {
			expect(back[i][3]).toEqual(back[(i + 1) % back.length][0]);
		}
	});

	it('swaps the handles, not just the order', () => {
		const curve = [[{ x: 0, y: 0 }, { x: 1, y: 5 }, { x: 9, y: 5 }, { x: 10, y: 0 }]];
		const [reversed] = reversePath(curve);
		expect(reversed[0]).toEqual({ x: 10, y: 0 });
		expect(reversed[1]).toEqual({ x: 9, y: 5 });
		expect(reversed[2]).toEqual({ x: 1, y: 5 });
	});
});

describe('traceCellToFontSpace', () => {
	/**
	 * A crop holding a ring, so there is an outer contour and a counter.
	 * @returns {Object}
	 */
	function ring() {
		const size = 80;
		const field = new Float32Array(size * size);
		for (let y = 0; y < size; y++) {
			for (let x = 0; x < size; x++) {
				const d = Math.hypot(x - 40, y - 40);
				field[y * size + x] = Math.min(30 - d, d - 14);
			}
		}
		return { field, width: size, height: size, originX: 0, originY: 0 };
	}

	const placement = { baseline: 70, unitsPerPixel: 10, sidebearing: 50 };

	it('turns the sheet the right way up', () => {
		const { bezierData } = traceCellToFontSpace(ring(), placement);
		const ys = bezierData.flat().flatMap((b) => [b[0].y, b[3].y]);
		// Baseline is at source row 70 and the ring spans rows 10 to 70, so in
		// font space it sits at or above zero.
		expect(Math.min(...ys)).toBeGreaterThan(-1);
		expect(Math.max(...ys)).toBeGreaterThan(500);
	});

	it('runs the outer contour one way and the counter the other', () => {
		const { bezierData, contours } = traceCellToFontSpace(ring(), placement);
		expect(contours).toBe(2);
		const areas = bezierData.map(pathArea).sort((a, b) => Math.abs(b) - Math.abs(a));
		expect(areas[0]).toBeGreaterThan(0); // outer, counter-clockwise in font space
		expect(areas[1]).toBeLessThan(0); // counter, the other way
	});

	it('puts the sidebearing on the ink, not on the crop', () => {
		const { bezierData, advanceWidth } = traceCellToFontSpace(ring(), placement);
		const xs = bezierData.flat().flatMap((b) => [b[0].x, b[3].x]);
		expect(Math.min(...xs)).toBeCloseTo(50, 0);
		expect(advanceWidth).toBeCloseTo(Math.max(...xs) + 50, 0);
	});

	it('levels a glyph onto the line it belongs on', () => {
		const { bezierData } = traceCellToFontSpace(ring(), {
			...placement,
			snap: { edge: 'bottom', y: -18 },
		});
		const ys = bezierData.flat().flatMap((b) => [b[0].y, b[3].y]);
		expect(Math.min(...ys)).toBeCloseTo(-18, 1);
	});

	it('brings a glyph to the height its character should stand', () => {
		const { bezierData, scaled } = traceCellToFontSpace(ring(), {
			...placement,
			fit: { top: 1000, bottom: 0 },
			snap: { edge: 'bottom', y: 0 },
		});
		const ys = bezierData.flat().flatMap((b) => [b[0].y, b[3].y]);
		expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(1000, 0);
		expect(scaled).not.toBe(1);
	});

	it('scales both axes together, so the stems stay in proportion', () => {
		const plain = traceCellToFontSpace(ring(), placement);
		const sized = traceCellToFontSpace(ring(), { ...placement, fit: { top: 1200, bottom: 0 } });
		const width = (result) => {
			const xs = result.bezierData.flat().flatMap((b) => [b[0].x, b[3].x]);
			return Math.max(...xs) - Math.min(...xs);
		};
		const heights = (result) => {
			const ys = result.bezierData.flat().flatMap((b) => [b[0].y, b[3].y]);
			return Math.max(...ys) - Math.min(...ys);
		};
		expect(width(sized) / width(plain)).toBeCloseTo(heights(sized) / heights(plain), 3);
	});

	it('gives an empty crop nothing rather than guessing', () => {
		const empty = {
			field: new Float32Array(40 * 40).fill(-1),
			width: 40,
			height: 40,
			originX: 0,
			originY: 0,
		};
		expect(traceCellToFontSpace(empty, placement).bezierData).toEqual([]);
	});
});

describe('defaults', () => {
	it('scales the sidebearing and the overshoot with the face', () => {
		expect(defaultSidebearing(TARGETS)).toBe(74);
		expect(defaultOvershoot(TARGETS)).toBe(18);
		expect(defaultSidebearing({ ...TARGETS, capHeight: 740 })).toBe(37);
	});
});
