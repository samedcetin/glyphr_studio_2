import { describe, expect, it } from 'vitest';
import { Anchor } from '../../project_data/anchor.js';
import { Glyph } from '../../project_data/glyph.js';

describe('Anchors: the anchor itself', () => {
	it('keeps a name, and a position', () => {
		const anchor = new Anchor({ name: 'top', x: 300, y: 700 });
		expect(anchor.name).toEqual('top');
		expect(anchor.x).toEqual(300);
		expect(anchor.y).toEqual(700);
	});

	it('tells a base anchor from a mark anchor', () => {
		expect(new Anchor({ name: 'top' }).isMarkAnchor).toBe(false);
		expect(new Anchor({ name: '_top' }).isMarkAnchor).toBe(true);
	});

	it('pairs the two halves of a connection by name', () => {
		expect(new Anchor({ name: '_top' }).pairName).toEqual('top');
		expect(new Anchor({ name: 'top' }).pairName).toEqual('top');
	});

	it('holds names to what OpenType feature code can carry', () => {
		/*
			Anchor names end up verbatim in feature syntax, where a space or a
			bracket is a syntax error rather than a stylistic choice.
		*/
		expect(new Anchor({ name: 'top left!' }).name).toEqual('topleft');
		expect(new Anchor({ name: 'top-mark' }).name).toEqual('topmark');
		expect(new Anchor({ name: 'ogonek.alt' }).name).toEqual('ogonek.alt');
	});

	it('keeps one leading underscore and no more', () => {
		expect(new Anchor({ name: '__top' }).name).toEqual('_top');
		expect(new Anchor({ name: '_top' }).name).toEqual('_top');
	});

	it('never ends up nameless', () => {
		expect(new Anchor({ name: '' }).name).toEqual('anchor');
		expect(new Anchor({ name: '!!!' }).name).toEqual('anchor');
	});

	it('treats a position it cannot read as the origin', () => {
		const anchor = new Anchor({ name: 'top', x: 'abc', y: undefined });
		expect(anchor.x).toEqual(0);
		expect(anchor.y).toEqual(0);
	});

	it('saves what it needs and nothing else', () => {
		expect(new Anchor({ name: 'top', x: 10, y: 20 }).save()).toEqual({
			name: 'top',
			x: 10,
			y: 20,
		});
	});
});

describe('Anchors: on a glyph', () => {
	it('starts with none', () => {
		expect(new Glyph({ id: 'glyph-0x61' }).anchors).toEqual([]);
	});

	it('adds and finds them by name', () => {
		const glyph = new Glyph({ id: 'glyph-0x61' });
		glyph.setAnchor('top', 300, 700);

		expect(glyph.anchors.length).toEqual(1);
		expect(glyph.getAnchor('top')).toMatchObject({ y: 700 });
		expect(glyph.getAnchor('bottom')).toBe(false);
	});

	it('moves an anchor rather than adding a second one with the same name', () => {
		/*
			Two anchors called `top` would make attachment ambiguous, and
			whichever won would do so silently.
		*/
		const glyph = new Glyph({ id: 'glyph-0x61' });
		glyph.setAnchor('top', 300, 700);
		glyph.setAnchor('top', 320, 720);

		expect(glyph.anchors.length).toEqual(1);
		expect(glyph.getAnchor('top')).toMatchObject({ x: 320 });
	});

	it('removes them, and says whether there was one', () => {
		const glyph = new Glyph({ id: 'glyph-0x61' });
		glyph.setAnchor('top', 300, 700);

		expect(glyph.removeAnchor('top')).toBe(true);
		expect(glyph.removeAnchor('top')).toBe(false);
		expect(glyph.anchors).toEqual([]);
	});

	it('carries them through a save and reload', () => {
		const glyph = new Glyph({ id: 'glyph-0x61' });
		glyph.setAnchor('top', 300, 700);
		glyph.setAnchor('bottom', 300, -20);

		const reloaded = new Glyph(JSON.parse(JSON.stringify(glyph.save())));
		expect(reloaded.anchors.length).toEqual(2);
		expect(reloaded.getAnchor('top')).toMatchObject({ y: 700 });
		expect(reloaded.getAnchor('bottom')).toMatchObject({ y: -20 });
		expect(reloaded.getAnchor('top') instanceof Anchor).toBe(true);
	});

	it('writes nothing to the save file when there are none', () => {
		expect(new Glyph({ id: 'glyph-0x61' }).save().anchors).toBeUndefined();
	});
});
