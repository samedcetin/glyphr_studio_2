/**
	ICON NAMES
	----------
	Turning a file name into the name a game will refer to the icon by.

	This is the part of an icon font that people actually touch. `U+E047` in
	source code is unreadable and unsearchable; `ICON_HEART_FILLED` is neither.
	So every icon gets a slug, and the slug is what the exported map is keyed
	on.
 */

/** Prefixes icon sets habitually put on file names, which carry no meaning. */
const REDUNDANT_PREFIXES = [/^icon[-_ ]/i, /^ic[-_]/i, /^ico[-_ ]/i];

/**
 * Makes a slug out of a file name.
 *
 * Handles the three naming styles icon sets ship in - `heart-filled.svg`,
 * `heart_filled.svg` and `heartFilled.svg` - so a set does not have to be
 * renamed by hand before it can be imported.
 *
 * @param {String} fileName - a file name, possibly with a path
 * @returns {String} - kebab-case, never empty
 */
export function slugFromFileName(fileName) {
	let name = String(fileName || '');

	// Drop any directory part, then the extension.
	name = name.split(/[/\\]/).pop() || '';
	name = name.replace(/\.[^.]+$/, '');

	REDUNDANT_PREFIXES.forEach((prefix) => {
		name = name.replace(prefix, '');
	});

	// camelCase and PascalCase become separate words before anything else, or
	// `heartFilled` would collapse into one unreadable run.
	name = name.replace(/([a-z0-9])([A-Z])/g, '$1-$2');

	name = name
		.replace(/[^a-zA-Z0-9]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '')
		.toLowerCase();

	return name || 'icon';
}

/**
 * Makes a slug that is not already in use.
 *
 * Two icons with the same name would give the exported map two entries with
 * the same key, and one of them would silently win.
 *
 * @param {String} slug - the wanted name
 * @param {Set<String>} taken - names already used
 * @returns {String}
 */
export function uniqueSlug(slug, taken) {
	if (!taken.has(slug)) return slug;

	let counter = 2;
	while (taken.has(`${slug}-${counter}`)) counter++;
	return `${slug}-${counter}`;
}

/**
 * Slugs for a whole set of file names, all distinct.
 * @param {Array<String>} fileNames - the files
 * @param {Set<String>=} alreadyTaken - names in use elsewhere
 * @returns {Array<String>} - one slug per file, in order
 */
export function makeSlugs(fileNames, alreadyTaken = new Set()) {
	const taken = new Set(alreadyTaken);

	return fileNames.map((fileName) => {
		const slug = uniqueSlug(slugFromFileName(fileName), taken);
		taken.add(slug);
		return slug;
	});
}

/**
 * The slug as a constant name, for source code that wants one.
 * @param {String} slug - kebab-case name
 * @returns {String} - SCREAMING_SNAKE_CASE
 */
export function constantFromSlug(slug) {
	return String(slug).replace(/-/g, '_').toUpperCase();
}
