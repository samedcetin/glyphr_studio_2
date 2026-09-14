/**
	MENU BUTTON
	-----------
	A split control: a primary button that does the currently-selected thing,
	and a chevron next to it that opens the list of things it could do instead.
	The pattern every current design tool uses for its toolbar, because it keeps
	a family of related tools in one slot without hiding any of them.

	Rows are real <button> elements with role="menuitemradio". That matters: the
	app's other menu (#context-menu in controls/dialogs) builds rows as divs with
	tabindex and binds click only, so Enter and Space do nothing on them, and its
	rows are display:contents so their focus outline cannot render. Neither
	defect is worth inheriting for a surface this visible.

	Positioning is CSS, not measurement - the menu is an absolutely positioned
	child of a relatively positioned wrapper, opening down by default and up when
	the caller asks. So there are no inline style writes anywhere in this file.
 */

import { makeElement } from '../../common/dom.js';

/** Every open menu, so an outside click or Escape can close all of them. */
const openMenus = new Set();

/**
 * Closes every open menu button. Called from closeEveryTypeOfDialog.
 */
export function closeAllMenuButtons() {
	[...openMenus].forEach((close) => close());
}

let globalListenersAttached = false;

/**
 * Outside-click and Escape are document-level, attached once for all menus
 * rather than once per menu.
 */
function attachGlobalListeners() {
	if (globalListenersAttached) return;
	globalListenersAttached = true;

	document.addEventListener(
		'pointerdown',
		(event) => {
			if (!openMenus.size) return;
			const target = /** @type {Element} */ (event.target);
			if (target && target.closest && target.closest('.menu-button')) return;
			closeAllMenuButtons();
		},
		true
	);

	document.addEventListener('keydown', (event) => {
		if (event.key === 'Escape' && openMenus.size) {
			event.stopPropagation();
			closeAllMenuButtons();
		}
	});
}

/**
 * @typedef {Object} MenuButtonItem
 * @property {String} id - value handed back to onSelect
 * @property {String} name - the row label
 * @property {String} [shortcut] - shown right-aligned, and in the aria-label
 * @property {String} [icon] - SVG markup, drawn in currentColor
 * @property {Boolean} [disabled]
 */

/**
 * Makes a split button with a menu of related items.
 *
 * @param {Object} args
 * @param {Array<MenuButtonItem>} args.items - the menu contents
 * @param {String} args.activeID - which item the face shows to begin with
 * @param {Function} args.onSelect - (id) => void, for both the face and the rows
 * @param {String} [args.groupName] - names the chevron for screen readers
 * @param {String} [args.className] - extra class on the wrapper
 * @param {Boolean} [args.sticky] - selecting a row makes it the new face
 * @param {Boolean} [args.openUp] - open above the button instead of below
 * @param {Function} [args.isFacePressed] - () => Boolean, drives aria-pressed
 * @returns {Object} - { element, setActiveID, refresh }
 */
export function makeMenuButton({
	items = [],
	activeID = '',
	onSelect = () => {},
	groupName = 'options',
	className = '',
	sticky = true,
	openUp = false,
	isFacePressed = () => false,
}) {
	attachGlobalListeners();

	let currentID = activeID || (items[0] && items[0].id) || '';
	let isOpen = false;

	const wrapper = makeElement({
		className: `menu-button${className ? ' ' + className : ''}`,
	});

	const face = makeElement({
		tag: 'button',
		className: 'menu-button__face',
		attributes: { type: 'button' },
	});

	const chevron = makeElement({
		tag: 'button',
		className: 'menu-button__chevron',
		attributes: {
			type: 'button',
			'aria-haspopup': 'menu',
			'aria-expanded': 'false',
			'aria-label': `${groupName} options`,
		},
		innerHTML: `<svg viewBox="0 0 12 12" aria-hidden="true"><path fill="currentColor" d="M2.6 4.4a.75.75 0 0 1 1.06-.04L6 6.53l2.34-2.17a.75.75 0 1 1 1.02 1.1l-2.85 2.64a.75.75 0 0 1-1.02 0L2.64 5.46a.75.75 0 0 1-.04-1.06Z"/></svg>`,
	});

	const menu = makeElement({
		className: `menu-button__menu${openUp ? ' menu-button__menu--up' : ''}`,
		attributes: { role: 'menu', 'aria-label': groupName },
	});
	menu.hidden = true;

	/** @type {Array<HTMLElement>} */
	let rowElements = [];

	function itemByID(id) {
		return items.find((item) => item.id === id);
	}

	/** The face shows the active item, and says what it is. */
	function renderFace() {
		const item = itemByID(currentID) || items[0];
		if (!item) return;
		face.innerHTML = item.icon || '';
		const label = item.shortcut ? `${item.name}  (${item.shortcut})` : item.name;
		face.setAttribute('title', label);
		face.setAttribute('aria-label', label);
		face.setAttribute('aria-pressed', String(isFacePressed()));
		face.classList.toggle('menu-button__face--pressed', isFacePressed());
		if (item.disabled) face.setAttribute('disabled', '');
		else face.removeAttribute('disabled');
	}

	function renderRows() {
		menu.innerHTML = '';
		rowElements = items.map((item) => {
			const row = makeElement({
				tag: 'button',
				className: 'menu-button__row',
				attributes: {
					type: 'button',
					role: 'menuitemradio',
					'aria-checked': String(item.id === currentID),
					tabindex: '-1',
				},
				/*
					No tick column. Every row in one of these menus carries an
					icon already, and a 16px gutter held open on every row so
					that one of them can show a tick sets the whole list in from
					its own edge for the sake of a mark you could make with the
					row itself. The selected row is marked instead - see
					[aria-checked='true'] in the stylesheet. The role and the
					attribute are unchanged, so a screen reader still hears
					which one is chosen.
				*/
				innerHTML: `
					<span class="menu-button__row-icon" aria-hidden="true">${item.icon || ''}</span>
					<span class="menu-button__row-name">${item.name}</span>
					<span class="menu-button__row-key">${item.shortcut || ''}</span>
				`,
			});
			if (item.disabled) row.setAttribute('disabled', '');
			row.addEventListener('click', () => {
				if (item.disabled) return;
				choose(item.id);
			});
			menu.appendChild(row);
			return row;
		});
	}

	function choose(id) {
		if (sticky) currentID = id;
		close();
		renderFace();
		onSelect(id);
	}

	function open() {
		if (isOpen) return;
		closeAllMenuButtons();
		renderRows();
		menu.hidden = false;
		isOpen = true;
		wrapper.classList.add('menu-button--open');
		chevron.setAttribute('aria-expanded', 'true');
		openMenus.add(close);
		const checked = rowElements.find((row) => row.getAttribute('aria-checked') === 'true');
		(checked || rowElements[0])?.focus();
	}

	function close({ returnFocus = false } = {}) {
		if (!isOpen) return;
		menu.hidden = true;
		isOpen = false;
		wrapper.classList.remove('menu-button--open');
		chevron.setAttribute('aria-expanded', 'false');
		openMenus.delete(close);
		if (returnFocus) chevron.focus();
	}

	face.addEventListener('click', () => {
		if (itemByID(currentID)?.disabled) return;
		onSelect(currentID);
	});

	chevron.addEventListener('click', () => {
		if (isOpen) close({ returnFocus: true });
		else open();
	});

	chevron.addEventListener('keydown', (event) => {
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			open();
		}
	});

	/* Arrow keys move within the menu; Escape hands focus back to the chevron. */
	menu.addEventListener('keydown', (event) => {
		const enabled = rowElements.filter((row) => !row.hasAttribute('disabled'));
		if (!enabled.length) return;
		const index = enabled.indexOf(/** @type {HTMLElement} */ (document.activeElement));

		if (event.key === 'ArrowDown') {
			event.preventDefault();
			enabled[(index + 1) % enabled.length].focus();
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			enabled[(index - 1 + enabled.length) % enabled.length].focus();
		} else if (event.key === 'Home') {
			event.preventDefault();
			enabled[0].focus();
		} else if (event.key === 'End') {
			event.preventDefault();
			enabled[enabled.length - 1].focus();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			close({ returnFocus: true });
		} else if (event.key === 'Tab') {
			close();
		}
	});

	wrapper.appendChild(face);
	wrapper.appendChild(chevron);
	wrapper.appendChild(menu);
	renderFace();

	return {
		element: wrapper,
		/**
		 * Moves the face to another item without firing onSelect - for when the
		 * tool changed somewhere else, like a keyboard shortcut.
		 * @param {String} id
		 */
		setActiveID(id) {
			if (!itemByID(id)) return false;
			currentID = id;
			renderFace();
			return true;
		},
		/** Re-reads the face's pressed state and icon. */
		refresh: renderFace,
		/** @returns {String} */
		getActiveID: () => currentID,
	};
}

/**
 * The same popover, opened by one button, holding whatever the caller builds.
 *
 * makeMenuButton above is a split control over a list of items - right for a
 * family of tools, wrong for a panel of buttons. This shares its machinery
 * rather than growing a second one: the same open set, so Escape and an
 * outside click still close everything at once; the same `.menu-button__menu`
 * box, so it is positioned by CSS and sits where a tool menu sits.
 *
 * Content is built on open rather than once, because what these popovers hold
 * depends on what is selected at the moment they are asked for.
 *
 * @param {Object} args
 * @param {String} args.icon - SVG markup for the face
 * @param {String} args.label - accessible name and tooltip
 * @param {Function} args.buildContent - returns the element to show
 * @param {String =} args.className - extra class on the wrapper
 * @param {Boolean =} args.openUp - open above the button
 * @param {Function =} args.isDisabled - asked on every open
 * @returns {Object} - { element, refresh, close }
 */
export function makePopoverButton({
	icon = '',
	label = '',
	buildContent = () => makeElement(),
	className = '',
	openUp = false,
	isDisabled = () => false,
}) {
	attachGlobalListeners();

	let isOpen = false;

	const wrapper = makeElement({
		className: `menu-button menu-button--popover${className ? ' ' + className : ''}`,
	});

	const face = makeElement({
		tag: 'button',
		className: 'menu-button__face',
		innerHTML: icon,
		attributes: {
			type: 'button',
			title: label,
			'aria-label': label,
			'aria-haspopup': 'dialog',
			'aria-expanded': 'false',
		},
	});

	const menu = makeElement({
		className: `menu-button__menu menu-button__menu--popover${
			openUp ? ' menu-button__menu--up' : ''
		}`,
		attributes: { role: 'group', 'aria-label': label },
	});
	menu.hidden = true;

	function open() {
		if (isOpen || isDisabled()) return;
		closeAllMenuButtons();

		menu.innerHTML = '';
		menu.appendChild(buildContent());

		menu.hidden = false;
		isOpen = true;
		wrapper.classList.add('menu-button--open');
		face.setAttribute('aria-expanded', 'true');
		openMenus.add(close);

		/** @type {HTMLElement} */ (menu.querySelector('button:not([disabled])'))?.focus();
	}

	function close({ returnFocus = false } = {}) {
		if (!isOpen) return;
		menu.hidden = true;
		isOpen = false;
		wrapper.classList.remove('menu-button--open');
		face.setAttribute('aria-expanded', 'false');
		openMenus.delete(close);
		if (returnFocus) face.focus();
	}

	face.addEventListener('click', () => {
		if (isOpen) close({ returnFocus: true });
		else open();
	});

	/* Acting on something in here is the end of the errand. */
	menu.addEventListener('click', (event) => {
		if (/** @type {Element} */ (event.target).closest('button')) close();
	});

	menu.addEventListener('keydown', (event) => {
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			close({ returnFocus: true });
		} else if (event.key === 'Tab' && !event.shiftKey) {
			const buttons = [...menu.querySelectorAll('button:not([disabled])')];
			if (document.activeElement === buttons.at(-1)) close();
		}
	});

	wrapper.appendChild(face);
	wrapper.appendChild(menu);

	return {
		element: wrapper,
		/** Reflects a changed disabled state without rebuilding the button. */
		refresh() {
			const off = isDisabled();
			if (off) face.setAttribute('disabled', 'disabled');
			else face.removeAttribute('disabled');
			if (off) close();
		},
		close,
	};
}
