import { describe, expect, it } from 'vitest';
import { importGlyphrProjectFromText } from '../../../project_editor/import_project.js';
import oblegg from '../../../samples/oblegg.gs2?raw';
import {
	analyzeCoverage,
	collectJSONStrings,
	extractCharacters,
	groupByBlock,
	textFromSource,
} from '../subset.js';

const project = importGlyphrProjectFromText(oblegg);

describe('Subset: pulling characters out of text', () => {
	it('counts each distinct character once, with how often it appeared', () => {
		const usage = extractCharacters('aab');
		expect(usage.length).toBe(2);
		expect(usage.find((entry) => entry.char === 'a').count).toBe(2);
		expect(usage.find((entry) => entry.char === 'b').count).toBe(1);
	});

	it('returns characters in code point order', () => {
		const usage = extractCharacters('zebra');
		for (let i = 1; i < usage.length; i++) {
			expect(usage[i].codePoint).toBeGreaterThan(usage[i - 1].codePoint);
		}
	});

	it('drops control codes and line breaks', () => {
		const usage = extractCharacters('a\nb\tc\r');
		expect(usage.map((entry) => entry.char).join('')).toBe('abc');
	});

	it('keeps the space, because a font without one lays text out with no gaps', () => {
		const usage = extractCharacters('a b');
		expect(usage.some((entry) => entry.codePoint === 0x20)).toBe(true);
	});

	it('keeps a character outside the basic plane whole', () => {
		const usage = extractCharacters('\u{1F600}');
		expect(usage.length).toBe(1);
		expect(usage[0].codePoint).toBe(0x1f600);
	});

	it('drops zero-width and byte order marks', () => {
		const usage = extractCharacters('a​b﻿');
		expect(usage.map((entry) => entry.char).join('')).toBe('ab');
	});
});

describe('Subset: reading a source file', () => {
	it('takes only the values out of a localisation file, not the keys', () => {
		const source = JSON.stringify({ 'menu.start': 'Spielen', 'menu.quit': 'Beenden' });
		const { text, format } = textFromSource(source);

		expect(format).toBe('json');
		// The key characters - the dot in 'menu.start' - must not be dragged in.
		expect(text).toContain('Spielen');
		expect(text).not.toContain('menu.start');
	});

	it('walks nested objects and arrays', () => {
		const source = JSON.stringify({ a: { b: ['Ja', 'Nein'] }, c: 'Vielleicht' });
		const { text } = textFromSource(source);
		['Ja', 'Nein', 'Vielleicht'].forEach((word) => expect(text).toContain(word));
	});

	it('can be asked for keys as well', () => {
		const collected = collectJSONStrings({ greeting: 'Hallo' }, true);
		expect(collected).toContain('greeting');
		expect(collected).toContain('Hallo');
	});

	it('treats anything that is not JSON as plain text', () => {
		const csv = 'id,de\nstart,Spielen\nquit,Beenden';
		const { text, format } = textFromSource(csv);
		expect(format).toBe('text');
		expect(text).toBe(csv);
	});

	it('does not mistake a bare JSON string for a localisation file', () => {
		const { format } = textFromSource('"just a string"');
		expect(format).toBe('text');
	});

	it('respects an explicit plain-text request over valid JSON', () => {
		const source = JSON.stringify({ a: 'b' });
		expect(textFromSource(source, 'text').format).toBe('text');
	});
});

describe('Subset: coverage against a real font', () => {
	it('marks characters the font has as covered', () => {
		const report = analyzeCoverage(project, extractCharacters('ABC'));
		expect(report.missing.length).toBe(0);
		expect(report.covered.length).toBe(3);
	});

	it('marks characters the font lacks as missing, with a name and a block', () => {
		// Oblegg is a Latin test font; it has no CJK.
		const report = analyzeCoverage(project, extractCharacters('A漢'));

		expect(report.covered.map((entry) => entry.char)).toEqual(['A']);
		expect(report.missing.length).toBe(1);
		expect(report.missing[0].char).toBe('漢');
		expect(report.missing[0].name.length).toBeGreaterThan(0);
		expect(report.missing[0].block.length).toBeGreaterThan(0);
	});

	it('counts a blank glyph as covered - an advance is coverage', () => {
		const report = analyzeCoverage(project, extractCharacters('A B'));
		expect(report.covered.some((entry) => entry.codePoint === 0x20)).toBe(true);
	});

	it('hands back a subset string ready to paste into the export', () => {
		const report = analyzeCoverage(project, extractCharacters('CAB漢'));
		// Only the covered ones, in code point order.
		expect(report.subsetString).toBe('ABC');
	});

	it('reports how many distinct characters the text used', () => {
		const report = analyzeCoverage(project, extractCharacters('aabbc'));
		expect(report.totalCharacters).toBe(3);
	});

	it('groups missing characters by block, busiest first', () => {
		const report = analyzeCoverage(project, extractCharacters('漢字한'));
		const groups = groupByBlock(report.missing);

		expect(groups.length).toBeGreaterThan(0);
		for (let i = 1; i < groups.length; i++) {
			expect(groups[i - 1].characters.length).toBeGreaterThanOrEqual(
				groups[i].characters.length
			);
		}
	});

	it('turns a whole localisation file into a subset in one pass', () => {
		const source = JSON.stringify({
			'menu.start': 'Spiel starten',
			'menu.quit': 'Beenden',
			'hud.score': 'Punkte',
		});
		const { text } = textFromSource(source);
		const report = analyzeCoverage(project, extractCharacters(text));

		// Far fewer than the font's full glyph count - that is the point.
		expect(report.subsetString.length).toBeGreaterThan(5);
		expect(report.subsetString.length).toBeLessThan(30);
		expect(report.subsetString).toContain('S');
		expect(report.subsetString).toContain(' ');
	});
});
