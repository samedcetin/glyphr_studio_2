import { emailLink } from '../app/app.js';
import wordmarkVertical from '../common/graphics/bluerain-wordmark-vertical.svg';
import {
	PRODUCT_ISSUES_URL,
	PRODUCT_NAME,
	PRODUCT_SOURCE_URL,
	PRODUCT_URL,
	/* Only the two the legal notice needs. UPSTREAM_HELP, _RELEASES_URL,
	   _SOURCE_URL and _VERSION went with the courtesy sections; they are still
	   exported from brand.js because help.js uses the first one. */
	UPSTREAM_NAME,
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
	addAsChildren(tabs, tabControl.makeTabs({ segmented: true }));
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
		The studio, first. The vertical wordmark on its own black plate - the
		mark is drawn for that ground and no other, so the plate does not
		follow the theme. It is the publisher, not the product: the product
		is the identity row beneath it, set in type from PRODUCT_NAME.
	*/
	const hero = makeElement({ tag: 'div', className: 'about__hero' });
	hero.appendChild(
		makeElement({
			tag: 'img',
			className: 'about__wordmark',
			attributes: { src: wordmarkVertical, alt: VENDOR_NAME, width: '1025', height: '1239' },
		})
	);
	content.appendChild(hero);

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
			/* The provenance lives on the License tab, where the notice is.
			   Repeating it in the identity line put the upstream name in the
			   first thing anyone reads about this app. */
			content: `A font editor by ${VENDOR_NAME}.`,
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

	/*
		THE UPSTREAM SECTION THAT USED TO SIT HERE IS GONE, and what it was
		doing is worth writing down so nobody puts it back by accident.

		It ran three paragraphs on the Version tab: that Glyva is a modified
		version of Glyphr Studio, that contributions belong upstream, that this
		build carries 2.10.3 underneath, plus links to their releases and
		updates pages. All of it was manners, none of it was law. Checked:
		the repo's LICENSE is plain GPL-3.0 with no section 7 additional terms,
		there is no NOTICE or AUTHORS file, and upstream ships no per-file
		copyright headers — so nothing obliged this app to carry the upstream
		project's NAME anywhere.

		What the licence does oblige is on the License tab, where a legal notice
		belongs: that this is a modified version and when, the GPL, the absence
		of warranty, both copyright lines, and the offer of source. That is the
		floor and it is kept in full.
	*/

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

	/*
		The upstream block that sat here — their help, site and source, under
		the heading "Glyphr Studio" — is gone. It was a courtesy: the licence
		notice on the License tab already names the project, and a Contact tab
		is for reaching US. Its one useful sentence, "questions about Glyva
		should not go to them", only existed because the block invited people
		to go there in the first place.

		THE HELP MENU STILL LINKS TO THEIR DOCUMENTATION, deliberately and
		separately (see src/pages/help.js, and the note in brand.js). That is
		not sentiment, it is the only documentation this editor has; removing
		it costs users something real, and it goes when Glyva has help of its
		own — not before.
	*/

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
			/*
				THE LEGAL FLOOR, AND NOTHING ON TOP OF IT.

				Every clause here is carrying a GPL-3.0 obligation:
				  · "a modified version of ... in 2026" — §5(a), which wants a
				    notice that the work was modified AND a date. The date used
				    to live only in the copyright line; it is in the sentence
				    now so the notice stands on its own.
				  · "no warranty" — §0's definition of Appropriate Legal
				    Notices, which §5(d) requires an interactive interface to
				    display. IT WAS MISSING ENTIRELY. Removing upstream's name
				    from the rest of the app and leaving this out would have
				    traded a courtesy we did not owe for a term we do.
				  · both copyright lines — §4, keep intact. Matthew LaGrandeur
				    wrote the large majority of the code still running here.
				  · the source link — §6.

				The upstream name stays in exactly this one sentence. It is not
				strictly compelled: §5(a) asks us to say the work was modified,
				not to name what it was modified from, and there is no section 7
				attribution clause in this repo. It stays because the provenance
				is trivially checkable anyway — the repository is named
				glyphr_studio_2, project files are .gs2 — so cutting the name
				would conceal nothing and look like an attempt to.
			*/
			`<p class="about__prose">
				${PRODUCT_NAME} is a modified version of
				<a href="${UPSTREAM_URL}" target="_blank">${UPSTREAM_NAME}</a>, modified in
				2026 by ${VENDOR_NAME} and, like the original, licensed under the
				<a href="${GPL_URL}" target="_blank">GNU General Public License</a>,
				version 3 or later — a free, open source copyleft license. You are free
				to use, distribute and modify it as long as this license and its
				freeness stay intact.
			</p>
			<p class="about__prose">
				It comes with <strong>absolutely no warranty</strong>, to the extent
				permitted by law.
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
			/* The sentence stands without sending the reader to another
			   project's help site to finish it. Font licensing is not
			   something this editor decides, and the upstream page it linked
			   was general advice rather than anything about Glyva. */
			`<p class="about__prose">
				Any font you create belongs 100% to you, and you decide how to license
				it. Nothing in this editor's licence reaches the fonts you make with it.
			</p>`
		)
	);

	content.appendChild(makeElement({ tag: 'div', className: 'studio-rule' }));

	const libraryRows = LIBRARIES.map(
		(library) => `
		<div class="about__library">
			<div class="about__library-name">${library.name}</div>
			<!--
				NO YEAR. This line used to read "Copyright © 2026, Matthew
				LaGrandeur" for all four libraries, hardcoded in the template.
				The author is right — every one of these is from
				github.com/mattlag — but 2026 came from nowhere: it is the year
				this page was written, not the year any of these was published,
				and all four predate it. Their own packages carry no copyright
				line to copy either; the LICENSE files are the plain GPL text,
				whose 2007 FSF header belongs to the licence document rather
				than to the software.

				So the year is gone rather than guessed. Naming the holder and
				the licence is the part we can stand behind; inventing a date on
				somebody else's notice is the kind of small inaccuracy this
				project does not accept anywhere else.
			-->
			<div class="about__library-meta">
				GNU General Public License · Matthew LaGrandeur
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
