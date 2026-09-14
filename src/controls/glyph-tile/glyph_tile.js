import { getCurrentProject } from '../../app/main.js';
import { hexesToChars } from '../../common/character_ids.js';
import { makeElement } from '../../common/dom.js';
import { onThemeChange } from '../../common/theme.js';
import { remove } from '../../common/functions.js';
import { isWhitespace } from '../../lib/unicode/unicode_names.js';
import { getItemNameWithFallback } from '../../pages/characters.js';
import style from './glyph-tile.css?inline';

/**
 * `U+0041` for a character item, and nothing for a ligature or a component -
 * those are sequences, so there is no one code point to print.
 *
 * @param {String} itemID - e.g. `glyph-0x41`
 * @returns {String | false}
 */
function codePointLabel(itemID) {
	if (!`${itemID}`.startsWith('glyph-0x')) return false;
	const hex = remove(itemID, 'glyph-0x');
	if (!/^[0-9a-fA-F]+$/.test(hex)) return false;
	return `U+${hex.toUpperCase().padStart(4, '0')}`;
}

/**
 * A clickable mini-preview tile of a single glyph
 */
export class GlyphTile extends HTMLElement {
	// Specify observed attributes so that
	// attributeChangedCallback will work
	static get observedAttributes() {
		return ['selected'];
	}

	/**
	 * Create an GlyphTile
	 * @param {Object} attributes - collection of key: value pairs to set as attributes
	 */
	constructor(attributes = {}) {
		super();
		// log(`GlyphTile.constructor`, 'start');
		/** @type {Function | false} - undoes the theme subscription */
		this.unsubscribeTheme = false;
		// log(attributes);

		Object.keys(attributes).forEach((key) => {
			if (key !== 'project') this.setAttribute(key, attributes[key]);
		});
		this.project = attributes.project || getCurrentProject();
		const displayedItemID = this.getAttribute('displayed-item-id');
		this.glyph = this.project.getItem(displayedItemID);
		const chars = this.glyph?.chars || hexesToChars(remove(displayedItemID, 'glyph-'));

		const name = this.glyph?.name || getItemNameWithFallback(displayedItemID);
		this.view = {};

		// log(this.project);
		// log(this.glyph);
		// log(`displayedItemID: ${displayedItemID}`);
		// log(`chars: ${chars}`);
		// log(`name: ${name}`);

		const overallSize = 50;

		this.wrapper = makeElement({ className: 'wrapper' });
		this.wrapper.style.backgroundSize = `auto ${overallSize}px`;

		// Session-state information
		let sessionState = 'notCreated';
		if (attributes['session-state']) {
			sessionState = attributes['session-state'];
		} else if (this?.glyph?.sessionState) {
			sessionState = this?.glyph?.sessionState;
		}

		let sessionMessage = '';
		this.wrapper.setAttribute('session-state', sessionState);
		if (sessionState === 'notCreated')
			sessionMessage = '\n\nItem does not exist yet, click to create';
		if (sessionState === 'new')
			sessionMessage = '\n\nItem was created, but has not yet been edited';
		if (sessionState === 'changed') sessionMessage = '\n\nItem was recently edited';

		// Selection
		if (this.hasAttribute('selected')) this.wrapper.setAttribute('selected', '');

		if (this.glyph && this.glyph.hasChangedThisSession === true) {
			this.setAttribute('title', `${name}\n${displayedItemID}${sessionMessage}`);
			this.thumbnail = makeElement({
				tag: 'span',
				className: 'thumbnail',
			});
			// @ts-expect-error 'property does exist'
			this.thumbnail.width = overallSize;
			// @ts-expect-error 'property does exist'
			this.thumbnail.height = overallSize;
		} else {
			this.setAttribute('title', `${name}\n${displayedItemID}${sessionMessage}`);
			this.thumbnail = makeElement({
				className: 'thumbnail',
			});
			if (isWhitespace(remove(displayedItemID, 'glyph-'))) {
				this.thumbnail.innerHTML = `
					<div class="whitespace-char-thumbnail">white space</div>
				`;
			} else {
				if (chars) {
					this.thumbnail.innerHTML = chars;
				} else {
					this.thumbnail.innerHTML = `
						<div class="whitespace-char-thumbnail">${displayedItemID}</div>
					`;
				}
			}
			// log(`no glyph`);
		}

		/*
			Whether anything has been drawn in it, which is not the same question
			as the session state above: that says what happened to this item since
			the app opened, and this says whether the font has it yet. It is what
			the coverage dot reads - see the `large` block in glyph-tile.css.
		*/
		this.wrapper.setAttribute('drawn', this.glyph?.shapes?.length ? 'true' : 'false');
		this.wrapper.appendChild(makeElement({ tag: 'span', className: 'status' }));

		/*
			The caption. Large tiles carry the code point rather than the
			character, because at that size the character is already the biggest
			thing on the tile and repeating it underneath says nothing - while the
			code point is the one label you cannot read off the drawing.
		*/
		this.name = makeElement({ className: 'name' });
		const codePoint = this.hasAttribute('large') && codePointLabel(displayedItemID);
		if (codePoint) this.name.innerHTML = codePoint;
		else if (chars) this.name.innerHTML = displayedItemID === 'glyph-0x20' ? 'Space' : chars;
		else this.name.innerHTML = name.replaceAll('Component ', 'comp-');

		// Put it all together
		const shadow = this.attachShadow({ mode: 'open' });
		const styles = makeElement({ tag: 'style', innerHTML: style });
		shadow.appendChild(styles);

		this.wrapper.appendChild(this.thumbnail);
		this.wrapper.appendChild(this.name);

		shadow.appendChild(this.wrapper);
		this.redraw();

		// log(`GlyphTile.constructor`, 'end');
	}

	/**
	 * what to do when an attribute is changed
	 */
	attributeChangedCallback() {
		// log(`GlyphTile.attributeChangedCallback`, 'start');
		const wrapper = this.shadowRoot ? this.shadowRoot.querySelector('.wrapper') : false;
		// log(wrapper);
		if (wrapper) {
			if (this.hasAttribute('selected')) wrapper.setAttribute('selected', '');
			else wrapper.removeAttribute('selected');
		}
		// log(`GlyphTile.attributeChangedCallback`, 'end');
	}

	/**
	 * redraw this thumbnail
	 */
	connectedCallback() {
		// Thumbnails draw the glyph in the theme's ink color, so they repaint
		// when the theme changes.
		if (!this.unsubscribeTheme) {
			this.unsubscribeTheme = onThemeChange(() => this.redraw());
		}
	}

	disconnectedCallback() {
		if (this.unsubscribeTheme) {
			this.unsubscribeTheme();
			this.unsubscribeTheme = false;
		}
	}

	redraw() {
		if (this.glyph?.shapes?.length) {
			// const project = getCurrentProject();
			this.thumbnail.innerHTML = this.project.makeItemThumbnail(this.glyph);
		}
	}
}
