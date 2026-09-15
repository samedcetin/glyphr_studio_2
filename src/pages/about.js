import { emailLink } from '../app/app.js';
import {
	PRODUCT_ISSUES_URL,
	PRODUCT_NAME,
	PRODUCT_SOURCE_URL,
	PRODUCT_URL,
	UPSTREAM_HELP,
	UPSTREAM_NAME,
	UPSTREAM_RELEASES_URL,
	UPSTREAM_SOURCE_URL,
	UPSTREAM_URL,
	VENDOR_NAME,
} from '../app/brand.js';
import { getCurrentProjectEditor, getGlyphrStudioApp } from '../app/main.js';
import { addAsChildren, makeElement } from '../common/dom.js';
import { makeLineIcon } from '../common/icons.js';
import { TabControl } from '../controls/tabs/tab_control.js';

/**
	PAGE > ABOUT
	------------
	What this app is, who built it, and how it is licensed.

	WHAT THIS PAGE WAS. The last content page still on the old shell: a 450px
	column holding a dropdown that named the page you were already on, the
	three tab names stacked under it, and a card of attribution - beside a
	panel whose first screen was the upstream Glyphr Studio wordmark at 300px.
	Our own About page led with someone else's logo.

	WHAT IT IS. The shared page shell, the same one Overview, Live preview,
	Global actions and Settings use: head, a segmented tab row, one card that
	scrolls. The identity at the top is set in type from the brand constants
	rather than drawn from an SVG, so it says what the product is called and
	changes when that constant does.

	Attribution to Matthew LaGrandeur and to Glyphr Studio is kept, and kept
	prominent - the GPL requires the notices and the credit is owed besides.
	See src/app/brand.js for the line between what is ours and what is theirs.
 */

/** The third-party code that ships inside the app, in load order. */
const LIBRARIES = [
	{
		name: 'Font Flux JS',
		repo: 'https://github.com/mattlag/Font-Flux-JS',
		npm: 'https://www.npmjs.com/package/font-flux-js',
	},
	{
		name: 'bezier-boolean',
		repo: 'https://github.com/mattlag/bezier-boolean',
		npm: 'https://www.npmjs.com/package/bezier-boolean',
	},
	{
		name: 'SVG-to-Bézier',
		repo: 'https://github.com/mattlag/SVG-to-Bezier',
		npm: 'https://www.npmjs.com/package/svg-to-bezier',
	},
	{
		name: 'XMLtoJSON',
		repo: 'https://github.com/mattlag/XMLtoJSON',
		npm: 'https://www.npmjs.com/package/@mattlag/xmltojson',
	},
];

const GPL_URL = 'https://www.gnu.org/licenses/gpl.html';

/**
 * Page > About
 * Information about the app.
 * @returns {Element} - page content
 */
export function makePage_About() {
	const content = makeElement({ tag: 'div', id: 'app__page' });
	const page = makeElement({ tag: 'div', className: 'studio-page about' });
	content.appendChild(page);

	// --- Head ----------------------------------------------------
	const head = makeElement({ tag: 'div', className: 'studio-page__head' });
	const titles = makeElement({ tag: 'div', className: 'studio-page__titles' });
	titles.appendChild(makeElement({ tag: 'h1', className: 'studio-page__title', content: 'About' }));
	titles.appendChild(
		makeElement({
			tag: 'div',
			className: 'studio-page__subtitle',
			content: 'What this app is, who built it, and how it is licensed.',
		})
	);
	head.appendChild(titles);
	page.appendChild(head);

	/*
		No head context. The other pages put what you are working on up there -
		which slice of the font is on screen - and this page is not about the
		font. The product name and version belong to the identity block in the
		first tab, and saying them twice sixty pixels apart said nothing.
	*/

	// --- Tabs, and what they switch ------------------------------
	/* No .studio-tab-body: the page scrolls here, not the card. See .about. */
	const body = makeElement({ tag: 'div', className: 'studio-card' });
	const tabControl = new TabControl(body);

	tabControl.registerTab('Version', makeVersionInfo, { icon: 'page_about' });
	tabControl.registerTab('Contact', makeContactInfo, { icon: 'mail' });
	tabControl.registerTab('License', makeLicenseInfo, { icon: 'label' });

	const tabs = makeElement({ tag: 'div', className: 'studio-tabs about__tabs' });
	addAsChildren(tabs, tabControl.makeTabs());
	page.appendChild(tabs);

	page.appendChild(body);
	tabControl.selectTab('Version');

	return content;
}

// --------------------------------------------------------------
// Shared pieces
// --------------------------------------------------------------

/**
 * One block inside a tab: a small caps title, then whatever it holds.
 * @param {String} title - the eyebrow over the block
 * @param {String} innerHTML - the block's content
 * @returns {Element}
 */
function makeSection(title, innerHTML) {
	const section = makeElement({ tag: 'section', className: 'about__section' });
	section.appendChild(makeElement({ tag: 'div', className: 'studio-eyebrow', content: title }));
	section.appendChild(makeElement({ tag: 'div', className: 'about__section-body', innerHTML }));
	return section;
}

/**
 * A label / value table.
 *
 * The third field says whether the value is a number: version numbers and
 * project IDs are read a character at a time and compared down the column, so
 * they are mono and tabular. A project's name is a name, and was harder to
 * read set as though it were a serial number.
 *
 * @param {Array} rows - [label, value, isNumeric] triples
 * @returns {String}
 */
function specTable(rows) {
	const cells = rows
		.map(([label, value, isNumeric]) => {
			const valueClass = isNumeric
				? 'about__spec-value about__spec-value--mono'
				: 'about__spec-value';
			return `<dt class="about__spec-label">${label}</dt><dd class="${valueClass}">${value}</dd>`;
		})
		.join('');
	return `<dl class="about__spec">${cells}</dl>`;
}

/**
 * A row of links out of the app.
 * @param {Array} rows - [label, href] pairs, or [label, href, display] when the
 *	link's text is a sentence rather than the address itself
 * @returns {String}
 */
function linkTable(rows) {
	const cells = rows
		.map(
			([label, href, display]) =>
				`<dt class="about__spec-label">${label}</dt>
				<dd class="about__spec-value"><a href="${href}" target="_blank">${
					display || displayURL(href)
				}</a></dd>`
		)
		.join('');
	return `<dl class="about__spec">${cells}</dl>`;
}

/**
 * A URL as it is written down rather than as it is typed.
 *
 * Seven of these rows used to carry the address twice - once as the href, once
 * as a string spelling out the same thing - so a constant could move and the
 * label beside it would go on naming where it used to point, silently. A row
 * only states its own text now when that text is a sentence rather than an
 * address.
 *
 * @param {String} url - the href
 * @returns {String} - without the scheme, the www, or a trailing slash
 */
function displayURL(url) {
	return String(url)
		.replace(/^https?:\/\//, '')
		.replace(/^www\./, '')
		.replace(/\/$/, '');
}

// --------------------------------------------------------------
// Version
// --------------------------------------------------------------

/**
 * Makes content for version info
 * @returns {Element}
 */
function makeVersionInfo() {
	const editor = getCurrentProjectEditor();
	const app = getGlyphrStudioApp();
	const project = editor.project.settings.project;

	const content = makeElement({ tag: 'div', className: 'about__tab-content' });

	/*
		The identity, set in type. This is where the upstream wordmark used to
		be - 300px of someone else's logo on our own About page. Setting the
		name instead of drawing it means it follows PRODUCT_NAME, and it is
		legible in both themes without a second asset.
	*/
	const identity = makeElement({ tag: 'div', className: 'about__identity' });
	identity.appendChild(
		makeElement({ tag: 'div', className: 'about__mark', innerHTML: makeLineIcon('appMark', 30) })
	);
	const identityText = makeElement({ tag: 'div', className: 'about__identity-text' });
	identityText.appendChild(
		makeElement({ tag: 'div', className: 'about__name', content: PRODUCT_NAME })
	);
	identityText.appendChild(
		makeElement({
			tag: 'div',
			className: 'about__tagline',
			content: `A font editor by ${VENDOR_NAME}, built on ${UPSTREAM_NAME}.`,
		})
	);
	identity.appendChild(identityText);
	identity.appendChild(makeElement({ tag: 'div', className: 'about__chip', content: app.version }));
	content.appendChild(identity);

	content.appendChild(makeElement({ tag: 'div', className: 'studio-rule' }));

	const columns = makeElement({ tag: 'div', className: 'about__columns' });
	columns.appendChild(
		makeSection(
			'This app',
			specTable([
				['Version name', app.versionName],
				['Version number', app.version, true],
				[
					'Last updated',
					app.versionDate ? new Date(app.versionDate).toDateString() : 'Not set — dev edition',
				],
			])
		)
	);
	columns.appendChild(
		makeSection(
			'This project',
			specTable([
				['Project name', project.name],
				['Project ID', project.id, true],
				['Created with', `Version ${project.initialVersion}`],
			])
		)
	);
	content.appendChild(columns);

	content.appendChild(makeElement({ tag: 'div', className: 'studio-rule' }));

	content.appendChild(
		makeSection(
			`Built on ${UPSTREAM_NAME}`,
			`<p class="about__prose">
				${PRODUCT_NAME} is a modified version of
				<a href="${UPSTREAM_URL}" target="_blank">${UPSTREAM_NAME}</a> by Matthew
				LaGrandeur, released under the GPL. The years of work underneath this
				editor are his, and the upstream project takes contributions at
				<a href="${UPSTREAM_URL}" target="_blank">glyphrstudio.com</a> — that is
				where they belong, not with us.
			</p>
			<p class="about__prose">
				Version numbers follow that project. What changed in each of them is
				written up on the
				<a href="${UPSTREAM_RELEASES_URL}" target="_blank">${UPSTREAM_NAME} releases</a>
				page and the
				<a href="${UPSTREAM_HELP}/about/updates.html" target="_blank">${UPSTREAM_NAME} updates</a>
				page.
			</p>`
		)
	);

	return content;
}

// --------------------------------------------------------------
// Contact
// --------------------------------------------------------------

/**
 * Makes content for contact info
 * @returns {Element}
 */
function makeContactInfo() {
	const content = makeElement({ tag: 'div', className: 'about__tab-content' });

	content.appendChild(
		makeSection(
			PRODUCT_NAME,
			`<p class="about__prose">
				For anything specific to ${PRODUCT_NAME} — a bug, a feature, something
				that reads wrong — write to us or open an issue. Both reach the same
				people.
			</p>` +
				linkTable([
					['Site', PRODUCT_URL],
					['Source', PRODUCT_SOURCE_URL],
					['Issues', PRODUCT_ISSUES_URL, 'Report a bug or ask for a feature'],
				]) +
				`<dl class="about__spec">
					<dt class="about__spec-label">Email</dt>
					<dd class="about__spec-value">${emailLink()}</dd>
				</dl>`
		)
	);

	content.appendChild(makeElement({ tag: 'div', className: 'studio-rule' }));

	content.appendChild(
		makeSection(
			UPSTREAM_NAME,
			`<p class="about__prose">
				The project this editor is built on. Its help still covers most of what
				is here, and its channels are its own — questions about ${PRODUCT_NAME}
				should not go to them.
			</p>` +
				linkTable([
					['Help', UPSTREAM_HELP],
					['Site', UPSTREAM_URL],
					['Source', UPSTREAM_SOURCE_URL],
				])
		)
	);

	return content;
}

// --------------------------------------------------------------
// License
// --------------------------------------------------------------

/**
 * Makes content for license info
 * @returns {Element}
 */
function makeLicenseInfo() {
	const content = makeElement({ tag: 'div', className: 'about__tab-content' });

	content.appendChild(
		makeSection(
			'This app',
			`<p class="about__prose">
				${PRODUCT_NAME} is a modified version of
				<a href="${UPSTREAM_URL}" target="_blank">${UPSTREAM_NAME}</a>, and like it
				is licensed under a
				<a href="${GPL_URL}" target="_blank">GNU General Public License</a>,
				version 3 or later — a free, open source copyleft license. You are free
				to use, distribute and modify it as long as this license and its
				freeness stay intact.
			</p>` +
				linkTable([
					['Site', PRODUCT_URL],
					['Source', PRODUCT_SOURCE_URL],
				]) +
				`<p class="about__copyright">
					Copyright © 2010–2026 Matthew LaGrandeur, for ${UPSTREAM_NAME}<br>
					Copyright © 2026 ${VENDOR_NAME}, for the modifications in ${PRODUCT_NAME}
				</p>`
		)
	);

	content.appendChild(makeElement({ tag: 'div', className: 'studio-rule' }));

	content.appendChild(
		makeSection(
			'Fonts you create',
			`<p class="about__prose">
				Any font you create belongs 100% to you, and you decide how to license
				it. There is
				<a href="${UPSTREAM_HELP}/about/licensing.html" target="_blank">more about
				licensing on the ${UPSTREAM_NAME} help site</a>.
			</p>`
		)
	);

	content.appendChild(makeElement({ tag: 'div', className: 'studio-rule' }));

	const libraryRows = LIBRARIES.map(
		(library) => `
		<div class="about__library">
			<div class="about__library-name">${library.name}</div>
			<div class="about__library-meta">
				GNU General Public License · Copyright © 2026, Matthew LaGrandeur
			</div>
			<div class="about__library-links">
				<a href="${library.repo}" target="_blank">GitHub</a>
				<a href="${library.npm}" target="_blank">NPM</a>
			</div>
		</div>`
	).join('');

	content.appendChild(
		makeSection(
			'Libraries',
			`<p class="about__prose">
				${PRODUCT_NAME} includes these third party libraries, each under a
				<a href="${GPL_URL}" target="_blank">GNU General Public License</a>.
			</p>
			<div class="about__library-list">${libraryRows}</div>`
		)
	);

	return content;
}
