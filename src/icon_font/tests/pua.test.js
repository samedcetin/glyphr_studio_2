import { describe, expect, it } from 'vitest';
import {
	DEFAULT_ICON_START,
	findFreeCodePoints,
	glyphIDForCodePoint,
	isCodePointTaken,
	isPrivateUse,
	listIconGlyphs,
	puaRanges,
} from '../pua.js';

/**
 * A project-shaped object holding just a glyph table.
 * @param {Object} glyphs - id to glyph
 * @returns {Object}
 */
function fakeProject(glyphs = {}) {
	return { glyphs: glyphs };
}

describe('Icon font: the Private Use Area', () => {
	it('knows the three ranges', () => {
		expect(isPrivateUse(0xe000)).toBe(true);
		expect(isPrivateUse(0xf8ff)).toBe(true);
		expect(isPrivateUse(0xf0000)).toBe(true);
		expect(isPrivateUse(0x100000)).toBe(true);
	});

	it('does not mistake assigned characters for private ones', () => {
		expect(isPrivateUse(0x41)).toBe(false);
		expect(isPrivateUse(0xdfff)).toBe(false);
		expect(isPrivateUse(0xf900)).toBe(false);
		expect(isPrivateUse(0x1f600)).toBe(false);
	});

	it('never overlaps the surrogate range', () => {
		/*
			High Private Use Surrogates sit at D800-DBFF and are not usable
			code points at all - a font with a glyph there is malformed.
		*/
		for (let codePoint = 0xd800; codePoint <= 0xdfff; codePoint += 0x40) {
			expect(isPrivateUse(codePoint), codePoint.toString(16)).toBe(false);
		}
	});

	it('starts assigning where icon fonts conventionally start', () => {
		expect(DEFAULT_ICON_START).toEqual(0xe000);
		expect(puaRanges[0].begin).toEqual(0xe000);
	});

	it('writes glyph ids the way the project does', () => {
		expect(glyphIDForCodePoint(0xe001)).toEqual('glyph-0xE001');
	});

	it('hands out code points from the start of the range', () => {
		expect(findFreeCodePoints(fakeProject(), 3)).toEqual([0xe000, 0xe001, 0xe002]);
	});

	it('steps over code points that are already used', () => {
		const project = fakeProject({ 'glyph-0xE000': {}, 'glyph-0xE002': {} });
		expect(findFreeCodePoints(project, 3)).toEqual([0xe001, 0xe003, 0xe004]);
	});

	it('gives the same answer twice, so a re-import does not renumber', () => {
		/*
			Icon numbers end up in a game's source. An assignment that depended
			on file order or on a hash would quietly move them.
		*/
		const project = fakeProject({ 'glyph-0xE005': {} });
		expect(findFreeCodePoints(project, 8)).toEqual(findFreeCodePoints(project, 8));
	});

	it('can be told to start further along', () => {
		expect(findFreeCodePoints(fakeProject(), 2, 0xf000)).toEqual([0xf000, 0xf001]);
	});

	it('carries on into the next range when one fills up', () => {
		const start = 0xf8fe;
		const found = findFreeCodePoints(fakeProject(), 3, start);
		expect(found).toEqual([0xf8fe, 0xf8ff, 0xf0000]);
	});

	it('asks for nothing and gets nothing', () => {
		expect(findFreeCodePoints(fakeProject(), 0)).toEqual([]);
	});

	it('reports what is taken without creating anything', () => {
		const glyphs = { 'glyph-0xE000': {} };
		const project = fakeProject(glyphs);
		expect(isCodePointTaken(project, 0xe000)).toBe(true);
		expect(isCodePointTaken(project, 0xe001)).toBe(false);
		expect(Object.keys(glyphs).length).toEqual(1);
	});

	it('lists only the private use glyphs, in code point order', () => {
		const project = fakeProject({
			'glyph-0x41': { name: 'Latin Capital Letter A' },
			'glyph-0xE005': { name: 'star' },
			'glyph-0xE001': { name: 'heart' },
		});

		const icons = listIconGlyphs(project);
		expect(icons.map((entry) => entry.name)).toEqual(['heart', 'star']);
		expect(icons.map((entry) => entry.codePoint)).toEqual([0xe001, 0xe005]);
	});
});
