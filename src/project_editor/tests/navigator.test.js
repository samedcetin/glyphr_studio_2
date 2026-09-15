import { beforeEach, describe, expect, it } from 'vitest';
import { getCurrentProjectEditor } from '../../app/main.js';
import { makeBreadcrumb, Navigator } from '../navigator.js';

describe('Navigator: Page Navigation', () => {
	let navigator;

	beforeEach(() => {
		navigator = new Navigator();
	});

	it('Should have a default page of "Overview"', () => {
		expect(navigator.page).toBe('Overview');
	});

	it('Should have a default panel of "Attributes"', () => {
		expect(navigator.panel).toBe('Attributes');
	});

	it('Navigate to page: Characters', () => {
		navigator.page = 'Characters';
		navigator.navigate(true);
		const pageContent = navigator.makePageContent();
		expect(pageContent.id).toBe('app__main-content');
		// Edit-canvas pages build the editor shell; which page you are on is
		// reported by the top bar breadcrumb rather than by an in-page button.
		expect(pageContent.querySelector('.editor__page')).toBeTruthy();
	});

	it('Navigate to page: Ligatures', () => {
		navigator.page = 'Ligatures';
		navigator.navigate(true);
		const pageContent = navigator.makePageContent();
		expect(pageContent.id).toBe('app__main-content');
		// Edit-canvas pages build the editor shell; which page you are on is
		// reported by the top bar breadcrumb rather than by an in-page button.
		expect(pageContent.querySelector('.editor__page')).toBeTruthy();
	});

	it('Navigate to page: Components', () => {
		navigator.page = 'Components';
		navigator.navigate(true);
		const pageContent = navigator.makePageContent();
		expect(pageContent.id).toBe('app__main-content');
		// Edit-canvas pages build the editor shell; which page you are on is
		// reported by the top bar breadcrumb rather than by an in-page button.
		expect(pageContent.querySelector('.editor__page')).toBeTruthy();
	});

	it('Navigate to page: Kerning', () => {
		navigator.page = 'Kerning';
		navigator.navigate(true);
		const pageContent = navigator.makePageContent();
		expect(pageContent.id).toBe('app__main-content');
		// Edit-canvas pages build the editor shell; which page you are on is
		// reported by the top bar breadcrumb rather than by an in-page button.
		expect(pageContent.querySelector('.editor__page')).toBeTruthy();
	});

	/*
		Overview and Live preview are not here, and cannot be until the suite
		registers the custom elements. Both pages construct one directly - a
		GlyphTile, a DisplayCanvas - and jsdom throws "the constructor is not
		part of the custom element registry" the moment they call super().

		Tried enabling them; that is the wall. Whoever registers those in the
		test setup gets two more pages covered for free, asserting
		.studio-page__title the way the Global actions one does.
	*/

	it('Navigate to page: Global actions', () => {
		navigator.page = 'Global actions';
		navigator.navigate(true);
		const pageContent = navigator.makePageContent();
		expect(pageContent.id).toBe('app__main-content');
		// This page names itself in its own heading rather than in a page-selector
		// button, the way Kerning leaves it to the top bar breadcrumb.
		expect(pageContent.querySelector('.studio-page__title').innerHTML).toBe('Global actions');
	});

	it('Navigate to page: Settings', () => {
		navigator.page = 'Settings';
		navigator.navigate(true);
		const pageContent = navigator.makePageContent();
		expect(pageContent.id).toBe('app__main-content');
		// Named in its own heading, not in a page-selector button - see the
		// Global actions test above.
		expect(pageContent.querySelector('.studio-page__title').innerHTML).toBe('Settings');
	});

	it('Navigate to page: Help', () => {
		navigator.page = 'Help';
		navigator.navigate(true);
		const pageContent = navigator.makePageContent();
		expect(pageContent.id).toBe('app__main-content');
		expect(pageContent.querySelector('.nav-button__title').innerHTML).toBe('Help');
	});

	/**
	 * makeBreadcrumb returns false when there is no editor; there always is
	 * one here, so a false is a failed test rather than a case to handle.
	 * @returns {Element}
	 */
	function breadcrumbOrFail() {
		const breadcrumb = makeBreadcrumb();
		if (!breadcrumb) throw new Error('makeBreadcrumb returned false');
		return breadcrumb;
	}

	/*
		The breadcrumb reads the *current* editor rather than a standalone
		Navigator, because it is built by the app top bar - so these drive
		getCurrentProjectEditor().nav rather than the local instance above.
	*/
	it('Reports the current page in the breadcrumb', () => {
		const editor = getCurrentProjectEditor();
		editor.nav.page = 'Ligatures';
		const breadcrumb = breadcrumbOrFail();
		expect(breadcrumb.querySelector('#nav-button-l1')?.textContent).toContain('Ligatures');
	});

	it('Only offers an item chooser on pages that edit one item', () => {
		const editor = getCurrentProjectEditor();
		editor.nav.page = 'Settings';
		expect(breadcrumbOrFail().querySelector('#nav-button-l2')).toBeNull();
	});

	it('Keeps the item name in step with the selection', () => {
		/*
			The breadcrumb is built once and the selection changes constantly,
			so it has to follow - otherwise it goes on naming whichever item
			was open when the page was built.
		*/
		const editor = getCurrentProjectEditor();
		editor.nav.page = 'Characters';

		/*
			Changing the selection publishes, and the Characters page keeps a
			subscriber that redraws the edit canvas - which does not exist in a
			headless run. A do-nothing canvas keeps that out of the way.
		*/
		const realCanvas = editor.editCanvas;
		editor.editCanvas = /** @type {any} */ ({ redraw: () => {} });
		editor.selectedGlyphID = 'glyph-0x41';

		const breadcrumb = breadcrumbOrFail();
		document.body.appendChild(breadcrumb);
		const before = breadcrumb.querySelector('#nav-button-l2 span')?.textContent;

		editor.selectedGlyphID = 'glyph-0x42';
		editor.publish('whichGlyphIsSelected', 'glyph-0x42');

		const itemButton = breadcrumb.querySelector('#nav-button-l2');
		const after = itemButton?.querySelector('span')?.textContent;
		expect(after).not.toEqual(before);

		/*
			The label shows the character itself with its code point beside it;
			the full Unicode name lives in the tooltip. Both have to follow the
			selection.
		*/
		expect(after).toEqual('B');
		expect(itemButton?.getAttribute('title')).toEqual(
			editor.project.getItemName('glyph-0x42', true)
		);

		breadcrumb.remove();
		editor.editCanvas = realCanvas;
	});

	it('Keeps the dropdown hooks the page and item choosers rely on', () => {
		const editor = getCurrentProjectEditor();
		editor.nav.page = 'Characters';
		const pageButton = breadcrumbOrFail().querySelector('#nav-button-l1');
		expect(pageButton?.getAttribute('data-nav-type')).toBe('PAGE');
	});

	it('Navigate to page: About', () => {
		navigator.page = 'About';
		navigator.navigate(true);
		const pageContent = navigator.makePageContent();
		expect(pageContent.id).toBe('app__main-content');
		// Named in its own heading, not in a page-selector button - see the
		// Global actions test above.
		expect(pageContent.querySelector('.studio-page__title').innerHTML).toBe('About');
	});
});

/*
describe('Navigator: Panel Navigation', () => {
	let navigator;

	beforeEach(() => {
		navigator = new Navigator();
	});

	it('Navigate to panel: Layers', () => {
		navigator.page = 'Characters';
		navigator.panel = 'Layers';
		navigator.navigate(true);
		const pageContent = navigator.makePageContent();
		expect(pageContent.querySelector('#nav-button-l3 .nav-button__title').innerHTML).toBe('Layers');
	});

	it('Navigate to panel: Context characters', () => {
		navigator.page = 'Characters';
		navigator.panel = 'Context characters';
		navigator.navigate(true);
		const pageContent = navigator.makePageContent();
		expect(pageContent.querySelector('#nav-button-l3 .nav-button__title').innerHTML).toBe('Context characters');
	});

	it('Navigate to panel: History', () => {
		navigator.page = 'Characters';
		navigator.panel = 'History';
		navigator.navigate(true);
		const pageContent = navigator.makePageContent();
		expect(pageContent.querySelector('#nav-button-l3 .nav-button__title').innerHTML).toBe('History');
	});

	it('Navigate to panel: Guides', () => {
		navigator.page = 'Characters';
		navigator.panel = 'Guides';
		navigator.navigate(true);
		const pageContent = navigator.makePageContent();
		expect(pageContent.querySelector('#nav-button-l3 .nav-button__title').innerHTML).toBe('Guides');
	});
});
*/
