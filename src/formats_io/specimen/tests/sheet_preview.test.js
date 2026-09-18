import { describe, expect, it } from 'vitest';
import {
	describeReading,
	makePreviewPlane,
	previewSize,
	renderSheetPreview,
} from '../sheet_preview.js';

/** The alpha byte of one destination pixel. */
function coverageAt(rgba, width, x, y) {
	return rgba[(y * width + x) * 4 + 3];
}

/**
 * @param {Number} width
 * @param {Number} height
 * @param {Function} level - (x, y) => grey, 0-255
 * @returns {Uint8Array}
 */
function plane(width, height, level) {
	const grey = new Uint8Array(width * height);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) grey[y * width + x] = level(x, y);
	}
	return grey;
}

describe('previewSize', () => {
	it('keeps the aspect of the sheet', () => {
		const size = previewSize(5760, 2880);
		expect(size.width / size.height).toBeCloseTo(2, 2);
	});

	it('fits inside both caps', () => {
		const size = previewSize(5760, 2880, { maxWidth: 1400, maxHeight: 520 });
		expect(size.width).toBeLessThanOrEqual(1400);
		expect(size.height).toBeLessThanOrEqual(520);
	});

	it('is bound by whichever cap bites first', () => {
		// Tall and narrow: the height cap decides, not the width one.
		const size = previewSize(400, 4000, { maxWidth: 1400, maxHeight: 520 });
		expect(size.height).toBe(520);
		expect(size.width).toBe(52);
	});

	it('never upscales a small sheet', () => {
		expect(previewSize(200, 100)).toEqual({ width: 200, height: 100 });
	});

	it('survives a sheet with no size', () => {
		expect(previewSize(0, 0)).toEqual({ width: 0, height: 0 });
		expect(previewSize(undefined, undefined)).toEqual({ width: 0, height: 0 });
	});
});

describe('renderSheetPreview', () => {
	it('puts ink in the alpha channel and leaves the colour black', () => {
		// The caller recolours through this, so any colour here would tint it.
		const grey = plane(4, 4, () => 0);
		const rgba = renderSheetPreview(grey, 4, 4, { width: 4, height: 4 });
		for (let i = 0; i < rgba.length; i += 4) {
			expect([rgba[i], rgba[i + 1], rgba[i + 2]]).toEqual([0, 0, 0]);
			expect(rgba[i + 3]).toBe(255);
		}
	});

	it('reads dark as ink on an ordinary sheet', () => {
		// Left half black, right half white.
		const grey = plane(4, 2, (x) => (x < 2 ? 0 : 255));
		const rgba = renderSheetPreview(grey, 4, 2, { width: 4, height: 2 });
		expect(coverageAt(rgba, 4, 0, 0)).toBe(255);
		expect(coverageAt(rgba, 4, 3, 0)).toBe(0);
	});

	it('reads light as ink when the sheet was inverted', () => {
		const grey = plane(4, 2, (x) => (x < 2 ? 0 : 255));
		const rgba = renderSheetPreview(grey, 4, 2, { width: 4, height: 2 }, { inverted: true });
		expect(coverageAt(rgba, 4, 0, 0)).toBe(0);
		expect(coverageAt(rgba, 4, 3, 0)).toBe(255);
	});

	it('averages when downsampling rather than dropping rows', () => {
		/*
			The gap this closes: a hairline is one row of a five-row block, so
			sampling the block's first row returns paper and the line vanishes
			from the preview. Averaged, it survives at a fifth of its weight.
		*/
		const grey = plane(10, 10, (x, y) => (y === 7 ? 0 : 255));
		const rgba = renderSheetPreview(grey, 10, 10, { width: 2, height: 2 });
		// The line falls in the lower half, which must not come back empty.
		expect(coverageAt(rgba, 2, 0, 1)).toBeGreaterThan(0);
		expect(coverageAt(rgba, 2, 0, 0)).toBe(0);
	});

	it('covers every destination pixel, with none left unwritten', () => {
		// An awkward ratio, where the floor divisions could strand a column.
		const grey = plane(97, 61, () => 0);
		const size = { width: 31, height: 17 };
		const rgba = renderSheetPreview(grey, 97, 61, size);
		let blank = 0;
		for (let i = 0; i < size.width * size.height; i++) {
			if (rgba[i * 4 + 3] !== 255) blank++;
		}
		expect(blank).toBe(0);
	});

	it('returns an empty buffer rather than throwing on a sheet with no size', () => {
		expect(renderSheetPreview(new Uint8Array(0), 0, 0, { width: 0, height: 0 })).toHaveLength(0);
		expect(renderSheetPreview(new Uint8Array(4), 2, 2, { width: 0, height: 0 })).toHaveLength(0);
	});
});

describe('makePreviewPlane', () => {
	it('sizes and renders in one call', () => {
		const sheet = { grey: plane(800, 400, () => 0), width: 800, height: 400, inverted: false };
		const preview = makePreviewPlane(sheet, { maxWidth: 200, maxHeight: 200 });
		expect(preview).toMatchObject({ width: 200, height: 100 });
		expect(preview.rgba).toHaveLength(200 * 100 * 4);
		expect(preview.rgba[3]).toBe(255);
	});

	it('does not throw on a sheet that failed to load', () => {
		expect(makePreviewPlane(null)).toMatchObject({ width: 0, height: 0 });
	});
});

describe('describeReading', () => {
	it('says nothing about the ordinary sheet', () => {
		expect(describeReading({ inverted: false, alphaIsInk: false })).toBe('');
	});

	it('explains a preview that will not match the file', () => {
		// Both cases show black artwork the user uploaded as white.
		expect(describeReading({ alphaIsInk: true })).toBe('read from transparency');
		expect(describeReading({ inverted: true })).toBe('read as light on dark');
	});

	it('survives a sheet that failed to load', () => {
		expect(describeReading(null)).toBe('');
	});
});
