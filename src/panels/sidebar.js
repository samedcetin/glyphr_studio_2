import { getCurrentProjectEditor } from '../app/main.js';
import { addAsChildren, makeElement } from '../common/dom.js';
import { makeIcon } from '../common/graphics.js';
import { getUIState, getUIStateEntry, setUIState, setUIStateEntry } from '../common/ui_state.js';
import { closeAllInfoBubbles } from '../controls/dialogs/dialogs.js';
import { makePanel_GlyphAttributes } from './attributes_glyph_edit.js';
import { makePanel_KernGroupAttributes } from './attributes_kern.js';
import { makePanel_CharacterInfo } from './character_info.js';
import { makePanel_ContextCharacters } from './context_characters.js';
import { makePanel_Anchors } from '../anchors/anchors_panel.js';
import { makePanel_Guides } from './guides.js';
import { makePanel_History } from './history.js';
import { makePanel_Layers } from './layers.js';
import { handlePanelsKeyPress, handlePanelsKeyUp } from './panel_events.js';
import { makePanel_QualityChecks } from './quality_checks.js';
import { makePanel_Transforms } from './transforms.js';

/**
	SIDEBARS
	--------
	The editor used to show exactly one panel at a time, chosen from a dropdown.
	Selecting a path in Layers meant you could not see its coordinates without
	switching panels - and switching panels rebuilt the whole area from scratch.

	This replaces that with the arrangement every design tool uses:

		LEFT   - structure. What is in this glyph, and what is around it.
		         Layers, Context characters, Guides, History.
		RIGHT  - properties of whatever is selected right now.
		         Attributes, Transform, Character info, Quality checks.

	Both sides are stacks of collapsible sections. Which sections are open, and
	how wide each sidebar is, persist per user.

	Panel makers themselves are untouched - they still return the same cards.
	What changed is that several of them are now mounted at once, which means
	subscriptions have to be managed per section rather than by unsubscribing
	everything that is not currently visible.
 */

const SECTION_STATE_KEY = 'sidebarSections';
const PANELS_HIDDEN_KEY = 'panelsHidden';
const WIDTH_STATE_KEY = 'sidebarWidths';

const MIN_SIDEBAR_WIDTH = 220;
const MAX_SIDEBAR_WIDTH = 520;
const DEFAULT_LEFT_WIDTH = 280;
const DEFAULT_RIGHT_WIDTH = 300;

/**
 * Section definitions.
 *
 * `subscriberPrefix` matters: unsubscribe does substring matching, so a
 * section's own subscribers can be cleared without touching its neighbours'.
 * Every maker in here must use that prefix for its subscriberIDs.
 */
const sectionDefinitions = {
	left: [
		{
			id: 'layers',
			title: 'Layers',
			icon: 'panel_layers',
			subscriberPrefix: 'layersPanel',
			maker: makePanel_Layers,
			defaultOpen: true,
			isAvailable: (page) => page !== 'Kerning',
		},
		{
			id: 'contextCharacters',
			title: 'Context characters',
			icon: 'panel_contextCharacters',
			subscriberPrefix: 'contextCharactersPanel',
			maker: makePanel_ContextCharacters,
			defaultOpen: false,
			isAvailable: () => true,
		},
		{
			id: 'guides',
			title: 'Guides',
			icon: 'panel_guides',
			subscriberPrefix: 'guidesPanel',
			maker: makePanel_Guides,
			defaultOpen: false,
			isAvailable: () => true,
		},
		{
			id: 'history',
			title: 'History',
			icon: 'panel_history',
			subscriberPrefix: 'historyPanel',
			maker: makePanel_History,
			defaultOpen: false,
			isAvailable: () => true,
		},
	],
	right: [
		{
			id: 'attributes',
			title: 'Properties',
			icon: 'panel_attributes',
			subscriberPrefix: 'attributesPanel',
			maker: (page) =>
				page === 'Kerning' ? makePanel_KernGroupAttributes() : makePanel_GlyphAttributes(),
			defaultOpen: true,
			isAvailable: () => true,
		},
		{
			id: 'transforms',
			title: 'Transform',
			icon: 'panel_transforms',
			subscriberPrefix: 'transformsPanel',
			maker: makePanel_Transforms,
			defaultOpen: false,
			isAvailable: (page) => page !== 'Kerning',
			/*
				Transform holds live control state while you drag its sliders.
				Rebuilding it mid-interaction would drop that state, which is why
				the old refreshPanel() refused to run at all while this panel was
				showing. Now only this one section opts out.
			*/
			skipOnRefresh: true,
		},
		{
			id: 'anchors',
			title: 'Anchors',
			icon: 'panel_anchors',
			subscriberPrefix: 'anchorsPanel',
			maker: makePanel_Anchors,
			defaultOpen: false,
			// Kern groups have no outlines of their own for a mark to attach to.
			isAvailable: (page) => page !== 'Kerning',
			/*
				This panel holds text fields people type into. Rebuilding it on
				every publish took focus out of the field mid-word and replaced
				the input under the caret, so arrow-key nudging worked once and
				then stopped. It updates itself instead - see anchors_panel.js.
			*/
			skipOnRefresh: true,
		},
		{
			id: 'characterInfo',
			title: 'Character info',
			icon: 'panel_characterInfo',
			subscriberPrefix: 'characterInfoPanel',
			maker: makePanel_CharacterInfo,
			defaultOpen: false,
			isAvailable: (page) => page === 'Characters' || page === 'Ligatures',
		},
		{
			id: 'qualityChecks',
			title: 'Quality checks',
			icon: 'panel_qualityChecks',
			subscriberPrefix: 'qualityChecksPanel',
			maker: makePanel_QualityChecks,
			defaultOpen: false,
			isAvailable: (page) => page !== 'Kerning',
		},
	],
};

/** True while a sidebar refresh is already scheduled for the next frame. */
let refreshQueued = false;

// --------------------------------------------------------------
// Showing and hiding the panels entirely
// --------------------------------------------------------------

/**
 * Whether the floating panels are hidden, leaving only the canvas.
 *
 * Now that the panels float over a full-bleed canvas rather than sitting in
 * grid tracks beside it, hiding them gives a genuinely uninterrupted drawing
 * surface - which is what the shortcut is for.
 *
 * @returns {Boolean}
 */
export function arePanelsHidden() {
	return !!getUIState(PANELS_HIDDEN_KEY, false);
}

/**
 * Applies the hidden state to the page, without rebuilding anything.
 * @param {Boolean} hidden - new state
 */
function applyPanelsHidden(hidden) {
	const editorPage = document.querySelector('.editor__page');
	if (editorPage) editorPage.classList.toggle('editor__page--panels-hidden', hidden);

	// The canvas just changed size, so an auto-fit view is no longer fitted.
	const editor = getCurrentProjectEditor();
	if (editor.view?.default) editor.autoFitIfViewIsDefault();
	if (editor.editCanvas?.redraw) editor.editCanvas.redraw('panelsToggled');
}

/**
 * Shows or hides both floating panels. The choice persists.
 * @param {Boolean=} hidden - omit to toggle
 * @returns {Boolean} - the new state
 */
export function setPanelsHidden(hidden) {
	const next = typeof hidden === 'boolean' ? hidden : !arePanelsHidden();
	setUIState(PANELS_HIDDEN_KEY, next);
	applyPanelsHidden(next);
	return next;
}

// --------------------------------------------------------------
// Section open / closed state
// --------------------------------------------------------------

/**
 * @param {Object} definition - a section definition
 * @returns {Boolean} - whether this section should render open
 */
function isSectionOpen(definition) {
	return !!getUIStateEntry(SECTION_STATE_KEY, definition.id, definition.defaultOpen);
}

/**
 * @param {String} sectionID - which section
 * @param {Boolean} isOpen - new state
 */
function setSectionOpen(sectionID, isOpen) {
	setUIStateEntry(SECTION_STATE_KEY, sectionID, isOpen);
}

// --------------------------------------------------------------
// Building sections
// --------------------------------------------------------------

const chevronSVG = `<svg class="sidebar__chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/**
 * Fills a section's body with freshly made panel content.
 *
 * Clears the section's own subscribers first: the maker is about to register
 * new ones pointing at new DOM, and the old ones would otherwise keep firing
 * callbacks against detached elements.
 *
 * @param {Object} definition - section definition
 * @param {Element} body - the section body element to fill
 */
function buildSectionBody(definition, body) {
	const editor = getCurrentProjectEditor();
	editor.unsubscribe({ idToRemove: definition.subscriberPrefix });

	body.innerHTML = '';

	try {
		const content = definition.maker(editor.nav.page);
		if (content) addAsChildren(body, content);
	} catch (error) {
		console.warn(`Panel "${definition.id}" failed to build:`, error);
		body.appendChild(
			makeElement({
				className: 'sidebar__section-error',
				content: `This panel could not be shown.`,
			})
		);
	}
}

/**
 * Makes one collapsible sidebar section.
 * @param {Object} definition - section definition
 * @returns {Element}
 */
function makeSection(definition) {
	const open = isSectionOpen(definition);

	const section = makeElement({
		tag: 'section',
		className: 'sidebar__section',
		attributes: { 'data-section-id': definition.id },
	});
	if (open) section.classList.add('sidebar__section--open');

	const header = makeElement({
		tag: 'button',
		className: 'sidebar__section-header',
		attributes: {
			type: 'button',
			'aria-expanded': String(open),
			'aria-controls': `sidebar-body-${definition.id}`,
		},
		innerHTML: `${chevronSVG}${makeIcon({
			name: definition.icon,
			color: 'currentColor',
		})}<span class="sidebar__section-title">${definition.title}</span>`,
	});

	const body = makeElement({
		className: 'sidebar__section-body',
		id: `sidebar-body-${definition.id}`,
	});

	// Closed sections are built the first time they are opened, so a project
	// with eight collapsed panels does not pay to construct all of them.
	if (open) buildSectionBody(definition, body);

	header.addEventListener('click', () => {
		const nowOpen = !section.classList.contains('sidebar__section--open');
		section.classList.toggle('sidebar__section--open', nowOpen);
		header.setAttribute('aria-expanded', String(nowOpen));
		setSectionOpen(definition.id, nowOpen);

		if (nowOpen) {
			buildSectionBody(definition, body);
		} else {
			// Stop listening while hidden - nothing is there to update.
			getCurrentProjectEditor().unsubscribe({ idToRemove: definition.subscriberPrefix });
			body.innerHTML = '';
		}
	});

	addAsChildren(section, [header, body]);
	return section;
}

/**
 * Builds every available section for one side.
 * @param {'left'|'right'} side - which sidebar
 * @returns {Array} - section elements
 */
function makeSectionsForSide(side) {
	const page = getCurrentProjectEditor().nav.page;
	return sectionDefinitions[side]
		.filter((definition) => definition.isAvailable(page))
		.map((definition) => makeSection(definition));
}

// --------------------------------------------------------------
// Public building blocks
// --------------------------------------------------------------

/**
 * Content for the left sidebar. Called by the page makers through
 * panels.js `makePanel()`, which keeps the existing page code working.
 * @returns {Element}
 */
export function makeLeftSidebarContent() {
	const wrapper = makeElement({ className: 'sidebar__sections' });
	addAsChildren(wrapper, makeSectionsForSide('left'));

	// The Layers list supports ctrl-click multi-select, which needs modifier
	// tracking. Layers is always mounted now, so these listeners are attached
	// once here rather than being toggled as panels swapped in and out.
	document.removeEventListener('keydown', handlePanelsKeyPress, false);
	document.removeEventListener('keyup', handlePanelsKeyUp, false);
	document.addEventListener('keydown', handlePanelsKeyPress, false);
	document.addEventListener('keyup', handlePanelsKeyUp, false);

	return wrapper;
}

/**
 * Content for the right sidebar.
 * @returns {Element}
 */
export function makeRightSidebarContent() {
	const wrapper = makeElement({ className: 'sidebar__sections' });
	addAsChildren(wrapper, makeSectionsForSide('right'));
	return wrapper;
}

// --------------------------------------------------------------
// Installing into a page
// --------------------------------------------------------------

/**
 * Adds the right sidebar and both drag-to-resize handles to an editor page.
 *
 * Done here rather than in each page's markup so the four edit-canvas pages
 * (Characters, Components, Ligatures, Kerning) all get the same treatment
 * from one place.
 *
 * @param {Element} pageContent - the element returned by a page maker
 */
export function installEditorSidebars(pageContent) {
	const editorPage = pageContent.querySelector('.editor__page');
	if (!editorPage) return;

	// No selected item means the page is showing its first-run state, which is
	// a single full-width panel with nothing to inspect.
	const editor = getCurrentProjectEditor();
	if (!editor.selectedItemID) return;
	if (!editorPage.querySelector('.editor-page__edit-canvas-wrapper')) return;

	applyStoredWidth(editorPage, 'left');
	applyStoredWidth(editorPage, 'right');

	const rightArea = makeElement({
		className: 'editor-page__right-area',
		id: 'editor-page__right-sidebar',
	});
	rightArea.appendChild(makeRightSidebarContent());
	rightArea.addEventListener('scroll', closeAllInfoBubbles);
	editorPage.appendChild(rightArea);

	editorPage.appendChild(makeResizer(editorPage, 'left'));
	editorPage.appendChild(makeResizer(editorPage, 'right'));

	if (arePanelsHidden()) editorPage.classList.add('editor__page--panels-hidden');
}

/**
 * @param {Element} editorPage - the .editor__page element
 * @param {'left'|'right'} side - which sidebar
 */
function applyStoredWidth(editorPage, side) {
	if (!(editorPage instanceof HTMLElement)) return;
	const fallback = side === 'left' ? DEFAULT_LEFT_WIDTH : DEFAULT_RIGHT_WIDTH;
	const stored = Number(getUIStateEntry(WIDTH_STATE_KEY, side, fallback));
	const width = clampWidth(Number.isFinite(stored) ? stored : fallback);
	editorPage.style.setProperty(`--${side}-sidebar-w`, `${width}px`);
}

/**
 * @param {Number} value - a proposed sidebar width in pixels
 * @returns {Number}
 */
function clampWidth(value) {
	return Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, Math.round(value)));
}

/**
 * Makes one drag handle. Uses pointer events with capture so the drag keeps
 * tracking even when the pointer crosses the canvas.
 * @param {Element} editorPage - the .editor__page element
 * @param {'left'|'right'} side - which sidebar this handle resizes
 * @returns {Element}
 */
function makeResizer(editorPage, side) {
	const handle = makeElement({
		className: `editor-page__resizer editor-page__resizer--${side}`,
		attributes: {
			role: 'separator',
			'aria-orientation': 'vertical',
			'aria-label': `Resize ${side} sidebar`,
			tabindex: '0',
		},
	});

	let startX = 0;
	let startWidth = 0;

	const currentWidth = () =>
		parseFloat(getComputedStyle(editorPage).getPropertyValue(`--${side}-sidebar-w`)) ||
		(side === 'left' ? DEFAULT_LEFT_WIDTH : DEFAULT_RIGHT_WIDTH);

	const applyWidth = (width) => {
		const clamped = clampWidth(width);
		if (editorPage instanceof HTMLElement) {
			editorPage.style.setProperty(`--${side}-sidebar-w`, `${clamped}px`);
		}
		return clamped;
	};

	const onPointerMove = (event) => {
		// Dragging the right handle leftwards makes that sidebar wider, so the
		// delta is inverted on that side.
		const delta = side === 'left' ? event.clientX - startX : startX - event.clientX;
		applyWidth(startWidth + delta);
	};

	const onPointerUp = (event) => {
		handle.releasePointerCapture?.(event.pointerId);
		handle.removeEventListener('pointermove', onPointerMove);
		handle.removeEventListener('pointerup', onPointerUp);
		document.body.classList.remove('is-resizing-sidebar');
		setUIStateEntry(WIDTH_STATE_KEY, side, currentWidth());
	};

	handle.addEventListener('pointerdown', (event) => {
		event.preventDefault();
		startX = event.clientX;
		startWidth = currentWidth();
		handle.setPointerCapture?.(event.pointerId);
		handle.addEventListener('pointermove', onPointerMove);
		handle.addEventListener('pointerup', onPointerUp);
		document.body.classList.add('is-resizing-sidebar');
	});

	// Keyboard resizing, so the handle is not mouse-only.
	handle.addEventListener('keydown', (event) => {
		const step = event.shiftKey ? 32 : 8;
		let delta = 0;
		if (event.key === 'ArrowLeft') delta = side === 'left' ? -step : step;
		if (event.key === 'ArrowRight') delta = side === 'left' ? step : -step;
		if (!delta) return;
		event.preventDefault();
		setUIStateEntry(WIDTH_STATE_KEY, side, applyWidth(currentWidth() + delta));
	});

	return handle;
}

// --------------------------------------------------------------
// Refreshing
// --------------------------------------------------------------

/**
 * Rebuilds the body of every open section, on the next animation frame.
 *
 * Several mounted panels subscribe to the same topics, so one edit can ask for
 * a refresh three or four times in a single tick. Coalescing means the sidebar
 * is rebuilt once per frame instead of once per subscriber.
 */
export function refreshSidebars() {
	if (refreshQueued) return;
	refreshQueued = true;

	const run = () => {
		refreshQueued = false;
		rebuildOpenSections();
	};

	if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
	else run();
}

/**
 * Rebuilds open section bodies in place, preserving each sidebar's scroll
 * position - which the old full-panel rebuild always threw away.
 */
function rebuildOpenSections() {
	const allDefinitions = [...sectionDefinitions.left, ...sectionDefinitions.right];

	const scrollPositions = new Map();
	document.querySelectorAll('.editor-page__left-area, .editor-page__right-area').forEach((area) => {
		scrollPositions.set(area, area.scrollTop);
	});

	allDefinitions.forEach((definition) => {
		if (definition.skipOnRefresh) return;
		const section = document.querySelector(
			`.sidebar__section[data-section-id="${definition.id}"].sidebar__section--open`
		);
		if (!section) return;
		const body = section.querySelector('.sidebar__section-body');
		if (body) buildSectionBody(definition, body);
	});

	scrollPositions.forEach((top, area) => {
		area.scrollTop = top;
	});
}
