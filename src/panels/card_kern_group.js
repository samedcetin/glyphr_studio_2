import { addAsChildren, makeElement } from '../common/dom.js';
import { makeKernGroupCharChips } from '../pages/kerning.js';
import { makeSingleInput, makeSingleLabel, rowPad } from './cards.js';

// --------------------------------------------------------------
// Kern Group Attributes Card
// --------------------------------------------------------------

export function makeCard_kernGroup(kernGroup) {
	// log(`makeCard_kernGroup`, 'start');
	// log(kernGroup);

	let kernGroupCard = makeElement({
		tag: 'div',
		className: 'panel__card',
		innerHTML: '<h3>Kern Group</h3>',
	});

	let valueLabel = makeSingleLabel('Value', 'The value of a kern group is an adjustment to the left group\'s advance width.');
	let valueInput = makeSingleInput(kernGroup, 'value', 'currentKernGroup', 'input-number');

	let leftLabel = makeSingleLabel('Left group');
	let leftInput = makeKernGroupCharChips(kernGroup.leftGroup);

	let rightLabel = makeSingleLabel('Right group');
	let rightInput = makeKernGroupCharChips(kernGroup.rightGroup);

	// Put it all together
	addAsChildren(kernGroupCard, [
		valueLabel,
		valueInput,
		leftLabel,
		leftInput,
		rightLabel,
		rightInput,
	]);

	addAsChildren(kernGroupCard, rowPad());
	/*
		The action grid moved to the toolbar - see edit_canvas/quick_actions.js.
	*/

	// log(`makeCard_kernGroup`, 'end');
	return kernGroupCard;
}
