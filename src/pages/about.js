import { emailLink } from '../app/app.js';
import {
	PRODUCT_NAME,
	PRODUCT_URL,
	UPSTREAM_HELP,
	UPSTREAM_URL,
	VENDOR_NAME,
} from '../app/brand.js';
import { getCurrentProjectEditor, getGlyphrStudioApp } from '../app/main.js';
import { addAsChildren, makeElement } from '../common/dom.js';
import logoVertical from '../common/graphics/logo-wordmark-vertical.svg?raw';
import { TabControl } from '../controls/tabs/tab_control.js';
import { makeNavButton, toggleNavDropdown } from '../project_editor/navigator.js';

/**
 * Page > About
 * Information about the app..
 * @returns {Element} - page content
 */
export function makePage_About() {
	const content = makeElement({
		tag: 'div',
		id: 'app__page',
		innerHTML: `
		<div class="content__page">
			<div class="content-page__left-area">
				<div class="content-page__nav-area">
					${makeNavButton({ level: 'l1', superTitle: 'PAGE', title: 'About' })}
				</div>
				<div id="content-page__panel"></div>
			</div>
			<div class="content-page__right-area"></div>
		</div>
	`,
	});

	// Page Selector
	let l1 = content.querySelector('#nav-button-l1');
	l1.addEventListener('click', function () {
		toggleNavDropdown(l1);
	});

	const rightArea = content.querySelector('.content-page__right-area');
	const tabControl = new TabControl(rightArea);

	tabControl.registerTab('Version', makeVersionInfo);
	tabControl.registerTab('Contact and socials', makeContactInfo);
	tabControl.registerTab('License', makeLicenseInfo);

	tabControl.selectTab('Version');

	const panelArea = content.querySelector('#content-page__panel');
	addAsChildren(panelArea, [tabControl.makeTabs(), makeContributeCard()]);

	return content;
}

/**
 * Makes content for license info
 * @returns {Element}
 */
function makeLicenseInfo() {
	const content = makeElement({
		innerHTML: `
		<h1>License</h1>
		<h2>This app</h2>
		<br>
		<div class="page__card">
			<h3>${PRODUCT_NAME}</h3>
			<a href="${PRODUCT_URL}" target="_blank">bluerain.studio</a>
			<br><br>
			${PRODUCT_NAME} is a modified version of
			<a href="${UPSTREAM_URL}" target="_blank">Glyphr Studio</a>, and like it is
			licensed under a
			<a href='https://www.gnu.org/licenses/gpl.html' target='_blank'>GNU General
			Public License</a>, version 3 or later - a free / open source 'copyleft'
			license. You are free to use, distribute, and modify it as long as this
			license and its freeness stays intact.
			<br><br>
			<a href="https://github.com/samedcetin/glyphr_studio_2" target="_blank">Source
			code for this version</a>
			<br><br>
			Copyright © 2010 - 2026 Matthew LaGrandeur, for Glyphr Studio<br>
			Copyright © 2026 ${VENDOR_NAME}, for the modifications in ${PRODUCT_NAME}
		</div>

		<br><br><br>
		<h2>Fonts you create</h2>
		<p>
			Any font you create belongs 100% to you, and you must decide how to license it.<br>
			You can find out <a href="${UPSTREAM_HELP}/about/licensing.html" target="_blank">
			more about licensing on the Glyphr Studio help site</a>.
		</p>

		<br>
		<h2>Libraries</h2>
		<p>${PRODUCT_NAME} includes the following 3rd party libraries:</p>

		<div class="page__card">
			<h3>Font Flux JS</h3>
			Available on
			<a href="https://github.com/mattlag/Font-Flux-JS" target="_blank">GitHub</a>
			and
			<a href="https://www.npmjs.com/package/font-flux-js" target="_blank">NPM</a>.
			<br>
			Licensed under a
			<a href='https://www.gnu.org/licenses/gpl.html' target='_blank'>GNU General Public License</a>.
			<br>
			Copyright © 2026, Matthew LaGrandeur
		</div>

		<div class="page__card">
			<h3>bezier-boolean</h3>
			Available on
			<a href="https://github.com/mattlag/bezier-boolean" target="_blank">GitHub</a>
			and
			<a href="https://www.npmjs.com/package/bezier-boolean" target="_blank">NPM</a>.
			<br>
			Licensed under a
			<a href='https://www.gnu.org/licenses/gpl.html' target='_blank'>GNU General Public License</a>.
			<br>
			Copyright © 2026, Matthew LaGrandeur
		</div>

		<div class="page__card">
			<h3>SVG-to-Bézier</h3>
			Available on
			<a href="https://github.com/mattlag/SVG-to-Bezier" target="_blank">GitHub</a>
			and
			<a href="https://www.npmjs.com/package/svg-to-bezier" target="_blank">NPM</a>.
			<br>
			Licensed under a
			<a href='https://www.gnu.org/licenses/gpl.html' target='_blank'>GNU General Public License</a>.
			<br>
			Copyright © 2026, Matthew LaGrandeur
		</div>

		<div class="page__card">
			<h3>XMLtoJSON</h3>
			Available on
			<a href="https://github.com/mattlag/XMLtoJSON" target="_blank">GitHub</a>
			and
			<a href="https://www.npmjs.com/package/@mattlag/xmltojson" target="_blank">NPM</a>.
			<br>
			Licensed under a
			<a href='https://www.gnu.org/licenses/gpl.html' target='_blank'>GNU General Public License</a>.
			<br>
			Copyright © 2026, Matthew LaGrandeur
		</div>
	`,
	});

	return content;
}

/**
 * Makes content for version info
 * @returns {Element}
 */
function makeVersionInfo() {
	const editor = getCurrentProjectEditor();
	const app = getGlyphrStudioApp();
	const content = makeElement({
		innerHTML: `
			<div class="about-page__logo">
				${logoVertical}
			</div><br><br>
			<h1>Version information</h1>
			<div class="page__card">
				<h3>${PRODUCT_NAME}</h3>
				<label>Version name:</label> ${app.versionName}<br>
				<label>Version number:</label> ${app.version}<br>
				<label>Last updated on:</label> ${
					app.versionDate ? new Date(app.versionDate).toDateString() : '[n/a - dev edition]'
				}
			</div>

			<div class="page__card">
				<h3>This project</h3>
				<label>Project name:</label> ${editor.project.settings.project.name}<br>
				<label>Unique project ID:</label> ${editor.project.settings.project.id}<br>
				<label>Initially created with:</label> Version ${
					editor.project.settings.project.initialVersion
				}</span>
			</div>

			<br><br>

			<h2>More details</h2>
			<p>
				${PRODUCT_NAME} is built on Glyphr Studio and its version numbers follow
				that project. What changed in each of those versions is written up on the
				<a href="https://github.com/glyphr-studio/Glyphr-Studio-2/releases"
				target="_blank">Glyphr Studio releases</a> page and the
				<a href="${UPSTREAM_HELP}/about/updates.html" target="_blank">Glyphr Studio
				updates</a> page.
			</p>


		`,
	});

	return content;
}

/**
 * Makes content for contribution info in a card
 * @returns {Element}
 */
export function makeContributeCard() {
	const content = makeElement({
		className: 'panel__card full-width more-padding',
	});
	content.appendChild(makeContributeContent());
	return content;
}

/**
 * Makes content for contribution info
 * @returns {Element}
 */
export function makeContributeContent() {
	return makeElement({
		tag: 'div',
		attributes: { style: 'margin: 20px;' },
		innerHTML: `
			<h2>Built on Glyphr Studio</h2>
			${PRODUCT_NAME} is a modified version of
			<a href="${UPSTREAM_URL}" target="_blank">Glyphr Studio</a> by Matthew
			LaGrandeur, released under the GPL. The years of work underneath this editor
			are his.
			<br><br>
			The upstream project takes contributions at
			<a href="${UPSTREAM_URL}" target="_blank">glyphrstudio.com</a>, and that is
			where they belong - not with us.
			<br><br>
			<h2>Tell us what to fix</h2>
			For anything specific to ${PRODUCT_NAME}, write to ${emailLink()}, or open an
			issue on
			<a href="https://github.com/samedcetin/glyphr_studio_2/issues"
			target="_blank">GitHub</a>.
			`,
	});
}

/**
 * Makes content for contact info
 * @returns {Element}
 */
function makeContactInfo() {
	const content = makeElement({
		innerHTML: `
			<h1>Contact and socials</h1>

			<div class="about-page__contact-table">
				<h2>Web</h2>
				<span>Main site:</span>
				<a href="${PRODUCT_URL}" target="_blank">bluerain.studio</a>

				<span>Email:</span>
				${emailLink()}

				<span>Source code:</span>
				<a href="https://github.com/samedcetin/glyphr_studio_2" target="_blank">github.com/samedcetin/glyphr_studio_2</a>

				<h2>Glyphr Studio</h2>
				The project this editor is built on. Its help still covers most of
				what is here, and its channels are its own - not ours.

				<span>Help:</span>
				<a href="${UPSTREAM_HELP}" target="_blank">glyphrstudio.com/help</a>

				<span>Site:</span>
				<a href="${UPSTREAM_URL}" target="_blank">glyphrstudio.com</a>

				<span>Source:</span>
				<a href="https://github.com/glyphr-studio" target="_blank">github.com/glyphr-studio</a>
			</div>
		`,
	});

	return content;
}
