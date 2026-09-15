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
import { PRODUCT_NAME } from './brand.js';
import { getCurrentProjectEditor } from './main.js';
import { makeMenu, makeThemeToggle } from './menu.js';
import { navigateToHub } from './open_project.js';

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

	rail.appendChild(makeRailMark(navigateToHub));

	/*
		A spacer above the destinations as well as below them, so they sit in
		the middle of the column - the same shape the hub's rail has, and for
		the same reason. The editor's list is longer but it is not long enough
		to fill the column: on a 1270px window it ran out 800px short, which
		left the whole of the navigation crowded into the top third with the
		mark and nothing under it.
	*/
	rail.appendChild(makeElement({ className: 'left-rail__spacer' }));

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
 * The same rail, for an app page that is not the editor.
 *
 * The hub had a 260px sidebar of its own - a wordmark, four labelled rows and
 * a legal footer - which meant the first screen of the app taught a piece of
 * chrome that then disappeared the moment you opened a project. This is the
 * rail you land on and the rail you keep.
 *
 * It takes its destinations rather than reading the navigator, because an app
 * page's tabs are its own and there is no project to have pages of.
 *
 * @param {Object} args
 * @param {Array<Object>} args.tabs - [{ id, icon, label }]
 * @param {String} args.current - which tab id is selected
 * @param {Function} args.onSelect - called with a tab id
 * @param {Array<Element>=} args.footer - buttons pinned to the bottom, after
 *     the theme toggle
 * @returns {Element}
 */
export function makeAppPageRail({ tabs = [], current = '', onSelect = () => {}, footer = [] }) {
	const rail = makeElement({
		tag: 'nav',
		id: 'app__left-rail',
		attributes: { 'aria-label': 'Main' },
	});

	rail.appendChild(makeRailMark());

	/*
		A spacer on each side of the destinations, so they sit in the middle of
		the column rather than stacked under the mark. The editor's rail is
		built the same way - see makeLeftRail - so the navigation is in the same
		place whichever of the two you are looking at.
	*/
	rail.appendChild(makeElement({ className: 'left-rail__spacer' }));

	rail.appendChild(
		makeRailGroup(
			tabs.map((tab) => {
				const isCurrent = tab.id === current;
				return makeElement({
					tag: 'button',
					className: `left-rail__button${isCurrent ? ' left-rail__button--current' : ''}`,
					innerHTML: makeLineIcon(tab.icon, 20),
					attributes: {
						type: 'button',
						title: tab.label,
						'aria-label': tab.label,
						'aria-current': isCurrent ? 'page' : 'false',
						'data-rail-tab': tab.id,
					},
					onClick: () => onSelect(tab.id),
				});
			})
		)
	);

	rail.appendChild(makeElement({ className: 'left-rail__spacer' }));
	rail.appendChild(makeRailGroup([makeRailThemeToggle(), ...footer]));

	return rail;
}

/**
 * Marks which rail tab is current, for a page that switches views in place.
 * @param {String} tabID - the id that is now selected
 */
export function setAppPageRailTab(tabID) {
	document.querySelectorAll('#app__left-rail [data-rail-tab]').forEach((button) => {
		const isCurrent = button.getAttribute('data-rail-tab') === tabID;
		button.classList.toggle('left-rail__button--current', isCurrent);
		button.setAttribute('aria-current', isCurrent ? 'page' : 'false');
	});
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

/**
 * The app mark at the top of the rail.
 *
 * In the editor it is the way back to the hub - the one thing the rail was
 * missing, since every other route out of a project is inside a menu. On the
 * hub it stays a plain mark: home is a tab three pixels below it, and a mark
 * that reloads the page you are on is a control that does nothing.
 *
 * @param {Function =} onClick - what the mark does, if anything
 * @returns {Element}
 */
function makeRailMark(onClick = undefined) {
	if (!onClick) {
		return makeElement({
			className: 'left-rail__mark',
			innerHTML: makeLineIcon('appMark', 24),
			title: PRODUCT_NAME,
		});
	}

	return makeElement({
		tag: 'button',
		className: 'left-rail__mark',
		innerHTML: makeLineIcon('appMark', 24),
		attributes: {
			type: 'button',
			title: `${PRODUCT_NAME}\nBack to your projects.`,
			'aria-label': `${PRODUCT_NAME} — back to your projects`,
		},
		onClick: onClick,
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
	Pages the Help menu already reaches, so the rail does not show them twice.

	Both of these are rows in the Help dropdown - "In-app help" and "About
	Blue Rain Type" - and both drew the same question-mark and info icons the
	menu's own entry point uses. Two identical icons in one column, one opening
	a menu and one navigating, is a column that has to be read rather than
	scanned.
 */
const PAGES_IN_HELP_MENU = ['Help', 'About'];

/**
 * The pages, in table-of-contents order.
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

		/*
			A subtitle is a group heading and becomes a divider - a heading in a
			56px column is one word broken over four lines. A page with no maker
			is not a subtitle, it is a page that is not built yet: it gets no
			button and no divider. Treating the two the same put a group break
			between Settings and Help, where the tree has no group break.
		*/
		if (entry.type === 'subtitle') {
			/* Only between groups, never leading or trailing. */
			if (buttons.length) pendingDivider = true;
			return;
		}

		if (!entry.pageMaker || PAGES_IN_HELP_MENU.includes(pageName)) return;

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
