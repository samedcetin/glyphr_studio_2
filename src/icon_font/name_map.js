import { constantFromSlug } from './icon_names.js';
import { listIconGlyphs } from './pua.js';

/**
	ICON NAME MAP
	-------------
	The file that makes an icon font usable from code.

	Without it a game ends up with `"\\uE04A"` written inline in a dozen places,
	and the day an icon is renumbered every one of them is wrong and none of
	them says so. With it there is one place the numbers live.
 */

/**
 * @typedef {Object} IconMapEntry
 * @property {String} name - the icon's slug
 * @property {Number} codePoint - where it lives
 * @property {String} hex - 'E001'
 * @property {String} unicode - 'U+E001'
 * @property {String} escape - '\\uE001', ready to paste into source
 */

/**
 * Collects a project's icons into a plain list.
 * @param {Object} project - a GlyphrStudioProject
 * @returns {Array<IconMapEntry>}
 */
export function collectIconMap(project) {
	return listIconGlyphs(project).map((entry) => {
		const hex = entry.codePoint.toString(16).toUpperCase().padStart(4, '0');

		return {
			name: entry.name,
			codePoint: entry.codePoint,
			hex: hex,
			unicode: `U+${hex}`,
			/*
				Anything past the basic plane needs a surrogate pair in a
				JavaScript or C# string literal, and `\\u{...}` is not
				understood everywhere - so those are written the long way.
			*/
			escape: entry.codePoint > 0xffff ? escapeAstral(entry.codePoint) : `\\u${hex}`,
		};
	});
}

/**
 * A code point above the basic plane, as a surrogate pair.
 * @param {Number} codePoint - a code point above 0xFFFF
 * @returns {String}
 */
function escapeAstral(codePoint) {
	const offset = codePoint - 0x10000;
	const high = 0xd800 + (offset >> 10);
	const low = 0xdc00 + (offset & 0x3ff);
	const hex = (value) => value.toString(16).toUpperCase().padStart(4, '0');
	return `\\u${hex(high)}\\u${hex(low)}`;
}

/**
 * The map as JSON.
 * @param {Array<IconMapEntry>} entries - from collectIconMap
 * @param {String=} fontFamily - the font's family name
 * @returns {String}
 */
export function makeIconMapJSON(entries, fontFamily = '') {
	return JSON.stringify(
		{
			family: fontFamily,
			count: entries.length,
			icons: entries.map((entry) => ({
				name: entry.name,
				codePoint: entry.codePoint,
				unicode: entry.unicode,
				escape: entry.escape,
			})),
		},
		null,
		'\t'
	);
}

/**
 * The map as CSS classes, the way web icon fonts are used.
 * @param {Array<IconMapEntry>} entries - from collectIconMap
 * @param {Object=} options - {prefix, fontFamily, fontFile}
 * @returns {String}
 */
export function makeIconMapCSS(entries, { prefix = 'icon', fontFamily = 'Icons', fontFile = '' } = {}) {
	const lines = [];

	if (fontFile) {
		lines.push(`@font-face {`);
		lines.push(`\tfont-family: '${fontFamily}';`);
		lines.push(`\tsrc: url('${fontFile}') format('opentype');`);
		lines.push(`\tfont-display: block;`);
		lines.push(`}`);
		lines.push('');
	}

	lines.push(`[class^="${prefix}-"], [class*=" ${prefix}-"] {`);
	lines.push(`\tfont-family: '${fontFamily}';`);
	// Icon fonts break if the browser applies its usual text treatment, so
	// every one of these is deliberate rather than defensive.
	lines.push(`\tfont-style: normal;`);
	lines.push(`\tfont-weight: normal;`);
	lines.push(`\tfont-variant: normal;`);
	lines.push(`\ttext-transform: none;`);
	lines.push(`\tline-height: 1;`);
	lines.push(`\t-webkit-font-smoothing: antialiased;`);
	lines.push(`}`);
	lines.push('');

	entries.forEach((entry) => {
		lines.push(`.${prefix}-${entry.name}::before { content: "\\${entry.hex}"; }`);
	});

	return lines.join('\n') + '\n';
}

/**
 * The map as constants, for engine code.
 *
 * Written as a plain table rather than in one language's syntax, because the
 * three places this is going - C#, GDScript and TypeScript - disagree about
 * everything except that a name maps to a code point.
 *
 * @param {Array<IconMapEntry>} entries - from collectIconMap
 * @returns {String}
 */
export function makeIconMapTable(entries) {
	if (!entries.length) return 'No icons found in the Private Use Area.\n';

	const width = Math.max(...entries.map((entry) => constantFromSlug(entry.name).length));
	const lines = [`# name${' '.repeat(Math.max(0, width - 4))}  code point  escape`];

	entries.forEach((entry) => {
		const constant = constantFromSlug(entry.name);
		lines.push(`${constant.padEnd(width)}  ${entry.unicode.padEnd(10)}  ${entry.escape}`);
	});

	return lines.join('\n') + '\n';
}
