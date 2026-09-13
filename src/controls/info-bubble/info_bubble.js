import { makeElement } from '../../common/dom.js';
import { animateRemove, closeAllInfoBubbles } from '../dialogs/dialogs.js';
import bubbleStyle from './info-bubble-popup.css?inline';
import style from './info-bubble.css?inline';

/**
 * A small bubble that displays information
 * about a target UI element
 */
export class InfoBubble extends HTMLElement {
	/**
	 * Create an InfoBubble
	 */
	constructor() {
		super();

		let wrapper = makeElement({ className: 'wrapper', tabIndex: true });
		this.entryPoint = makeElement({ id: 'entryPoint', content: '?' });

		// Put together visible stuff
		let shadow = this.attachShadow({ mode: 'open' });
		let styles = makeElement({ tag: 'style', innerHTML: style });
		shadow.appendChild(styles);

		wrapper.appendChild(this.entryPoint);
		shadow.appendChild(wrapper);

		// Event listeners
		this.addEventListener('click', this.toggle);
		this.addEventListener('keydown', this.keyPress);
	}

	/**
	 * Toggle the bubble
	 */
	toggle() {
		if (document.querySelector('#bubble')) this.hide(this.entryPoint);
		else this.show();
	}

	/**
	 * Show the bubble
	 */
	show() {
		// log(`info-bubble show`, 'start');
		closeAllInfoBubbles();
		// put together bubble stuff
		// log(`Making bubble...`);
		let bubble = makeElement({
			id: 'bubble',
		});
		let bubbleStyles = makeElement({ tag: 'style', innerHTML: bubbleStyle });
		bubble.appendChild(bubbleStyles);

		// log(`Making content...`);
		let content = makeElement({
			innerHTML: this.innerHTML,
			className: 'content',
		});
		let bubbleWidth = this.getAttribute('bubble-width');
		// log(`bubbleWidth: ${bubbleWidth}`);
		if (bubbleWidth) content.setAttribute('style', `width: ${bubbleWidth};`);

		bubble.appendChild(content);
		content.addEventListener('mouseleave', () => this.hide(this.entryPoint));

		// Add and show bubble
		document.body.appendChild(bubble);

		/*
			Placed against the window, not just next to the mark.

			It used to open to the right of its "?" and clamp at zero, which
			handles running off the top or the left - neither of which happens -
			and does nothing about running off the right, which is where every
			one of these lives: the far edge of the Properties panel. A 360px
			bubble opened from a control 40px from the window's edge spent 320px
			of itself outside it. Now it flips to the other side when there is
			no room, and is held inside the window on both axes either way.
		*/
		const gap = 8;
		const entryPointRect = this.entryPoint.getBoundingClientRect();
		const bubbleRect = bubble.getBoundingClientRect();
		const limitRight = window.innerWidth - bubbleRect.width - gap;
		const limitBottom = window.innerHeight - bubbleRect.height - gap;

		let left = entryPointRect.right + gap;
		if (left > limitRight) left = entryPointRect.left - bubbleRect.width - gap;
		left = Math.min(Math.max(left, gap), Math.max(limitRight, gap));

		let top = entryPointRect.top + entryPointRect.height / 2 - bubbleRect.height / 2;
		top = Math.min(Math.max(top, gap), Math.max(limitBottom, gap));

		// log(`showing bubble at ${left} / ${top}`);
		// log(this.entryPoint);
		bubble.style.left = `${left}px`;
		bubble.style.top = `${top}px`;

		// State on an attribute, so the open look lives in the stylesheet.
		this.entryPoint.setAttribute('open', '');
		this.entryPoint.innerHTML = '✕';

		// log(`info-bubble show`, 'end');
	}

	/**
	 * Hide the bubble
	 * @param {HTMLElement} entryPoint
	 */
	hide(entryPoint) {
		// log(`info-bubble hide`, 'start');
		// log(this);
		// log(entryPoint);
		/** @type {HTMLElement} */
		let bubble = document.querySelector('#bubble');
		animateRemove(bubble, 120, 0.98, '0px');
		// document.body.removeChild(bubble);
		// log(`bubble has been removed`);

		entryPoint.removeAttribute('open');
		entryPoint.innerHTML = '?';
		entryPoint.blur();
		// log(`info-bubble hide`, 'end');
	}

	/**
	 * Handle keypress event
	 * @param {Object} ev - event
	 */
	keyPress(ev) {
		switch (ev.keyCode) {
			case 13: // enter
			case 37: // d-pad left
			case 39: // d-pad right
			case 98: // ten key down
			case 102: // ten key right
			case 104: // ten key up
			case 107: // ten key +
			case 109: // ten key -
			case 100: // ten key left
				this.dispatchEvent(new Event('click'));
				break;

			default:
				break;
		}
	}
}
