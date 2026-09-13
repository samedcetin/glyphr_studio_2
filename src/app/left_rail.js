/**
	LEFT RAIL
	---------
	The app's one piece of persistent chrome, down the left edge: the app mark,
	the three shell menus, the pages, and the two workspace switches at the
	bottom.

	It replaces a full-width top bar. A horizontal bar spends a whole row of the
	window on nine items and their labels; a rail spends a 56px column, and the
	row it gives back is canvas. It is also where every current design tool puts
	this, so it is where a hand goes looking.

	Everything in it is an icon with a tooltip and an aria-label. That is a real
	trade - a label teaches faster than an icon does - which is why the command
	palette stays one click away at the bottom of the rail: it is the searchable
	index of everything the icons stand for.
 */

import { makeElement } from '../common/dom.js';
import { makeLineIcon } from '../common/icons.js';
import { showCommandPalette } from '../controls/command-palette/command_palette.js';
import { navigateToPage } from '../project_editor/navigator.js';
import { getCurrentProjectEditor } from './main.js';
import { makeMenu, makeThemeToggle } from './menu.js';

/** Shell menus, in the order they were in the old top bar. */
const RAIL_MENUS = [
	{ name: 'File', icon: 'menu_file' },
	{ name: 'Projects', icon: 'menu_projects' },
	{ name: 'Help', icon: 'menu_help' },
];

/**
 * Builds the rail.
 * @returns {Element}
 */
export function makeLeftRail() {
	const rail = makeElement({
		tag: 'nav',
		id: 'app__left-rail',
		attributes: { 'aria-label': 'Main' },
	});

	rail.appendChild(makeRailMark());
	rail.appendChild(makeRailGroup(RAIL_MENUS.map(makeRailMenuButton)));
	rail.appendChild(makeElement({ className: 'left-rail__divider' }));

	const pages = makeRailPageButtons();
	if (pages.length) {
		rail.appendChild(makeRailGroup(pages));
	}

	/* Pushes the two workspace switches to the bottom of the column. */
	rail.appendChild(makeElement({ className: 'left-rail__spacer' }));
	rail.appendChild(makeRailGroup([makeRailSearchButton(), makeRailThemeToggle()]));

	return rail;
}

/**
 * @param {Array<Element>} children
 * @returns {Element}
 */
function makeRailGroup(children) {
	const group = makeElement({ className: 'left-rail__group' });
	children.forEach((child) => group.appendChild(child));
	return group;
}

/** The app mark at the top of the rail. */
function makeRailMark() {
	return makeElement({
		className: 'left-rail__mark',
		innerHTML: makeLineIcon('appMark', 24),
		title: 'Glyphr Studio',
	});
}

/**
 * A shell menu as an icon.
 *
 * `makeMenu` builds the entry point and owns the dropdown, so the rail only
 * swaps the label for an icon rather than rebuilding any of that behaviour -
 * the menus keep working exactly as they did in the top bar.
 *
 * @param {Object} data - { name, icon }
 * @returns {Element}
 */
function makeRailMenuButton({ name, icon }) {
	const button = makeMenu(name);
	button.classList.add('left-rail__button');
	button.innerHTML = makeLineIcon(icon, 20);
	button.setAttribute('title', name);
	button.setAttribute('aria-label', name);
	return button;
}

/**
 * The pages, in table-of-contents order.
 *
 * Subtitle entries carry no pageMaker; they become a divider rather than a
 * heading, because a heading in a 56px column is a word broken across four
 * lines.
 *
 * @returns {Array<Element>}
 */
function makeRailPageButtons() {
	const editor = getCurrentProjectEditor();
	if (!editor?.nav) return [];

	const toc = editor.nav.tableOfContents;
	/** @type {Array<Element>} */
	const buttons = [];
	let pendingDivider = false;

	Object.keys(toc).forEach((pageName) => {
		const entry = toc[pageName];

		if (!entry.pageMaker) {
			/* Only between groups, never leading or trailing. */
			if (buttons.length) pendingDivider = true;
			return;
		}

		if (pendingDivider) {
			buttons.push(makeElement({ className: 'left-rail__divider' }));
			pendingDivider = false;
		}

		const isCurrent = editor.nav.page === pageName;
		const button = makeElement({
			tag: 'button',
			className: `left-rail__button${isCurrent ? ' left-rail__button--current' : ''}`,
			innerHTML: makeLineIcon(entry.iconName || 'default', 20),
			attributes: {
				type: 'button',
				title: pageName,
				'aria-label': pageName,
				'aria-current': isCurrent ? 'page' : 'false',
			},
			onClick: () => navigateToPage(pageName),
		});

		buttons.push(button);
	});

	return buttons;
}

/** The command palette, at the bottom where a search box would sit. */
function makeRailSearchButton() {
	const isMac = navigator.platform.toLowerCase().includes('mac');
	const label = `Search commands, characters and pages  (${isMac ? '⌘' : 'Ctrl'} K)`;

	return makeElement({
		tag: 'button',
		className: 'left-rail__button',
		innerHTML: makeLineIcon('search', 20),
		attributes: { type: 'button', title: label, 'aria-label': label },
		onClick: showCommandPalette,
	});
}

/** The theme switch, reusing the top bar's three-state control. */
function makeRailThemeToggle() {
	const button = makeThemeToggle();
	button.classList.add('left-rail__button');
	return button;
}
