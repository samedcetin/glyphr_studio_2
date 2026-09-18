import { describe, expect, it, vi } from 'vitest';
import { keepWhatWasThere } from '../loose_shapes_panel.js';
import { isFromSheet, isPlaced, looseSheetShapes } from '../leftovers.js';
import { Glyph } from '../../../project_data/glyph.js';

/**
 * A triangle, as a Path the way the project builds one.
 * @param {Number} offset - moves it, so two shapes are tellable apart
 * @returns {Object}
 */
function triangle(offset = 0) {
	return {
		pathPoints: [
			{ p: { coord: { x: offset, y: 0 } } },
			{ p: { coord: { x: offset + 300, y: 0 } } },
			{ p: { coord: { x: offset + 150, y: 500 } } },
		],
	};
}

/**
 * @param {Array =} shapes
 * @returns {Object} a Glyph holding them
 */
function glyphWith(shapes = []) {
	const glyph = new Glyph({});
	if (shapes.length) glyph.shapes = shapes;
	return glyph;
}

/**
 * @returns {Object} enough of a project for the helper, numbering ids itself
 */
function fakeProject() {
	let next = 0;
	return {
		components: {},
		addItemByType: vi.fn(function (item, objType, id) {
			const key = id || `comp-${next++}`;
			item.id = key;
			item.objType = objType;
			this.components[key] = item;
			return item;
		}),
	};
}

describe('keepWhatWasThere', () => {
	it('keeps nothing when the character was empty', () => {
		const project = fakeProject();
		expect(keepWhatWasThere(project, glyphWith(), 'Latin Capital Letter A')).toBe(null);
		expect(project.addItemByType).not.toHaveBeenCalled();
	});

	it('keeps nothing when there is no character at all', () => {
		const project = fakeProject();
		expect(keepWhatWasThere(project, null, 'Anything')).toBe(null);
		expect(keepWhatWasThere(project, undefined, 'Anything')).toBe(null);
	});

	it('turns what was drawn into a component', () => {
		const project = fakeProject();
		const target = glyphWith([triangle()]);
		const kept = keepWhatWasThere(project, target, 'Latin Capital Letter A');

		expect(kept).toBeTruthy();
		expect(kept.shapes).toHaveLength(1);
		expect(kept.name).toBe('Latin Capital Letter A (replaced)');
		expect(project.addItemByType).toHaveBeenCalledWith(kept, 'Component');
	});

	it('carries the advance width across', () => {
		const project = fakeProject();
		const target = glyphWith([triangle()]);
		target.advanceWidth = 742;
		expect(keepWhatWasThere(project, target, 'X').advanceWidth).toBe(742);
	});

	it('SURVIVES the overwrite that happens on the very next line', () => {
		/*
			The guarantee this whole function exists for, and the one that would
			break silently. The shapes setter assigns a fresh array to _shapes
			rather than emptying the old one, so the reference taken here still
			holds the outlines after the character has been written over - but
			only because it is taken first. Swap the two statements below and
			this test is what catches it.
		*/
		const project = fakeProject();
		const target = glyphWith([triangle(0)]);
		const before = target.svgPathData;

		const kept = keepWhatWasThere(project, target, 'Latin Capital Letter A');
		target.shapes = [triangle(1000)];

		expect(target.svgPathData).not.toBe(before);
		expect(kept.svgPathData).toBe(before);
		expect(kept.shapes).toHaveLength(1);
	});

	it('keeps every shape, not just the first', () => {
		const project = fakeProject();
		const target = glyphWith([triangle(0), triangle(400), triangle(800)]);
		const kept = keepWhatWasThere(project, target, 'Three');
		expect(kept.shapes).toHaveLength(3);
	});

	it('lands back in the panel it was dragged onto', () => {
		// The point of the fix: the displaced shape has to be findable again.
		const project = fakeProject();
		keepWhatWasThere(project, glyphWith([triangle()]), 'Question Mark');

		const loose = looseSheetShapes(project);
		expect(loose).toHaveLength(1);
		expect(loose[0].component.name).toBe('Question Mark (replaced)');
		expect(isFromSheet(loose[0].component)).toBe(true);
		expect(isPlaced(loose[0].component)).toBe(false);
	});

	it('does not disturb the shapes already loose', () => {
		const project = fakeProject();
		const first = glyphWith([triangle(0)]);
		const second = glyphWith([triangle(600)]);
		keepWhatWasThere(project, first, 'A');
		keepWhatWasThere(project, second, 'B');

		const loose = looseSheetShapes(project);
		expect(loose.map(({ component }) => component.name)).toEqual(['A (replaced)', 'B (replaced)']);
		expect(loose[0].component.svgPathData).not.toBe(loose[1].component.svgPathData);
	});
});

describe('the loose flag across a save', () => {
	it('survives save and reload, or the panel is empty tomorrow', () => {
		/*
			Glyph.save() is an allowlist and the constructor destructures a fixed
			list, so an undeclared property is dropped at BOTH ends. Before this
			was closed, importing a sheet and saving left every loose shape in
			the project with nothing on screen able to reach it: the panel reads
			the flag, and the flag did not come back.
		*/
		const original = new Glyph({});
		original.shapes = [triangle()];
		original.objType = 'Component';
		original.name = 'Question Mark (replaced)';
		original.fromSpecimenSheet = true;

		const reloaded = new Glyph(JSON.parse(JSON.stringify(original.save())));

		expect(reloaded.fromSpecimenSheet).toBe(true);
		expect(isFromSheet(reloaded)).toBe(true);
		expect(reloaded.shapes).toHaveLength(1);
		expect(reloaded.svgPathData).toBe(original.svgPathData);
	});

	it('costs a project that never imported a sheet nothing', () => {
		const plain = new Glyph({});
		plain.shapes = [triangle()];
		plain.objType = 'Component';
		expect('fromSpecimenSheet' in plain.save()).toBe(false);
	});
});
