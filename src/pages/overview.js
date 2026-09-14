import { getCurrentProject, getCurrentProjectEditor } from '../app/main.js';
import { makeElement } from '../common/dom.js';
import { countItems } from '../common/functions.js';
import { makeAllItemTypeChooserContent } from '../panels/item_chooser.js';

/**
	PAGE > OVERVIEW
	---------------
	The font, and every character in it.

	WHAT THIS PAGE WAS. A 450px column of three cards beside the grid. The
	first card repeated the page you were already on, in a dropdown that did
	what the rail on the left does. The second welcomed you to the app and
	linked to a blog, a tutorial and an email address - once useful, furniture
	from the second visit on. The third asked you to contribute. Between them
	they took 450 of every 1200 pixels, and the thing the page is named after
	got what was left.

	It is the grid now. What survived from those cards is the font's own
	facts - family, style, the metrics - because this is the page where you
	would look for them, and they fit on one line instead of seven.

	The specimen stays for the same reason: on a page about a font, the font
	showing itself is not decoration.
 */

/**
 * Page > Overview
 * @returns {Element} - page content
 */
export function makePage_Overview() {
	const project = getCurrentProject();
	const font = project.settings.font;

	const content = makeElement({ tag: 'div', id: 'app__page' });
	const page = makeElement({ className: 'overview' });
	content.appendChild(page);

	page.appendChild(makeOverviewHead(project, font));
	page.appendChild(makeSpecimen(project));
	page.appendChild(makeCharacterArea());

	return content;
}

/**
 * The font's name and its facts, on one line.
 *
 * The seven label-and-value rows of the old Project info card said family,
 * style, count, UPM, ascent and descent - none of which needs a row of its
 * own, and all of which are read at a glance rather than looked up one at a
 * time. They are a sentence under the name now.
 *
 * @param {Object} project - the current project
 * @param {Object} font - project.settings.font
 * @returns {Element}
 */
function makeOverviewHead(project, font) {
	const head = makeElement({ className: 'overview__head' });

	const identity = makeElement({ className: 'overview__identity' });
	identity.appendChild(
		makeElement({ tag: 'h1', className: 'overview__family', content: font.family })
	);

	/*
		The project name only earns a place when it is not simply the family
		name again, which is what it is in a project nobody has renamed - and
		two lines saying "Oblegg" is worse than one.
	*/
	const facts = [];
	if (project.settings.project.name && project.settings.project.name !== font.family) {
		facts.push(project.settings.project.name);
	}
	facts.push(font.style);
	facts.push(`${countItems(project.glyphs) + countItems(project.ligatures)} glyphs`);
	facts.push(`${font.upm} UPM`);
	facts.push(`${font.ascent} / ${font.descent}`);

	const meta = makeElement({ className: 'overview__meta' });
	facts.forEach((fact, index) => {
		if (index) meta.appendChild(makeElement({ tag: 'span', className: 'overview__meta-dot' }));
		meta.appendChild(makeElement({ tag: 'span', content: fact }));
	});
	identity.appendChild(meta);
	head.appendChild(identity);

	head.appendChild(
		makeElement({
			tag: 'fancy-button',
			innerHTML: 'Font settings',
			attributes: { secondary: '' },
			onClick: () => {
				const editor = getCurrentProjectEditor();
				editor.nav.page = 'Settings';
				editor.navigate();
			},
		})
	);

	return head;
}

/**
 * The font, set in itself.
 *
 * @param {Object} project - the current project
 * @returns {Element}
 */
function makeSpecimen(project) {
	const specimen = makeElement({ className: 'overview__specimen' });
	specimen.appendChild(
		makeElement({
			tag: 'display-canvas',
			attributes: {
				text: project.settings.app.previewText || 'Aa Bb Cc Xx Yy Zz',
				'font-size': '64',
				'show-placeholder-message': 'true',
			},
			title: 'Change this text on the Settings > App page.',
		})
	);
	return specimen;
}

/**
 * The characters, from the chooser the rest of the app already uses.
 *
 * @returns {Element}
 */
function makeCharacterArea() {
	const area = makeElement({ className: 'overview__characters' });
	area.appendChild(
		makeAllItemTypeChooserContent(
			(itemID) => {
				const editor = getCurrentProjectEditor();
				editor.selectedItemID = itemID;

				if (itemID.startsWith('glyph-')) editor.nav.page = 'Characters';
				else if (itemID.startsWith('liga-')) editor.nav.page = 'Ligatures';
				else if (itemID.startsWith('comp-')) editor.nav.page = 'Components';
				else if (itemID.startsWith('kern-')) editor.nav.page = 'Kerning';
				editor.navigate();

				editor.history.addState(`Navigated to ${editor.project.getItemName(itemID, true)}`);
			},
			'',
			getCurrentProjectEditor(),
			/* The page is the grid here, so the tiles get the room. */
			'large'
		)
	);
	return area;
}
