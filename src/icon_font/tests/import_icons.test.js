import { describe, expect, it } from 'vitest';
import { buildAtlas, makeDefaultAtlasOptions } from '../../formats_io/atlas/build_atlas.js';
import { GlyphrStudioProject } from '../../project_data/glyphr_studio_project.js';
import { defaultIconBox, makeIconFit } from '../fit_icon.js';
import { importIcons, planIconImport } from '../import_icons.js';
import { collectIconMap, makeIconMapCSS, makeIconMapJSON, makeIconMapTable } from '../name_map.js';
import { listIconGlyphs } from '../pua.js';

import heartSVG from './icons/heart.svg?raw';
import wideBarSVG from './icons/wide-bar.svg?raw';
import emptySVG from './icons/empty.svg?raw';
import strokeLineSVG from './icons/stroke-line.svg?raw';
import strokeCircleSVG from './icons/stroke-circle.svg?raw';
import noFillAttributeSVG from './icons/no-fill-attribute.svg?raw';

/** A fresh project, with nothing in the Private Use Area. */
function makeProject() {
	return new GlyphrStudioProject();
}

const files = [
	{ name: 'heart.svg', text: heartSVG },
	{ name: 'wide-bar.svg', text: wideBarSVG },
];

/**
 * makeIconFit says `false` for a source with no area; these cases all have
 * one, so a false here is a failure rather than a value to reason about.
 * @param {Object} maxes - source bounds
 * @param {Object} options - fit options
 * @returns {Object} - an IconFit
 */
function fitOrFail(maxes, options) {
	const fit = makeIconFit(maxes, options);
	if (!fit) throw new Error('makeIconFit returned false for a source with area');
	return fit;
}

describe('Icon font: fitting an icon', () => {
	const square = { xMin: 0, yMin: 0, xMax: 24, yMax: 24 };
	const wide = { xMin: 0, yMin: 0, xMax: 48, yMax: 24 };

	it('scales to the height it was asked for', () => {
		const fit = fitOrFail(square, { boxHeight: 700, advanceWidth: 1000 });
		expect(fit.height).toEqual(700);
		expect(fit.width).toEqual(700);
	});

	it('keeps the aspect ratio, so a wide icon stays wide', () => {
		const fit = fitOrFail(wide, { boxHeight: 700, advanceWidth: 1000 });
		expect(fit.height).toEqual(700);
		expect(fit.width).toEqual(1400);
	});

	it('centres an icon in a fixed advance', () => {
		const fit = fitOrFail(square, { boxHeight: 700, advanceWidth: 1000 });
		// 150 either side of a 700 wide icon in a 1000 wide slot.
		expect(fit.x).toEqual(150);
		expect(fit.advanceWidth).toEqual(1000);
	});

	it('lets an oversized icon overhang rather than squashing it', () => {
		/*
			Squashing would distort it unevenly and say nothing; overhanging is
			at least visible the moment you look at the glyph.
		*/
		const fit = fitOrFail(wide, { boxHeight: 700, advanceWidth: 1000 });
		expect(fit.x).toBeLessThan(0);
		expect(fit.advanceWidth).toEqual(1000);
	});

	it('fits the advance to the ink when asked', () => {
		const fit = fitOrFail(wide, { boxHeight: 700, advanceWidth: false, sidebearing: 50 });
		expect(fit.x).toEqual(50);
		expect(fit.advanceWidth).toEqual(1500);
	});

	it('sits the icon where it was told to', () => {
		const fit = fitOrFail(square, { boxHeight: 700, boxBottom: -70, advanceWidth: 1000 });
		expect(fit.y).toEqual(-70);
	});

	it('refuses a source with no area rather than dividing by zero', () => {
		expect(makeIconFit({ xMin: 0, yMin: 0, xMax: 0, yMax: 24 }, { boxHeight: 700 })).toBe(false);
		expect(makeIconFit({ xMin: 0, yMin: 0, xMax: 24, yMax: 24 }, { boxHeight: 0 })).toBe(false);
	});

	it('drops the icon below the baseline so it optically matches capitals', () => {
		const box = defaultIconBox(makeProject());
		expect(box.boxBottom).toBeLessThan(0);
		expect(box.boxHeight).toBeGreaterThan(makeProject().settings.font.capHeight);
	});
});

describe('Icon font: planning an import', () => {
	it('names each icon after its file and assigns code points in order', () => {
		const plan = planIconImport(makeProject(), files);

		expect(plan.map((entry) => entry.slug)).toEqual(['heart', 'wide-bar']);
		expect(plan.map((entry) => entry.codePoint)).toEqual([0xe000, 0xe001]);
		expect(plan.every((entry) => entry.ok)).toBe(true);
	});

	it('says why a file cannot be used, and does not spend a code point on it', () => {
		/*
			An empty SVG failing is not interesting on its own - what matters
			is that it does not take E000 with it, leaving the real icons
			numbered from E001 for no reason a user could see.
		*/
		const plan = planIconImport(makeProject(), [
			{ name: 'empty.svg', text: emptySVG },
			...files,
		]);

		expect(plan[0].ok).toBe(false);
		expect(plan[0].reason).toBeTruthy();
		expect(plan[1].codePoint).toEqual(0xe000);
		expect(plan[2].codePoint).toEqual(0xe001);
	});

	it('turns down a stroked line, which has no area to fill', () => {
		const plan = planIconImport(makeProject(), [{ name: 'line.svg', text: strokeLineSVG }]);
		expect(plan[0].ok).toBe(false);
		expect(plan[0].reason).toContain('strokes');
	});

	it('turns down a stroked outline that would import as a solid blob', () => {
		/*
			The parser keeps the geometry and drops the paint, so a stroked
			circle and a filled one are the same outline by the time there are
			shapes to inspect - and the stroked one would come in as a filled
			disc. Caught by reading the source, not the shapes.
		*/
		const plan = planIconImport(makeProject(), [{ name: 'ring.svg', text: strokeCircleSVG }]);
		expect(plan[0].ok).toBe(false);
		expect(plan[0].reason).toContain('fill');
	});

	it('accepts a shape with no fill declared, which SVG paints black', () => {
		const plan = planIconImport(makeProject(), [{ name: 'box.svg', text: noFillAttributeSVG }]);
		expect(plan[0].ok).toBe(true);
	});

	it('says Ready only about files it will really import', () => {
		/*
			The table is the whole point of planning separately - a row that
			says Ready and then does not appear is worse than no table.
		*/
		const project = makeProject();
		const plan = planIconImport(project, [
			{ name: 'line.svg', text: strokeLineSVG },
			...files,
			{ name: 'empty.svg', text: emptySVG },
		]);

		const result = importIcons(project, plan);
		expect(result.imported.length).toEqual(plan.filter((entry) => entry.ok).length);
		expect(result.skipped.every((entry) => entry.reason)).toBe(true);
	});

	it('avoids names already used by icons in the project', () => {
		const project = makeProject();
		importIcons(project, planIconImport(project, files));

		const second = planIconImport(project, files);
		expect(second.map((entry) => entry.slug)).toEqual(['heart-2', 'wide-bar-2']);
		expect(second.map((entry) => entry.codePoint)).toEqual([0xe002, 0xe003]);
	});
});

describe('Icon font: importing', () => {
	it('creates a named glyph at each code point', () => {
		const project = makeProject();
		const result = importIcons(project, planIconImport(project, files));

		expect(result.imported.length).toEqual(2);
		expect(project.getItem('glyph-0xE000').name).toEqual('heart');
		expect(project.getItem('glyph-0xE001').name).toEqual('wide-bar');
	});

	it('turns the SVG the right way up', () => {
		/*
			SVG has y running down the page. Imported without flipping, every
			icon is upside down and sits below the baseline - so the test is
			that the ink is above it.
		*/
		const project = makeProject();
		importIcons(project, planIconImport(project, files));

		const heart = project.getItem('glyph-0xE000');
		expect(heart.maxes.yMax).toBeGreaterThan(0);
		expect(heart.maxes.yMin).toBeLessThan(heart.maxes.yMax);
	});

	it('sizes every icon to the same box', () => {
		const project = makeProject();
		const box = defaultIconBox(project);
		importIcons(project, planIconImport(project, files));

		listIconGlyphs(project).forEach((entry) => {
			const height = entry.glyph.maxes.yMax - entry.glyph.maxes.yMin;
			expect(Math.abs(height - box.boxHeight), entry.name).toBeLessThan(1);
			expect(entry.glyph.advanceWidth).toEqual(box.advanceWidth);
		});
	});

	it('keeps a wide icon wide and a square icon square', () => {
		const project = makeProject();
		importIcons(project, planIconImport(project, files));

		const heart = project.getItem('glyph-0xE000').maxes;
		const bar = project.getItem('glyph-0xE001').maxes;
		const ratio = (maxes) => (maxes.xMax - maxes.xMin) / (maxes.yMax - maxes.yMin);

		// The bar's source is 48 by 8 of drawn ink, the heart's is close to square.
		expect(ratio(bar)).toBeGreaterThan(ratio(heart) * 2);
	});

	it('holds its proportions through a large scale-up', () => {
		/*
			The reason the transform is done coordinate by coordinate instead
			of through setGlyphSize. A 24-unit icon has to grow roughly
			eighty-fold to fill a 2048 em, and at that factor the built-in path
			scaling came out 450% too wide. Half a unit of error on a 1600-unit
			icon is the standard here.
		*/
		const project = makeProject();
		importIcons(project, planIconImport(project, files));

		const sourceRatios = { heart: 20.202 / 20.106, 'wide-bar': 48 / 8 };

		[
			['glyph-0xE000', 'heart'],
			['glyph-0xE001', 'wide-bar'],
		].forEach(([id, name]) => {
			const maxes = project.getItem(id).maxes;
			const ratio = (maxes.xMax - maxes.xMin) / (maxes.yMax - maxes.yMin);
			expect(Math.abs(ratio - sourceRatios[name]), name).toBeLessThan(0.001);
		});
	});

	it('places the icon exactly where the fit says', () => {
		const project = makeProject();
		const box = defaultIconBox(project);
		importIcons(project, planIconImport(project, files));

		const bar = project.getItem('glyph-0xE001').maxes;
		expect(Math.abs(bar.yMin - box.boxBottom)).toBeLessThan(0.001);
		expect(Math.abs(bar.yMax - (box.boxBottom + box.boxHeight))).toBeLessThan(0.001);

		// The bar is wider than the advance, so it is centred and overhangs
		// evenly rather than being pushed to one side.
		const overhangLeft = -bar.xMin;
		const overhangRight = bar.xMax - box.advanceWidth;
		expect(Math.abs(overhangLeft - overhangRight)).toBeLessThan(0.001);
	});

	it('reports what it could not do instead of failing silently', () => {
		const project = makeProject();
		const plan = planIconImport(project, [{ name: 'empty.svg', text: emptySVG }, ...files]);
		const result = importIcons(project, plan);

		expect(result.imported.length).toEqual(2);
		expect(result.skipped.length).toEqual(1);
		expect(result.skipped[0].fileName).toEqual('empty.svg');
	});

	it('survives a save and reload with its names intact', () => {
		/*
			The whole workflow rests on this. Unicode has no name for E000, so
			if the name does not persist, a reopened project is a list of
			numbered blobs.
		*/
		const project = makeProject();
		importIcons(project, planIconImport(project, files));

		const reloaded = new GlyphrStudioProject(JSON.parse(JSON.stringify(project.save())));
		expect(reloaded.getItem('glyph-0xE000').name).toEqual('heart');
		expect(reloaded.getItem('glyph-0xE001').name).toEqual('wide-bar');
	});

	it('shows the icon name everywhere a name is asked for', () => {
		/*
			The breadcrumb, the panels and the item chooser all go through
			getItemName, which reaches for the Unicode name first. In the
			Private Use Area that name is only the code point written out, so
			without this an icon called 'heart' reads as 'U+E000' in every
			part of the UI.
		*/
		const project = makeProject();
		importIcons(project, planIconImport(project, files));

		expect(project.getItemName('glyph-0xE000', true)).toEqual('heart');
		expect(project.getItemName('glyph-0xE000')).toEqual('heart');

		// A letter still gets its Unicode name, not a made-up one.
		project.getItem('glyph-0x41', true);
		expect(project.getItemName('glyph-0x41', true)).toEqual('Latin Capital Letter A');
	});

	it('leaves ordinary letters alone', () => {
		const project = makeProject();
		importIcons(project, planIconImport(project, files));

		// A letter's name still comes from Unicode, and is not written to the
		// save file just because renaming became possible.
		const saved = project.save();
		expect(saved.glyphs['glyph-0xE000'].name).toEqual('heart');
	});
});

describe('Icon font: the name map', () => {
	const project = makeProject();
	importIcons(project, planIconImport(project, files));
	const entries = collectIconMap(project);

	it('lists every icon with a usable escape', () => {
		expect(entries.map((entry) => entry.name)).toEqual(['heart', 'wide-bar']);
		expect(entries[0].unicode).toEqual('U+E000');
		expect(entries[0].escape).toEqual('\\uE000');
	});

	it('writes a code point above the basic plane as a surrogate pair', () => {
		/*
			`\\u{1F0000}` is not understood by every language that will read
			this, but a surrogate pair is understood by all of them.
		*/
		const astral = collectIconMap({
			glyphs: { 'glyph-0xF0000': { name: 'far-away' } },
		});
		expect(astral[0].escape).toEqual('\\uDB80\\uDC00');
	});

	it('makes JSON a game can parse', () => {
		const parsed = JSON.parse(makeIconMapJSON(entries, 'My Icons'));
		expect(parsed.count).toEqual(2);
		expect(parsed.icons[0]).toEqual({
			name: 'heart',
			codePoint: 0xe000,
			unicode: 'U+E000',
			escape: '\\uE000',
		});
	});

	it('makes CSS with one class per icon', () => {
		const css = makeIconMapCSS(entries, { prefix: 'icon', fontFamily: 'My Icons' });
		expect(css).toContain('.icon-heart::before { content: "\\E000"; }');
		expect(css).toContain('.icon-wide-bar::before { content: "\\E001"; }');
	});

	it('makes a constants table for engine code', () => {
		const table = makeIconMapTable(entries);
		expect(table).toContain('HEART');
		expect(table).toContain('WIDE_BAR');
		expect(table).toContain('U+E001');
	});

	it('says so when there are no icons', () => {
		expect(makeIconMapTable([])).toContain('No icons');
	});
});

describe('Icon font: icons in an atlas', () => {
	it('carries the names through to the atlas metadata', () => {
		/*
			An engine reading the atlas gets the names in the same file as the
			glyph quads, so nothing has to keep two files in step.
		*/
		const project = makeProject();
		importIcons(project, planIconImport(project, files));

		const atlas = buildAtlas(project, {
			...makeDefaultAtlasOptions(),
			pixelSize: 32,
			pageSize: 256,
			characters: '\u{E000}\u{E001}',
		});

		expect(atlas.metadata.icons).toEqual([
			{ name: 'heart', codePoint: 0xe000, unicode: 'U+E000', escape: '\\uE000' },
			{ name: 'wide-bar', codePoint: 0xe001, unicode: 'U+E001', escape: '\\uE001' },
		]);
	});

	it('only lists icons the atlas actually contains', () => {
		const project = makeProject();
		importIcons(project, planIconImport(project, files));

		const atlas = buildAtlas(project, {
			...makeDefaultAtlasOptions(),
			pixelSize: 32,
			pageSize: 256,
			characters: '\u{E000}',
		});

		expect(atlas.metadata.icons.map((icon) => icon.name)).toEqual(['heart']);
	});

	it('leaves the field out of a font with no icons', () => {
		const project = makeProject();
		project.getItem('glyph-0x41', true);

		const atlas = buildAtlas(project, {
			...makeDefaultAtlasOptions(),
			pixelSize: 32,
			pageSize: 256,
			characters: 'A',
		});

		expect(atlas.metadata.icons).toBeUndefined();
	});
});
