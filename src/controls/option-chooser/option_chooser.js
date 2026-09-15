import { makeElement } from '../../common/dom.js';
import { closeAllNavMenus } from '../../project_editor/navigator.js';
import { closeAllOptionChoosers, makeContextMenu } from '../dialogs/dialogs.js';
import style from './option-chooser.css?inline';

/**
 * An options group / dropdown control
 * HTML like this:
 *
 * <option-chooser selected-id="first[123, 456]" selected-name="first" selected-prefix="Category:">
 * 		<option note="[123, 456]">first</option>
 * 		<option note="[123, 456]">second</option>
 * 		<option note="[123, 456]">3rd</option>
 * </option-chooser>
 */
export class OptionChooser extends HTMLElement {
	/**
	 * Create an OptionChooser
	 */
	constructor() {
		// log(`OptionChooser.constructor`, 'start');
		super();

		this.disabled = false;

		this.wrapper = makeElement({
			className: 'wrapper',
			tabIndex: !this.disabled,
		});
		// @ts-expect-error 'property does exist'
		this.wrapper.elementRoot = this;

		// this.options = makeElement({ tag: 'slot', className: 'options' });
		// this.selectionDisplay.innerHTML = displayText;

		this.selectionDisplay = makeElement({
			className: 'selection-display',
			attributes: { tabIndex: -1 },
			innerHTML: this.getDisplayName(),
		});
		// @ts-expect-error 'property does exist'
		this.selectionDisplay.elementRoot = this;

		this.downArrow = makeElement({
			className: 'downArrow',
			/* The same chevron the breadcrumb and the toolbar draw, on
				currentColor so it takes the control's state with it. */
			content: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6.5 8 10l4-3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
			attributes: { tabIndex: -1 },
		});
		// @ts-expect-error 'property does exist'
		this.downArrow.elementRoot = this;

		// Put it all together
		let shadow = this.attachShadow({ mode: 'open' });
		let styles = makeElement({ tag: 'style', innerHTML: style });
		shadow.appendChild(styles);

		this.wrapper.appendChild(this.selectionDisplay);
		this.wrapper.appendChild(this.downArrow);

		if (!this.disabled) this.addAllEventListeners();
		shadow.appendChild(this.wrapper);

		// log(this);
		// log(`OptionChooser.constructor`, 'end');
	}

	/**
	 * Specify which attributes are observed and trigger attributeChangedCallback
	 */
	static get observedAttributes() {
		return ['disabled', 'selected-id', 'selected-name', 'deployed'];
	}

	/**
	 * Initialize the component once it's being used
	 */
	connectedCallback() {
		// log(`OptionChooser.connectedCallback`, 'start');
		if (this.disabled) this.wrapper.setAttribute('disabled', '');
		// log(`OptionChooser.connectedCallback`, 'end');
	}

	/**
	 * Listens for attribute changes on this element
	 * @param {String} attributeName - which attribute was changed
	 * @param {String} oldValue - value before the change
	 * @param {String} newValue - value after the change
	 */
	attributeChangedCallback(attributeName, oldValue, newValue) {
		// log(`OptionChooser.attributeChangedCallback`, 'start');
		// log(`Attribute ${attributeName} was ${oldValue}, is now ${newValue}`);

		if (attributeName === 'disabled') {
			if (newValue === '') {
				// disabled
				this.wrapper.setAttribute('disabled', '');
				this.wrapper.removeAttribute('tabIndex');
				this.removeAllEventListeners();
			} else if (oldValue === '') {
				// enabled
				this.wrapper.removeAttribute('disabled');
				this.wrapper.setAttribute('tabIndex', '0');
				this.addAllEventListeners();
			}
		}
		if (attributeName === 'deployed') {
			if (newValue === '') {
				// deployed
				this.wrapper.setAttribute('deployed', '');
			} else if (oldValue === '') {
				// closed
				this.wrapper.removeAttribute('deployed');
			}
		}

		if (attributeName === 'selected-id') {
			this.dispatchEvent(new Event('change'));
		}

		if (attributeName === 'selected-name') {
			this.selectionDisplay.innerHTML = this.getDisplayName();
		}

		// log(`OptionChooser.attributeChangedCallback`, 'end');
	}

	/**
	 * Figures out the name to display in the entry point
	 * @returns {String}
	 */
	getDisplayName() {
		let displayText = this.getAttribute('selected-name');
		if (!displayText) return '';

		let prefix = this.getAttribute('selected-prefix');
		// log(`prefix: ${prefix}`);

		if (prefix) displayText = `<span class="prefix">${prefix}</span> ${displayText}`;
		// log(`displayText: ${displayText}`);
		displayText = displayText.replace(/ /gi, '&nbsp;');
		return displayText;
	}

	/**
	 * Shows the dropdown part of the control
	 */
	showOptions() {
		// log(`OptionsChooser.showOptions`, 'start');

		const currentSelection = this.getAttribute('selected-id');
		let optionRows = [];
		[...this.children].forEach((/** @type {HTMLElement} */ child) => {
			let tag = child.tagName.toLowerCase();
			if (tag === 'option') {
				let note = child.getAttribute('note') || '';
				let selectionID = `${child.innerText}${note ? ` ${note}` : ''}`;
				if (child.getAttribute('selection-id')) selectionID = child.getAttribute('selection-id');
				optionRows.push({
					name: child.innerHTML,
					/*
						Marked, not ticked. Every row used to carry an icon -
						a check on the chosen one and an empty square on all the
						rest - so a list of twelve options was a column of eleven
						empty boxes. The chosen row takes the accent the way the
						toolbar's tool menus mark theirs.
					*/
					selected: currentSelection === selectionID,
					id: selectionID,
					note: note,
					onClick: () => {
						this.setAttribute('selected-id', selectionID);
						this.setAttribute('selected-name', child.innerText.trim());
						child.dispatchEvent(new Event('click'));
					},
				});
			} else if (tag === 'hr') {
				optionRows.push({ name: 'hr' });
			}
		});

		/*
			Placed against the window, and hung on #app__wrapper.

			It used to be inserted next to the chooser itself, which puts an
			absolutely positioned menu inside whatever panel or card happens to
			be positioned nearby - so the viewport coordinates measured here
			were resolved against that ancestor's corner. There was a correction
			for exactly one case, the character chooser's nav dropdown, and
			everywhere else the menu landed wherever the arithmetic happened to
			put it: opening the transform-origin chooser in a 300px sidebar sent
			its options 1300px to the right, on the far side of the window.

			#app__wrapper starts at the window's top left and does not scroll,
			so the measurements land where they were taken.
		*/
		const entryPointRect = this.getBoundingClientRect();
		const gap = 4;
		const left = Math.max(Math.round(entryPointRect.left), gap);
		const top = Math.round(entryPointRect.bottom + gap);
		const maxHeight = Math.max(window.innerHeight - top - 16, 120);

		closeAllOptionChoosers();
		closeAllNavMenus(true);
		this.setAttribute('deployed', '');

		const menu = makeContextMenu(
			optionRows,
			left,
			top,
			Math.round(entryPointRect.width),
			maxHeight,
			true
		);
		(document.querySelector('#app__wrapper') || document.body).appendChild(menu);

		/*
			Open on what is already chosen. A twelve-row list that always starts
			at the top makes you find your own current value before you can see
			what is near it.
		*/
		const current = menu.querySelector('.context-menu-row[selected]');
		if (current) current.scrollIntoView({ block: 'nearest' });

		// log(`OptionsChooser.showOptions`, 'end');
	}

	/**
	 * Add all event listeners to elements
	 */
	addAllEventListeners() {
		// log('addAllEventListeners');
		this.addEventListener('click', this.showOptions);
		this.addEventListener('keydown', this.keyboardPress);
	}

	/**
	 * Add all event listeners to elements
	 */
	removeAllEventListeners() {
		// log('removeAllEventListeners');
		this.removeEventListener('click', this.showOptions);
		this.removeEventListener('keydown', this.keyboardPress);
	}

	/**
	 * Handle keypress event
	 *
	 * This was a switch on the deprecated numeric key codes 40, 98 and 109 -
	 * arrow down, numpad 2 and numpad minus - with no Enter and no Space. So
	 * the control was a tab stop you could reach and could not open: the two
	 * keys a person actually presses on a focused control did nothing, and the
	 * two numpad values were whatever the original author's keyboard happened
	 * to send. The numeric codes do not survive a non-US layout either.
	 *
	 * @param {KeyboardEvent} ev - event
	 */
	keyboardPress(ev) {
		if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'ArrowDown') {
			/* Space scrolls the page otherwise, and Enter submits a form. */
			ev.preventDefault();
			this.showOptions();
		}
	}
}
