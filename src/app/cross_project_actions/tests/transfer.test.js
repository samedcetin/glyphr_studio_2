import { describe, expect, it } from 'vitest';
import { makeComponentID } from '../../../pages/components.js';
import { ControlPoint } from '../../../project_data/control_point.js';
import { Glyph } from '../../../project_data/glyph.js';
import { GlyphrStudioProject } from '../../../project_data/glyphr_studio_project.js';
import { KernGroup } from '../../../project_data/kern_group.js';
import { Path } from '../../../project_data/path.js';
import { PathPoint } from '../../../project_data/path_point.js';
import { History } from '../../../project_editor/history.js';
import { createSelection } from '../selection.js';
import {
	copyGlyphForTransfer,
	copyKernGroupForTransfer,
	describeEmScaling,
	emRatioBetween,
	ensureItem,
} from '../transfer.js';

/**
	CROSS-PROJECT TESTS
	-------------------
	The four things that lost data on this page, each pinned: the selection
	dropping a row nobody touched, the copy sharing state with the source, the
	scale being a resize, and the component id counted in the wrong project.
 */

/**
 * @param {Number} xMin - left
 * @param {Number} xMax - right
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
 * @param {Number} upm - em size
 * @returns {Object} - a project with one glyph and one component
 */
function makeProject(upm) {
	const project = new GlyphrStudioProject();
	project.settings.font.upm = upm;
	project.addItemByType(
		new Glyph({
			id: 'glyph-0x41',
			shapes: [block(100, 900)],
			advanceWidth: 1000,
			usedIn: ['glyph-0x42'],
		}),
		'Glyph',
		'glyph-0x41'
	);
	return project;
}

describe('Cross-project: selection', () => {
	it('ticks and unticks by id', () => {
		const selection = createSelection();
		expect(selection.set('a', true)).toBe(true);
		expect(selection.set('b', true)).toBe(true);
		expect(selection.set('a', false)).toBe(true);
		expect(selection.list).toEqual(['b']);
	});

	it('does nothing for an id it does not hold', () => {
		/*
			The old array did `splice(indexOf(id), 1)` - indexOf gives -1 for
			an unknown id, and splice(-1, 1) removes the LAST entry. The
			toggle-all box had no id, so every click on it deleted a row.
		*/
		const selection = createSelection();
		selection.set('a', true);
		selection.set('b', true);

		expect(selection.set('not-there', false)).toBe(false);
		expect(selection.set('', false)).toBe(false);
		expect(selection.list).toEqual(['a', 'b']);
	});

	it('never holds the same id twice', () => {
		const selection = createSelection();
		selection.set('a', true);
		expect(selection.set('a', true)).toBe(false);
		expect(selection.size).toEqual(1);
	});

	it('drops what left the screen when the range changes', () => {
		const selection = createSelection();
		selection.setAll(['a', 'b', 'c'], true);
		selection.keepOnly(['b', 'c', 'd']);
		expect(selection.list).toEqual(['b', 'c']);
	});
});

describe('Cross-project: copying an item for transfer', () => {
	it('shares nothing with the source', () => {
		/*
			usedIn and gsub used to come across by reference. Pushing to the
			copy's usedIn then edited the source project.
		*/
		const source = makeProject(1000);
		const original = source.getItem('glyph-0x41');
		const copy = copyGlyphForTransfer(original);

		copy.usedIn.push('glyph-0x99');
		copy.shapes[0].pathPoints[0].p.coord.x = 5;

		expect(original.usedIn).toEqual(['glyph-0x42']);
		expect(original.shapes[0].pathPoints[0].p.x).toEqual(100);
	});

	it('scales every coordinate and the advance width by the em ratio', () => {
		/*
			The old code fed an advance-width delta into updateGlyphSize as a
			bounding-box change and left the advance width alone - so a glyph
			from a 2048 em landed in a 1000 em with the right outline width,
			the wrong outline position, and its original advance.
		*/
		const source = makeProject(2048);
		const destination = makeProject(1024);
		const ratio = emRatioBetween(source.project ? source.project : source, destination);
		expect(ratio).toEqual(0.5);

		const copy = copyGlyphForTransfer(source.getItem('glyph-0x41'), {
			emRatio: ratio,
			scale: true,
		});

		expect(copy.maxes.xMin).toEqual(50);
		expect(copy.maxes.xMax).toEqual(450);
		expect(copy.maxes.yMax).toEqual(350);
		expect(copy.advanceWidth).toEqual(500);
	});

	it('leaves the geometry alone when not asked to scale', () => {
		const copy = copyGlyphForTransfer(makeProject(2048).getItem('glyph-0x41'), {
			emRatio: 0.5,
			scale: false,
		});
		expect(copy.maxes.xMax).toEqual(900);
		expect(copy.advanceWidth).toEqual(1000);
	});

	it('describes the scaling in numbers a reader can check', () => {
		const text = describeEmScaling(makeProject(2048), makeProject(1000));
		expect(text).toContain('2048');
		expect(text).toContain('1000');
		expect(text).toContain('0.488');
	});

	it('scales a kern value the same way', () => {
		const group = new KernGroup({ leftGroup: ['0x41'], rightGroup: ['0x56'], value: -100 });
		expect(copyKernGroupForTransfer(group, { emRatio: 0.5, scale: true }).value).toEqual(-50);
		expect(copyKernGroupForTransfer(group).value).toEqual(-100);
	});
});

describe('Cross-project: ids counted in the receiving project', () => {
	it('numbers a new component after the ones already there', () => {
		const components = { 'comp-0': {}, 'comp-1': {}, 'comp-2': {} };
		expect(makeComponentID(components)).toEqual('comp-3');
		expect(makeComponentID({})).toEqual('comp-0');
	});

	it('adds a component to a project without colliding with its own', () => {
		/*
			The bug: the id was counted in the *selected* project. With the
			destination holding three components and the selected project
			holding none, the new one became comp-0 and replaced the
			destination's comp-0.
		*/
		const destination = new GlyphrStudioProject();
		['comp-0', 'comp-1', 'comp-2'].forEach((id) => {
			destination.addItemByType(new Glyph({ id: id, name: `keep ${id}` }), 'Component', id);
		});

		const added = destination.addItemByType(new Glyph({ name: 'new one' }), 'Component');

		expect(added.id).toEqual('comp-3');
		expect(destination.components['comp-0'].name).toEqual('keep comp-0');
		expect(Object.keys(destination.components).length).toEqual(4);
	});

	it('creates a missing item without touching any history', () => {
		const project = new GlyphrStudioProject();
		const item = ensureItem(project, 'glyph-0x42');
		expect(item.id).toEqual('glyph-0x42');
		expect(project.getItem('glyph-0x42')).toBe(item);
		// Asking again returns the same one rather than a second copy.
		expect(ensureItem(project, 'glyph-0x42')).toBe(item);
	});
});

describe('Cross-project: history follows its own editor', () => {
	/**
	 * Enough of a ProjectEditor for History to snapshot.
	 * @param {String} name - project name, so snapshots can be told apart
	 * @returns {Object}
	 */
	function fakeEditor(name) {
		const project = new GlyphrStudioProject();
		project.settings.project.name = name;
		project.settings.app.autoSave = false;
		return {
			project: project,
			selectedItemID: 'glyph-0x41',
			nav: { page: 'Characters', panel: '' },
			setProjectAsUnsaved: () => {},
		};
	}

	it('snapshots the project it belongs to, not the selected one', () => {
		/*
			On the cross-project page the destination is the *other* editor.
			Its history used to snapshot the selected editor's project, so
			undo restored the project that had not changed.
		*/
		const other = fakeEditor('destination');
		const history = new History(other);

		history.addWholeProjectChangePreState('cross-project write');

		expect(history.queue.length).toEqual(1);
		expect(history.queue[0].itemState.settings.project.name).toEqual('destination');
	});

	it('brackets a change with two entries of the same project', () => {
		const other = fakeEditor('destination');
		const history = new History(other);

		history.addWholeProjectChangePreState('before');
		other.project.settings.project.name = 'destination, changed';
		history.addWholeProjectChangePostState();

		expect(history.queue.length).toEqual(2);
		expect(history.queue[1].itemState.settings.project.name).toEqual('destination');
		expect(history.queue[0].itemState.settings.project.name).toEqual('destination, changed');
	});
});

describe('Cross-project: the copy-shapes action', () => {
	/**
	 * A source and a destination, the destination with an empty item table.
	 * @param {Number} sourceUPM - source em
	 * @param {Number} destinationUPM - destination em
	 * @returns {Object} - an ActionContext with a history that records titles
	 */
	function makeContext(sourceUPM, destinationUPM) {
		const source = makeProject(sourceUPM);
		const destination = new GlyphrStudioProject();
		destination.settings.font.upm = destinationUPM;
		destination.settings.app.autoSave = false;
		const editorFor = (project) => ({
			project: project,
			selectedItemID: 'glyph-0x41',
			nav: { page: 'Characters', panel: '' },
			setProjectAsUnsaved: () => {},
		});
		const destinationEditor = editorFor(destination);
		destinationEditor.history = new History(destinationEditor);
		return {
			source: editorFor(source),
			destination: destinationEditor,
			range: false,
			options: {},
		};
	}

	it('gives an item it had to create the source advance width, scaled', async () => {
		/*
			A slot that did not exist came out with the paths and an advance
			width of 0 - the glyph drew but took no room. The width should
			arrive with the paths, through the same scale.
		*/
		const { crossProjectActions } = await import('../actions.js');
		const copyShapes = crossProjectActions.find((action) => action.id === 'copy-shapes');
		const context = makeContext(2048, 1024);
		context.options.scale = true;

		copyShapes.run(context, ['glyph-0x41']);

		const made = context.destination.project.getItem('glyph-0x41');
		expect(made.advanceWidth).toEqual(500);
		expect(Math.round(made.maxes.xMax)).toEqual(450);
		// Bracketed in the destination's history: a pre and a post state.
		expect(context.destination.history.queue.length).toEqual(2);
	});

	it('leaves an existing item its own advance width', async () => {
		const { crossProjectActions } = await import('../actions.js');
		const copyShapes = crossProjectActions.find((action) => action.id === 'copy-shapes');
		const context = makeContext(1000, 1000);
		context.destination.project.addItemByType(
			new Glyph({ id: 'glyph-0x41', advanceWidth: 640 }),
			'Glyph',
			'glyph-0x41'
		);

		copyShapes.run(context, ['glyph-0x41']);

		const item = context.destination.project.getItem('glyph-0x41');
		expect(item.advanceWidth).toEqual(640);
		expect(item.shapes.length).toEqual(1);
	});
});
