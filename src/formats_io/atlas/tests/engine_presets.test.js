import { describe, expect, it } from 'vitest';
import {
	applyEnginePreset,
	enginePresets,
	getEnginePreset,
	makeImportInstructions,
} from '../engine_presets.js';
import { makeDefaultAtlasOptions } from '../build_atlas.js';

/**
	ENGINE PRESET TESTS
	-------------------
	A preset is a promise that the output will import into a named engine, so
	what is worth checking is that a preset only ever sets options the exporter
	actually understands, and that the instructions describe the files that
	were really written.
 */

/**
 * A stand-in for what buildAtlas returns, with only the fields the
 * instructions read.
 * @param {Object} overrides - anything to change
 * @returns {Object}
 */
function makeResult(overrides = {}) {
	return {
		fileBaseName: 'oblegg',
		pageFiles: ['oblegg_0.png'],
		stats: {
			glyphCount: 95,
			pageCount: 1,
			pageSize: 512,
			kerningCount: 12,
			coverage: 0.634,
			fieldType: 'bitmap',
			pxRange: 0,
		},
		...overrides,
	};
}

describe('Atlas: engine presets', () => {
	const presetIds = Object.keys(enginePresets);

	it('offers presets for the engines a game is likely to ship on', () => {
		expect(presetIds).toContain('generic');
		expect(presetIds).toContain('phaser3');
		expect(presetIds).toContain('unity_tmp');
		expect(presetIds).toContain('godot4');
	});

	it('only sets options the exporter knows about', () => {
		/*
			A typo in a preset key would silently do nothing, so the settings
			are checked against the real default options rather than a list
			written out here that could drift.
		*/
		const known = new Set(Object.keys(makeDefaultAtlasOptions()));

		presetIds.forEach((id) => {
			Object.keys(enginePresets[id].settings).forEach((key) => {
				expect(known.has(key), `${id} sets unknown option "${key}"`).toBe(true);
			});
		});
	});

	it('gives every preset a label, a reason and usable steps', () => {
		presetIds.forEach((id) => {
			const preset = enginePresets[id];
			expect(preset.label, id).toBeTruthy();
			expect(preset.note, id).toBeTruthy();

			const steps = preset.steps({
				base: 'font',
				descriptor: 'font.fnt',
				json: 'font.json',
				page: 'font_0.png',
			});
			expect(Array.isArray(steps), id).toBe(true);
			expect(steps.length, id).toBeGreaterThan(0);
			steps.forEach((step) => expect(typeof step).toBe('string'));
		});
	});

	it('picks a descriptor format for every preset', () => {
		presetIds.forEach((id) => {
			expect(['text', 'xml'], id).toContain(enginePresets[id].settings.descriptorFormat);
		});
	});

	it('leaves settings the preset is silent about alone', () => {
		const options = { ...makeDefaultAtlasOptions(), pixelSize: 48, characters: 'ABC' };
		const applied = applyEnginePreset(options, 'phaser3');

		expect(applied.descriptorFormat).toEqual('xml');
		// Phaser's preset says nothing about these, so the user's choices stand.
		expect(applied.pixelSize).toEqual(48);
		expect(applied.characters).toEqual('ABC');
	});

	it('does not mutate the options it was given', () => {
		const options = makeDefaultAtlasOptions();
		applyEnginePreset(options, 'unity_tmp');
		expect(options.fieldType).toEqual('bitmap');
	});

	it('falls back to an unchanged copy for an unknown preset', () => {
		const options = makeDefaultAtlasOptions();
		const applied = applyEnginePreset(options, 'not-a-real-engine');
		expect(applied).toEqual(options);
		expect(getEnginePreset('not-a-real-engine')).toBe(false);
	});
});

describe('Atlas: import instructions', () => {
	it('names the files that were actually written', () => {
		const text = makeImportInstructions({
			presetId: 'godot4',
			options: { ...makeDefaultAtlasOptions(), descriptorFormat: 'text' },
			result: makeResult({ pageFiles: ['oblegg_0.png', 'oblegg_1.png'] }),
		});

		expect(text).toContain('oblegg.fnt');
		expect(text).toContain('oblegg_0.png');
		expect(text).toContain('oblegg_1.png');
		expect(text).not.toContain('oblegg.xml');
	});

	it('follows the descriptor format through to the file name', () => {
		const text = makeImportInstructions({
			presetId: 'phaser3',
			options: { ...makeDefaultAtlasOptions(), descriptorFormat: 'xml' },
			result: makeResult(),
		});

		expect(text).toContain('oblegg.xml');
		expect(text).not.toContain('oblegg.fnt');
	});

	it('reports the settings the atlas was built with', () => {
		const text = makeImportInstructions({
			presetId: 'generic',
			options: { ...makeDefaultAtlasOptions(), pixelSize: 32 },
			result: makeResult(),
		});

		expect(text).toContain('32 px');
		expect(text).toContain('95');
		expect(text).toContain('63%');
	});

	it('calls the JSON required, and gives the range, for MSDF', () => {
		const text = makeImportInstructions({
			presetId: 'unity_tmp',
			options: { ...makeDefaultAtlasOptions(), fieldType: 'msdf', pxRange: 4 },
			result: makeResult({
				stats: { ...makeResult().stats, fieldType: 'msdf', pxRange: 4 },
			}),
		});

		expect(text).toContain('required for MSDF');
		expect(text).toContain('Distance range: **4 px**');
	});

	it('numbers the steps contiguously around code samples', () => {
		/*
			Phaser's steps interleave prose and fenced code. Numbering by array
			index would skip a number for every fence.
		*/
		const text = makeImportInstructions({
			presetId: 'phaser3',
			options: { ...makeDefaultAtlasOptions(), descriptorFormat: 'xml' },
			result: makeResult(),
		});

		const numbers = text
			.split('\n')
			.map((line) => line.match(/^(\d+)\. /))
			.filter((match) => match)
			.map((match) => Number(match[1]));

		expect(numbers.length).toBeGreaterThan(2);
		numbers.forEach((value, index) => expect(value).toEqual(index + 1));
	});

	it('surfaces the caveat when an engine cannot do what people expect', () => {
		const godot = makeImportInstructions({
			presetId: 'godot4',
			options: makeDefaultAtlasOptions(),
			result: makeResult(),
		});
		expect(godot).toContain('Worth knowing');
		expect(godot).toContain('no importer for a pre-made MSDF atlas');
	});
});
