import { makeElement } from '../../common/dom.js';
import { makeLineIcon } from '../../common/icons.js';
import { attachTooltip } from '../tooltip/tooltip.js';

/**
	ICON TOGGLE
	-----------
	One icon, two states, `aria-pressed` carrying which.

	The app kept reinventing this. The Layers panel has it for a layer's eye
	and its lock; the Quality checks panel got its own copy for the canvas
	overlay; and the places that had not got round to it were still shipping
	a browser checkbox - the largest control on the surface, at a size the
	app never picks itself, in a shape nothing else in the app has.

	A checkbox is right for a list of things you tick. It is wrong for a
	switch: "use handle 1" is not an item in a set, it is a state of the
	point you are editing, and a square box with a tick in it says the first
	thing rather than the second.

	The control is a button, so it is 28px like every other control in a
	sidebar row, takes --r-lg like every other button, and says what it does
	through the app's own tooltip rather than through a caption beside it.
 */

/**
 * @param {Object} args
 * @param {String} args.icon - a key in lineIcons, or ready SVG markup
 * @param {String} args.name - the tooltip's first line, and the accessible name
 * @param {String =} args.body - the rest of the tooltip
 * @param {Boolean =} args.pressed - the starting state
 * @param {Boolean =} args.disabled - whether it can be pressed at all
 * @param {String =} args.className - an extra class for the call site
 * @param {Function} args.onToggle - called with the new state
 * @returns {HTMLElement}
 */
export function makeIconToggle({
	icon,
	name,
	body = '',
	pressed = false,
	disabled = false,
	className = '',
	onToggle = () => {},
}) {
	const button = makeElement({
		tag: 'button',
		className: `icon-toggle${className ? ' ' + className : ''}`,
		innerHTML: icon.startsWith('<') ? icon : makeLineIcon(icon, 16),
		attributes: {
			type: 'button',
			'aria-pressed': `${!!pressed}`,
		},
	});

	if (disabled) button.setAttribute('disabled', 'disabled');

	button.addEventListener('click', () => {
		if (button.hasAttribute('disabled')) return;
		const next = button.getAttribute('aria-pressed') !== 'true';
		button.setAttribute('aria-pressed', `${next}`);
		onToggle(next);
	});

	attachTooltip(button, { name: name, body: body });
	return button;
}
