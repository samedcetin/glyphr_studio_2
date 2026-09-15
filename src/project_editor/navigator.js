import { showAppErrorPage } from '../app/app.js';
import { getCurrentProject, getCurrentProjectEditor } from '../app/main.js';
import { makeLeftRail } from '../app/left_rail.js';
import { accentColors } from '../common/colors.js';
import { hexesToChars } from '../common/character_ids.js';
import { getAdjacentItem } from '../panels/card_glyph.js';
import { addAsChildren, makeElement } from '../common/dom.js';
import { countItems } from '../common/functions.js';
import { makeIcon } from '../common/graphics.js';
import { animateRemove, closeEveryTypeOfDialog } from '../controls/dialogs/dialogs.js';
import { installEditorSidebars } from '../panels/sidebar.js';
import { makePage_About } from '../pages/about.js';
import { makePage_Characters } from '../pages/characters.js';
import { makePage_Components } from '../pages/components.js';
import { makePage_GlobalActions } from '../pages/global_actions.js';
import { makePage_Help } from '../pages/help.js';
import { makePage_Kerning } from '../pages/kerning.js';
import { makePage_Ligatures } from '../pages/ligatures.js';
import { livePreviewPageWindowResize, makePage_LivePreview } from '../pages/live_preview.js';
import { makePage_Overview } from '../pages/overview.js';
import { makePage_Settings } from '../pages/settings.js';
import { makeSingleItemTypeChooserContent } from '../panels/item_chooser.js';
import { attachTooltipsIn, setTooltip } from '../controls/tooltip/tooltip.js';

// --------------------------------------------------------------
// Navigation
// --------------------------------------------------------------

export class Navigator {
	constructor() {
		this.page = 'Overview';
		this.panel = 'Attributes';
		this.pageContents = {};
	}

	/**
	 * List of pages the editor supports
	 */
	get tableOfContents() {
		return {
			Overview: {
				pageMaker: makePage_Overview,
				iconName: 'page_overview',
			},
			'Design glyphs': {
				type: 'subtitle',
			},
			Characters: {
				pageMaker: makePage_Characters,
				iconName: 'page_characters',
			},
			Ligatures: {
				pageMaker: makePage_Ligatures,
				iconName: 'page_ligatures',
			},
			Components: {
				pageMaker: makePage_Components,
				iconName: 'page_components',
			},
			Refine: {
				type: 'subtitle',
			},
			Kerning: {
				pageMaker: makePage_Kerning,
				iconName: 'page_kerning',
			},
			'Live preview': {
				pageMaker: makePage_LivePreview,
				iconName: 'page_livePreview',
			},
			'Global actions': {
				pageMaker: makePage_GlobalActions,
				iconName: 'page_globalActions',
			},
			'Settings & more': {
				type: 'subtitle',
			},
			Settings: {
				pageMaker: makePage_Settings,
				iconName: 'page_settings',
			},
			'Import & export': {
				pageMaker: false,
				iconName: 'page_importAndExport',
			},
			Help: {
				pageMaker: makePage_Help,
				iconName: 'page_help',
			},
			About: {
				pageMaker: makePage_About,
				iconName: 'page_about',
			},
		};
	}

	/**
	 * Changes the page of this Project Editor
	 * @param {Boolean =} test - set to true when running from Vitest
	 */
	navigate(test = false) {
		// log(`Navigator.navigate`, 'start');
		// log(`this.page: ${this.page}`);
		// log(`this.panel: ${this.panel}`);
		// log(`editor.selectedItemID: ${getCurrentProjectEditor().selectedItemID}`);

		closeEveryTypeOfDialog();
		const wrapper = document.querySelector('#app__wrapper');

		// log(`wrapper before:`);
		// log(wrapper);

		if (wrapper) {
			try {
				const pageContent = this.makePageContent();
				wrapper.innerHTML = '';
				wrapper.appendChild(makeLeftRail());
				wrapper.appendChild(pageContent);
			} catch (e) {
				console.warn(`Navigation failed:`, e);
				showAppErrorPage('This page could not be opened', e);
				// log(getCurrentProject());
			}
		} else {
			if (!test) console.warn(`Navigation failed: app__wrapper could not be found.`);
		}
		// log(`Navigator.navigate`, 'end');
	}

	/**
	 * Sets the current view to the appropriate Page
	 * @returns {Object} Page Loader object - {string} content and {function} callback
	 */
	makePageContent() {
		// log(`Navigator.makePageContent`, 'start');
		const editorContent = makeElement({
			tag: 'div',
			id: 'app__main-content',
		});

		// Default page loader fallback
		let pageContent = makeElement({ tag: 'h1', innerHTML: 'Uninitialized page content' });
		let currentPageMaker = this.tableOfContents[this.page].pageMaker;
		// log(`page detected as ${this.page}`);

		if (!currentPageMaker) {
			console.warn(`No page maker for ${this.page}`);
			pageContent.innerHTML += `<br>${this.page}`;
		} else {
			// if (!this.pageContents[this.page]) {
			// 	this.pageContents[this.page] = this.tableOfContents[this.page].pageMaker();
			// }
			// If there is page content, set it
			// pageContent = this.pageContents[this.page];

			window.removeEventListener('resize', livePreviewPageWindowResize);

			pageContent = this.tableOfContents[this.page].pageMaker();

			// The four edit-canvas pages all get the right sidebar from here,
			// rather than each one building its own copy.
			if (this.isOnEditCanvasPage) installEditorSidebars(pageContent);
		}
		/*
			Where you are, floating over the top of the canvas. It used to sit in
			the top bar; with the bar gone it goes here rather than into the rail,
			because a 56px column cannot hold a path of three names and the path
			is the point.

			Edit pages only. A content page already states its name in its own
			heading, and the rail already marks which page is current, so a third
			copy floating over the text would be clutter rather than orientation.
		*/
		if (this.isOnEditCanvasPage) {
			const breadcrumb = makeBreadcrumb();
			/*
				Into .editor__page itself, not the animation wrapper around it.
				That element is what carries --left-sidebar-w, and the breadcrumb
				is placed from that variable so it clears a panel whatever width
				the user has dragged it to.
			*/
			const editorPage = pageContent.querySelector('.editor__page') || pageContent;
			if (breadcrumb) editorPage.appendChild(breadcrumb);
		}

		/*
			The app's hover label for whatever the page built, in one sweep -
			the same thing the toolbar, the breadcrumb, the panels and the hub
			do. Every page in the editor is constructed through here, so a
			control added to any of them gets it without its author having to
			remember, and the value-type marks on Settings and the range tables
			on Global actions stop being the last things in the app waiting a
			second for an OS tooltip.
		*/
		attachTooltipsIn(pageContent);

		// Append results
		editorContent.appendChild(pageContent);

		// log(`this.pageContents`);
		// log(this.pageContents);

		// log(`Navigator.makePageContent`, 'end');

		return editorContent;
	}

	/**
	 * Returns True if the current page has an item chooser panel
	 * @returns {Boolean}
	 */
	get isOnChooserPanelPage() {
		const nh = this.page;
		return nh === 'Characters' || nh === 'Components' || nh === 'Kerning' || nh === 'Ligatures';
	}

	/**
	 * Returns true if the current page has an Edit Canvas
	 * @returns {Boolean}
	 */
	get isOnEditCanvasPage() {
		const nh = this.page;
		return nh === 'Characters' || nh === 'Components' || nh === 'Kerning' || nh === 'Ligatures';
	}
}

// --------------------------------------------------------------
// Helpers
// --------------------------------------------------------------

/**
 * Builds the breadcrumb that lives in the app top bar.
 *
 * This replaces the stack of two-line "PAGE / EDITING" slabs that used to sit
 * above the left panel and cost about 90px of vertical space before any
 * content. A breadcrumb says the same thing in one line, in the chrome that
 * already exists, and leaves the whole window below it for the canvas.
 *
 * The buttons keep the ids and data-nav-type attributes the dropdown
 * machinery reads, so the existing page and item choosers work unchanged.
 *
 * @returns {Element | false} - false when there is nothing to show
 */
export function makeBreadcrumb() {
	const editor = getCurrentProjectEditor();
	if (!editor?.nav) return false;

	const projectName = editor.project?.settings?.project?.name || 'Untitled';
	const wrapper = makeElement({ className: 'breadcrumb' });

	wrapper.appendChild(
		makeElement({ className: 'breadcrumb__project', content: projectName, title: projectName })
	);
	wrapper.appendChild(makeElement({ className: 'breadcrumb__separator', content: '/' }));

	const pageButton = makeElement({
		tag: 'button',
		id: 'nav-button-l1',
		className: 'breadcrumb__button',
		attributes: { type: 'button', 'data-nav-type': 'PAGE', title: 'Change page' },
		innerHTML: `<span>${editor.nav.page}</span>${breadcrumbChevron}`,
	});
	pageButton.addEventListener('click', () => toggleNavDropdown(pageButton));
	wrapper.appendChild(pageButton);

	// The item chooser only means anything on a page that edits one item.
	if (editor.nav.isOnEditCanvasPage && editor.selectedItemID) {
		const itemName = editor.project.getItemName(editor.selectedItemID, true);
		wrapper.appendChild(makeElement({ className: 'breadcrumb__separator', content: '/' }));

		/*
			Step back and forward, either side of the thing being stepped
			through.

			These used to be a pair of wide buttons at the foot of the
			Properties card - and again at the foot of Character info, so the
			same two controls appeared twice in one column. Stepping to the next
			character is not a property of this character; it belongs with the
			name, which is what changes when you press it.
		*/
		const previousButton = makeStepButton(editor, -1);
		wrapper.appendChild(previousButton);

		const itemButton = makeElement({
			tag: 'button',
			id: 'nav-button-l2',
			className: 'breadcrumb__button breadcrumb__button--item',
			attributes: { type: 'button', 'data-nav-type': 'EDITING', title: itemName },
			innerHTML: makeItemLabel(editor, itemName) + breadcrumbChevron,
		});
		itemButton.addEventListener('click', () => toggleNavDropdown(itemButton));
		wrapper.appendChild(itemButton);

		const nextButton = makeStepButton(editor, 1);
		wrapper.appendChild(nextButton);

		/*
			The breadcrumb is built once, when the page is, but the item it
			names changes every time a different glyph is chosen - so without
			this it goes on saying whichever glyph happened to be open first.
		*/
		editor.subscribe({
			topic: [
				'whichGlyphIsSelected',
				'whichLigatureIsSelected',
				'whichComponentIsSelected',
				'whichKernGroupIsSelected',
			],
			subscriberID: 'breadcrumb.itemName',
			callback: () => {
				if (!itemButton.isConnected) return;
				const newName = editor.project.getItemName(editor.selectedItemID || '', true);
				itemButton.innerHTML = makeItemLabel(editor, newName) + breadcrumbChevron;
				/* setTooltip, not a title: the sweep below took the title away,
					and writing one back brings the OS tooltip up over ours. */
				setTooltip(itemButton, newName);
				// The step buttons name where they go, so they change too.
				refreshStepButton(previousButton, editor, -1);
				refreshStepButton(nextButton, editor, 1);
			},
		});
	}

	/*
		The app's hover label for the whole bar, in one sweep - the same thing
		the canvas toolbar does, and for the same reason: the project name and
		the item name are both truncated here, so hovering them is how you read
		them in full, and a browser tooltip is a second of nothing followed by
		an OS font.
	*/
	attachTooltipsIn(wrapper);

	return wrapper;
}

const breadcrumbChevron = `<svg class="breadcrumb__chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6.5 8 10l4-3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const stepChevron = {
	'-1': `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9.75 4 6.25 8l3.5 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
	1: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.25 4 9.75 8l-3.5 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};

/**
 * One step through the items on this page.
 *
 * @param {Object} editor - the project editor
 * @param {Number} delta - -1 for the previous item, 1 for the next
 * @returns {Element}
 */
function makeStepButton(editor, delta) {
	const button = makeElement({
		tag: 'button',
		className: 'breadcrumb__step',
		attributes: { type: 'button' },
		innerHTML: stepChevron[String(delta)],
	});

	refreshStepButton(button, editor, delta);

	button.addEventListener('click', () => {
		const target = getAdjacentItem(editor.selectedItem, delta);
		if (!target) return;
		editor.selectedItemID = target.id;
		editor.history.addState(`Navigated to ${editor.project.getItemName(target.id, true)}`);
	});

	return button;
}

/**
 * A step button says where it goes, since where it goes changes every time
 * one of them is pressed.
 *
 * @param {Element} button - the button to update
 * @param {Object} editor - the project editor
 * @param {Number} delta - -1 for the previous item, 1 for the next
 */
function refreshStepButton(button, editor, delta) {
	if (!button) return;
	let label = delta < 0 ? 'Previous item' : 'Next item';
	try {
		const target = getAdjacentItem(editor.selectedItem, delta);
		if (target)
			label = `${delta < 0 ? 'Previous' : 'Next'}: ${editor.project.getItemName(target.id, true)}`;
	} catch (error) {
		// An item with no neighbours keeps the plain label.
	}
	const shortcut = delta < 0 ? 'Ctrl ,' : 'Ctrl .';
	/*
		These relabel themselves every time the selection moves - they name
		where they go - so they go through setTooltip rather than writing a
		title the sweep has already taken away.
	*/
	setTooltip(button, label, `Shortcut ${shortcut}`);
	button.setAttribute('aria-label', label);
}

/**
 * What the breadcrumb says about the thing being edited.
 *
 * For a character, the character and its code point rather than its Unicode
 * name. "Latin Capital Letter A" spent 142px of a 330px bar saying "A", and
 * the full name is already on screen, in Character Info on the right. The
 * code point comes with it because the letterform alone is not an answer: A,
 * Alpha and the Cyrillic A are the same shape and three different characters.
 *
 * Everything else - ligatures, components, kern groups - has no code point
 * and a name someone chose, so it keeps the name.
 *
 * @param {Object} editor - the project editor
 * @param {String} itemName - the long name, used as the fallback
 * @returns {String} - markup for the button's label
 */
function makeItemLabel(editor, itemName) {
	const id = editor.selectedItemID || '';
	const hex = id.startsWith('glyph-') ? id.replace('glyph-', '') : '';
	const chars = hex ? hexesToChars(hex) : '';

	if (!hex || !chars) return `<span>${itemName}</span>`;

	const codePoint = `U+${hex.replace(/^0x/i, '').toUpperCase().padStart(4, '0')}`;
	return `<span class="breadcrumb__glyph">${chars}</span><span class="breadcrumb__codepoint">${codePoint}</span>`;
}

/*
	makeNavButton and makeNavButtonContent were here.

	They built the two-line slab - a caps super-title over a title - that the
	breadcrumb above replaced. The content pages outlived it by using one as a
	page selector: a dropdown whose whole job was naming the page you were
	already on. They came off it one at a time and Help was the last, which
	left both functions exported and imported by nothing. The CSS went with
	them; see the head of nav.css.
*/

export function toggleNavDropdown(parentElement) {
	closeAllNavMenus();
	showNavDropdown(parentElement);
}

/**
 *	Close all the main nav menu dropdowns
 * @param {Boolean} isChooserMenu - The Item Chooser can be inside a nav menu,
 *	this method gets called from other dropdowns, so we have to know if this is
 *	being called from a control inside a nav menu or from outside of it.
 */
export function closeAllNavMenus(isChooserMenu = false) {
	// log(`closeAllNavMenus`, 'start');
	// Only the dropdowns, not every navigation landmark on the page.
	/** @type {NodeListOf<HTMLElement>} */
	let navMenus = document.querySelectorAll(`nav[id^='nav-dropdown']`);
	// log(navMenus);
	navMenus.forEach((elem) => {
		if (isChooserMenu) {
			if (elem.id !== 'nav-dropdown-chooser') animateRemove(elem);
		} else {
			animateRemove(elem);
		}
	});
	// log(`closeAllNavMenus`, 'end');
}

export function showNavDropdown(parentElement) {
	// log(`showNavDropdown`, 'start');
	let size = '';
	let navID;
	let rect = parentElement.getBoundingClientRect();

	/*
		Measured from the breadcrumb, not from the button inside it.

		The button is 24px tall inside a 33px box with a border and its own
		padding, so hanging the menu 3px below the button put it seven pixels
		*inside* the breadcrumb's bottom edge - the menu grew up out of the
		middle of the control that opened it. The 6px gap is the one the rail's
		menus already stand off by.
	*/
	const anchor = parentElement.closest('.breadcrumb') || parentElement;
	const anchorRect = anchor.getBoundingClientRect();
	let top = anchorRect.bottom + 6;

	let dropdownContent = makeElement({ tag: 'h3', content: 'Uninitialized' });
	let dropdownType = parentElement.getAttribute('data-nav-type');
	// log(`dropdownType: ${dropdownType}`);

	if (dropdownType === 'PAGE') {
		dropdownContent = makePageChooserContent();
		/*
			Sized by its own longest row. It used to be told to match the width
			of the whole breadcrumb - which is as wide as a project name plus a
			page name plus a character name - for a list of eleven short words.
			Two thirds of it was empty.
		*/
		navID = 'nav-dropdown-page';
	}

	if (dropdownType === 'EDITING') {
		const editor = getCurrentProjectEditor();
		const project = getCurrentProject();
		dropdownContent = makeSingleItemTypeChooserContent(editor.nav.page, (itemID) => {
			editor.selectedItemID = itemID;
			editor.history.addState(`Navigated to ${editor.project.getItemName(itemID, true)}`);
			closeAllNavMenus();
		});

		if (editor.nav.page === 'Characters') {
			/*
				The character grid decides how wide this is - ten columns of
				forty - rather than the window deciding how wide the grid is.
				See #nav-dropdown-chooser in nav.css.
			*/
			size = '';
		} else if (
			(editor.nav.page === 'Ligatures' && countItems(project.ligatures) > 25) ||
			(editor.nav.page === 'Components' && countItems(project.components) > 25)
		) {
			size = '80%';
		} else {
			size = `${parentElement.getBoundingClientRect().width - 2}px`;
		}

		navID = 'nav-dropdown-chooser';
	}

	if (dropdownType === 'PANEL') {
		dropdownContent = makePanelChooserContent();
		size = `${rect.width - 2}px`;
		navID = 'nav-dropdown-panel';
	}

	let dropDown = makeElement({
		tag: 'nav',
		id: navID,
		attributes: { tabindex: '-1' },
		/*
			Position only. The dropdown used to copy its parent button's
			background color inline, which made it translucent once the nav
			buttons became surface-colored. Its surface now comes from nav.css
			so it stays opaque and themed.
		*/
		/*
			Width is only set here for the two dropdowns that have to match
			something else - the character chooser's grid and the panel
			chooser's button. The page chooser takes the width of its own
			longest row, which nav.css bounds.
		*/
		style: `
			left: ${Math.round(rect.left)}px;
			top: ${Math.round(top)}px;
			${size ? `min-width: ${size}; max-width: 80%;` : ''}
		`,
	});

	addAsChildren(dropDown, dropdownContent);
	// log(`dropDown:`);
	// log(dropDown);
	// closeAllNavMenus();
	closeEveryTypeOfDialog();

	// let appWrapper = document.querySelector('#app__wrapper');
	// appWrapper.appendChild(dropDown).focus();
	/*
		Appended to the shell, not next to the button that opened it.

		It used to be inserted as a sibling of its button, which was fine while
		those buttons lived in a full-width top bar. The breadcrumb replaced that
		bar: it is a floating 33px-tall box with `overflow: hidden`, so the
		dropdown was being clipped to nine pixels of its own first row - and the
		viewport coordinates above were being resolved against the breadcrumb's
		own corner, which put what survived off the right of the screen.

		#app__wrapper starts at the window's top left and does not scroll, so
		the coordinates measured above land where they were measured.
	*/
	document.querySelector('#app__wrapper')?.appendChild(dropDown);

	// log(`showNavDropdown`, 'end');
}

function makePageChooserContent() {
	// log(`makePageChooserContent`, 'start');

	let content = makeElement();
	let pageButton;
	let toc = getCurrentProjectEditor().nav.tableOfContents;

	Object.keys(toc).forEach((itemName) => {
		if (toc[itemName]?.type === 'subtitle') {
			content.appendChild(
				makeElement({ tag: 'h3', content: itemName, className: 'nav-dropdown__subtitle' })
			);
		} else if (itemName !== 'Open project' && toc[itemName].pageMaker) {
			pageButton = makeNavButton_Page(itemName, toc[itemName].iconName);
			content.appendChild(pageButton);
		}
	});

	// log(`makePageChooserContent`, 'end');
	return content;
}

function makeNavButton_Page(pageName, iconName) {
	let button = makeElement({
		tag: 'button',
		className: 'nav-dropdown__button',
		attributes: { tabindex: '0' },
	});
	button.innerHTML += makeIcon({ name: iconName, color: accentColors.blue.l90 });
	button.appendChild(makeElement({ content: pageName }));
	button.addEventListener('click', () => navigateToPage(pageName));
	return button;
}

/**
 * Goes to a page.
 *
 * Exported because two things navigate now - this dropdown and the left rail -
 * and the steps around the navigate() call are not optional: a stale selection
 * carried into another page, or a panel that page does not have, both end in a
 * broken sidebar.
 *
 * @param {String} pageName - a key of nav.tableOfContents
 */
export function navigateToPage(pageName) {
	let editor = getCurrentProjectEditor();
	if (editor.nav.page !== pageName) {
		editor.multiSelect.shapes.clear();
		editor.multiSelect.points.clear();
	}

	// Ensure the selected Panel is availabe for the new page, otherwise default to Attributes
	editor.nav.page = pageName;
	if (panelsPerPage?.[pageName]) {
		if (!panelsPerPage[pageName].includes(editor.nav.panel)) editor.nav.panel = 'Attributes';
	}

	editor.navigate();
	if (editor.selectedItemID) {
		let lastChange = editor.history.queue[0] || false;

		// Only add a nav item to the history queue if the previous undo item:
		//  - matches the current selected item
		//  - is not a whole project save
		if (
			lastChange &&
			!(lastChange.wholeProjectSave || lastChange.itemID === editor.selectedItemID)
		) {
			editor.history.addState(
				`Navigated to ${editor.project.getItemName(editor.selectedItemID, true)}`
			);
		}
	}
}

const panelsPerPage = {
	Characters: [
		'Attributes',
		'Layers',
		'ContextCharacters',
		'Transforms',
		'History',
		'Guides',
		'CharacterInfo',
		'QualityChecks',
	],
	Ligatures: ['Attributes', 'Layers', 'Transforms', 'History', 'Guides', 'QualityChecks'],
	Components: ['Attributes', 'Layers', 'Transforms', 'History', 'Guides', 'QualityChecks'],
	Kerning: ['Attributes', 'History'],
};

function makePanelChooserContent() {
	// log(`makePanelChooserContent`, 'start');
	let content = makeElement();
	let pageButton;
	let panels = listOfPanels();
	let page = getCurrentProjectEditor().nav.page;
	panelsPerPage[page].forEach((panelName) => {
		pageButton = makeNavButton_Panel(panels[panelName].name, panels[panelName].iconName);
		content.appendChild(pageButton);
	});

	// log(`makePanelChooserContent`, 'end');
	return content;
}

function makeNavButton_Panel(panelName, iconName) {
	let button = makeElement({
		tag: 'button',
		className: 'nav-dropdown__button',
		attributes: { tabindex: '0' },
	});
	button.innerHTML += makeIcon({ name: iconName, color: accentColors.blue.l90 });
	button.appendChild(makeElement({ content: panelName }));
	button.addEventListener('click', () => {
		// log(`navButton.click`, 'start');
		// log(`panelName: ${panelName}`);
		const editor = getCurrentProjectEditor();
		editor.nav.panel = panelName;
		editor.showPageTransitions = false;
		editor.navigate();
		editor.showPageTransitions = true;
		// log(`navButton.click`, 'end');
	});
	return button;
}

/**
 * List of panels the editor supports
 */
function listOfPanels() {
	return {
		Attributes: {
			name: 'Attributes',
			panelMaker: false,
			iconName: 'panel_attributes',
		},
		Layers: {
			name: 'Layers',
			panelMaker: false,
			iconName: 'panel_layers',
		},
		ContextCharacters: {
			name: 'Context characters',
			panelMaker: false,
			iconName: 'panel_contextCharacters',
		},
		Transforms: {
			name: 'Transforms',
			panelMaker: false,
			iconName: 'panel_transforms',
		},
		History: {
			name: 'History',
			panelMaker: false,
			iconName: 'panel_history',
		},
		Guides: {
			name: 'Guides',
			panelMaker: false,
			iconName: 'panel_guides',
		},
		CharacterInfo: {
			name: 'Character info',
			panelMaker: false,
			iconName: 'panel_characterInfo',
		},
		QualityChecks: {
			name: 'Quality checks',
			panelMaker: false,
			iconName: 'panel_qualityChecks',
		},
	};
}
