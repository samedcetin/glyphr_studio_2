import { addAsChildren, makeElement } from '../common/dom.js';
import { makeIconButton } from '../controls/icon-toggle/icon_toggle.js';
import { makeKernGroupCharChips, showAddEditKernGroupDialog } from '../pages/kerning.js';
import { makeSingleInput, makeSingleLabel } from './cards.js';

/**
	KERN GROUP CARD
	---------------
	The value, and the two sets of characters it applies between.

	Both sets were a bare span of inline chips with nothing between them, so
	eight characters measured 160px across in a 160px span - edge to edge,
	reading as one strip rather than as eight things. They are a wrapped row
	now, with the count beside the label, because how many characters are on
	a side is most of what you want from this row at a glance.

	And the card is the only place in the app that shows a kern group's
	membership, while the only way to change it was the Edit action in the
	toolbar's quick actions - two clicks away, in a menu, for the thing this
	card is about. The card has its own edit button now.
 */

/**
 * A label with the size of the group it names.
 *
 * @param {String} text - `Left group` or `Right group`
 * @param {Number} count - how many characters are in it
 * @returns {HTMLElement}
 */
function makeGroupLabel(text, count) {
	const label = makeSingleLabel(text);

	/*
		The count goes straight on the label, with no span around the name.
		makeSingleLabel says why: resets.css sets font-size on the universal
		selector, so a span in here takes --fs-md directly and beats the
		--fs-sm the sidebar sets on the label.
	*/
	const countElement = makeElement({ className: 'kern-chips__count' });
	countElement.textContent = `${count}`;
	label.appendChild(countElement);

	return label;
}

/**
 * @param {Object} kernGroup - the KernGroup being edited
 * @returns {HTMLElement}
 */
export function makeCard_kernGroup(kernGroup) {
	const kernGroupCard = makeElement({ tag: 'div', className: 'panel__card' });

	/*
		Heading and its action on one row - the shape the handle groups and the
		Quality checks verdict already use for a control that belongs to a whole
		group rather than to one field.
	*/
	const head = makeElement({ className: 'kern-group__head' });
	head.appendChild(makeElement({ tag: 'h3', content: 'Kern group' }));
	head.appendChild(
		makeIconButton({
			icon: 'edit',
			name: 'Edit this kern group',
			body: 'Change which characters are on each side, and the value between them.',
			onClick: () => showAddEditKernGroupDialog(kernGroup),
		})
	);
	kernGroupCard.appendChild(head);

	const valueLabel = makeSingleLabel(
		'Value',
		"The value of a kern group is an adjustment to the left group's advance width."
	);
	const valueInput = makeSingleInput(kernGroup, 'value', 'currentKernGroup', 'input-number');
	/* Em, like every other distance in the app. The dialog says so; this did not. */
	valueInput.setAttribute('suffix', 'em');

	addAsChildren(kernGroupCard, [
		valueLabel,
		valueInput,
		makeGroupLabel('Left group', kernGroup.leftGroup.length),
		makeKernGroupCharChips(kernGroup.leftGroup),
		makeGroupLabel('Right group', kernGroup.rightGroup.length),
		makeKernGroupCharChips(kernGroup.rightGroup),
	]);

	/*
		The action grid moved to the toolbar - see edit_canvas/quick_actions.js.
		The rowPad that used to close this card went with it: it was a 0 x 10
		div, and the card's own row gap does that job.
	*/

	return kernGroupCard;
}
