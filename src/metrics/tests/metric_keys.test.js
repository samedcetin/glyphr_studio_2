import { describe, expect, it } from 'vitest';
import { ControlPoint } from '../../project_data/control_point.js';
import { Glyph } from '../../project_data/glyph.js';
import { GlyphrStudioProject } from '../../project_data/glyphr_studio_project.js';
import { Path } from '../../project_data/path.js';
import { PathPoint } from '../../project_data/path_point.js';
import { applyAllMetricKeys, applyKeysToGlyph, findDriftedGlyphs } from '../apply_keys.js';
import {
	applyKeyMath,
	formatMetricKey,
	parseMetricKey,
	referenceToGlyphID,
	resolveSideBearing,
} from '../metric_keys.js';

/**
	METRIC KEY TESTS
	----------------
	Built on plain rectangles, so a sidebearing is a number that can be read
	off the shape rather than inferred.
 */

/**
 * @param {Number} xMin - left edge
 * @param {Number} xMax - right edge
 * @returns {Path}
 */
function block(xMin, xMax) {
	const corners = [
		{ x: xMin, y: 700 },
		{ x: xMax, y: 700 },
		{ x: xMax, y: 0 },
		{ x: xMin, y: 0 },
	];

	return new Path({
		pathPoints: corners.map((corner) => new PathPoint({ p: new ControlPoint({ coord: corner }) })),
	});
}

/**
 * A glyph whose ink runs from `xMin` to `xMax` inside `advanceWidth`.
 * @param {String} id - glyph id
 * @param {Number} xMin - left edge of the ink
 * @param {Number} xMax - right edge of the ink
 * @param {Number} advanceWidth - the advance
 * @returns {Glyph}
 */
function makeGlyph(id, xMin, xMax, advanceWidth) {
	return new Glyph({ id: id, shapes: [block(xMin, xMax)], advanceWidth: advanceWidth });
}

/**
 * A project with an `n` (straight sided) and an `o` (round, tighter).
 * @returns {Object}
 */
function makeProject() {
	const project = new GlyphrStudioProject();

	// n: ink 40..560, advance 600 - so both sidebearings are 40.
	project.addItemByType(makeGlyph('glyph-0x6E', 40, 560, 600), 'Glyph', 'glyph-0x6E');
	// o: ink 30..570, advance 600 - both sidebearings 30.
	project.addItemByType(makeGlyph('glyph-0x6F', 30, 570, 600), 'Glyph', 'glyph-0x6F');
	// d: ink 100..500, advance 700 - deliberately wrong, waiting to be keyed.
	project.addItemByType(makeGlyph('glyph-0x64', 100, 500, 700), 'Glyph', 'glyph-0x64');

	return project;
}

/**
 * A parsed key, for the cases that are known to be keys.
 * @param {String} text - key text
 * @returns {Object} - a MetricKey
 */
function keyOf(text) {
	const key = parseMetricKey(text);
	if (!key) throw new Error(`"${text}" did not parse as a key`);
	return key;
}

describe('Metric keys: reading them', () => {
	it('reads the plain form', () => {
		expect(parseMetricKey('=n')).toEqual({
			reference: 'n',
			mirrored: false,
			operator: '',
			amount: 0,
		});
	});

	it('reads the mirrored form', () => {
		expect(parseMetricKey('=|n')).toMatchObject({ reference: 'n', mirrored: true });
	});

	it('reads the arithmetic forms', () => {
		expect(parseMetricKey('=n+10')).toMatchObject({ operator: '+', amount: 10 });
		expect(parseMetricKey('=n-5')).toMatchObject({ operator: '-', amount: 5 });
		expect(parseMetricKey('=o*0.9')).toMatchObject({ operator: '*', amount: 0.9 });
		expect(parseMetricKey('=|o+12')).toMatchObject({ reference: 'o', mirrored: true, amount: 12 });
	});

	it('tolerates the spaces people type', () => {
		expect(parseMetricKey('= | n + 10')).toMatchObject({
			reference: 'n',
			mirrored: true,
			amount: 10,
		});
	});

	it('says no to anything that is not a key', () => {
		expect(parseMetricKey('40')).toBe(false);
		expect(parseMetricKey('')).toBe(false);
		expect(parseMetricKey('=')).toBe(false);
	});

	it('writes back what it read', () => {
		['=n', '=|n', '=n+10', '=o*0.9'].forEach((text) => {
			expect(formatMetricKey(keyOf(text))).toEqual(text);
		});
	});

	it('does the arithmetic', () => {
		expect(applyKeyMath(40, keyOf('=n+10'))).toEqual(50);
		expect(applyKeyMath(40, keyOf('=n-10'))).toEqual(30);
		expect(applyKeyMath(40, keyOf('=n*0.5'))).toEqual(20);
		expect(applyKeyMath(40, keyOf('=n'))).toEqual(40);
	});
});

describe('Metric keys: naming a glyph', () => {
	it('takes the character itself, which is what people type', () => {
		expect(referenceToGlyphID('n')).toEqual('glyph-0x6E');
		expect(referenceToGlyphID('A')).toEqual('glyph-0x41');
	});

	it('takes a code point either way round', () => {
		expect(referenceToGlyphID('U+006E')).toEqual('glyph-0x6E');
		expect(referenceToGlyphID('0x6E')).toEqual('glyph-0x6E');
	});

	it('takes an id as it stands', () => {
		expect(referenceToGlyphID('glyph-0x6E')).toEqual('glyph-0x6E');
	});

	it('handles a character outside the basic plane', () => {
		expect(referenceToGlyphID('𐐀')).toEqual('glyph-0x10400');
	});

	it('gives nothing back for something it cannot read', () => {
		expect(referenceToGlyphID('')).toEqual('');
		expect(referenceToGlyphID('not a glyph')).toEqual('');
	});
});

describe('Metric keys: resolving', () => {
	it('reads the same side of the referenced glyph', () => {
		const project = makeProject();
		project.glyphs['glyph-0x64'].leftSideBearingKey = '=o';

		expect(resolveSideBearing(project, 'glyph-0x64', 'left')).toMatchObject({
			ok: true,
			value: 30,
		});
	});

	it('reads the other side when mirrored', () => {
		/*
			What a round letter actually wants: `b`'s right sidebearing is the
			`o`'s left seen from the other side. With an asymmetric reference
			the two forms give different answers, which is the whole point.
		*/
		const project = makeProject();
		project.addItemByType(makeGlyph('glyph-0x72', 40, 400, 500), 'Glyph', 'glyph-0x72');
		const r = project.glyphs['glyph-0x72'];
		expect(Math.round(r.leftSideBearing)).toEqual(40);
		expect(Math.round(r.rightSideBearing)).toEqual(100);

		project.glyphs['glyph-0x64'].leftSideBearingKey = '=r';
		expect(resolveSideBearing(project, 'glyph-0x64', 'left').value).toEqual(40);

		project.glyphs['glyph-0x64'].leftSideBearingKey = '=|r';
		expect(resolveSideBearing(project, 'glyph-0x64', 'left').value).toEqual(100);
	});

	it('follows a chain to whichever glyph is not keyed', () => {
		const project = makeProject();
		project.glyphs['glyph-0x6F'].leftSideBearingKey = '=n+5';
		project.glyphs['glyph-0x64'].leftSideBearingKey = '=o';

		// n's left is 40, so o's resolves to 45, and d's follows it.
		expect(resolveSideBearing(project, 'glyph-0x64', 'left').value).toEqual(45);
	});

	it('refuses to follow keys that lead back to where they started', () => {
		/*
			Two glyphs keyed to each other is an easy mistake to make and an
			infinite loop to follow.
		*/
		const project = makeProject();
		project.glyphs['glyph-0x6E'].leftSideBearingKey = '=o';
		project.glyphs['glyph-0x6F'].leftSideBearingKey = '=n';

		const resolved = resolveSideBearing(project, 'glyph-0x6E', 'left');
		expect(resolved.ok).toBe(false);
		expect(resolved.reason).toContain('refer back');
	});

	it('catches a glyph keyed to itself', () => {
		const project = makeProject();
		project.glyphs['glyph-0x6E'].leftSideBearingKey = '=n';
		expect(resolveSideBearing(project, 'glyph-0x6E', 'left').ok).toBe(false);
	});

	it('says which glyph is missing', () => {
		const project = makeProject();
		project.glyphs['glyph-0x64'].leftSideBearingKey = '=z';

		const resolved = resolveSideBearing(project, 'glyph-0x64', 'left');
		expect(resolved.ok).toBe(false);
		expect(resolved.reason).toContain('z');
	});
});

describe('Metric keys: applying', () => {
	it('moves the glyph so its sidebearing matches the key', () => {
		const project = makeProject();
		const d = project.glyphs['glyph-0x64'];
		d.leftSideBearingKey = '=o';
		d.rightSideBearingKey = '=n';

		expect(applyKeysToGlyph(project, 'glyph-0x64')).toMatchObject({ ok: true, changed: true });
		expect(Math.round(d.leftSideBearing)).toEqual(30);
		expect(Math.round(d.rightSideBearing)).toEqual(40);
	});

	it('keeps the ink the same width - only the space around it changes', () => {
		const project = makeProject();
		const d = project.glyphs['glyph-0x64'];
		const inkWidth = d.maxes.xMax - d.maxes.xMin;

		d.leftSideBearingKey = '=o';
		d.rightSideBearingKey = '=n';
		applyKeysToGlyph(project, 'glyph-0x64');

		expect(d.maxes.xMax - d.maxes.xMin).toEqual(inkWidth);
		// 400 of ink with 30 and 40 either side.
		expect(d.advanceWidth).toEqual(inkWidth + 30 + 40);
	});

	it('resolves both sides before writing either', () => {
		/*
			Setting the left sidebearing moves the outline and changes the
			advance. A right side resolved after that would be measured
			against a glyph that had already moved.
		*/
		const project = makeProject();
		const d = project.glyphs['glyph-0x64'];
		d.leftSideBearingKey = '=n';
		d.rightSideBearingKey = '=n';

		applyKeysToGlyph(project, 'glyph-0x64');
		expect(Math.round(d.leftSideBearing)).toEqual(40);
		expect(Math.round(d.rightSideBearing)).toEqual(40);
	});

	it('reports no change when everything already agrees', () => {
		const project = makeProject();
		project.glyphs['glyph-0x64'].leftSideBearingKey = '=n';
		applyKeysToGlyph(project, 'glyph-0x64');

		expect(applyKeysToGlyph(project, 'glyph-0x64')).toMatchObject({ ok: true, changed: false });
	});

	it('leaves an empty glyph alone and says why', () => {
		const project = makeProject();
		const space = new Glyph({ id: 'glyph-0x20', advanceWidth: 250 });
		space.leftSideBearingKey = '=n';
		project.addItemByType(space, 'Glyph', 'glyph-0x20');

		const result = applyKeysToGlyph(project, 'glyph-0x20');
		expect(result.ok).toBe(false);
		expect(result.reason).toContain('Nothing drawn');
		expect(space.advanceWidth).toEqual(250);
	});

	it('needs no ordering, however the chain is arranged', () => {
		const project = makeProject();
		project.glyphs['glyph-0x6F'].leftSideBearingKey = '=n+5';
		project.glyphs['glyph-0x64'].leftSideBearingKey = '=o';

		applyAllMetricKeys(project);

		expect(Math.round(project.glyphs['glyph-0x6F'].leftSideBearing)).toEqual(45);
		expect(Math.round(project.glyphs['glyph-0x64'].leftSideBearing)).toEqual(45);
	});

	it('follows the reference when it changes - the point of the whole thing', () => {
		const project = makeProject();
		const d = project.glyphs['glyph-0x64'];
		d.leftSideBearingKey = '=n';
		applyAllMetricKeys(project);
		expect(Math.round(d.leftSideBearing)).toEqual(40);

		// Respace the n, then update.
		project.glyphs['glyph-0x6E'].leftSideBearing = 80;
		applyAllMetricKeys(project);
		expect(Math.round(d.leftSideBearing)).toEqual(80);
	});

	it('reports the ones it could not do', () => {
		const project = makeProject();
		project.glyphs['glyph-0x64'].leftSideBearingKey = '=z';

		const result = applyAllMetricKeys(project);
		expect(result.updated.length).toEqual(0);
		expect(result.failed.length).toEqual(1);
		expect(result.failed[0].id).toEqual('glyph-0x64');
	});

	it('says what has drifted without changing it', () => {
		const project = makeProject();
		const d = project.glyphs['glyph-0x64'];
		d.leftSideBearingKey = '=n';

		const drifted = findDriftedGlyphs(project);
		expect(drifted).toEqual([{ id: 'glyph-0x64', side: 'left', current: 100, target: 40 }]);
		// Reporting only - the glyph has not moved.
		expect(Math.round(d.leftSideBearing)).toEqual(100);
	});

	it('carries the keys through a save and reload', () => {
		const project = makeProject();
		project.glyphs['glyph-0x64'].leftSideBearingKey = '=o';
		project.glyphs['glyph-0x64'].rightSideBearingKey = '=|o';

		const reloaded = new GlyphrStudioProject(JSON.parse(JSON.stringify(project.save())));
		expect(reloaded.glyphs['glyph-0x64'].leftSideBearingKey).toEqual('=o');
		expect(reloaded.glyphs['glyph-0x64'].rightSideBearingKey).toEqual('=|o');
	});

	it('writes nothing to the save file when there are no keys', () => {
		const saved = makeProject().glyphs['glyph-0x6E'].save();
		expect(saved.leftSideBearingKey).toBeUndefined();
		expect(saved.rightSideBearingKey).toBeUndefined();
	});
});
