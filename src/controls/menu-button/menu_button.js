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
				innerHTML: `
					<span class="menu-button__check" aria-hidden="true">${
						item.id === currentID
							? `<svg viewBox="0 0 12 12"><path fill="currentColor" d="M10.2 3.3a.75.75 0 0 1 .02 1.06l-4.4 4.6a.75.75 0 0 1-1.08 0L2.28 6.4a.75.75 0 1 1 1.08-1.04l1.92 2 3.86-4.04a.75.75 0 0 1 1.06-.02Z"/></svg>`
							: ''
					}</span>
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
