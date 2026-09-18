import { describe, expect, it, vi } from 'vitest';
import {
	canImportWithoutReview,
	describePlan,
	glyphIdFor,
	importSheet,
	planImport,
} from '../import_sheet.js';
import { ROW_OK } from '../assign_glyphs.js';

const FACE = { upm: 2048, capHeight: 1480, xHeight: 950, ascent: 1500, descent: -420 };

/**
 * A crop holding a ring, so a planned glyph has an outer contour and a counter.
 * @param {Number} size
 * @returns {Object} a fake sheet whose grey plane draws one ring per cell
 */
function ringSheet(size = 80) {
	const grey = new Uint8Array(size * size).fill(255);
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			const d = Math.hypot(x - size / 2, y - size / 2);
			// Ink between radius 14 and 30, with a soft edge so the trace has
			// sub-pixel information the way a real sheet does.
			const inside = Math.min(30 - d, d - 14);
			grey[y * size + x] = Math.round(255 - 255 * Math.max(0, Math.min(1, inside / 2 + 0.5)));
		}
	}
	return { grey, width: size, height: size, threshold: 128, inverted: false };
}

/**
 * @param {Array} characters
 * @returns {Object} an assignment whose cells all point at the same ring
 */
function assignmentFor(characters) {
	return {
		rows: [
			{
				index: 0,
				status: ROW_OK,
				cells: characters.map((character) => ({
					character,
					status: ROW_OK,
					cell: { x0: 8, y0: 8, x1: 71, y1: 71, parts: [{}] },
				})),
			},
		],
		assigned: characters.length,
		needsReview: 0,
		missingRows: [],
		extraRows: 0,
	};
}

const METRICS = {
	unitsPerPixel: 20,
	rows: [{ index: 0, baseline: 72 }],
	derived: FACE,
};

/**
 * @param {Object =} glyphs - already in the project
 * @returns {Object} enough of a project for the importer
 */
function fakeProject(glyphs = {}) {
	return {
		glyphs,
		settings: { project: { upm: 2048 }, font: { xHeight: 1100, ascent: 1550, descent: -440 } },
		addItemByType: vi.fn(function (item, type, id) {
			this.glyphs[id] = item;
			return item;
		}),
		incrementRangeCountFor: vi.fn(),
	};
}

/**
 * @returns {Object} a history that records the calls made on it
 */
function fakeHistory() {
	return {
		addWholeProjectChangePreState: vi.fn(),
		addWholeProjectChangePostState: vi.fn(),
		addState: vi.fn(),
	};
}

function planFor(characters, project, options = {}) {
	return planImport(
		{ sheet: ringSheet(), assignment: assignmentFor(characters), metrics: METRICS },
		{ project, ...options }
	);
}

describe('glyphIdFor', () => {
	it('matches the project id scheme', () => {
		expect(glyphIdFor('A')).toBe('glyph-0x41');
		expect(glyphIdFor('a')).toBe('glyph-0x61');
		expect(glyphIdFor('ı')).toBe('glyph-0x131');
	});
});

describe('planImport', () => {
	it('plans a finished glyph, not raw geometry', () => {
		const plan = planFor(['O'], fakeProject());
		expect(plan.entries).toHaveLength(1);
		const [entry] = plan.entries;
		expect(entry.character).toBe('O');
		expect(entry.contours).toBe(2);
		expect(entry.advanceWidth).toBeGreaterThan(0);
		expect(entry.bezierData.length).toBe(2);
		// Font space: y up, and nothing far below the baseline.
		const ys = entry.bezierData.flat().flatMap((b) => [b[0].y, b[3].y]);
		expect(Math.min(...ys)).toBeGreaterThan(-100);
	});

	it('writes nothing', () => {
		const project = fakeProject();
		planFor(['O', 'o'], project);
		expect(project.addItemByType).not.toHaveBeenCalled();
		expect(Object.keys(project.glyphs)).toHaveLength(0);
	});

	it('counts what it would replace before anything happens', () => {
		// The gap this closes: addItemByType overwrites with no check, so a
		// user who has drawn twenty glyphs would lose them without a word.
		const project = fakeProject({ 'glyph-0x4F': { shapes: [] } });
		const plan = planFor(['O', 'H'], project);
		expect(plan.replaceCount).toBe(1);
		expect(plan.newCount).toBe(1);
		expect(plan.entries.find((e) => e.character === 'O').replaces).toBe(true);
		expect(plan.entries.find((e) => e.character === 'H').replaces).toBe(false);
	});

	it('says what it is about to do', () => {
		const project = fakeProject({ 'glyph-0x4F': { shapes: [] } });
		expect(describePlan(planFor(['O', 'H'], project))).toContain('replaced');
		expect(describePlan({ entries: [] })).toBe('Nothing to import yet');
	});

	it('levels and sizes when asked, and leaves things alone when not', () => {
		const project = fakeProject();
		const plain = planFor(['H'], project, { level: false, fit: false });
		const placed = planFor(['H'], project, { level: true, fit: true });
		const bottomOf = (plan) =>
			Math.min(...plan.entries[0].bezierData.flat().flatMap((b) => [b[0].y, b[3].y]));
		const heightOf = (plan) => {
			const ys = plan.entries[0].bezierData.flat().flatMap((b) => [b[0].y, b[3].y]);
			return Math.max(...ys) - Math.min(...ys);
		};
		expect(bottomOf(placed)).toBeCloseTo(0, 1);
		expect(heightOf(placed)).toBeCloseTo(FACE.capHeight, 0);
		expect(heightOf(plain)).not.toBeCloseTo(FACE.capHeight, 0);
	});
});

describe('canImportWithoutReview', () => {
	const perfect = { status: 'detected', confidence: 1 };
	const cleanRows = { rows: [{ status: 'ok' }, { status: 'undeclared' }] };

	it('lets a sheet that was read cleanly go straight in', () => {
		const project = fakeProject();
		const plan = planFor(['O', 'H'], project);
		expect(canImportWithoutReview(perfect, plan, cleanRows)).toBe(true);
	});

	it('never skips when something would be replaced', () => {
		// The one outcome here that cannot be undone by noticing it afterwards.
		const project = fakeProject({ 'glyph-0x4F': { shapes: [] } });
		const plan = planFor(['O', 'H'], project);
		expect(plan.replaceCount).toBe(1);
		expect(canImportWithoutReview(perfect, plan, cleanRows)).toBe(false);
	});

	it('does not skip when the layout was not identified', () => {
		const plan = planFor(['O'], fakeProject());
		expect(canImportWithoutReview({ status: 'undetected', confidence: 0 }, plan, cleanRows)).toBe(false);
		expect(canImportWithoutReview(null, plan, cleanRows)).toBe(false);
	});

	it('does not skip when a shape did not look like its character', () => {
		const plan = planFor(['O'], fakeProject());
		expect(canImportWithoutReview({ status: 'detected', confidence: 0.98 }, plan, cleanRows)).toBe(false);
	});

	it('does not skip when a row could not be read', () => {
		const plan = planFor(['O'], fakeProject());
		const mismatched = { rows: [{ status: 'ok' }, { status: 'count-mismatch' }] };
		expect(canImportWithoutReview(perfect, plan, mismatched)).toBe(false);
	});

	it('does not skip an import with nothing in it', () => {
		expect(canImportWithoutReview(perfect, { entries: [] }, cleanRows)).toBe(false);
	});
});

describe('importSheet', () => {
	it('writes new glyphs through the project', () => {
		const project = fakeProject();
		const plan = planFor(['O', 'H'], project);
		const result = importSheet(plan, { project });
		expect(result).toMatchObject({ written: 2, replaced: 0, skipped: 0 });
		expect(project.glyphs['glyph-0x4F']).toBeTruthy();
		expect(project.glyphs['glyph-0x48']).toBeTruthy();
	});

	it('gives each glyph the advance width that was planned', () => {
		const project = fakeProject();
		const plan = planFor(['O'], project);
		importSheet(plan, { project });
		expect(project.glyphs['glyph-0x4F'].advanceWidth).toBe(plan.entries[0].advanceWidth);
	});

	it('replaces in place rather than through the adder', () => {
		// addItemByType increments the character range count every time it is
		// called, so putting an existing glyph through it a second time inflates
		// the counts the ranges report.
		const existing = { shapes: [], advanceWidth: 5, changed: vi.fn() };
		const project = fakeProject({ 'glyph-0x4F': existing });
		const plan = planFor(['O'], project);
		const result = importSheet(plan, { project });

		expect(result).toMatchObject({ written: 0, replaced: 1 });
		expect(project.addItemByType).not.toHaveBeenCalled();
		expect(project.incrementRangeCountFor).not.toHaveBeenCalled();
		expect(existing.shapes.length).toBeGreaterThan(0);
		expect(existing.changed).toHaveBeenCalled();
	});

	it('is one undoable change, however many glyphs arrive', () => {
		const project = fakeProject();
		const history = fakeHistory();
		importSheet(planFor(['O', 'H', 'B', 'o'], project), { project, history });
		expect(history.addWholeProjectChangePreState).toHaveBeenCalledTimes(1);
		expect(history.addWholeProjectChangePostState).toHaveBeenCalledTimes(1);
		expect(history.addState).not.toHaveBeenCalled();
	});

	it('does not open a history entry it will not close', () => {
		const project = fakeProject();
		const history = fakeHistory();
		const result = importSheet({ entries: [] }, { project, history });
		expect(result.written).toBe(0);
		expect(history.addWholeProjectChangePreState).not.toHaveBeenCalled();
	});

	it('imports only what it was asked for', () => {
		const project = fakeProject();
		const plan = planFor(['O', 'H', 'B'], project);
		importSheet(plan, { project, only: ['H'] });
		expect(Object.keys(project.glyphs)).toEqual(['glyph-0x48']);
	});

	it('takes the face proportions onto the project when given them', () => {
		const project = fakeProject();
		importSheet(planFor(['O'], project), { project, face: FACE });
		expect(project.settings.font.xHeight).toBe(950);
		expect(project.settings.font.ascent).toBe(1500);
		expect(project.settings.font.descent).toBe(-420);
	});

	it('leaves the project metrics alone when not given any', () => {
		const project = fakeProject();
		importSheet(planFor(['O'], project), { project });
		expect(project.settings.font.xHeight).toBe(1100);
	});
});
