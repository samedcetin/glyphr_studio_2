import { getCurrentProjectEditor } from '../app/main.js';
import { makeElement } from '../common/dom.js';
import { copyToClipboard } from '../common/functions.js';
import { makeLineIcon } from '../common/icons.js';
import { showToast } from '../controls/dialogs/dialogs.js';
import { attachTooltip } from '../controls/tooltip/tooltip.js';
import { isStandardUnicodeRange } from '../lib/unicode/unicode_blocks.js';
import { getItemNameWithFallback } from '../pages/characters.js';

/**
	CHARACTER INFO
	--------------
	What this character is, and the four ways you might need to type it
	somewhere else.

	It is a reference panel: nothing in it is editable, and everything in it is
	something you want in your clipboard. It used to be four `<input readonly>`
	fields, which look exactly like the editable fields two panels up - same
	well, same border, same text cursor - so the only way to find out they were
	read-only was to try. They are copy rows now: one line of mono, one button,
	one toast.

	Two other things were wrong rather than merely awkward.

		- It read `char.codePointAt(0)`, the FIRST code point, and labelled it
		  as the character. On a ligature - a whole page of this app - `fi` was
		  reported as U+0066 and the `i` was not mentioned.

		- It showed the range the chooser is parked on as though it were this
		  character's range. On a ligature that is whatever you last browsed,
		  so `fi` claimed to live in Basic Latin. The range row is a property
		  of a `glyph-` item and is only shown for one.
 */

// --------------------------------------------------------------
// Code point formatting
// --------------------------------------------------------------

/**
 * Hex for a code point, upper case, at least four digits.
 * @param {Number} codePoint
 * @returns {String}
 */
function toHex(codePoint) {
	return codePoint.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * The four ways to write one code point elsewhere.
 *
 * Decimal HTML (`&#65;`) is gone. It is the same escape as the hex one in a
 * base nobody reads code points in - every chart, every spec and every other
 * row in this panel is hex - so it was a duplicate that made you convert. Its
 * row went to the JavaScript / C# escape, which is what someone building a
 * game UI actually needs and had to look up.
 */
const formats = [
	{
		label: 'Unicode',
		hint: 'The standard notation, and what every chart and spec uses.',
		of: (codePoint) => `U+${toHex(codePoint)}`,
		join: ' ',
	},
	{
		label: 'HTML entity',
		hint: 'For HTML and XML.',
		of: (codePoint) => `&#x${toHex(codePoint)};`,
		join: '',
	},
	{
		label: 'Code escape',
		hint: 'For JavaScript, C#, Java and JSON string literals.',
		/* Above the BMP it takes the braced form. \u is exactly four
			digits, so \u1F600 reads as U+1F60 followed by a zero. */
		of: (codePoint) =>
			codePoint > 0xffff ? `\\u{${toHex(codePoint)}}` : `\\u${toHex(codePoint)}`,
		join: '',
	},
	{
		label: 'Character',
		hint: 'The character itself.',
		of: (codePoint) => String.fromCodePoint(codePoint),
		join: '',
	},
];

// --------------------------------------------------------------
// Pieces
// --------------------------------------------------------------

/**
 * The character, large, with its name under it.
 *
 * The panel's whole subject was previously a value in a read-only field,
 * the same size as the string `&#x41;` beside it. It is the one thing here
 * you identify at a glance rather than read, so it is shown at a size you
 * can identify it at.
 *
 * @param {String} chars - the character, or a ligature's characters
 * @param {String} name - the item's name
 * @param {String} points - every code point, `U+0066 U+0069`
 * @returns {HTMLElement}
 */
function makeHero(chars, name, points) {
	const hero = makeElement({ className: 'char-info__hero' });

	/*
		textContent, not innerHTML. Half of Basic Latin is markup: the old
		panel interpolated the character into an HTML string, so `<` opened a
		tag, `&` started an entity, and three characters in the font you are
		drawing rendered as nothing at all.
	*/
	const sample = makeElement({ className: 'char-info__sample' });
	sample.textContent = chars;
	hero.appendChild(sample);

	const identity = makeElement({ className: 'char-info__identity' });
	const nameElement = makeElement({ className: 'char-info__name' });
	nameElement.textContent = name;
	const pointsElement = makeElement({ className: 'char-info__points' });
	pointsElement.textContent = points;
	identity.appendChild(nameElement);
	identity.appendChild(pointsElement);
	hero.appendChild(identity);

	attachTooltip(hero, { name: name, body: points });
	return hero;
}

/**
 * One label, one value, one copy button.
 *
 * @param {HTMLElement} card - where the two cells go
 * @param {String} label - the label column
 * @param {String} value - the text, and what gets copied
 * @param {String} hint - the tooltip body
 */
function addCopyRow(card, label, value, hint) {
	const labelElement = makeElement({ tag: 'label' });
	labelElement.textContent = label;
	card.appendChild(labelElement);

	const row = makeElement({ className: 'char-info__value' });

	const text = makeElement({ className: 'char-info__text' });
	text.textContent = value;
	row.appendChild(text);

	const button = makeElement({
		tag: 'button',
		className: 'char-info__copy',
		innerHTML: makeLineIcon('copy', 16),
		attributes: { type: 'button' },
		onClick: async () => {
			const copied = await copyToClipboard(value);
			showToast(copied ? `Copied ${value}` : `Could not reach the clipboard`, 1600);
		},
	});
	attachTooltip(button, { name: `Copy ${label.toLowerCase()}`, body: hint });
	row.appendChild(button);

	card.appendChild(row);
}

/**
 * A link out, as an icon and a short label rather than as its own URL.
 *
 * The old one printed `wikipedia.org/wiki/Basic_Latin_(Unicode_block)` at
 * full length with an inline `width: 420px`, inside a card that is 265px
 * wide - 155px of it hanging off the side of the panel. Where it goes is
 * the tooltip's job; the link only has to say what is at the other end.
 *
 * @param {String} href
 * @param {String} label
 * @returns {HTMLElement}
 */
function makeLink(href, label) {
	const link = makeElement({
		tag: 'a',
		className: 'char-info__link',
		innerHTML: makeLineIcon('externalLink', 14),
		attributes: {
			href: href,
			target: '_blank',
			/* target=_blank hands the new tab a window.opener into this one. */
			rel: 'noopener noreferrer',
		},
	});

	const text = makeElement({ tag: 'span' });
	text.textContent = label;
	link.appendChild(text);

	attachTooltip(link, { name: label, body: href.replace(/^https:\/\//, '') });
	return link;
}

/**
 * The range this character lives in, on one line, and where to read about it.
 *
 * @param {HTMLElement} card - where the cells go
 * @param {Object} range - a CharacterRange
 */
function addRangeRows(card, range) {
	const labelElement = makeElement({ tag: 'label' });
	labelElement.textContent = 'Range';
	card.appendChild(labelElement);

	const line = makeElement({ className: 'char-info__range' });
	const name = makeElement({ className: 'char-info__range-name' });
	name.textContent = range.name;
	const span = makeElement({ className: 'char-info__range-span' });
	span.textContent = `U+${toHex(range.begin)}–${toHex(range.end)}`;
	line.appendChild(name);
	line.appendChild(span);
	attachTooltip(line, { name: range.name, body: span.textContent });
	card.appendChild(line);

	if (!isStandardUnicodeRange(range)) return;

	/* Basic Latin's chart is U0000.pdf - the file starts at the block, and
		the block starts below the range this app calls Basic Latin. */
	const chart = range.begin === 0x20 ? '0000' : toHex(range.begin);
	const article = `${range.name.replace(/ /g, '_')}_(Unicode_block)`;

	const links = makeElement({ className: 'char-info__links' });
	links.appendChild(makeLink(`https://www.unicode.org/charts/PDF/U${chart}.pdf`, 'Unicode chart'));
	links.appendChild(makeLink(`https://en.wikipedia.org/wiki/${article}`, 'Wikipedia'));
	card.appendChild(links);
}

// --------------------------------------------------------------
// The panel
// --------------------------------------------------------------

/**
 * @returns {Array<HTMLElement>} - one card
 */
export function makePanel_CharacterInfo() {
	const editor = getCurrentProjectEditor();
	const selected = editor.selectedItem;
	if (!selected) return [];

	/*
		Spread, not codePointAt(0) and not charAt: it iterates by code point,
		so a ligature gives every character and an emoji gives one character
		rather than two halves of a surrogate pair.
	*/
	const chars = [...(selected.char || '')];
	const codePoints = chars.map((char) => char.codePointAt(0));
	if (!codePoints.length) return [];

	const card = makeElement({ className: 'panel__card char-info' });

	card.appendChild(
		makeHero(
			chars.join(''),
			getItemNameWithFallback(selected.id),
			codePoints.map((codePoint) => `U+${toHex(codePoint)}`).join(' ')
		)
	);

	formats.forEach((format) => {
		addCopyRow(card, format.label, codePoints.map(format.of).join(format.join), format.hint);
	});

	/* Only a character has a Unicode range. See the note at the top. */
	if (`${selected.id}`.startsWith('glyph-') && editor.selectedCharacterRange) {
		card.appendChild(makeElement({ className: 'char-info__rule' }));
		addRangeRows(card, editor.selectedCharacterRange);
	}

	return [card];
}
