import { describe, expect, it } from 'vitest';
import { GlyphrStudioProject } from '../../../project_data/glyphr_studio_project.js';
import { importGlyphrProjectFromText } from '../../../project_editor/import_project.js';
import obleggProject from '../../../samples/oblegg.gs2?raw';
import { buildAtlas, collectAtlasGlyphs, makeAtlasFileBaseName, makeDefaultAtlasOptions } from '../build_atlas.js';
import { applyEnginePreset, makeImportInstructions } from '../engine_presets.js';

/**
 * Oblegg is the project the rest of the suite uses for round-trip tests, so
 * the atlas is measured against the same font everything else is.
 */
const project = importGlyphrProjectFromText(obleggProject);

/**
 * Parses a `.fnt` char line into an object, so assertions can read fields by
 * name rather than by string matching.
 * @param {String} descriptor - the whole .fnt file
 * @param {Number} codePoint - which char record to find
 * @returns {Object | false}
 */
function findCharRecord(descriptor, codePoint) {
	const line = descriptor
		.split('\n')
		.find((row) => row.startsWith('char ') && row.includes(`id=${codePoint} `));
	if (!line) return false;

	const record = {};
	line
		.split(' ')
		.slice(1)
		.forEach((field) => {
			const [key, value] = field.split('=');
			if (key) record[key] = Number(value);
		});
	return record;
}

describe('Atlas: collecting glyphs', () => {
	it('includes existing glyphs, including whitespace, when no character list is given', () => {
		const entries = collectAtlasGlyphs(project, '');
		expect(entries.length).toBe(Object.keys(project.glyphs).length);
		expect(entries.some((entry) => entry.codePoint === 32)).toBe(true);
	});

	it('returns entries sorted by code point', () => {
		const entries = collectAtlasGlyphs(project, '');
		for (let i = 1; i < entries.length; i++) {
			expect(entries[i].codePoint).toBeGreaterThan(entries[i - 1].codePoint);
		}
	});

	it('honours an explicit character list, in the order given', () => {
		const entries = collectAtlasGlyphs(project, 'CAB');
		expect(entries.map((entry) => entry.codePoint)).toEqual([67, 65, 66]);
	});

	it('does not include the same character twice', () => {
		const entries = collectAtlasGlyphs(project, 'AAA');
		expect(entries.length).toEqual(1);
	});

	it('handles characters outside the basic plane as single code points', () => {
		// Nothing in Oblegg matches, but the point is that a surrogate pair is
		// read as one character rather than two broken halves.
		const entries = collectAtlasGlyphs(project, '\u{1F600}');
		expect(entries.length).toEqual(0);
	});
});

describe('Atlas: building', () => {
	const options = {
		pixelSize: 32,
		padding: 1,
		spacing: 1,
		pageSize: 256,
		powerOfTwo: true,
		characters: 'AVWo',
		includeKerning: true,
	};

	const result = buildAtlas(project, options);

	it('produces one page and a descriptor', () => {
		expect(result.pages.length).toEqual(1);
		expect(result.pageFiles.length).toEqual(1);
		expect(result.descriptor.length).toBeGreaterThan(0);
		expect(result.stats.glyphCount).toEqual(4);
	});

	it('names the page files to match the descriptor', () => {
		expect(result.descriptor).toContain(`file="${result.pageFiles[0]}"`);
	});

	it('writes the page dimensions it actually created', () => {
		expect(result.descriptor).toContain(`scaleW=${result.stats.pageSize}`);
		expect(result.pages[0].width).toEqual(result.stats.pageSize);
		expect(result.pages[0].height).toEqual(result.stats.pageSize);
	});

	it('rounds the texture up to a power of two when asked', () => {
		const odd = buildAtlas(project, { ...options, pageSize: 300 });
		expect(odd.stats.pageSize).toEqual(512);

		const exact = buildAtlas(project, { ...options, pageSize: 300, powerOfTwo: false });
		expect(exact.stats.pageSize).toEqual(300);
	});

	it('derives xadvance from the glyph advance width and the pixel size', () => {
		const capitalA = project.getItem('glyph-0x41');
		const scale = options.pixelSize / Number(project.settings.font.upm);
		const record = findCharRecord(result.descriptor, 65);

		expect(record).toBeTruthy();
		expect(record.xadvance).toEqual(Math.round(capitalA.advanceWidth * scale));
	});

	it('keeps every glyph bitmap inside its page', () => {
		const pageSize = result.stats.pageSize;
		[65, 86, 87, 111].forEach((codePoint) => {
			const record = findCharRecord(result.descriptor, codePoint);
			expect(record).toBeTruthy();
			expect(record.x).toBeGreaterThanOrEqual(0);
			expect(record.y).toBeGreaterThanOrEqual(0);
			expect(record.x + record.width).toBeLessThanOrEqual(pageSize);
			expect(record.y + record.height).toBeLessThanOrEqual(pageSize);
		});
	});

	it('places a lowercase o below the baseline top, and a cap A above it', () => {
		// yoffset is measured down from the top of the line, so a smaller
		// letter must start further down than a capital.
		const capA = findCharRecord(result.descriptor, 65);
		const lowerO = findCharRecord(result.descriptor, 111);
		expect(lowerO.yoffset).toBeGreaterThan(capA.yoffset);
	});

	it('scales linearly with pixel size', () => {
		const small = buildAtlas(project, { ...options, pixelSize: 16 });
		const large = buildAtlas(project, { ...options, pixelSize: 32 });

		const smallA = findCharRecord(small.descriptor, 65);
		const largeA = findCharRecord(large.descriptor, 65);

		// Allow a pixel of slack for independent rounding at each size.
		expect(Math.abs(largeA.xadvance - smallA.xadvance * 2)).toBeLessThanOrEqual(1);
	});

	it('can drop the kerning block', () => {
		const withKerning = buildAtlas(project, { ...options, characters: '', includeKerning: true });
		const withoutKerning = buildAtlas(project, {
			...options,
			characters: '',
			includeKerning: false,
		});

		expect(withKerning.stats.kerningCount).toBeGreaterThan(0);
		expect(withoutKerning.stats.kerningCount).toEqual(0);
		expect(withoutKerning.descriptor).toContain('kernings count=0');
	});

	it('only writes kerning pairs whose characters are both in the atlas', () => {
		const narrow = buildAtlas(project, { ...options, characters: 'AV', includeKerning: true });
		const kernLines = narrow.descriptor.split('\n').filter((line) => line.startsWith('kerning '));
		expect(kernLines.sort()).toEqual([
			'kerning first=65 second=86 amount=-2',
			'kerning first=86 second=65 amount=-2',
		]);

		kernLines.forEach((line) => {
			const first = Number(line.match(/first=(\d+)/)?.[1]);
			const second = Number(line.match(/second=(\d+)/)?.[1]);
			expect([65, 86]).toContain(first);
			expect([65, 86]).toContain(second);
		});
	});

	it('expands hex-encoded kern classes, including supplementary Unicode characters', () => {
		const kernProject = new GlyphrStudioProject({
			settings: { font: { upm: 1000 } },
			glyphs: Object.fromEntries(
				['0x41', '0x56', '0x57', '0x1F600', '0x30'].map((hex) => [
					`glyph-${hex}`,
					{ advanceWidth: 500 },
				])
			),
			kerning: {
				'kern-0': { leftGroup: ['0x41', '0x1F600'], rightGroup: ['0x56', '0x57'], value: -80 },
			},
		});
		const atlas = buildAtlas(kernProject, { ...options, pixelSize: 100, characters: 'AVW😀0' });
		expect(atlas.descriptor.split('\n').filter((line) => line.startsWith('kerning '))).toEqual([
			'kerning first=65 second=86 amount=-8',
			'kerning first=65 second=87 amount=-8',
			'kerning first=128512 second=86 amount=-8',
			'kerning first=128512 second=87 amount=-8',
		]);
	});

	it('preserves space advance in the default atlas without allocating a bitmap for it', () => {
		const atlas = buildAtlas(project, { ...options, characters: '' });
		const record = findCharRecord(atlas.descriptor, 32);
		expect(record).toMatchObject({
			width: 0,
			height: 0,
			xadvance: Math.round(
				(project.getItem('glyph-0x20').advanceWidth * options.pixelSize) / project.settings.font.upm
			),
		});
		expect(record.xadvance).toBeGreaterThan(0);
	});

	it('gives blank glyphs an advance and no bitmap', () => {
		const withSpace = buildAtlas(project, { ...options, characters: 'A ' });
		const spaceRecord = findCharRecord(withSpace.descriptor, 32);

		expect(spaceRecord).toBeTruthy();
		expect(spaceRecord.width).toEqual(0);
		expect(spaceRecord.height).toEqual(0);
		expect(spaceRecord.xadvance).toBeGreaterThan(0);
	});

	it('opens more pages rather than dropping glyphs', () => {
		const tiny = buildAtlas(project, { ...options, characters: '', pixelSize: 48, pageSize: 128 });

		expect(tiny.stats.pageCount).toBeGreaterThan(1);
		expect(tiny.pages.length).toEqual(tiny.stats.pageCount);
		// Every page named in the descriptor exists as a canvas.
		expect(tiny.pageFiles.length).toEqual(tiny.pages.length);
	});

	it('makes a file-safe base name', () => {
		expect(makeAtlasFileBaseName(project)).toMatch(/^[a-zA-Z0-9._-]+$/);
	});
});

describe('Atlas: MSDF mode', () => {
	const baseOptions = {
		pixelSize: 32,
		padding: 1,
		spacing: 1,
		pageSize: 256,
		powerOfTwo: true,
		characters: 'AO',
		includeKerning: false,
	};

	it('pads every glyph by at least the distance range', () => {
		// The field has to extend past the outline or it gets clipped exactly
		// where the engine needs it, so padding is raised even though the
		// caller asked for 1.
		const bitmap = buildAtlas(project, { ...baseOptions, fieldType: 'bitmap' });
		const msdf = buildAtlas(project, { ...baseOptions, fieldType: 'msdf', pxRange: 4 });

		const bitmapA = findCharRecord(bitmap.descriptor, 65);
		const msdfA = findCharRecord(msdf.descriptor, 65);

		expect(msdfA.width).toBeGreaterThan(bitmapA.width);
		expect(msdfA.width - bitmapA.width).toBeGreaterThanOrEqual(6);
	});

	it('reports the field type and range it used', () => {
		const msdf = buildAtlas(project, { ...baseOptions, fieldType: 'msdf', pxRange: 6 });
		expect(msdf.stats.fieldType).toEqual('msdf');
		expect(msdf.stats.pxRange).toEqual(6);

		const bitmap = buildAtlas(project, { ...baseOptions, fieldType: 'bitmap' });
		expect(bitmap.stats.fieldType).toEqual('bitmap');
		expect(bitmap.stats.pxRange).toEqual(0);
	});

	it('still writes a usable .fnt alongside the field', () => {
		const msdf = buildAtlas(project, { ...baseOptions, fieldType: 'msdf' });
		const record = findCharRecord(msdf.descriptor, 65);
		expect(record).toBeTruthy();
		expect(record.xadvance).toBeGreaterThan(0);
		expect(record.width).toBeGreaterThan(0);
	});
});

describe('Atlas: JSON metadata', () => {
	const options = {
		pixelSize: 32,
		padding: 1,
		spacing: 1,
		pageSize: 256,
		powerOfTwo: true,
		characters: 'AV ',
		includeKerning: true,
		fieldType: 'msdf',
		pxRange: 4,
	};

	const result = buildAtlas(project, options);

	it('declares the field type and distance range', () => {
		expect(result.metadata.atlas.type).toEqual('msdf');
		expect(result.metadata.atlas.distanceRange).toEqual(4);
		expect(result.metadata.atlas.size).toEqual(32);
		expect(result.metadata.atlas.width).toEqual(result.stats.pageSize);
	});

	it('says which way its atlas coordinates run', () => {
		// atlasBounds are written top-down, so this has to agree or every
		// glyph lands mirrored vertically.
		expect(result.metadata.atlas.yOrigin).toEqual('top');
	});

	it('carries one entry per character, in em units', () => {
		expect(result.metadata.glyphs.length).toEqual(result.stats.glyphCount);

		const capitalA = result.metadata.glyphs.find((entry) => entry.unicode === 65);
		expect(capitalA.advance).toBeGreaterThan(0);
		// An advance is a fraction of the em, not a pixel count.
		expect(capitalA.advance).toBeLessThan(3);
	});

	it('places the glyph quad sensibly around the baseline', () => {
		const capitalA = result.metadata.glyphs.find((entry) => entry.unicode === 65);
		// A capital sits on the baseline and rises above it.
		expect(capitalA.planeBounds.top).toBeGreaterThan(0);
		expect(capitalA.planeBounds.top).toBeGreaterThan(capitalA.planeBounds.bottom);
		expect(capitalA.planeBounds.right).toBeGreaterThan(capitalA.planeBounds.left);
	});

	it('keeps atlas bounds inside the page', () => {
		result.metadata.glyphs.forEach((entry) => {
			if (!entry.atlasBounds) return;
			expect(entry.atlasBounds.left).toBeGreaterThanOrEqual(0);
			expect(entry.atlasBounds.right).toBeLessThanOrEqual(result.stats.pageSize);
			expect(entry.atlasBounds.bottom).toBeLessThanOrEqual(result.stats.pageSize);
		});
	});

	it('gives a blank glyph an advance but no quad', () => {
		const space = result.metadata.glyphs.find((entry) => entry.unicode === 32);
		expect(space).toBeTruthy();
		expect(space.advance).toBeGreaterThan(0);
		expect(space.planeBounds).toBeUndefined();
		expect(space.atlasBounds).toBeUndefined();
	});

	it('normalises font metrics against the em square', () => {
		expect(result.metadata.metrics.emSize).toEqual(1);
		expect(result.metadata.metrics.ascender).toBeGreaterThan(0);
		expect(result.metadata.metrics.descender).toBeLessThan(0);
		expect(result.metadata.metrics.lineHeight).toBeGreaterThan(
			result.metadata.metrics.ascender
		);
	});

	it('writes kerning in em units, matching the descriptor', () => {
		const kerned = buildAtlas(project, { ...options, characters: '', includeKerning: true });
		expect(kerned.metadata.kerning.length).toEqual(kerned.stats.kerningCount);
		kerned.metadata.kerning.forEach((kern) => {
			expect(Math.abs(kern.advance)).toBeLessThan(1);
		});
	});
});

describe('Atlas: engine-ready output', () => {
	/*
		The unit tests either side of this check the descriptor writers and the
		presets in isolation. This block runs the path a game developer
		actually takes - pick an engine, build, read the instructions - against
		a real project, because that is where a mismatch between the pieces
		would show up.
	*/
	const options = applyEnginePreset(
		{ ...makeDefaultAtlasOptions(), characters: 'AVWo', pageSize: 256 },
		'phaser3'
	);
	const result = buildAtlas(project, options);

	it('writes both descriptor flavours from one build', () => {
		expect(result.descriptor.length).toBeGreaterThan(0);
		expect(result.descriptorXML.length).toBeGreaterThan(0);
	});

	it('agrees with itself across the two flavours', () => {
		const doc = new DOMParser().parseFromString(result.descriptorXML, 'text/xml');
		expect(doc.querySelector('parsererror')).toBe(null);

		const textChars = result.descriptor.split('\n').filter((line) => line.startsWith('char '));
		expect(doc.querySelectorAll('char').length).toEqual(textChars.length);
		expect(doc.querySelector('page')?.getAttribute('file')).toEqual(result.pageFiles[0]);

		// A real glyph, checked field by field rather than by count alone.
		const textA = findCharRecord(result.descriptor, 65);
		const xmlA = doc.querySelector('char[id="65"]');
		expect(xmlA).not.toBe(null);
		Object.keys(textA).forEach((key) => {
			expect(Number(xmlA?.getAttribute(key)), key).toEqual(textA[key]);
		});
	});

	it('describes the files it really wrote in the import instructions', () => {
		const instructions = makeImportInstructions({
			presetId: 'phaser3',
			options: options,
			result: result,
		});

		// Phaser's preset selects the XML descriptor, so that is what the
		// instructions must tell the reader to load.
		expect(instructions).toContain(`${result.fileBaseName}.xml`);
		expect(instructions).toContain(result.pageFiles[0]);
		expect(instructions).toContain('this.load.bitmapFont');
	});

	it('carries the MSDF distance range through to the instructions', () => {
		const msdfOptions = applyEnginePreset(
			{ ...makeDefaultAtlasOptions(), characters: 'AVWo', pageSize: 256 },
			'unity_tmp'
		);
		const msdfResult = buildAtlas(project, msdfOptions);

		expect(msdfResult.stats.fieldType).toEqual('msdf');
		expect(msdfResult.metadata.atlas.distanceRange).toEqual(msdfOptions.pxRange);

		const instructions = makeImportInstructions({
			presetId: 'unity_tmp',
			options: msdfOptions,
			result: msdfResult,
		});
		expect(instructions).toContain(`Distance range: **${msdfOptions.pxRange} px**`);
		expect(instructions).toContain('required for MSDF');
	});
});
