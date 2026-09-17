import { describe, expect, it } from 'vitest';
import {
	binarize,
	detectAlphaIsInk,
	detectInverted,
	otsuThreshold,
	rgbaToGrey,
} from '../binarize.js';
import {
	dropSpecks,
	findRows,
	groupIntoGlyphs,
	inkProfile,
	labelComponents,
	segmentSheet,
} from '../segment_sheet.js';

/**
 * Builds an RGBA buffer from an ASCII picture, so a test reads as the bitmap
 * it is testing. '#' is ink, anything else is paper.
 * @param {Array} rows - strings of equal length
 * @returns {Object} { rgba, width, height }
 */
function picture(rows) {
	const height = rows.length;
	const width = rows[0].length;
	const rgba = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const value = rows[y][x] === '#' ? 0 : 255;
			const o = (y * width + x) * 4;
			rgba[o] = rgba[o + 1] = rgba[o + 2] = value;
			rgba[o + 3] = 255;
		}
	}
	return { rgba, width, height };
}

/**
 * The ink mask for an ASCII picture.
 * @param {Array} rows - strings of equal length
 * @returns {Object} { ink, width, height }
 */
function mask(rows) {
	const { rgba, width, height } = picture(rows);
	const grey = rgbaToGrey(rgba);
	const ink = binarize(grey, otsuThreshold(grey));
	return { ink, width, height };
}

describe('binarize', () => {
	it('reads luma in gamma space, not linear light', () => {
		// Mid grey encoded at 128 must come back near 128. Linearizing would
		// pull it toward 186 and move every anti-aliased edge outward.
		const rgba = new Uint8ClampedArray([128, 128, 128, 255]);
		expect(rgbaToGrey(rgba)[0]).toBeGreaterThan(120);
		expect(rgbaToGrey(rgba)[0]).toBeLessThan(136);
	});

	it('splits a two-peak histogram between the peaks', () => {
		const grey = new Uint8Array(1000);
		for (let i = 0; i < 1000; i++) grey[i] = i < 300 ? 20 : 240;
		const threshold = otsuThreshold(grey);
		expect(threshold).toBeGreaterThan(20);
		expect(threshold).toBeLessThan(240);
	});

	it('takes the middle of a tie rather than the first of it', () => {
		// Two clean classes with an empty valley: every threshold across the
		// valley scores the same. Landing on the low edge would thin strokes.
		const grey = new Uint8Array(200);
		for (let i = 0; i < 200; i++) grey[i] = i < 100 ? 0 : 255;
		const threshold = otsuThreshold(grey);
		expect(threshold).toBeGreaterThan(60);
		expect(threshold).toBeLessThan(195);
	});

	it('spots a sheet whose glyphs are the light side', () => {
		const grey = new Uint8Array(100);
		for (let i = 0; i < 100; i++) grey[i] = i < 80 ? 10 : 250;
		expect(detectInverted(grey, 128)).toBe(true);
		expect(binarize(grey, 128, true)[90]).toBe(1);
		expect(binarize(grey, 128, true)[10]).toBe(0);
	});

	it('spots a transparent-background export', () => {
		const opaque = new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 255]);
		expect(detectAlphaIsInk(opaque)).toBe(false);

		const transparent = new Uint8ClampedArray(400);
		for (let i = 0; i < 100; i++) transparent[i * 4 + 3] = i < 50 ? 0 : 255;
		expect(detectAlphaIsInk(transparent)).toBe(true);
	});

	it('reads coverage from alpha when the colour channels are empty', () => {
		// Black-on-transparent: luma would see solid black everywhere.
		const rgba = new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 255]);
		const grey = rgbaToGrey(rgba, { alphaIsInk: true });
		expect(grey[0]).toBe(255);
		expect(grey[1]).toBe(0);
	});
});

describe('labelComponents', () => {
	it('joins strokes that meet only on the diagonal', () => {
		// 4-connectivity would call this two components.
		const { ink, width, height } = mask(['#...', '.#..', '..#.', '...#']);
		expect(labelComponents(ink, width, height).count).toBe(1);
	});

	it('keeps separate marks separate', () => {
		const { ink, width, height } = mask(['#..#', '#..#', '....', '#..#']);
		expect(labelComponents(ink, width, height).count).toBe(4);
	});

	it('reports inclusive bounding boxes', () => {
		const { ink, width, height } = mask(['....', '.##.', '.##.', '....']);
		const { boxes } = labelComponents(ink, width, height);
		expect(boxes).toHaveLength(1);
		expect(boxes[0]).toMatchObject({ x0: 1, y0: 1, x1: 2, y1: 2, area: 4 });
	});

	it('does not treat a hole as a component', () => {
		// A ring is one component; its counter is a contour, resolved later.
		const { ink, width, height } = mask(['#####', '#...#', '#...#', '#####']);
		expect(labelComponents(ink, width, height).count).toBe(1);
	});
});

describe('dropSpecks', () => {
	it('drops dirt but keeps the dot of an i', () => {
		const boxes = [
			{ x0: 0, y0: 0, x1: 9, y1: 99, area: 1000 },
			{ x0: 0, y0: 0, x1: 9, y1: 9, area: 100 },
			{ x0: 50, y0: 50, x1: 50, y1: 50, area: 1 },
		];
		const kept = dropSpecks(boxes);
		expect(kept).toHaveLength(2);
		expect(kept.some((b) => b.area === 100)).toBe(true);
		expect(kept.some((b) => b.area === 1)).toBe(false);
	});
});

describe('findRows', () => {
	it('parts two rows that a descender bridges', () => {
		// The measured failure on the real sheet: `g` and `j` reach down far
		// enough that no scanline between the rows is ever blank. What separates
		// them is that a tail carries a tiny fraction of a full row's ink - on
		// the reference sheet, 1.6% of peak.
		const rows = [];
		for (let i = 0; i < 6; i++) rows.push('#'.repeat(60));
		for (let i = 0; i < 6; i++) rows.push('..#'.padEnd(60, '.'));
		for (let i = 0; i < 6; i++) rows.push('.....'.padEnd(5, '.') + '#'.repeat(55));
		const { ink, width, height } = mask(rows);
		const profile = inkProfile(ink, width, height);
		const boxes = labelComponents(ink, width, height).boxes;
		expect(findRows(profile, boxes, height)).toHaveLength(2);
	});

	it('splits a band that holds two rows even when it is the only band', () => {
		// With one band there are no neighbours to compare against, so the
		// yardstick is the median component height instead.
		const rows = [];
		for (let i = 0; i < 5; i++) rows.push('####......');
		for (let i = 0; i < 5; i++) rows.push('......####');
		const { ink, width, height } = mask(rows);
		const profile = inkProfile(ink, width, height);
		const boxes = labelComponents(ink, width, height).boxes;
		expect(findRows(profile, boxes, height)).toHaveLength(2);
	});

	it('files a component by its middle, not by how far it reaches', () => {
		const rows = [];
		for (let i = 0; i < 8; i++) rows.push('###...###');
		for (let i = 0; i < 4; i++) rows.push('..#......');
		for (let i = 0; i < 8; i++) rows.push('......###');
		const { ink, width, height } = mask(rows);
		const profile = inkProfile(ink, width, height);
		const boxes = labelComponents(ink, width, height).boxes;
		const found = findRows(profile, boxes, height);
		expect(found).toHaveLength(2);
		// The tailed shape stays with the row it starts in, even though it
		// reaches down into the band below.
		expect(found[0].boxes.some((b) => b.y1 > 8)).toBe(true);
	});
});

describe('groupIntoGlyphs', () => {
	const box = (x0, x1, y0 = 0, y1 = 10) => ({ x0, x1, y0, y1, area: (x1 - x0 + 1) * 10 });

	it('reunites a dot with its stem', () => {
		const glyphs = groupIntoGlyphs([box(10, 20, 0, 5), box(11, 19, 10, 40)]);
		expect(glyphs).toHaveLength(1);
		expect(glyphs[0].parts).toHaveLength(2);
	});

	it('leaves two letters that merely graze each other alone', () => {
		// The measured failure: adjacent letters in a bold face overlap by a few
		// columns, and transitive joining turned a whole row into one glyph.
		const glyphs = groupIntoGlyphs([box(0, 100), box(98, 200)]);
		expect(glyphs).toHaveLength(2);
	});

	it('joins the two bars of an equals sign', () => {
		const glyphs = groupIntoGlyphs([box(0, 50, 0, 10), box(0, 50, 20, 30)]);
		expect(glyphs).toHaveLength(1);
	});

	it('chains the three pieces of a percent sign through the slash', () => {
		// The rings do not overlap each other; both overlap the slash.
		const glyphs = groupIntoGlyphs([
			box(0, 40, 0, 40),
			box(20, 80, 0, 100),
			box(60, 100, 60, 100),
		]);
		expect(glyphs).toHaveLength(1);
		expect(glyphs[0].parts).toHaveLength(3);
	});

	it('keeps an open and close bracket apart', () => {
		const glyphs = groupIntoGlyphs([box(0, 20, 0, 100), box(30, 50, 0, 100)]);
		expect(glyphs).toHaveLength(2);
	});

	it('returns glyphs left to right', () => {
		const glyphs = groupIntoGlyphs([box(200, 240), box(0, 40), box(100, 140)]);
		expect(glyphs.map((g) => g.x0)).toEqual([0, 100, 200]);
	});
});

describe('segmentSheet', () => {
	it('reads a small sheet end to end', () => {
		const rows = [
			'..........',
			'.##....##.',
			'.##....##.',
			'..........',
			'..........',
			'.#..#..##.',
			'.#..#..##.',
			'..........',
		];
		const { ink, width, height } = mask(rows);
		const result = segmentSheet(ink, width, height, { minAreaRatio: 0, minSide: 1 });
		expect(result.rows).toHaveLength(2);
		expect(result.rows[0].glyphs).toHaveLength(2);
		expect(result.rows[1].glyphs).toHaveLength(3);
		expect(result.glyphCount).toBe(5);
	});
});
