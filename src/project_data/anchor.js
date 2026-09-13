import { numSan, strSan } from '../common/functions.js';

/**
	ANCHOR
	------
	A named point on a glyph that other glyphs attach to.

	This is how accented characters get built without drawing them. A base
	letter carries an anchor called `top`; a combining acute carries one called
	`_top`; putting the two together means moving the acute until its `_top`
	sits exactly on the letter's `top`. Draw twenty-six letters and five
	accents, and the whole of Latin Extended-A follows.

	The leading underscore is not decoration - it is what separates a place
	something can attach TO from a place a mark attaches BY. The convention
	comes from Glyphs and is what the AFDKO's `mark` feature syntax expects,
	so a project marked up this way is marked up the way the rest of the
	typographic world already reads.
 */

export class Anchor {
	/**
	 * @param {Object=} args - {name, x, y}
	 */
	constructor({ name = '', x = 0, y = 0 } = {}) {
		this.objType = 'Anchor';
		this.name = name;
		this.x = x;
		this.y = y;
	}

	/**
	 * @returns {Object} - a plain object for the project file
	 */
	save() {
		return { name: this.name, x: this.x, y: this.y };
	}

	/**
	 * Whether this is a mark's attachment point rather than a base's.
	 * @returns {Boolean}
	 */
	get isMarkAnchor() {
		return this.name.startsWith('_');
	}

	/**
	 * The name without the mark prefix - what a base anchor would be called.
	 *
	 * `_top` and `top` are the two halves of one connection, so pairing them
	 * up is a matter of comparing this.
	 *
	 * @returns {String}
	 */
	get pairName() {
		return this.isMarkAnchor ? this.name.slice(1) : this.name;
	}

	get name() {
		return this._name;
	}

	/**
	 * Anchor names end up in OpenType feature code, where the character set is
	 * narrow - so they are held to letters, digits, dots and underscores, with
	 * the underscore only meaningful in front.
	 * @param {String} name - wanted name
	 */
	set name(name) {
		const cleaned = strSan(String(name || ''))
			.replace(/[^a-zA-Z0-9._]/g, '')
			.replace(/^_+/, (match) => (match ? '_' : ''));

		this._name = cleaned || 'anchor';
	}

	get x() {
		return this._x;
	}

	set x(value) {
		const number = numSan(value);
		this._x = isNaN(number) ? 0 : number;
	}

	get y() {
		return this._y;
	}

	set y(value) {
		const number = numSan(value);
		this._y = isNaN(number) ? 0 : number;
	}
}
