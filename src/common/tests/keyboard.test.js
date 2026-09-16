import { describe, expect, it } from 'vitest';
import { keyLabel, shortcutLabel } from '../keyboard.js';

/*
	The test runner is jsdom, whose navigator is not a Mac, so this pins the
	non-Mac side: keys pass through untouched. The Mac side is a lookup table.
*/
describe('Keyboard labels', () => {
	it('leaves keys alone off a Mac', () => {
		expect(keyLabel('Ctrl')).toEqual('Ctrl');
		expect(shortcutLabel(['Ctrl', 'K'])).toEqual('Ctrl K');
	});
});
