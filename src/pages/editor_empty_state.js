import { getCurrentProject, getCurrentProjectEditor } from '../app/main.js';
import { makeElement } from '../common/dom.js';
import { makeLineIcon } from '../common/icons.js';

/**
	EDITOR EMPTY STATE
	------------------
	What Ligatures, Components and Kerning show when the project has none.

	The upstream "first run" page was an essay - what a ligature is, a table
	of Latin examples, two paragraphs on class-based kerning - laid out at
	the top left of the canvas, where the left panel the page was not
	drawing still sat on top of it and the breadcrumb sat on its heading. A
	new project has three of these pages, so the first thing a new user met
	was three broken walls of text.

	This is the hub's empty state brought onto the canvas: one plate with
	the page's icon, one fragment naming what is absent, one sentence saying
	what the thing is and one saying what to do, then the actions. Centred
	in the ground, because on an empty page the canvas is all there is. The
	explanation lives in Help; this only has to orient.
 */

/**
 * @typedef {Object} EmptyStateAction
 * @property {String} label - the button's text, verb + object, with an
 *   ellipsis when it opens a dialog first
 * @property {Function} onClick - what the button does
 * @property {Boolean=} secondary - the plain button; at most one primary
 */

/**
 * Builds the centred empty-state block for an editor page.
 * @param {Object} options
 * @param {String} options.icon - a lineIcons name, the page's own
 * @param {String} options.title - what is absent: "No ligatures yet"
 * @param {String} options.body - one or two sentences, what and what next
 * @param {Array<EmptyStateAction>} options.actions - the buttons, primary first
 * @returns {Element}
 */
export function makeEditorEmptyState({ icon, title, body, actions = [] }) {
	const block = makeElement({ className: 'editor-empty' });

	block.appendChild(
		makeElement({ className: 'editor-empty__mark', innerHTML: makeLineIcon(icon, 20) })
	);
	block.appendChild(makeElement({ tag: 'h2', className: 'editor-empty__title', content: title }));
	block.appendChild(makeElement({ tag: 'p', className: 'editor-empty__body', content: body }));

	if (actions.length) {
		const row = makeElement({ className: 'editor-empty__actions' });
		actions.forEach((action) => {
			const button = makeElement({
				tag: 'fancy-button',
				innerHTML: action.label,
				attributes: action.secondary ? { secondary: '' } : {},
				onClick: action.onClick,
			});
			row.appendChild(button);
		});
		block.appendChild(row);
	}

	return block;
}

/**
 * Whether any character in the project has an outline yet.
 *
 * A brand-new project has its character slots but nothing drawn in them.
 * Kerning has nothing to pair until that changes, and the empty state says
 * so rather than offering a dialog whose result would be invisible.
 *
 * @returns {Boolean}
 */
export function projectHasDrawnCharacters() {
	const glyphs = getCurrentProject()?.glyphs || {};
	return Object.values(glyphs).some((glyph) => glyph?.shapes?.length > 0);
}

/**
 * Sends the editor to the Characters page.
 */
export function goToCharacters() {
	const editor = getCurrentProjectEditor();
	editor.nav.page = 'Characters';
	editor.navigate();
}
