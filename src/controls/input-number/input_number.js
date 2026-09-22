import { makeElement } from '../../common/dom.js';
import { attachTooltip } from '../tooltip/tooltip.js';
import { hasLineIcon, makeLineIcon } from '../../common/icons.js';
import { cancelDefaultEventActions } from '../../edit_canvas/events.js';
import style from './input-number.css?inline';

/**
 * A numeric input field, with up/down arrows for increment/decrement
 */
export class InputNumber extends HTMLElement {
	constructor() {
		// log(`InputNumber.constructor`, 'start');
		super();

		this.elementRoot = {};
		const isDisabled = this.hasAttribute('disabled');

		// this.wrapper = makeElement({ className: 'wrapper' });
		// this.wrapper.elementRoot = this;
		// this.wrapper.style.borderWidth = attributes.hideBorder ? '0px' : '1px';

		// Input element
		this.numberInput = makeElement({
			tag: 'input',
			className: 'numberInput',
			tabIndex: !isDisabled,
			attributes: { type: 'text', value: this.sanitizeValue(this.getAttribute('value')) },
		});
		// @ts-expect-error 'property does exist'
		this.numberInput.elementRoot = this;

		/*
			The field, holding the input and whatever says what it is.

			`prefix` is an icon name or a character or two - "X", "W", an angle
			mark - and `suffix` is the unit. Both are Figma's idiom, and the app
			can afford them where it cannot afford a label: a glyph inside the
			field costs nothing, a label above it costs a whole row of the panel.

			They live in a box with the input because they have to read as one
			control. The border and the corner moved here from the input for the
			same reason.
		*/
		this.field = makeElement({ className: 'field' });
		this.field.appendChild(this.numberInput);

		/* An affix is part of the field, so clicking one lands in the field. */
		this.field.addEventListener('mousedown', (event) => {
			if (event.target === this.numberInput) return;
			event.preventDefault();
			this.numberInput.focus();
		});

		// Arrows
		this.arrowWrapper = makeElement({
			className: 'arrowWrapper',
			tabIndex: !isDisabled,
		});
		// @ts-expect-error 'property does exist'
		this.arrowWrapper.elementRoot = this;

		const arrowSeparator = makeElement({
			className: 'arrowSeparator',
		});

		this.upArrow = makeElement({
			className: 'arrow upArrow',
			innerHTML: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10"><polygon points="6.5 7 13.5 7 10 3.5 6.5 7"/></svg>`,
			attributes: { tabIndex: -1 },
		});
		// @ts-expect-error 'property does exist'
		this.upArrow.elementRoot = this;

		this.downArrow = makeElement({
			className: 'arrow downArrow',
			innerHTML: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10"><polygon points="13.5 3 6.5 3 10 6.5 13.5 3"/></svg>`,
			attributes: { tabIndex: -1 },
		});
		// @ts-expect-error 'property does exist'
		this.downArrow.elementRoot = this;

		// Lock
		this.iconLocked = `
			<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
			<path d="m11,4h-2c-1.66,0-3,1.34-3,3v8c0,1,1,2,2,2h4c1,0,2-1,2-2V7c0-1.66-1.34-3-3-3Zm-.5,11h-1v-3h1v3Zm-3.5-5v-3c0-1.1.9-2,2-2h2c1.1,0,2,.9,2,2v3h-6Z"/>
			</svg>
		`;

		this.iconUnlocked = `
			<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
			<path d="m14,7v-1c0-1.66-1.34-3-3-3h-2c-1.66,0-3,1.34-3,3v9c0,1,1,2,2,2h4c1,0,2-1,2-2v-5h-7v-4c0-1.1.9-2,2-2h2c1.1,0,2,.9,2,2v1h1Zm-1,4v5h-6v-5h6Z"/>
			</svg>
		`;

		this.padlock = makeElement({
			className: 'lock',
			attributes: { tabIndex: 0 },
			content: this.iconUnlocked,
		});
		// @ts-expect-error 'property does exist'
		this.padlock.elementRoot = this;

		// Put it all together
		let shadow = this.attachShadow({ mode: 'open' });
		let styles = makeElement({ tag: 'style', innerHTML: style });
		shadow.appendChild(styles);

		this.arrowWrapper.appendChild(this.upArrow);
		this.arrowWrapper.appendChild(arrowSeparator);
		this.arrowWrapper.appendChild(this.downArrow);

		/*
			Bound, because two of these listen on window rather than on an element
			inside this component - the pointer leaves the field the moment the drag
			starts - so the elementRoot back-reference the other handlers use is not
			available to them.
		*/
		this.scrubStart = this.scrubStart.bind(this);
		this.scrubMove = this.scrubMove.bind(this);
		this.scrubEnd = this.scrubEnd.bind(this);
		/** @type {Object | false} */
		this.scrub = false;

		shadow.appendChild(this.field);
		shadow.appendChild(this.arrowWrapper);
		shadow.appendChild(this.padlock);

		if (isDisabled) {
			this.numberInput.setAttribute('disabled', '');
			this.setAttribute('disabled', '');
		} else {
			this.addAllEventListeners();
		}

		// log(this);
		// log(`InputNumber.constructor`, 'end');
	}

	/**
	 * Specify which attributes are observed and trigger attributeChangedCallback
	 */
	static get observedAttributes() {
		return ['disabled', 'value', 'locked', 'unlocked'];
	}

	/**
	 * Put the prefix and suffix in the field, if this one has them.
	 *
	 * Here rather than in the constructor because a custom element's
	 * constructor runs at createElement time, before anything has had a chance
	 * to set an attribute on it - so `prefix` was always null there.
	 */
	buildAffixes() {
		if (this.affixesBuilt) return;
		this.affixesBuilt = true;

		const prefix = this.getAttribute('prefix');
		if (prefix) {
			this.field.insertBefore(
				makeElement({
					className: 'affix prefix',
					content: hasLineIcon(prefix) ? makeLineIcon(prefix, 14) : prefix,
				}),
				this.numberInput
			);
		}

		const suffix = this.getAttribute('suffix');
		if (suffix) {
			this.field.appendChild(makeElement({ className: 'affix suffix', content: suffix }));
		}
	}

	/**
	 * Initialize the component once it's being used
	 */
	connectedCallback() {
		// log(`InputNumber.connectedCallback`, 'start');

		this.buildAffixes();

		/*
			has-lock is the whole story: it shows the padlock and squares off the
			arrows' right corners, the padlock being the control's right-hand end.
			The corner used to be done here, inline, and only on one of the two
			branches - so a locked input had a rounded corner in the middle of
			itself with the padlock butted up against it. Showing the padlock was
			an inline display: block, which fought the flex centring its icon
			needs.
		*/
		if (this.getAttribute('is-locked') === 'true') {
			this.setAttribute('has-lock', '');
			this.setToLocked(true);
		}

		if (this.getAttribute('is-locked') === 'false') {
			this.setAttribute('has-lock', '');
			this.setToUnlocked(true);
		}

		this.padlock.addEventListener('click', () => {
			// log(`InputNumber.padlock Click handler`, 'start');

			// log(this.padlock);
			// Toggle the lock state
			if (this.getAttribute('is-locked') === 'true') {
				this.setToUnlocked();
			} else {
				this.setToLocked();
			}

			// log(`InputNumber.padlock Click handler`, 'end');
		});
		this.padlock.addEventListener('keydown', this.lockButtonKeyboardPress);

		if (this.hasAttribute('disabled')) {
			this.setToDisabled();
		}
		this.attachDragHint();

		// log(`InputNumber.connectedCallback`, 'end');
	}

	/**
	 * Say that the field can be dragged, in the one place it costs nothing.
	 *
	 * The gesture is deliberately invisible - no cursor on hover, no handle -
	 * so it needs somewhere to announce itself, and a tooltip is where this app
	 * already puts that kind of sentence. It appears exactly when someone is
	 * pointing at the field wondering what it does.
	 *
	 * It also moves these fields off the OS tooltip. Three of them carried a
	 * native title - advance width and the two side bearings - which arrived a
	 * second late, in an OS font, under everything else the app draws.
	 */
	attachDragHint() {
		if (this.hasAttribute('disabled')) return;

		const title = (this.getAttribute('title') || '').trim();
		const [first, ...rest] = title.split(String.fromCharCode(10));

		/*
			A field that says what it is keeps saying it, and the hint is the
			second line. A field that does not - most of them carry a prefix mark
			instead - makes the hint the heading, and then the second line has to
			add something rather than repeat it.
		*/
		attachTooltip(this, {
			name: first || 'Drag to change',
			body: first
				? [rest.join(' ').trim(), 'Drag left or right to change it. Hold Shift for tens.']
						.filter(Boolean)
						.join(' ')
				: 'A pixel is one unit. Hold Shift for tens.',
		});

		/* Or the OS would draw its own on top of this one a second later. */
		if (title) {
			if (!this.getAttribute('aria-label')) this.setAttribute('aria-label', title);
			this.removeAttribute('title');
		}
	}

	/**
	 * Listens for attribute changes on this element
	 * @param {String} attributeName - which attribute was changed
	 * @param {String} oldValue - value before the change
	 * @param {String} newValue - value after the change
	 */
	attributeChangedCallback(attributeName, oldValue, newValue) {
		// log(`InputNumber.attributeChangedCallback`, 'start');
		// log(`for < ${this.getAttribute('class')} >`);
		// log(`Attribute ${attributeName} was ${oldValue}, is now ${newValue}`);

		if (attributeName === 'value') {
			// log(`setting internal numberInput. PRE  ${this.numberInput.getAttribute('value')}`);
			this.numberInput.setAttribute('value', newValue);
			this.value = newValue;
			// @ts-expect-error 'property does exist'
			this.numberInput.value = newValue;
			// log(`setting internal numberInput. POST ${this.numberInput.getAttribute('value')}`);
		}

		if (attributeName === 'is-locked') {
			if (newValue === 'true') {
				// locked
				this.setToLocked();
			} else if (oldValue === '') {
				// unlocked
				this.setToUnlocked();
			}
		}

		if (attributeName === 'disabled') {
			if (newValue === '') {
				// disabled
				this.setToDisabled();
			} else if (oldValue === '') {
				// enabled
				this.setToEnabled();
			}
		}

		// log(`InputNumber.attributeChangedCallback`, 'end');
	}

	/**
	 * Set to locked
	 * @param {Boolean} internalEvent - If there isn't an internal event, dispatch a custom one
	 */
	setToLocked(internalEvent = false) {
		// log(`InputNumber.setToLocked`, 'start');
		this.setAttribute('is-locked', 'true');
		this.padlock.setAttribute('selected', '');
		this.setToDisabled();
		this.padlock.innerHTML = this.iconLocked;
		if (!internalEvent) {
			this.dispatchEvent(new CustomEvent('lock', { detail: { isLocked: true } }));
		}
		// log(`InputNumber.setToLocked`, 'end');
	}

	/**
	 * Set to unlocked
	 * @param {Boolean} internalEvent - If there isn't an internal event, dispatch a custom one
	 */
	setToUnlocked(internalEvent = false) {
		// log(`InputNumber.setToUnlocked`, 'start');
		this.setAttribute('is-locked', 'false');
		this.padlock.removeAttribute('selected');
		this.setToEnabled();
		this.padlock.innerHTML = this.iconUnlocked;
		if (!internalEvent) {
			this.dispatchEvent(new CustomEvent('lock', { detail: { isLocked: false } }));
		}
		// log(`InputNumber.setToUnlocked`, 'end');
	}

	/**
	 * Set to disabled
	 */
	setToDisabled() {
		// log(`InputNumber.setToDisabled`, 'start');
		this.numberInput.setAttribute('disabled', '');
		this.numberInput.removeAttribute('tabIndex');
		this.arrowWrapper.setAttribute('disabled', '');
		this.arrowWrapper.removeAttribute('tabIndex');
		this.removeAllEventListeners();
		// log(`InputNumber.setToDisabled`, 'end');
	}

	/**
	 * Set to enabled
	 */
	setToEnabled() {
		// log(`InputNumber.setToEnabled`, 'start');
		this.numberInput.removeAttribute('disabled');
		this.numberInput.setAttribute('tabIndex', '0');
		this.arrowWrapper.removeAttribute('disabled');
		this.arrowWrapper.setAttribute('tabIndex', '0');
		this.addAllEventListeners();
		// log(`InputNumber.setToEnabled`, 'end');
	}

	/**
	 * Add all event listeners to this control
	 */
	addAllEventListeners() {
		// log('addAllEventListeners');
		this.field.addEventListener('pointerdown', this.scrubStart);
		this.upArrow.addEventListener('click', this.increment);
		this.downArrow.addEventListener('click', this.decrement);
		this.arrowWrapper.addEventListener('keydown', this.arrowButtonsKeyboardPressed);
		this.numberInput.addEventListener('change', this.numberInputChanged);
		this.numberInput.addEventListener('keydown', this.numberInputKeyboardPress);
	}

	/**
	 * Remove all event listeners from this control
	 */
	removeAllEventListeners() {
		// log('removeAllEventListeners');
		this.field.removeEventListener('pointerdown', this.scrubStart);
		this.upArrow.removeEventListener('click', this.increment);
		this.downArrow.removeEventListener('click', this.decrement);
		this.arrowWrapper.removeEventListener('keydown', this.arrowButtonsKeyboardPressed);
		this.numberInput.removeEventListener('change', this.numberInputChanged);
		this.numberInput.removeEventListener('keydown', this.numberInputKeyboardPress);
		// this.arrowWrapper.removeEventListener('mouseout', (event) => {
		// log(event);
		// });
	}

	/**
	 * Push whatever is currently typed into the field through sanitize and
	 * commit it, the way blurring the field does.
	 *
	 * A panel that acts on Enter needs this: the host attribute only catches
	 * up on change, which fires on blur, so without it Enter would act on
	 * the previous value rather than the one on screen.
	 *
	 * @returns {Number} the committed value
	 */
	commit() {
		// @ts-expect-error 'value does exist on the internal input'
		this.updateToNewValue(this.sanitizeValue(this.numberInput.value));
		return Number(this.getAttribute('value'));
	}

	/**
	 * Make sure new values are good
	 * @param {Number | String} input - new value
	 */
	sanitizeValue(input) {
		let newValue = Number(input) || 0;
		// if (this.precision) newValue = round(newValue, this.precision);
		return newValue;
	}

	/**
	 * Update all the internal stuff to reflect a new value
	 */
	updateToNewValue(newValue, dispatch = true) {
		// log(`updateToNewValue`, 'start');
		// log(`newValue: ${newValue}`);
		this.setAttribute('value', newValue);
		this.value = newValue;
		if (dispatch) this.dispatchEvent(new Event('change'));
		// @ts-expect-error 'property does exist'
		this.numberInput.value = newValue;
		// log(`updateToNewValue`, 'end');
	}

	/**
	 * Handle onChange event
	 */
	numberInputChanged(ev) {
		// log(`InputNumber.numberInputChanged`, 'start');
		// log(`for < ${this.elementRoot.getAttribute('class')} >`);
		let newValue = this.elementRoot.sanitizeValue(ev.target.value);
		this.elementRoot.updateToNewValue(newValue);
		// log(`InputNumber.numberInputChanged`, 'end');
	}

	/**
	 * Drag the field sideways to change the number.
	 *
	 * The steppers are for one step at a time and for the keyboard. Getting
	 * from 40 to 400 through them is three hundred and sixty clicks, which is
	 * what every other design tool solved by making the field itself a
	 * scrubber - Blender, After Effects and Figma all do this.
	 *
	 * It stays invisible. No cursor change on hover, no handle: a click still
	 * puts the caret where you clicked, and the drag only takes over once the
	 * pointer has moved past a threshold, so selecting the text still works.
	 * The resize cursor appears only once it has.
	 *
	 * @param {PointerEvent} ev
	 */
	scrubStart(ev) {
		if (ev.button !== 0 || this.numberInput.hasAttribute('disabled')) return;

		this.scrub = {
			startX: ev.clientX,
			startValue: parseFloat(this.getAttribute('value')) || 0,
			active: false,
			pointerId: ev.pointerId,
			frame: 0,
		};

		window.addEventListener('pointermove', this.scrubMove);
		window.addEventListener('pointerup', this.scrubEnd);
		window.addEventListener('pointercancel', this.scrubEnd);
	}

	/**
	 * @param {PointerEvent} ev
	 */
	scrubMove(ev) {
		const scrub = this.scrub;
		if (!scrub || ev.pointerId !== scrub.pointerId) return;

		const distance = ev.clientX - scrub.startX;

		/*
			Three pixels of slack before this becomes a drag. Under that it is a
			click, and a click has to keep working: it places the caret, and two
			of them select a word.
		*/
		if (!scrub.active) {
			if (Math.abs(distance) < 3) return;
			scrub.active = true;
			this.setAttribute('scrubbing', '');
			this.numberInput.blur();
		}

		ev.preventDefault();

		/*
			The same steps the arrows take, so the two agree: a pixel is one, and
			a modifier makes it ten. A font has four-digit coordinates, so the
			modifier is what makes a long distance reachable in one gesture.
		*/
		const step = ev.shiftKey || ev.ctrlKey || ev.altKey || ev.metaKey ? 10 : 1;
		const next = this.sanitizeValue(scrub.startValue + Math.round(distance) * step);

		/*
			One commit per frame. updateToNewValue dispatches change, and a change
			on one of these can redraw the canvas or rebuild a panel - at raw
			pointermove rate that is several times more work than the screen can
			show.
		*/
		scrub.pending = next;
		if (scrub.frame) return;
		scrub.frame = window.requestAnimationFrame(() => {
			scrub.frame = 0;
			if (this.scrub) this.updateToNewValue(this.scrub.pending);
		});
	}

	/**
	 * @param {PointerEvent} ev
	 */
	scrubEnd(ev) {
		const scrub = this.scrub;
		if (!scrub || ev.pointerId !== scrub.pointerId) return;

		/*
			Flush, do not cancel. The last pointermove of a drag usually lands in the
			same frame as the pointerup, so cancelling the pending commit threw away
			the end of the gesture - a drag of ninety pixels stopped at forty-five.
		*/
		if (scrub.frame) window.cancelAnimationFrame(scrub.frame);
		if (scrub.active && scrub.pending !== undefined) this.updateToNewValue(scrub.pending);

		this.scrub = false;
		this.removeAttribute('scrubbing');

		window.removeEventListener('pointermove', this.scrubMove);
		window.removeEventListener('pointerup', this.scrubEnd);
		window.removeEventListener('pointercancel', this.scrubEnd);
	}

	/**
	 * Increment the value
	 * @param {Object} ev - event
	 */
	increment(ev) {
		// log(`InputNumber.increment`, 'start');
		// log(`for < ${this.elementRoot.getAttribute('class')} >`);
		let mod = ev.shiftKey || ev.ctrlKey || ev.altKey || ev.metaKey;
		let currentValue = parseFloat(this.elementRoot.getAttribute('value'));
		let newValue = this.elementRoot.sanitizeValue((currentValue += mod ? 10 : 1));
		this.elementRoot.updateToNewValue(newValue);
		// log(`InputNumber.increment`, 'end');
	}

	/**
	 * Decrement the value
	 * @param {Object} ev - event
	 */
	decrement(ev) {
		// log(`InputNumber.decrement`, 'start');
		// log(`for < ${this.elementRoot.getAttribute('class')} >`);
		let mod = ev.shiftKey || ev.ctrlKey || ev.altKey || ev.metaKey;
		let currentValue = parseFloat(this.elementRoot.getAttribute('value'));
		let newValue = this.elementRoot.sanitizeValue((currentValue -= mod ? 10 : 1));
		this.elementRoot.updateToNewValue(newValue);
		// log(`InputNumber.decrement`, 'end');
	}

	/**
	 * Detects if a key should increment
	 * @param {Number} keyCode - what key was pressed
	 * @returns {Boolean}
	 */
	isIncrement(keyCode, includeTenKey = true) {
		if (keyCode === 38) return true; // d-pad up
		if (keyCode === 39) return true; // d-pad right
		if (keyCode === 102 && includeTenKey) return true; // ten key right
		if (keyCode === 104 && includeTenKey) return true; // ten key up
		if (keyCode === 107 && includeTenKey) return true; // ten key +
		return false;
	}

	/**
	 * Detects if a key should decrement
	 * @param {Number} keyCode - what key was pressed
	 * @returns {Boolean}
	 */
	isDecrement(keyCode, includeTenKey = true) {
		if (keyCode === 37) return true; // d-pad left
		if (keyCode === 40) return true; // d-pad down
		if (keyCode === 98 && includeTenKey) return true; // ten key down
		if (keyCode === 100 && includeTenKey) return true; // ten key left
		if (keyCode === 109 && includeTenKey) return true; // ten key -
		return false;
	}

	/**
	 * Handle keypress event
	 * @param {Object} ev - event
	 */
	arrowButtonsKeyboardPressed(ev) {
		let click = new MouseEvent('click', {
			shiftKey: ev.shiftKey,
			ctrlKey: ev.ctrlKey,
			altKey: ev.altKey,
			metaKey: ev.metaKey,
		});

		if (this.elementRoot.isIncrement(ev.keyCode)) {
			cancelDefaultEventActions(ev);
			this.elementRoot.upArrow.dispatchEvent(click);
		}

		if (this.elementRoot.isDecrement(ev.keyCode)) {
			cancelDefaultEventActions(ev);
			this.elementRoot.downArrow.dispatchEvent(click);
		}
	}

	/**
	 * Handle keypress event
	 * @param {Object} ev - event
	 */
	numberInputKeyboardPress(ev) {
		let click = new MouseEvent('click', {
			shiftKey: ev.shiftKey,
			ctrlKey: ev.ctrlKey,
			altKey: ev.altKey,
			metaKey: ev.metaKey,
		});

		const noModifier = ev.shiftKey && ev.ctrlKey && ev.altKey && ev.metaKey;

		if (this.elementRoot.isIncrement(ev.keyCode, false)) {
			cancelDefaultEventActions(ev);
			this.elementRoot.upArrow.dispatchEvent(click);
		} else if (this.elementRoot.isDecrement(ev.keyCode, false)) {
			cancelDefaultEventActions(ev);
			this.elementRoot.downArrow.dispatchEvent(click);
		} else if (noModifier) {
			this.elementRoot.numberInputChanged(ev);
		}
	}

	/**
	 * Handle lock keypress event
	 * @param {Object} ev - event
	 */
	lockButtonKeyboardPress(ev) {
		let click = new MouseEvent('click', {
			shiftKey: ev.shiftKey,
			ctrlKey: ev.ctrlKey,
			altKey: ev.altKey,
			metaKey: ev.metaKey,
		});

		switch (ev.keyCode) {
			case 13: // enter
			case 32: // space
			case 37: // d-pad left
			case 38: // d-pad up
			case 39: // d-pad right
			case 40: // d-pad down
				cancelDefaultEventActions(ev);
				this.elementRoot.padlock.dispatchEvent(click);
				break;

			default:
				break;
		}
	}
}
