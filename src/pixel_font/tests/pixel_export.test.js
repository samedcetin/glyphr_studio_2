import { describe, expect, it } from 'vitest';
import { buildAtlas, makeDefaultAtlasOptions } from '../../formats_io/atlas/build_atlas.js';
import { Glyph } from '../../project_data/glyph.js';
import { importGlyphrProjectFromText } from '../../project_editor/import_project.js';
import obleggProject from '../../samples/oblegg.gs2?raw';
import { isOnGrid, isPixelPerfectSize } from '../pixel_grid.js';
import { pixelateGlyph } from '../pixelate.js';

/**
	PIXEL EXPORT TESTS
	------------------
	The promise pixel font mode makes is that the exported texture has no grey
	edges - every texel is either the letter or it is not.

	The texels themselves cannot be counted here: the test canvas is a mock and
	rasterises nothing. What can be checked is the condition that produces
	them, which is where the guarantee actually comes from - a glyph whose
	edges are whole cells, rasterised at a whole multiple of the cell size,
	lands on texel boundaries and has nothing left to antialias. The rendered
	pixels are checked in the browser instead.
 */

const PIXELS_PER_EM = 16;
const project = importGlyphrProjectFromText(obleggProject);
const upm = Number(project.settings.font.upm) || 2048;
const unitsPerPixel = upm / PIXELS_PER_EM;

project.settings.app.pixelMode = { enabled: true, pixelsPerEm: PIXELS_PER_EM };

['glyph-0x41', 'glyph-0x48', 'glyph-0x45', 'glyph-0x6F'].forEach((id) => {
	project.glyphs[id] = pixelateGlyph(new Glyph(project.getItem(id).save(true)), unitsPerPixel);
});

describe('Pixel font: what makes an export crisp', () => {
	it('only calls a whole multiple of the grid pixel perfect', () => {
		expect(isPixelPerfectSize(project, 16)).toBe(true);
		expect(isPixelPerfectSize(project, 32)).toBe(true);
		expect(isPixelPerfectSize(project, 48)).toBe(true);
		expect(isPixelPerfectSize(project, 21)).toBe(false);
		expect(isPixelPerfectSize(project, 24)).toBe(false);
		// Below the grid there is nothing to be perfect about - the letter
		// cannot fit in fewer texels than it has pixels.
		expect(isPixelPerfectSize(project, 8)).toBe(false);
	});

	it('leaves every pixelated glyph edge on the grid', () => {
		['glyph-0x41', 'glyph-0x48', 'glyph-0x45', 'glyph-0x6F'].forEach((id) => {
			const maxes = project.getItem(id).maxes;
			['xMin', 'xMax', 'yMin', 'yMax'].forEach((edge) => {
				expect(isOnGrid(maxes[edge], unitsPerPixel), `${id} ${edge}`).toBe(true);
			});
		});
	});

	it('puts those edges on whole texels at a pixel perfect size', () => {
		[16, 32, 48].forEach((pixelSize) => {
			const scale = pixelSize / upm;
			const maxes = project.getItem('glyph-0x48').maxes;

			['xMin', 'xMax', 'yMin', 'yMax'].forEach((edge) => {
				const texel = maxes[edge] * scale;
				expect(Math.abs(texel - Math.round(texel)), `${pixelSize}px ${edge}`).toBeLessThan(1e-9);
			});
		});
	});

	it('does not, at a size the grid does not divide into', () => {
		/*
			The counter-example, kept deliberately. This is the state that
			produces soft edges, and it is what the export dialog warns about.
		*/
		const scale = 21 / upm;
		const maxes = project.getItem('glyph-0x48').maxes;
		const offGrid = ['xMin', 'xMax', 'yMin', 'yMax'].filter((edge) => {
			const texel = maxes[edge] * scale;
			return Math.abs(texel - Math.round(texel)) > 1e-9;
		});

		expect(offGrid.length).toBeGreaterThan(0);
	});
});

describe('Pixel font: the atlas itself', () => {
	const options = {
		...makeDefaultAtlasOptions(),
		pixelSize: PIXELS_PER_EM,
		padding: 0,
		spacing: 1,
		pageSize: 256,
		characters: 'AHEo',
	};

	it('gives every glyph a bitmap exactly as many texels as it has pixels', () => {
		/*
			The descriptor is written in whole texels, so a glyph whose ink is
			a fraction of a texel wider than it should be is a glyph that was
			rounded - and rounding is the thing this mode exists to avoid.
		*/
		const atlas = buildAtlas(project, options);
		const scale = options.pixelSize / upm;

		'AHEo'.split('').forEach((character) => {
			const glyph = project.getItem(`glyph-0x${character.codePointAt(0).toString(16).toUpperCase()}`);
			const inkWidth = (glyph.maxes.xMax - glyph.maxes.xMin) * scale;
			const inkHeight = (glyph.maxes.yMax - glyph.maxes.yMin) * scale;

			const record = atlas.descriptor
				.split('\n')
				.find((line) => line.startsWith(`char id=${character.codePointAt(0)} `));

			expect(record, character).toBeTruthy();
			const width = Number(record.match(/ width=(-?\d+)/)[1]);
			const height = Number(record.match(/ height=(-?\d+)/)[1]);

			// Padding has a floor of one texel either side, which is why the
			// comparison is against the ink plus that border rather than the
			// ink alone.
			expect(width - 2, character).toEqual(inkWidth);
			expect(height - 2, character).toEqual(inkHeight);
		});
	});

	it('snaps the advance to whole texels too', () => {
		const atlas = buildAtlas(project, options);
		const scale = options.pixelSize / upm;

		'AHEo'.split('').forEach((character) => {
			const codePoint = character.codePointAt(0);
			const glyph = project.getItem(`glyph-0x${codePoint.toString(16).toUpperCase()}`);
			const record = atlas.descriptor
				.split('\n')
				.find((line) => line.startsWith(`char id=${codePoint} `));

			const advance = Number(record.match(/ xadvance=(-?\d+)/)[1]);
			expect(advance, character).toEqual(glyph.advanceWidth * scale);
		});
	});
});
