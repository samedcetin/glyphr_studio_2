import { describe, expect, it } from 'vitest';
import { ComponentInstance } from '../component_instance.js';
import { Glyph } from '../glyph.js';
import { Path } from '../path.js';
import { clone } from '../../common/functions.js';
import { samples } from '../../samples/samples.js';

/**
 * A sample path, matching how the other project_data tests build one.
 * @returns {Path}
 */
function samplePath() {
	return new Path({ pathPoints: clone(samples.pathPoints) });
}

/**
 * Layer visibility and locking.
 *
 * These are the properties behind the eye and lock buttons in the Layers
 * panel. Visibility is the one with teeth: it has to mean the same thing
 * everywhere a glyph is turned into a drawing, otherwise a hidden path can
 * disappear from the outline while still stretching the bounding box.
 */
describe('Layer state: visibility and locking', () => {
	/**
	 * @returns {Glyph} - a glyph with two separate paths
	 */
	function makeTwoPathGlyph() {
		const glyph = new Glyph();
		glyph.addOneShape(samplePath());
		const second = samplePath();
		second.name = 'Second';
		// Pushed well to the right, so it alone owns the glyph's xMax.
		second.x = second.x + 500;
		glyph.addOneShape(second);
		return glyph;
	}

	it('defaults to visible and unlocked', () => {
		const path = samplePath();
		expect(path.isVisible).toBe(true);
		expect(path.isLayerLocked).toBe(false);

		const instance = new ComponentInstance();
		expect(instance.isVisible).toBe(true);
		expect(instance.isLayerLocked).toBe(false);
	});

	it('does not write defaults into the saved project', () => {
		const saved = samplePath().save();
		expect(saved.isVisible).toBeUndefined();
		expect(saved.isLayerLocked).toBeUndefined();
	});

	it('saves and restores non-default layer state', () => {
		const path = samplePath();
		path.isVisible = false;
		path.isLayerLocked = true;

		const saved = path.save();
		expect(saved.isVisible).toBe(false);
		expect(saved.isLayerLocked).toBe(true);

		const restored = new Path(saved);
		expect(restored.isVisible).toBe(false);
		expect(restored.isLayerLocked).toBe(true);
	});

	it('saves and restores layer state on a component instance', () => {
		const instance = new ComponentInstance({ link: 'comp-0' });
		instance.isVisible = false;
		instance.isLayerLocked = true;

		const restored = new ComponentInstance(instance.save());
		expect(restored.isVisible).toBe(false);
		expect(restored.isLayerLocked).toBe(true);
	});

	it('leaves hidden shapes out of visibleShapes but keeps them in shapes', () => {
		const glyph = makeTwoPathGlyph();
		expect(glyph.shapes.length).toBe(2);
		expect(glyph.visibleShapes.length).toBe(2);

		glyph.shapes[0].isVisible = false;

		// Still stored - hiding is not deleting.
		expect(glyph.shapes.length).toBe(2);
		expect(glyph.visibleShapes.length).toBe(1);
		expect(glyph.visibleShapes[0].name).toBe('Second');
	});

	it('leaves hidden shapes out of the SVG path data', () => {
		const glyph = makeTwoPathGlyph();
		const bothVisible = glyph.svgPathData;

		glyph.shapes[0].isVisible = false;
		glyph.shapes[0].changed();
		const oneHidden = glyph.svgPathData;

		expect(oneHidden).not.toEqual(bothVisible);
		expect(oneHidden.length).toBeLessThan(bothVisible.length);
	});

	it('leaves hidden shapes out of the bounding box', () => {
		const glyph = makeTwoPathGlyph();
		const bothVisible = glyph.maxes.xMax;

		// The second path was moved 500 to the right, so it owns xMax.
		glyph.shapes[1].isVisible = false;
		glyph.shapes[1].changed();

		expect(glyph.maxes.xMax).toBeLessThan(bothVisible);
	});

	it('brings a shape back exactly as it was', () => {
		const glyph = makeTwoPathGlyph();
		const original = glyph.svgPathData;

		glyph.shapes[0].isVisible = false;
		glyph.shapes[0].changed();
		expect(glyph.svgPathData).not.toEqual(original);

		glyph.shapes[0].isVisible = true;
		glyph.shapes[0].changed();
		expect(glyph.svgPathData).toEqual(original);
	});

	it('does not let locking change what is drawn', () => {
		const glyph = makeTwoPathGlyph();
		const before = glyph.svgPathData;

		glyph.shapes[0].isLayerLocked = true;
		glyph.shapes[0].changed();

		// A lock is about what you can grab, not about what is on the page.
		expect(glyph.svgPathData).toEqual(before);
		expect(glyph.visibleShapes.length).toBe(2);
	});
});
