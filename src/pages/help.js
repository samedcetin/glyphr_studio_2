import { emailLink } from '../app/app.js';
import { PRODUCT_NAME, UPSTREAM_HELP, UPSTREAM_NAME } from '../app/brand.js';
import { makeElement } from '../common/dom.js';
import { makeLineIcon } from '../common/icons.js';
import { showKeyboardShortcuts } from '../controls/command-palette/command_palette.js';

/**
	PAGE > HELP
	-----------
	Where to learn this, and who to ask.

	WHAT THIS PAGE WAS. The last screen on the old content shell: a 450px
	column holding a dropdown that named the page you were already on, two tab
	names stacked under it, and beside them a wall of links in 400px cards.

	The second tab was a keyboard shortcut table - a second implementation of
	the one Ctrl+/ already opens, written before the token system, with its own
	key caps and its own layout, and it wrote the whole table to the console as
	markdown on every render. Two designs of one table is one too many, and the
	sheet is the better of them: a dialog reachable from anywhere beats a page
	you have to navigate to. So this page names the shortcut and opens it.

	WHAT IT IS. Two things you can do - see every shortcut, write to us - and
	then the documentation, which is upstream's. The page says so once, in one
	sentence, rather than leaving twenty-three links to imply it.

	Every URL here is built from UPSTREAM_HELP. The day we write our own docs
	it is one constant that changes, not twenty-three hrefs. See
	src/app/brand.js for the line between what is ours and what is theirs.
 */

/**
 * The prose documentation, grouped as the help site groups it.
 * Paths only - the origin comes from UPSTREAM_HELP.
 */
const DOC_GROUPS = [
	{
		title: 'Getting started',
		links: [
			['Navigation', 'getting-started/navigation.html'],
			['Editing', 'getting-started/editing.html'],
			['Keyboard shortcuts', 'getting-started/keyboard-shortcuts.html'],
			['Import and export', 'getting-started/import-export.html'],
			['Multiple projects', 'getting-started/working-with-multiple-projects.html'],
		],
	},
	{
		title: 'Common questions',
		links: [
			['Transparent overlaps', 'faq/transparent-overlaps.html'],
			['Curly quotes', 'faq/curly-quotes.html'],
			['Font family', 'faq/font-family.html'],
			['Running it locally', 'faq/run-locally.html'],
		],
	},
	{
		title: 'About the project',
		links: [
			['Features', 'about/features.html'],
			['Updates', 'about/updates.html'],
			['Licensing', 'about/licensing.html'],
		],
	},
];

/**
 * One page of the editor, each with a page of documentation.
 *
 * These are a different kind of thing from the guides above - an index, not
 * reading - so they flow as one list of short names rather than sitting in a
 * fourth column that would be twice the height of the other three.
 */
const PAGE_LINKS = [
	['Open project', 'pages/open-project.html'],
	['Overview', 'pages/overview.html'],
	['Characters', 'pages/characters.html'],
	['Ligatures', 'pages/ligatures.html'],
	['Components', 'pages/components.html'],
	['Kerning', 'pages/kerning.html'],
	['Live preview', 'pages/live-preview.html'],
	['Global actions', 'pages/global-actions.html'],
	['Settings', 'pages/settings.html'],
	['Help', 'pages/help.html'],
	['About', 'pages/about.html'],
];

/**
 * Page > Help
 * @returns {Element} - page content
 */
export function makePage_Help() {
	const content = makeElement({ tag: 'div', id: 'app__page' });
	const page = makeElement({ tag: 'div', className: 'studio-page help' });
	content.appendChild(page);

	// --- Head ----------------------------------------------------
	const head = makeElement({ tag: 'div', className: 'studio-page__head' });
	const titles = makeElement({ tag: 'div', className: 'studio-page__titles' });
	titles.appendChild(makeElement({ tag: 'h1', className: 'studio-page__title', content: 'Help' }));
	titles.appendChild(
		makeElement({
			tag: 'div',
			className: 'studio-page__subtitle',
			content: 'Where to learn this, and who to ask.',
		})
	);
	head.appendChild(titles);
	page.appendChild(head);

	// --- The two things you can do here --------------------------
	const actions = makeElement({ tag: 'div', className: 'help__actions' });
	actions.appendChild(makeShortcutsCard());
	actions.appendChild(makeContactCard());
	page.appendChild(actions);

	// --- The documentation ---------------------------------------
	page.appendChild(makeDocsCard());

	return content;
}

/**
 * The keyboard shortcuts, which live in a dialog rather than on this page.
 * @returns {Element}
 */
function makeShortcutsCard() {
	const isMac = navigator.platform.toLowerCase().includes('mac');
	const card = makeElement({ tag: 'div', className: 'studio-card help__card' });

	card.appendChild(makeElement({ tag: 'div', className: 'studio-eyebrow', content: 'Work faster' }));
	card.appendChild(
		makeElement({ tag: 'h2', className: 'help__card-title', content: 'Keyboard shortcuts' })
	);
	card.appendChild(
		makeElement({
			tag: 'p',
			className: 'help__card-body',
			innerHTML: `Every shortcut in the app on one sheet. It opens from anywhere with
				<code>${isMac ? '⌘' : 'Ctrl'}</code><code>/</code>.`,
		})
	);
	card.appendChild(
		makeElement({
			tag: 'button',
			className: 'hub-button help__card-action',
			attributes: { type: 'button' },
			innerHTML: `${makeLineIcon('keyboard', 16)}<span>Show shortcuts</span>`,
			onClick: showKeyboardShortcuts,
		})
	);

	return card;
}

/**
 * Who to ask, when the documentation does not cover it.
 * @returns {Element}
 */
function makeContactCard() {
	const card = makeElement({ tag: 'div', className: 'studio-card help__card' });

	card.appendChild(makeElement({ tag: 'div', className: 'studio-eyebrow', content: 'Ask us' }));
	card.appendChild(
		makeElement({ tag: 'h2', className: 'help__card-title', content: 'Something not working?' })
	);
	card.appendChild(
		makeElement({
			tag: 'p',
			className: 'help__card-body',
			innerHTML: `Tell us what you were doing and what happened instead. A bug, a feature you
				need, or a label that reads wrong — it all reaches the people who build
				${PRODUCT_NAME}.`,
		})
	);
	card.appendChild(
		makeElement({
			tag: 'div',
			className: 'help__card-action',
			innerHTML: emailLink('Write to us'),
		})
	);

	return card;
}

/**
 * The documentation: three columns of guides, then the page index.
 * @returns {Element}
 */
function makeDocsCard() {
	const card = makeElement({ tag: 'div', className: 'studio-card help__docs' });

	const docsHead = makeElement({ tag: 'div', className: 'help__docs-head' });
	docsHead.appendChild(
		makeElement({ tag: 'div', className: 'studio-eyebrow', content: 'Documentation' })
	);
	docsHead.appendChild(
		makeElement({
			tag: 'a',
			className: 'studio-link',
			attributes: { href: UPSTREAM_HELP, target: '_blank' },
			innerHTML: `<span>${UPSTREAM_NAME} help</span>${makeLineIcon('externalLink', 14)}`,
		})
	);
	card.appendChild(docsHead);

	card.appendChild(
		makeElement({
			tag: 'p',
			className: 'help__docs-note',
			content: `Written for ${UPSTREAM_NAME}, and accurate for most of this editor — we have
				none of our own yet. Everything below opens in a new tab.`,
		})
	);

	const groups = makeElement({ tag: 'div', className: 'help__groups' });
	DOC_GROUPS.forEach((group) => {
		const column = makeElement({ tag: 'div', className: 'help__group' });
		column.appendChild(
			makeElement({ tag: 'h3', className: 'help__group-title', content: group.title })
		);
		column.appendChild(makeLinkList(group.links));
		groups.appendChild(column);
	});
	card.appendChild(groups);

	card.appendChild(makeElement({ tag: 'div', className: 'studio-rule' }));

	card.appendChild(
		makeElement({ tag: 'h3', className: 'help__group-title', content: 'Every page, explained' })
	);
	card.appendChild(makeLinkList(PAGE_LINKS, 'help__links--index'));

	return card;
}

/**
 * A list of links out to the help site.
 * @param {Array} links - [label, path] pairs, path relative to UPSTREAM_HELP
 * @param {String =} extraClass - a layout variant
 * @returns {Element}
 */
function makeLinkList(links, extraClass = '') {
	const list = makeElement({
		tag: 'ul',
		className: `help__links${extraClass ? ` ${extraClass}` : ''}`,
	});

	links.forEach(([label, path]) => {
		const item = makeElement({ tag: 'li' });
		item.appendChild(
			makeElement({
				tag: 'a',
				className: 'help__link',
				attributes: { href: `${UPSTREAM_HELP}/${path}`, target: '_blank' },
				/*
					The arrow is drawn at rest and hidden with opacity, not with
					display: it holds its own width either way, so a row does not
					reflow under the pointer.
				*/
				innerHTML: `<span>${label}</span><span class="help__link-arrow">${makeLineIcon(
					'externalLink',
					13
				)}</span>`,
			})
		);
		list.appendChild(item);
	});

	return list;
}

/*
	makeKeyboardShortcutReference was here, and went with the tab that held it.
	showKeyboardShortcuts in controls/command-palette/command_palette.js is the
	one that ships: built from a data array rather than by string
	concatenation, reachable from anywhere, and already what Ctrl+/ and the
	Help menu open. Nothing outside this file ever imported the copy.
*/
