import { getCurrentProject, getCurrentProjectEditor } from '../app/main.js';
import { makeElement } from '../common/dom.js';
import { makeLineIcon } from '../common/icons.js';
import { makeFancySlider } from '../controls/fancy-slider/fancy_slider.js';
import { makeAllItemTypeChooserContent } from '../panels/item_chooser.js';
import { timeAgo } from '../panels/history.js';

/**
	PAGE > OVERVIEW
	---------------
	The font, and every character in it.

	Four blocks down one column:

		HEAD       what this page is, and which range and style you are looking
		           at right now.
		SPECIMEN   the font set in itself, with the controls that drive it -
		           what it says, how big, which style.
		COVERAGE   every character, with how far through the set you are.
		SNAPSHOT   the numbers that define the font, what you last touched, and
		           the way back into it.

	WHAT THIS PAGE WAS. A 450px column of three cards beside the grid: a
	dropdown repeating the page you were already on, a welcome message linking
	to a blog and a tutorial, and a request to contribute. Between them they
	took 450 of every 1200 pixels, and the thing the page is named after got
	what was left.
 */

/** Sizes the specimen offers. The slider covers everything between. */
const PREVIEW_SIZES = [24, 36, 48, 64, 72, 96, 128, 160];

/** Style names a font usually ships under. */
const FONT_STYLES = [
	'Thin',
	'ExtraLight',
	'Light',
	'Regular',
	'Medium',
	'SemiBold',
	'Bold',
	'ExtraBold',
	'Black',
	'Italic',
];

const DEFAULT_PREVIEW = 'Hamburgefontsiv';
const PANGRAM = 'The quick brown fox jumps over the lazy dog.';

/**
 * Page > Overview
 * @returns {Element} - page content
 */
export function makePage_Overview() {
	const content = makeElement({ tag: 'div', id: 'app__page' });
	const page = makeElement({ className: 'overview' });
	content.appendChild(page);

	page.appendChild(makeHead());
	page.appendChild(makeSpecimenCard());

	const columns = makeElement({ className: 'overview__columns' });
	columns.appendChild(makeCoverageCard());
	columns.appendChild(makeSnapshotCard());
	page.appendChild(columns);

	/*
		The chooser says when its range changes; the page decides what that
		means for the parts of it that are not the chooser. See showItemRange.
	*/
	page.addEventListener('chooser-range-change', (event) => {
		// @ts-expect-error 'CustomEvent detail'
		const rangeName = event.detail?.name || '';
		const context = page.querySelector('.overview__context-range');
		if (context) context.textContent = rangeName;

		/*
			The coverage is the range's, so it moves with it. Read back off the
			editor rather than from the event, because assigning 'Ligatures' to
			selectedCharacterRange does not stick - see rangeCountText.
		*/
		const editor = getCurrentProjectEditor();
		const target =
			rangeName === 'Ligatures' || rangeName === 'Components'
				? rangeName
				: editor.selectedCharacterRange;
		refreshCoverage(target);

		const search = page.querySelector('.overview__search input');
		if (search instanceof HTMLInputElement && search.value) {
			search.value = '';
			search.dispatchEvent(new Event('input'));
		}
	});

	return content;
}

// --------------------------------------------------------------
// Head
// --------------------------------------------------------------

/**
 * What the page is, and what you are looking at on it.
 * @returns {Element}
 */
function makeHead() {
	const editor = getCurrentProjectEditor();
	const project = getCurrentProject();

	const head = makeElement({ className: 'overview__head' });

	const titles = makeElement({ className: 'overview__titles' });
	titles.appendChild(makeElement({ tag: 'h1', className: 'overview__title', content: 'Overview' }));
	titles.appendChild(
		makeElement({
			className: 'overview__subtitle',
			content: 'Shape, review, and complete your typeface.',
		})
	);
	head.appendChild(titles);

	/*
		Which slice of the font is on screen. The range half changes as you
		move through the coverage grid, so it is marked for the range-change
		handler in makePage_Overview to write into.
	*/
	const context = makeElement({ className: 'overview__context' });
	context.appendChild(
		makeElement({
			tag: 'span',
			className: 'overview__context-range',
			content: editor.selectedCharacterRange?.name || 'Characters',
		})
	);
	context.appendChild(makeElement({ tag: 'span', className: 'overview__dot' }));
	context.appendChild(
		makeElement({
			tag: 'span',
			className: 'overview__context-style',
			content: project.settings.font.style || 'Regular',
		})
	);
	head.appendChild(context);

	return head;
}

// --------------------------------------------------------------
// Specimen
// --------------------------------------------------------------

/**
 * The font set in itself, and the controls that drive it.
 *
 * Two lines rather than one: a word at display size, where you judge shapes
 * against each other, and a sentence at reading size, where you judge rhythm.
 * `Hamburgefontsiv` is the word type designers use for the first, because
 * between them those letters carry most of the decisions in a Latin face.
 *
 * @returns {Element}
 */
function makeSpecimenCard() {
	const project = getCurrentProject();
	const card = makeElement({ className: 'overview__card overview__specimen' });

	card.appendChild(
		makeElement({ className: 'overview__eyebrow', content: 'Typeface preview' })
	);

	const stage = makeElement({ className: 'overview__specimen-stage' });
	const startingText = project.settings.app.previewText || DEFAULT_PREVIEW;
	const startingSize = 72;

	const headline = makeElement({
		tag: 'display-canvas',
		className: 'overview__specimen-headline',
		attributes: {
			text: startingText,
			'font-size': `${startingSize}`,
			'show-placeholder-message': 'true',
		},
	});
	const line = makeElement({
		tag: 'display-canvas',
		className: 'overview__specimen-line',
		attributes: { text: PANGRAM, 'font-size': '28', 'show-placeholder-message': 'false' },
	});
	stage.appendChild(headline);
	stage.appendChild(line);
	card.appendChild(stage);

	card.appendChild(makeElement({ className: 'overview__rule' }));
	card.appendChild(makeSpecimenControls(headline, startingText, startingSize));

	return card;
}

/**
 * Sample text, size, style.
 *
 * The size preset and the slider are one value seen two ways - the presets are
 * the sizes anyone actually specifies, the slider is everything between - so
 * each one writes to the canvas and back to the other.
 *
 * @param {Element} headline - the display-canvas they drive
 * @param {String} startingText
 * @param {Number} startingSize
 * @returns {Element}
 */
function makeSpecimenControls(headline, startingText, startingSize) {
	const project = getCurrentProject();
	const controls = makeElement({ className: 'overview__controls' });

	// --- Sample text ---------------------------------------------
	const textField = makeElement({
		tag: 'input',
		className: 'overview__text-input',
		attributes: { type: 'text', value: startingText, spellcheck: 'false' },
	});
	textField.addEventListener('input', (event) => {
		// @ts-expect-error 'property does exist'
		const value = event.target.value;
		headline.setAttribute('text', value || DEFAULT_PREVIEW);
		/* Remembered, because it is also what the Live preview page opens with. */
		project.settings.app.previewText = value;
	});
	controls.appendChild(makeControlGroup('Sample text', textField, 'overview__control--text'));

	// --- Size, twice ---------------------------------------------
	const sizeSelect = makeElement({ tag: 'select', className: 'overview__select' });
	PREVIEW_SIZES.forEach((size) => {
		const option = makeElement({ tag: 'option', content: `${size} pt` });
		option.setAttribute('value', `${size}`);
		if (size === startingSize) option.setAttribute('selected', 'selected');
		sizeSelect.appendChild(option);
	});

	let applySize = (size) => headline.setAttribute('font-size', `${size}`);

	const slider = makeFancySlider(startingSize, (value) => applySize(value), 12, 180, 1);
	slider.classList.add('overview__size-slider');

	const sliderInput = slider.querySelector('input[type="range"]');
	/*
		A slot for whatever the slider lands on between two presets. Without it
		the select kept showing the last preset it had - so dragging to 40 left
		a field reading `128 pt` above a specimen set at 40, which is a control
		stating a number that is not true.
	*/
	const customOption = makeElement({ tag: 'option', content: '' });
	customOption.setAttribute('value', 'custom');
	customOption.hidden = true;

	applySize = (size) => {
		headline.setAttribute('font-size', `${size}`);
		if (sliderInput instanceof HTMLInputElement) sliderInput.value = `${size}`;
		if (!(sizeSelect instanceof HTMLSelectElement)) return;

		if (PREVIEW_SIZES.includes(size)) {
			customOption.remove();
			sizeSelect.value = `${size}`;
		} else {
			customOption.textContent = `${size} pt`;
			if (!customOption.parentElement) sizeSelect.appendChild(customOption);
			sizeSelect.value = 'custom';
		}
	};

	sizeSelect.addEventListener('change', (event) => {
		// @ts-expect-error 'property does exist'
		applySize(parseInt(event.target.value));
	});
	controls.appendChild(makeControlGroup('Size', sizeSelect));

	// --- Style ---------------------------------------------------
	const styleSelect = makeElement({ tag: 'select', className: 'overview__select' });
	const currentStyle = project.settings.font.style || 'Regular';
	const styles = FONT_STYLES.includes(currentStyle)
		? FONT_STYLES
		: [currentStyle, ...FONT_STYLES];
	styles.forEach((name) => {
		const option = makeElement({ tag: 'option', content: name });
		option.setAttribute('value', name);
		if (name === currentStyle) option.setAttribute('selected', 'selected');
		styleSelect.appendChild(option);
	});
	/*
		No history state. This is a font setting rather than a change to an
		outline, and the history queue is per item - it snapshots
		editor.selectedItem, which on this page is nothing at all, so asking it
		to record this threw. The Settings page, which is the other place this
		field is edited, does not record it either.
	*/
	styleSelect.addEventListener('change', (event) => {
		const editor = getCurrentProjectEditor();
		// @ts-expect-error 'property does exist'
		const value = event.target.value;
		editor.project.settings.font.style = value;
		const shown = document.querySelector('.overview__context-style');
		if (shown) shown.textContent = value;
	});
	controls.appendChild(makeControlGroup('Style', styleSelect));

	// --- The slider, between its two A's -------------------------
	const sizeRow = makeElement({ className: 'overview__size-row' });
	sizeRow.appendChild(makeElement({ tag: 'span', className: 'overview__size-a', content: 'A' }));
	sizeRow.appendChild(slider);
	sizeRow.appendChild(
		makeElement({ tag: 'span', className: 'overview__size-a overview__size-a--large', content: 'A' })
	);
	controls.appendChild(sizeRow);

	return controls;
}

/**
 * @param {String} label
 * @param {Element} control
 * @param {String} className - an extra class for the group
 * @returns {Element}
 */
function makeControlGroup(label, control, className = '') {
	const group = makeElement({ className: `overview__control ${className}`.trim() });
	group.appendChild(makeElement({ tag: 'label', content: label }));
	group.appendChild(control);
	return group;
}

// --------------------------------------------------------------
// Coverage
// --------------------------------------------------------------

/**
 * Every character, and how far through the set you are.
 *
 * The grid is the chooser the rest of the app uses; what this page adds around
 * it is the progress - which is the one number a font in progress is measured
 * by and was written nowhere - and a search, because a range of two hundred is
 * longer than the patience for scrolling to one you already have in mind.
 *
 * @returns {Element}
 */
function makeCoverageCard() {
	const editor = getCurrentProjectEditor();
	const card = makeElement({ className: 'overview__card overview__coverage' });

	// --- Heading and progress ------------------------------------
	const head = makeElement({ className: 'overview__coverage-head' });
	head.appendChild(
		makeElement({ tag: 'h2', className: 'overview__card-title', content: 'Character coverage' })
	);

	const counts = coverageCounts(editor);
	head.appendChild(
		makeElement({
			className: 'overview__coverage-count',
			content: `${counts.drawn} / ${counts.total} designed`,
		})
	);

	const track = makeElement({ className: 'overview__progress' });
	const fill = makeElement({ className: 'overview__progress-fill' });
	fill.style.width = `${counts.total ? (counts.drawn / counts.total) * 100 : 0}%`;
	track.appendChild(fill);
	head.appendChild(track);
	card.appendChild(head);

	// --- The chooser, with a search in front of it ---------------
	const chooser = makeAllItemTypeChooserContent(
		(itemID) => openItem(itemID),
		'',
		editor,
		{ tileSize: 'large', filters: 'menu' }
	);

	const header = chooser.querySelector('.item-chooser__header');
	if (header) {
		/* In front of the range select, because you reach for it first. */
		header.insertBefore(makeSearchField(), header.firstChild);
		/* The count is in the heading now, as a fraction and a bar. */
		const count = header.querySelector('.item-chooser__count');
		if (count) count.remove();
		/*
			Moved up beside the heading, so the row reads as one line: what this
			is, how far through it you are, and the two controls that change
			which part of it you are looking at. Left where the chooser built
			it, they were a second row of controls under a row of numbers.

			Safe to move: nothing in item_chooser reaches for the header again -
			it replaces the tile grid, and it announces a range change as an
			event that bubbles past here either way.
		*/
		head.appendChild(header);
	}
	card.appendChild(chooser);

	// --- The way out ---------------------------------------------
	const footer = makeElement({ className: 'overview__coverage-footer' });
	const viewAll = makeElement({
		tag: 'button',
		className: 'overview__link',
		attributes: { type: 'button' },
		innerHTML: 'View all characters <span class="overview__link-arrow">&rarr;</span>',
	});
	viewAll.addEventListener('click', () => {
		const target = getCurrentProjectEditor();
		target.nav.page = 'Characters';
		target.navigate();
	});
	footer.appendChild(viewAll);
	card.appendChild(footer);

	return card;
}

/**
 * How many items are in what you are looking at, and how many are drawn.
 *
 * Scoped to the range on screen rather than to the whole font, because it sits
 * a hand's width from the control that says which range that is - a fraction
 * out of every enabled range, next to a select reading "Basic Latin", is two
 * numbers that look like they should agree and do not.
 *
 * @param {Object} editor - project editor
 * @param {Object | String} target - a character range, 'Ligatures' or 'Components'
 * @returns {Object} - { total, drawn }
 */
function coverageCounts(editor, target = undefined) {
	const showing = target === undefined ? editor.selectedCharacterRange : target;
	const drawnOf = (items) => items.filter((item) => item?.shapes?.length).length;

	if (showing === 'Ligatures') {
		const items = editor.project.sortedLigatures || [];
		return { total: items.length, drawn: drawnOf(items) };
	}

	if (showing === 'Components') {
		const items = Object.values(editor.project.components || {});
		return { total: items.length, drawn: drawnOf(items) };
	}

	const glyphs = editor.project.glyphs || {};
	const ids = showing?.getMemberIDs?.() || [];
	const drawn = ids.filter((id) => glyphs[`glyph-${id}`]?.shapes?.length).length;

	return { total: ids.length, drawn: drawn };
}

/**
 * Writes the coverage numbers into the card, wherever it is.
 * @param {Object | String} target - what is on screen now
 */
function refreshCoverage(target) {
	const counts = coverageCounts(getCurrentProjectEditor(), target);
	const label = document.querySelector('.overview__coverage-count');
	const fill = document.querySelector('.overview__progress-fill');

	if (label) label.textContent = `${counts.drawn} / ${counts.total} designed`;
	if (fill instanceof HTMLElement) {
		fill.style.width = `${counts.total ? (counts.drawn / counts.total) * 100 : 0}%`;
	}
}

/**
 * Search, over the tiles that are on screen.
 *
 * It filters rather than finds: the palette at Ctrl K already searches the
 * whole project and jumps you there, and this is the other question - which of
 * the ones in front of me. So it hides what does not match and leaves the grid
 * where it is.
 *
 * @returns {Element}
 */
function makeSearchField() {
	const field = makeElement({ className: 'overview__search' });
	field.appendChild(
		makeElement({ className: 'overview__search-icon', innerHTML: makeLineIcon('search', 16) })
	);

	const input = makeElement({
		tag: 'input',
		attributes: { type: 'search', placeholder: 'Search characters…', spellcheck: 'false' },
	});

	input.addEventListener('input', (event) => {
		// @ts-expect-error 'property does exist'
		const term = `${event.target.value}`.trim().toLowerCase();
		const grid = document.querySelector('.overview .item-chooser__tile-grid');
		if (!grid) return;

		let shown = 0;
		grid.querySelectorAll('glyph-tile').forEach((tile) => {
			/*
				Name, id, and the code point as it is written on the tile. The
				last one matters most: the caption under every tile in this grid
				reads U+0041, so that is what you type when you are looking for
				one, and neither the name nor the `glyph-0x41` id contains it.
			*/
			const caption = tile.shadowRoot?.querySelector('.name')?.textContent || '';
			const haystack = [
				tile.getAttribute('title') || '',
				tile.getAttribute('displayed-item-id') || '',
				caption,
			]
				.join(' ')
				.toLowerCase();
			const match = !term || haystack.includes(term);
			if (tile instanceof HTMLElement) tile.hidden = !match;
			if (match) shown++;
		});

		/* Said out loud, because a grid that has hidden everything looks the
			same as a grid that failed to build. */
		let empty = grid.querySelector('.overview__no-results');
		if (!shown && term) {
			if (!empty) {
				empty = makeElement({
					className: 'overview__no-results',
					content: `No character matches “${term}”.`,
				});
				grid.appendChild(empty);
			} else {
				empty.textContent = `No character matches “${term}”.`;
			}
		} else if (empty) {
			empty.remove();
		}
	});

	field.appendChild(input);
	return field;
}

/**
 * @param {String} itemID - what was clicked
 */
function openItem(itemID) {
	const editor = getCurrentProjectEditor();
	editor.selectedItemID = itemID;

	if (itemID.startsWith('glyph-')) editor.nav.page = 'Characters';
	else if (itemID.startsWith('liga-')) editor.nav.page = 'Ligatures';
	else if (itemID.startsWith('comp-')) editor.nav.page = 'Components';
	else if (itemID.startsWith('kern-')) editor.nav.page = 'Kerning';
	editor.navigate();

	editor.history.addState(`Navigated to ${editor.project.getItemName(itemID, true)}`);
}

// --------------------------------------------------------------
// Snapshot
// --------------------------------------------------------------

/**
 * The numbers that define the font, what you last touched, and the way back.
 * @returns {Element}
 */
function makeSnapshotCard() {
	const project = getCurrentProject();
	const font = project.settings.font;
	const card = makeElement({ className: 'overview__card overview__snapshot' });

	card.appendChild(
		makeElement({ tag: 'h2', className: 'overview__card-title', content: 'Project snapshot' })
	);

	/*
		The four that every other number in the font is measured against. The
		rest of the font settings are a page of their own, one click away from
		the head of this one.
	*/
	const metrics = makeElement({ className: 'overview__metrics' });
	[
		['UPM', font.upm],
		['Ascender', font.ascent],
		['Descender', font.descent],
		['X-height', font.xHeight],
	].forEach(([label, value]) => {
		metrics.appendChild(makeElement({ className: 'overview__metric-name', content: `${label}` }));
		metrics.appendChild(
			makeElement({ className: 'overview__metric-value', content: `${value}` })
		);
	});
	card.appendChild(metrics);

	card.appendChild(makeElement({ className: 'overview__rule' }));
	card.appendChild(makeContinueEditing());
	card.appendChild(makeElement({ className: 'overview__rule' }));
	card.appendChild(makeRecentActivity());

	return card;
}

/**
 * The last thing you drew, and the way back into it.
 *
 * The history knows this and nothing else did: closing the app and coming back
 * put you on the Overview page with no trace of where you had been, so the way
 * back in was to remember the letter and find it in the grid.
 *
 * @returns {Element}
 */
function makeContinueEditing() {
	const editor = getCurrentProjectEditor();
	const block = makeElement({ className: 'overview__continue' });
	block.appendChild(
		makeElement({ tag: 'h3', className: 'overview__section-title', content: 'Continue editing' })
	);

	const entry = lastEditEntry(editor);
	if (!entry) {
		block.appendChild(
			makeElement({
				className: 'overview__continue-empty',
				content: 'Nothing edited yet. Pick a character to start.',
			})
		);
		return block;
	}

	const row = makeElement({ className: 'overview__continue-row' });

	const thumbnail = makeElement({ className: 'overview__continue-thumb' });
	const item = editor.project.getItem(entry.itemID);
	thumbnail.innerHTML = editor.project.makeItemThumbnail(item, 72);
	row.appendChild(thumbnail);

	const detail = makeElement({ className: 'overview__continue-detail' });
	detail.appendChild(
		makeElement({ className: 'overview__continue-label', content: 'Last edited' })
	);
	detail.appendChild(
		makeElement({
			className: 'overview__continue-when',
			content: whenText(entry.timeStamp),
		})
	);

	const open = makeElement({
		tag: 'button',
		className: 'overview__link',
		attributes: { type: 'button' },
		innerHTML: `Open ${editor.project.getItemName(entry.itemID, true)} <span class="overview__link-arrow">&rarr;</span>`,
	});
	open.addEventListener('click', () => openItem(entry.itemID));
	detail.appendChild(open);

	row.appendChild(detail);
	block.appendChild(row);
	return block;
}

/**
 * The last few things that happened, on one line.
 * @returns {Element}
 */
function makeRecentActivity() {
	const editor = getCurrentProjectEditor();
	const entries = editor.history.queue
		.filter((entry) => entry.title && !`${entry.title}`.startsWith('Navigated to'))
		.slice(0, 2);

	const row = makeElement({ className: 'overview__activity' });
	row.appendChild(
		makeElement({
			className: 'overview__activity-icon',
			innerHTML: makeLineIcon('panel_history', 14),
		})
	);

	if (!entries.length) {
		row.appendChild(makeElement({ tag: 'span', content: 'No changes yet.' }));
		return row;
	}

	const words = entries.map((entry) => entry.title);
	words.push(whenText(entries[0].timeStamp));
	row.appendChild(makeElement({ tag: 'span', content: words.join(' · ') }));
	return row;
}

/**
 * The most recent history entry that was an edit to something, rather than a
 * move between items.
 *
 * @param {Object} editor - project editor
 * @returns {Object | false}
 */
function lastEditEntry(editor) {
	const found = editor.history.queue.find(
		(entry) =>
			entry.itemID &&
			entry.title &&
			!`${entry.title}`.startsWith('Navigated to') &&
			editor.project.getItem(entry.itemID)
	);
	return found || false;
}

/**
 * @param {Number} timeStamp
 * @returns {String}
 */
function whenText(timeStamp) {
	const ago = timeAgo(timeStamp, Date.now());
	return ago === 'just now' ? ago : `${ago} ago`;
}
