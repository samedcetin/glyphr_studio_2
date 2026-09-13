import { describe, expect, it } from 'vitest';
import { GlyphrStudioProject } from '../../project_data/glyphr_studio_project.js';
import { Glyph } from '../../project_data/glyph.js';
import { Path } from '../../project_data/path.js';
import { PathPoint } from '../../project_data/path_point.js';
import { ControlPoint } from '../../project_data/control_point.js';
import { makeGlyphWithResolvedLinks } from '../../project_editor/cross_item_actions.js';
import {
	computeMarkPlacement,
	decomposeCharacter,
	findAnchorPair,
	findMarkGlyphs,
	planCharacter,
	planComposition,
} from '../compose.js';
import { composeCharacter, composeCharacters } from '../compose_glyphs.js';

/**
	COMPOSITION TESTS
	-----------------
	Built on shapes whose corners are known exactly, so the assertions can be
	about position rather than about "roughly where you would expect".
 */

/**
 * A rectangle path.
 * @param {Number} xMin - left
 * @param {Number} yMin - bottom
 * @param {Number} xMax - right
 * @param {Number} yMax - top
 * @returns {Path}
 */
function rect(xMin, yMin, xMax, yMax) {
	const corners = [
		{ x: xMin, y: yMax },
		{ x: xMax, y: yMax },
		{ x: xMax, y: yMin },
		{ x: xMin, y: yMin },
	];

	return new Path({
		pathPoints: corners.map((corner) => new PathPoint({ p: new ControlPoint({ coord: corner }) })),
	});
}

/**
 * A project with a letter, an acute and a circumflex, all anchored.
 * @returns {Object}
 */
function makeProject() {
	const project = new GlyphrStudioProject();

	// 'a' - a 600 wide block, with somewhere for a mark to sit on top.
	const a = new Glyph({ id: 'glyph-0x61', shapes: [rect(50, 0, 650, 700)], advanceWidth: 700 });
	a.setAnchor('top', 350, 700);
	a.setAnchor('bottom', 350, 0);
	project.addItemByType(a, 'Glyph', 'glyph-0x61');

	// Combining acute, U+0301 - drawn where a mark is drawn, above the
	// baseline, with its attachment point at its own foot.
	const acute = new Glyph({ id: 'glyph-0x301', shapes: [rect(-60, 750, 60, 900)], advanceWidth: 0 });
	acute.setAnchor('_top', 0, 750);
	project.addItemByType(acute, 'Glyph', 'glyph-0x301');

	// Combining circumflex, U+0302 - carries a `top` of its own, so another
	// mark can stack on it.
	const circumflex = new Glyph({
		id: 'glyph-0x302',
		shapes: [rect(-100, 750, 100, 880)],
		advanceWidth: 0,
	});
	circumflex.setAnchor('_top', 0, 750);
	circumflex.setAnchor('top', 0, 880);
	project.addItemByType(circumflex, 'Glyph', 'glyph-0x302');

	return project;
}

describe('Anchors: decomposition', () => {
	it('breaks an accented letter into its pieces', () => {
		expect(decomposeCharacter('á')).toEqual({ base: 'a', marks: ['́'] });
	});

	it('gives every mark of a doubly accented letter, in order', () => {
		const pieces = decomposeCharacter('ế');
		expect(pieces.base).toEqual('e');
		expect(pieces.marks).toEqual(['̂', '́']);
	});

	it('says no to a letter that is already whole', () => {
		expect(decomposeCharacter('a')).toBe(false);
		expect(decomposeCharacter('Ω')).toBe(false);
	});

	it('says no to a ligature, which is a different problem', () => {
		/*
			'ﬁ' normalises to two letters rather than a letter and a mark.
			Building it by attachment would put the i on top of the f.
		*/
		expect(decomposeCharacter('ﬁ')).toBe(false);
	});
});

describe('Anchors: finding the marks a project has', () => {
	it('finds a combining mark drawn at its own code point', () => {
		const marks = findMarkGlyphs(makeProject());
		expect(marks.get(0x301)).toEqual('glyph-0x301');
	});

	it('finds a spacing accent standing in for a combining one', () => {
		/*
			Most character sets carry U+00B4 acute rather than U+0301, and
			Unicode itself says they are the same mark - the spacing one
			decomposes to a space plus the combining one. No table needed.
		*/
		const project = new GlyphrStudioProject();
		project.addItemByType(new Glyph({ id: 'glyph-0xB4' }), 'Glyph', 'glyph-0xB4');

		expect(findMarkGlyphs(project).get(0x301)).toEqual('glyph-0xB4');
	});

	it('prefers the real combining mark over a spacing stand-in', () => {
		const project = makeProject();
		project.addItemByType(new Glyph({ id: 'glyph-0xB4' }), 'Glyph', 'glyph-0xB4');

		expect(findMarkGlyphs(project).get(0x301)).toEqual('glyph-0x301');
	});

	it('does not mistake an ordinary letter for a mark', () => {
		const marks = findMarkGlyphs(makeProject());
		expect([...marks.values()]).not.toContain('glyph-0x61');
	});
});

describe('Anchors: pairing and placement', () => {
	const project = makeProject();

	it('pairs a mark anchor with the base anchor of the same name', () => {
		const pair = findAnchorPair(project.glyphs['glyph-0x61'], project.glyphs['glyph-0x301']);
		expect(pair.baseAnchor.name).toEqual('top');
		expect(pair.markAnchor.name).toEqual('_top');
	});

	it('finds no pair when the base has nowhere for the mark to go', () => {
		const bare = new Glyph({ id: 'glyph-0x62' });
		expect(findAnchorPair(bare, project.glyphs['glyph-0x301'])).toBe(false);
	});

	it('moves the mark so the two anchors land on the same point', () => {
		const placement = computeMarkPlacement({ x: 350, y: 700 }, { x: 0, y: 750 });
		expect(placement).toEqual({ translateX: 350, translateY: -50 });
	});
});

describe('Anchors: planning', () => {
	it('plans a simple accented letter', () => {
		const plan = planCharacter(makeProject(), 'á');

		expect(plan.ok).toBe(true);
		expect(plan.baseID).toEqual('glyph-0x61');
		expect(plan.steps.length).toEqual(1);
		expect(plan.steps[0].markID).toEqual('glyph-0x301');
		// The acute's `_top` is at (0, 750); the a's `top` is at (350, 700).
		expect(plan.steps[0].translateX).toEqual(350);
		expect(plan.steps[0].translateY).toEqual(-50);
	});

	it('stacks the second mark on the first, not on the letter', () => {
		/*
			In 'ậ' the second mark belongs on top of the first. Attaching both
			to the letter would draw them on top of each other.
		*/
		const project = makeProject();
		const e = new Glyph({ id: 'glyph-0x65', shapes: [rect(50, 0, 650, 700)], advanceWidth: 700 });
		e.setAnchor('top', 350, 700);
		project.addItemByType(e, 'Glyph', 'glyph-0x65');

		const plan = planCharacter(project, 'ế');
		expect(plan.ok).toBe(true);
		expect(plan.steps.length).toEqual(2);

		// Circumflex: its `_top` (0, 750) goes to the e's `top` (350, 700).
		expect(plan.steps[0]).toMatchObject({ translateX: 350, translateY: -50 });

		/*
			The circumflex's own `top` is at (0, 880), and it has just moved by
			(350, -50) - so it now offers (350, 830). The acute's `_top` is at
			(0, 750), so the acute moves (350, 80).
		*/
		expect(plan.steps[1]).toMatchObject({ translateX: 350, translateY: 80 });
	});

	it('says which piece is missing rather than failing quietly', () => {
		const project = makeProject();

		// No 'o' drawn.
		expect(planCharacter(project, 'ó').reason).toContain('base letter');

		/*
			The missing mark is named, not just numbered - "draw Combining
			Caron" is an instruction, "U+030C is missing" is a puzzle.
		*/
		const caron = planCharacter(project, 'ǎ').reason;
		expect(caron).toContain('U+030C');
		expect(caron.toLowerCase()).toContain('caron');
	});

	it('says when the anchors are what is missing', () => {
		const project = makeProject();
		project.glyphs['glyph-0x61'].removeAnchor('top');

		const plan = planCharacter(project, 'á');
		expect(plan.ok).toBe(false);
		expect(plan.reason).toContain('anchors');
	});

	it('plans a whole string in one pass', () => {
		const plans = planComposition(makeProject(), 'áâa');
		expect(plans.map((plan) => plan.ok)).toEqual([true, true, false]);
	});
});

describe('Anchors: building', () => {
	it('builds the glyph out of component instances', () => {
		/*
			Instances, not copied outlines - so redrawing the `a` afterwards
			updates every accented letter built from it.
		*/
		const project = makeProject();
		const result = composeCharacter(project, planCharacter(project, 'á'));

		expect(result.ok).toBe(true);
		const composed = project.getItem('glyph-0xE1');
		expect(composed.shapes.length).toEqual(2);
		composed.shapes.forEach((shape) => expect(shape.objType).toEqual('ComponentInstance'));
		expect(composed.shapes[0].link).toEqual('glyph-0x61');
		expect(composed.shapes[1].link).toEqual('glyph-0x301');
	});

	it('puts the mark where the anchors said, in the finished outline', () => {
		/*
			The test that matters. Everything above is about intent; this
			resolves the component links and measures the actual drawn shapes.
		*/
		const project = makeProject();
		composeCharacter(project, planCharacter(project, 'á'));

		const resolved = makeGlyphWithResolvedLinks(project.getItem('glyph-0xE1'));
		const shapes = resolved.shapes.map((shape) => shape.maxes);
		const markMaxes = shapes.find((maxes) => maxes.yMin >= 700);

		// The acute was drawn from -60 to 60 around its own anchor at x=0, and
		// the a's `top` anchor is at x=350 - so the mark's centre lands there.
		expect((markMaxes.xMin + markMaxes.xMax) / 2).toEqual(350);
		// Its foot was at 750 and the anchor is at 700, so it drops by 50.
		expect(markMaxes.yMin).toEqual(700);
	});

	it('takes its width from the base, not from the assembled outlines', () => {
		/*
			A combining mark has no advance - it is drawn over the letter
			before it. Measuring the outlines instead would make every
			accented letter wider than the letter it came from.
		*/
		const project = makeProject();
		composeCharacter(project, planCharacter(project, 'á'));

		expect(project.getItem('glyph-0xE1').advanceWidth).toEqual(700);
	});

	it('records where the pieces are used', () => {
		const project = makeProject();
		composeCharacter(project, planCharacter(project, 'á'));

		expect(project.glyphs['glyph-0x61'].usedIn).toContain('glyph-0xE1');
		expect(project.glyphs['glyph-0x301'].usedIn).toContain('glyph-0xE1');
	});

	it('does not write over a glyph that is already drawn', () => {
		const project = makeProject();
		const existing = new Glyph({ id: 'glyph-0xE1', shapes: [rect(0, 0, 10, 10)] });
		project.addItemByType(existing, 'Glyph', 'glyph-0xE1');

		const result = composeCharacter(project, planCharacter(project, 'á'));
		expect(result.ok).toBe(false);
		expect(result.reason).toContain('Already drawn');
		expect(project.getItem('glyph-0xE1').shapes[0].objType).toEqual('Path');
	});

	it('writes over it when told to', () => {
		const project = makeProject();
		project.addItemByType(
			new Glyph({ id: 'glyph-0xE1', shapes: [rect(0, 0, 10, 10)] }),
			'Glyph',
			'glyph-0xE1'
		);

		expect(composeCharacter(project, planCharacter(project, 'á'), true).ok).toBe(true);
		expect(project.getItem('glyph-0xE1').shapes[0].objType).toEqual('ComponentInstance');
	});

	it('builds a set and reports both halves of the outcome', () => {
		const project = makeProject();
		const result = composeCharacters(project, 'áâó');

		expect(result.built.map((entry) => entry.character)).toEqual(['á', 'â']);
		expect(result.skipped.length).toEqual(1);
		expect(result.skipped[0].reason).toContain('base letter');
	});
});
