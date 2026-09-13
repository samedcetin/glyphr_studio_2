import { describe, expect, it } from 'vitest';
import { makeBMFontDescriptor, makeBMFontXML } from '../bmfont.js';

/**
	BMFONT XML TESTS
	----------------
	The XML flavour is the same format in different syntax, which is exactly
	what makes it easy to get wrong: two emitters can drift apart silently and
	nothing complains until a game renders text with the wrong metrics.

	So the important test here is not that the XML is well-formed - it is that
	the XML and the text form say the same thing, field for field.
 */

const sampleData = {
	face: 'Test Font',
	size: 32,
	bold: true,
	italic: false,
	lineHeight: 40,
	base: 32,
	scaleW: 256,
	scaleH: 512,
	pageFiles: ['test_0.png', 'test_1.png'],
	padding: 2,
	spacing: 1,
	chars: [
		{ id: 65, x: 0, y: 0, width: 20, height: 24, xoffset: 1, yoffset: 8, xadvance: 22, page: 0 },
		{ id: 32, x: 0, y: 0, width: 0, height: 0, xoffset: 0, yoffset: 0, xadvance: 10, page: 0 },
		{ id: 86, x: 21, y: 0, width: 19, height: 24, xoffset: 0, yoffset: 8, xadvance: 20, page: 1 },
	],
	kernings: [
		{ first: 65, second: 86, amount: -2 },
		{ first: 86, second: 65, amount: -3 },
	],
};

/**
 * Parses the XML, failing the test if it is not well-formed.
 * @param {String} xml - the document
 * @returns {Document}
 */
function parse(xml) {
	const doc = new DOMParser().parseFromString(xml, 'text/xml');
	const error = doc.querySelector('parsererror');
	expect(error, error ? error.textContent : '').toBe(null);
	return doc;
}

/**
 * Reads the text `.fnt` back into records, so it can be compared with the XML.
 *
 * The text format is `blockName key=value key="value"` per line, which is
 * simple enough to read back without pulling in a parser.
 *
 * @param {String} text - a .fnt file
 * @returns {Array<Object>} - [{block, fields}]
 */
function parseTextDescriptor(text) {
	return text
		.split('\n')
		.filter((line) => line.trim())
		.map((line) => {
			const block = line.slice(0, line.indexOf(' '));
			const fields = {};
			const pattern = /(\w+)=("([^"]*)"|\S+)/g;
			let match;
			while ((match = pattern.exec(line)) !== null) {
				fields[match[1]] = match[3] === undefined ? match[2] : match[3];
			}
			return { block: block, fields: fields };
		});
}

/**
 * Reads an element's attributes into a plain object.
 * @param {Element} element - any element
 * @returns {Object}
 */
function attributesOf(element) {
	const result = {};
	Array.from(element.attributes).forEach((attribute) => {
		result[attribute.name] = attribute.value;
	});
	return result;
}

describe('Atlas: BMFont XML', () => {
	const xml = makeBMFontXML(sampleData);
	const doc = parse(xml);

	it('is well-formed XML rooted at <font>', () => {
		expect(doc.documentElement.nodeName).toEqual('font');
		expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
	});

	it('nests the blocks the way importers walk them', () => {
		expect(doc.querySelectorAll('font > info').length).toEqual(1);
		expect(doc.querySelectorAll('font > common').length).toEqual(1);
		expect(doc.querySelectorAll('font > pages > page').length).toEqual(2);
		expect(doc.querySelectorAll('font > chars > char').length).toEqual(3);
		expect(doc.querySelectorAll('font > kernings > kerning').length).toEqual(2);
	});

	it('writes the count attributes the loaders size their arrays from', () => {
		expect(doc.querySelector('chars')?.getAttribute('count')).toEqual('3');
		expect(doc.querySelector('kernings')?.getAttribute('count')).toEqual('2');
	});

	it('writes the em size as negative, same as the text form', () => {
		expect(doc.querySelector('info')?.getAttribute('size')).toEqual('-32');
	});

	it('numbers the pages and keeps them in file order', () => {
		const pages = Array.from(doc.querySelectorAll('page'));
		expect(pages.map((page) => page.getAttribute('id'))).toEqual(['0', '1']);
		expect(pages.map((page) => page.getAttribute('file'))).toEqual(['test_0.png', 'test_1.png']);
	});

	it('says exactly what the text descriptor says, field for field', () => {
		/*
			This is the test that matters. Anything added to one emitter and
			forgotten in the other shows up here rather than in someone's game.
		*/
		const textBlocks = parseTextDescriptor(makeBMFontDescriptor(sampleData));

		const compare = (blockName, elements) => {
			const textRecords = textBlocks.filter((entry) => entry.block === blockName);
			expect(textRecords.length).toEqual(elements.length);
			textRecords.forEach((record, index) => {
				expect(attributesOf(elements[index]), `${blockName}[${index}]`).toEqual(record.fields);
			});
		};

		compare('info', Array.from(doc.querySelectorAll('info')));
		compare('common', Array.from(doc.querySelectorAll('common')));
		compare('page', Array.from(doc.querySelectorAll('page')));
		compare('char', Array.from(doc.querySelectorAll('char')));
		compare('kerning', Array.from(doc.querySelectorAll('kerning')));
	});

	it('escapes characters that would otherwise break the document', () => {
		const escaped = makeBMFontXML({
			...sampleData,
			face: 'Ben & Jerry\'s "<Display>"',
		});

		expect(escaped).toContain('&amp;');
		expect(escaped).toContain('&lt;Display&gt;');
		expect(escaped).not.toContain('<Display>');

		// Round-tripping proves the escaping is correct, not just present.
		const escapedDoc = parse(escaped);
		expect(escapedDoc.querySelector('info')?.getAttribute('face')).toEqual(
			'Ben & Jerry\'s "<Display>"'
		);
	});

	it('always writes both container blocks, even when empty', () => {
		const empty = parse(
			makeBMFontXML({
				face: 'X',
				size: 16,
				lineHeight: 20,
				base: 16,
				scaleW: 64,
				scaleH: 64,
				pageFiles: ['x_0.png'],
				padding: 0,
				spacing: 0,
				chars: [],
			})
		);

		expect(empty.querySelector('chars')?.getAttribute('count')).toEqual('0');
		expect(empty.querySelector('kernings')?.getAttribute('count')).toEqual('0');
	});
});
