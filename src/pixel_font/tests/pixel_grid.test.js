import { describe, expect, it } from 'vitest';
import { GlyphrStudioProject } from '../../project_data/glyphr_studio_project.js';
import {
	cellBounds,
	cellCenter,
	cellIndex,
	cellRangeForBounds,
	defaultPixelMode,
	getPixelMode,
	getUnitsPerPixel,
	isOnGrid,
	isPixelModeOn,
	snapValue,
} from '../pixel_grid.js';

/**
 * A project-shaped object, only as much of one as the grid reads.
 * @param {Number} upm - em square
 * @param {Object} pixelMode - partial settings
 * @returns {Object}
 */
function fakeProject(upm, pixelMode = {}) {
	return { settings: { font: { upm: upm }, app: { pixelMode: pixelMode } } };
}

describe('Pixel grid: settings', () => {
	it('starts switched off', () => {
		expect(defaultPixelMode.enabled).toBe(false);
		expect(isPixelModeOn(new Object())).toBe(false);
	});

	it('matches the defaults a new project is built with', () => {
		/*
			The project constructor writes these out itself rather than
			importing them - it runs while modules are still loading, and an
			imported binding can still be uninitialised at that point. This is
			what stops the two copies drifting apart.
		*/
		expect(new GlyphrStudioProject().settings.app.pixelMode).toEqual(defaultPixelMode);
	});

	it('fills in anything a project has not been told', () => {
		const mode = getPixelMode(fakeProject(1000, { enabled: true }));
		expect(mode.enabled).toBe(true);
		expect(mode.pixelsPerEm).toEqual(defaultPixelMode.pixelsPerEm);
	});

	it('survives a project with no settings at all', () => {
		expect(getPixelMode(undefined)).toEqual(defaultPixelMode);
		expect(getUnitsPerPixel(undefined)).toBeGreaterThan(0);
	});
});

describe('Pixel grid: units per pixel', () => {
	it('divides the em square by the pixel count', () => {
		expect(getUnitsPerPixel(fakeProject(2048, { pixelsPerEm: 16 }))).toEqual(128);
		expect(getUnitsPerPixel(fakeProject(1024, { pixelsPerEm: 8 }))).toEqual(128);
	});

	it('does not round an em square that does not divide evenly', () => {
		/*
			1000 / 16 is 62.5. Rounding to 63 would put the top of the em
			square 8 units above the grid, which is exactly the half-pixel
			seam this mode exists to prevent.
		*/
		expect(getUnitsPerPixel(fakeProject(1000, { pixelsPerEm: 16 }))).toEqual(62.5);
	});

	it('never returns zero, however broken the settings are', () => {
		expect(getUnitsPerPixel(fakeProject(0, { pixelsPerEm: 0 }))).toBeGreaterThan(0);
	});
});

describe('Pixel grid: snapping', () => {
	it('moves a value to the nearest grid line', () => {
		expect(snapValue(130, 128)).toEqual(128);
		expect(snapValue(200, 128)).toEqual(256);
		expect(snapValue(-130, 128)).toEqual(-128);
	});

	it('leaves a value that is already on the grid alone', () => {
		expect(snapValue(256, 128)).toEqual(256);
		expect(snapValue(0, 128)).toEqual(0);
	});

	it('works on a fractional grid', () => {
		expect(snapValue(100, 62.5)).toEqual(125);
		expect(snapValue(40, 62.5)).toEqual(62.5);
		// Under half a pixel, so it snaps to the baseline rather than up.
		expect(snapValue(30, 62.5)).toEqual(0);
	});

	it('reports what is on the grid, allowing for float drift', () => {
		expect(isOnGrid(256, 128)).toBe(true);
		expect(isOnGrid(127.99999999999999, 128)).toBe(true);
		expect(isOnGrid(130, 128)).toBe(false);
	});
});

describe('Pixel grid: cells', () => {
	it('puts a coordinate on a grid line into the cell it starts', () => {
		expect(cellIndex(0, 128)).toEqual(0);
		expect(cellIndex(128, 128)).toEqual(1);
		expect(cellIndex(127, 128)).toEqual(0);
	});

	it('runs negative below the baseline', () => {
		expect(cellIndex(-1, 128)).toEqual(-1);
		expect(cellIndex(-128, 128)).toEqual(-1);
		expect(cellIndex(-129, 128)).toEqual(-2);
	});

	it('gives bounds that meet exactly, with no gap and no overlap', () => {
		const first = cellBounds(0, 0, 128);
		const second = cellBounds(1, 0, 128);
		expect(first.xMax).toEqual(second.xMin);
		expect(first).toEqual({ xMin: 0, yMin: 0, xMax: 128, yMax: 128 });
	});

	it('centres a sample inside its own cell', () => {
		const center = cellCenter(2, -1, 128);
		const bounds = cellBounds(2, -1, 128);
		expect(center.x).toBeGreaterThan(bounds.xMin);
		expect(center.x).toBeLessThan(bounds.xMax);
		expect(center.y).toBeGreaterThan(bounds.yMin);
		expect(center.y).toBeLessThan(bounds.yMax);
	});

	it('covers a box without claiming the cell its edge lands on', () => {
		/*
			A shape from 0 to 256 fills cells 0 and 1. Cell 2 starts at 256 and
			is empty - claiming it would grow the glyph by a pixel every time
			it was read and written back.
		*/
		const range = cellRangeForBounds({ xMin: 0, yMin: 0, xMax: 256, yMax: 128 }, 128);
		expect(range).toEqual({ colMin: 0, rowMin: 0, colMax: 1, rowMax: 0 });
	});

	it('grows outwards to whole cells when a box ends mid-cell', () => {
		const range = cellRangeForBounds({ xMin: 10, yMin: -10, xMax: 200, yMax: 130 }, 128);
		expect(range).toEqual({ colMin: 0, rowMin: -1, colMax: 1, rowMax: 1 });
	});
});
