import { getCurrentProjectEditor } from '../app/main.js';
import { countItems } from '../common/functions.js';
import { makeElement } from '../common/dom.js';
import { makeLeftSidebarContent, refreshSidebars } from './sidebar.js';

/**
	PANELS
	------
	Thin compatibility layer over the sidebars.

	The four edit-canvas pages each build a `#editor-page__panel` container and
	call makePanel() to fill it, then call refreshPanel() when the selection
	changes. Both of those still work exactly as before - what changed is what
	they produce. makePanel() now returns the left sidebar's stack of sections
	rather than whichever single panel was chosen from a dropdown, and the right
	sidebar is installed alongside it by the navigator.

	See sidebar.js for the actual arrangement.
 */

/**
 * Assembles the left sidebar for the current page.
 * @returns {Element} - sidebar content
 */
export function makePanel() {
	const editor = getCurrentProjectEditor();
	const page = editor.nav.page;

	// Pages with nothing in them yet show their own first-run content instead.
	if (page === 'Components' && countItems(editor.project.components) <= 0) return makeElement();
	if (page === 'Ligatures' && countItems(editor.project.ligatures) <= 0) return makeElement();
	if (page === 'Kerning' && countItems(editor.project.kerning) <= 0) return makeElement();

	return makeLeftSidebarContent();
}

/**
 * Refreshes the mounted panels in place.
 *
 * Called from inside panel subscriptions, so it can fire several times for a
 * single edit. sidebar.js coalesces those into one rebuild per frame and keeps
 * sidebar scroll position, which the previous full innerHTML swap did not.
 */
export function refreshPanel() {
	refreshSidebars();
}
