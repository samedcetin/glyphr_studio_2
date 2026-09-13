/**
	BMFONT DESCRIPTOR
	-----------------
	Writes the AngelCode BMFont text format - a PNG atlas plus a `.fnt` file
	describing where every character sits on it.

	This is the format game engines actually read: Phaser, LÖVE, Cocos2d,
	libGDX, Godot's BitmapFont, Defold, MonoGame and PixiJS all consume it or a
	direct descendant. It is the reason this is the first export target rather
	than any single engine's native asset.

	Reference for the field names and their meanings:
	www.angelcode.com/products/bmfont/doc/file_format.html

	Pure string building. No DOM, no project types - it takes plain numbers so
	it can be unit tested and reused from a build script.
 */

/**
 * @typedef {Object} BMFontChar
 * @property {Number} id - unicode code point
 * @property {Number} x - left edge on the page
 * @property {Number} y - top edge on the page
 * @property {Number} width - glyph bitmap width
 * @property {Number} height - glyph bitmap height
 * @property {Number} xoffset - pixels to shift right when drawing
 * @property {Number} yoffset - pixels down from the line top when drawing
 * @property {Number} xadvance - how far the pen moves after this character
 * @property {Number} page - which texture page
 */

/**
 * Escapes a value for the `key="value"` fields of the text format.
 * The text format has no escape syntax, so quotes are simply dropped.
 * @param {String} value - raw text
 * @returns {String}
 */
function quote(value) {
	return `"${String(value).replace(/"/g, '')}"`;
}

/**
 * Escapes text for an XML attribute.
 * @param {String} value - raw text
 * @returns {String}
 */
function escapeXML(value) {
	return String(value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/**
 * Assembles the descriptor's contents, independent of how it will be written.
 *
 * Both serialisers below read this, which is what stops the text and XML
 * flavours from quietly disagreeing about a font's metrics - the risk with
 * two independently written emitters.
 *
 * @param {Object} data - see makeBMFontDescriptor
 * @returns {Object} - {info, common, pages, chars, kernings}
 */
function assembleDescriptor({
	face,
	size,
	bold = false,
	italic = false,
	lineHeight,
	base,
	scaleW,
	scaleH,
	pageFiles,
	padding,
	spacing,
	chars,
	kernings = [],
}) {
	return {
		/*
			`size` is written negative by convention when it refers to the em
			square rather than the character height. That is what we render,
			and some importers use the sign to decide how to scale.
		*/
		info: {
			face: String(face),
			size: -Math.abs(Math.round(size)),
			bold: bold ? 1 : 0,
			italic: italic ? 1 : 0,
			charset: '',
			unicode: 1,
			stretchH: 100,
			smooth: 1,
			aa: 1,
			padding: `${padding},${padding},${padding},${padding}`,
			spacing: `${spacing},${spacing}`,
			outline: 0,
		},
		common: {
			lineHeight: Math.round(lineHeight),
			base: Math.round(base),
			scaleW: scaleW,
			scaleH: scaleH,
			pages: pageFiles.length,
			packed: 0,
			alphaChnl: 0,
			redChnl: 4,
			greenChnl: 4,
			blueChnl: 4,
		},
		pages: pageFiles.map((fileName, index) => ({ id: index, file: String(fileName) })),
		chars: chars.map((character) => ({
			id: character.id,
			x: character.x,
			y: character.y,
			width: character.width,
			height: character.height,
			xoffset: character.xoffset,
			yoffset: character.yoffset,
			xadvance: character.xadvance,
			page: character.page,
			// 15 means "all channels" - a plain white glyph on transparent.
			chnl: 15,
		})),
		kernings: kernings.map((kern) => ({
			first: kern.first,
			second: kern.second,
			amount: Math.round(kern.amount),
		})),
	};
}

/** Fields written as quoted strings in the text format. */
const QUOTED_INFO_FIELDS = new Set(['face', 'charset']);

/**
 * Builds a `.fnt` descriptor in the classic text format.
 *
 * @param {Object} data - everything the descriptor needs
 * @param {String} data.face - font family name
 * @param {Number} data.size - em size in pixels this atlas was rendered at
 * @param {Boolean=} data.bold - style flag
 * @param {Boolean=} data.italic - style flag
 * @param {Number} data.lineHeight - distance between baselines, in pixels
 * @param {Number} data.base - baseline distance from the top of a line
 * @param {Number} data.scaleW - page width in pixels
 * @param {Number} data.scaleH - page height in pixels
 * @param {Array<String>} data.pageFiles - PNG file names, in page order
 * @param {Number} data.padding - padding baked around each glyph
 * @param {Number} data.spacing - gap left between glyphs on the page
 * @param {Array<BMFontChar>} data.chars - the characters
 * @param {Array=} data.kernings - [{first, second, amount}] in pixels
 * @returns {String} - the complete .fnt file contents
 */
export function makeBMFontDescriptor(data) {
	const descriptor = assembleDescriptor(data);
	const lines = [];

	const pairs = (record, quotedFields = new Set()) =>
		Object.keys(record)
			.map((key) => `${key}=${quotedFields.has(key) ? quote(record[key]) : record[key]}`)
			.join(' ');

	lines.push(`info ${pairs(descriptor.info, QUOTED_INFO_FIELDS)}`);
	lines.push(`common ${pairs(descriptor.common)}`);

	descriptor.pages.forEach((page) => {
		lines.push(`page id=${page.id} file=${quote(page.file)}`);
	});

	lines.push(`chars count=${descriptor.chars.length}`);
	descriptor.chars.forEach((character) => lines.push(`char ${pairs(character)}`));

	// The kernings block is optional, but writing an empty one is harmless and
	// some importers are happier when it is always present.
	lines.push(`kernings count=${descriptor.kernings.length}`);
	descriptor.kernings.forEach((kern) => lines.push(`kerning ${pairs(kern)}`));

	return lines.join('\n') + '\n';
}

/**
 * Builds the same descriptor in the XML flavour.
 *
 * Same format, different syntax. Phaser 3 and PixiJS both ship loaders that
 * expect the XML form, so exporting only the text form leaves two of the
 * biggest web engines needing a conversion step.
 *
 * @param {Object} data - identical to makeBMFontDescriptor
 * @returns {String} - the complete .fnt XML contents
 */
export function makeBMFontXML(data) {
	const descriptor = assembleDescriptor(data);

	const attributes = (record) =>
		Object.keys(record)
			.map((key) => `${key}="${escapeXML(record[key])}"`)
			.join(' ');

	const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<font>'];

	lines.push(`\t<info ${attributes(descriptor.info)}/>`);
	lines.push(`\t<common ${attributes(descriptor.common)}/>`);

	lines.push('\t<pages>');
	descriptor.pages.forEach((page) => lines.push(`\t\t<page ${attributes(page)}/>`));
	lines.push('\t</pages>');

	lines.push(`\t<chars count="${descriptor.chars.length}">`);
	descriptor.chars.forEach((character) => lines.push(`\t\t<char ${attributes(character)}/>`));
	lines.push('\t</chars>');

	lines.push(`\t<kernings count="${descriptor.kernings.length}">`);
	descriptor.kernings.forEach((kern) => lines.push(`\t\t<kerning ${attributes(kern)}/>`));
	lines.push('\t</kernings>');

	lines.push('</font>');

	return lines.join('\n') + '\n';
}
