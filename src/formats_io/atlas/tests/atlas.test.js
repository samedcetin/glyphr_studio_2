import { describe, expect, it } from 'vitest';
import { makeBMFontDescriptor } from '../bmfont.js';
import { nextPowerOfTwo, packRects } from '../pack_rects.js';

describe('Atlas: rectangle packing', () => {
	it('nextPowerOfTwo rounds up, and leaves exact powers alone', () => {
		expect(nextPowerOfTwo(1)).toEqual(1);
		expect(nextPowerOfTwo(2)).toEqual(2);
		expect(nextPowerOfTwo(3)).toEqual(4);
		expect(nextPowerOfTwo(256)).toEqual(256);
		expect(nextPowerOfTwo(257)).toEqual(512);
	});

	it('places every rectangle inside the page', () => {
		const rects = [];
		for (let i = 0; i < 60; i++) {
			rects.push({ id: `r${i}`, width: 10 + (i % 7) * 3, height: 12 + (i % 5) * 4 });
		}

		const result = packRects(rects, { pageWidth: 256, pageHeight: 256, spacing: 1 });

		expect(result.tooLarge.length).toEqual(0);
		expect(result.placed.length).toEqual(rects.length);

		result.placed.forEach((rect) => {
			expect(rect.x).toBeGreaterThanOrEqual(0);
			expect(rect.y).toBeGreaterThanOrEqual(0);
			expect(rect.x + rect.width).toBeLessThanOrEqual(256);
			expect(rect.y + rect.height).toBeLessThanOrEqual(256);
		});
	});

	it('never overlaps two rectangles on the same page', () => {
		const rects = [];
		for (let i = 0; i < 120; i++) {
			rects.push({ id: `r${i}`, width: 8 + (i % 11) * 4, height: 8 + (i % 9) * 5 });
		}

		const { placed } = packRects(rects, { pageWidth: 256, pageHeight: 256, spacing: 1 });

		for (let a = 0; a < placed.length; a++) {
			for (let b = a + 1; b < placed.length; b++) {
				const one = placed[a];
				const two = placed[b];
				if (one.page !== two.page) continue;

				const separated =
					one.x + one.width <= two.x ||
					two.x + two.width <= one.x ||
					one.y + one.height <= two.y ||
					two.y + two.height <= one.y;

				expect(separated).toBe(true);
			}
		}
	});

	it('opens more pages when one is not enough', () => {
		const rects = [];
		for (let i = 0; i < 40; i++) rects.push({ id: `r${i}`, width: 60, height: 60 });

		// 40 tiles of 60px cannot fit on a single 128px page.
		const result = packRects(rects, { pageWidth: 128, pageHeight: 128, spacing: 1 });

		expect(result.pages).toBeGreaterThan(1);
		expect(result.placed.length).toEqual(rects.length);
	});

	it('reports rectangles larger than a page instead of looping', () => {
		const result = packRects(
			[
				{ id: 'ok', width: 10, height: 10 },
				{ id: 'huge', width: 500, height: 10 },
			],
			{ pageWidth: 128, pageHeight: 128, spacing: 1 }
		);

		expect(result.placed.length).toEqual(1);
		expect(result.tooLarge.length).toEqual(1);
		expect(result.tooLarge[0].id).toEqual('huge');
	});

	it('ignores zero-area rectangles', () => {
		const result = packRects(
			[
				{ id: 'blank', width: 0, height: 0 },
				{ id: 'real', width: 10, height: 10 },
			],
			{ pageWidth: 64, pageHeight: 64, spacing: 1 }
		);

		expect(result.placed.length).toEqual(1);
		expect(result.placed[0].id).toEqual('real');
	});
});

describe('Atlas: BMFont descriptor', () => {
	const descriptor = makeBMFontDescriptor({
		face: 'Test Font',
		size: 32,
		lineHeight: 40,
		base: 32,
		scaleW: 256,
		scaleH: 256,
		pageFiles: ['test_0.png'],
		padding: 1,
		spacing: 1,
		chars: [
			{
				id: 65,
				x: 0,
				y: 0,
				width: 20,
				height: 24,
				xoffset: 1,
				yoffset: 8,
				xadvance: 22,
				page: 0,
			},
		],
		kernings: [{ first: 65, second: 86, amount: -2 }],
	});

	const lines = descriptor.split('\n');

	it('writes the blocks in the order importers expect', () => {
		expect(lines[0].startsWith('info ')).toBe(true);
		expect(lines[1].startsWith('common ')).toBe(true);
		expect(lines[2].startsWith('page ')).toBe(true);
		expect(lines[3]).toEqual('chars count=1');
		expect(lines[4].startsWith('char ')).toBe(true);
		expect(lines[5]).toEqual('kernings count=1');
		expect(lines[6]).toEqual('kerning first=65 second=86 amount=-2');
	});

	it('writes the em size as negative, per the format convention', () => {
		expect(lines[0]).toContain('size=-32');
	});

	it('carries page dimensions and count on the common line', () => {
		expect(lines[1]).toContain('scaleW=256');
		expect(lines[1]).toContain('scaleH=256');
		expect(lines[1]).toContain('pages=1');
		expect(lines[1]).toContain('lineHeight=40');
		expect(lines[1]).toContain('base=32');
	});

	it('writes every field a char record needs', () => {
		const char = lines[4];
		['id=65', 'x=0', 'y=0', 'width=20', 'height=24', 'xoffset=1', 'yoffset=8', 'xadvance=22', 'page=0'].forEach(
			(field) => expect(char).toContain(field)
		);
	});

	it('always writes a kernings block, even when empty', () => {
		const noKerns = makeBMFontDescriptor({
			face: 'X',
			size: 16,
			lineHeight: 20,
			base: 16,
			scaleW: 64,
			scaleH: 64,
			pageFiles: ['x_0.png'],
			padding: 0,
			spacing: 0,
			chars: [],
		});
		expect(noKerns).toContain('kernings count=0');
	});

	it('drops quotes from names rather than producing invalid output', () => {
		const quoted = makeBMFontDescriptor({
			face: 'My "Great" Font',
			size: 16,
			lineHeight: 20,
			base: 16,
			scaleW: 64,
			scaleH: 64,
			pageFiles: ['x_0.png'],
			padding: 0,
			spacing: 0,
			chars: [],
		});
		expect(quoted).toContain('face="My Great Font"');
	});
});
