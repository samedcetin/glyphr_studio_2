/**
	UI STATE
	--------
	Small persisted store for interface preferences that are the user's, not the
	project's: which sidebar sections are open, how wide the sidebars are, and
	so on. These belong to the person and the browser, never to the font file,
	so they live in localStorage rather than in project settings.

	Every read and write is guarded. A private window, cleared site data, or a
	browser configured to block storage all just mean the defaults are used -
	none of that should ever break the editor.
 */

const STORAGE_KEY = 'GlyphrStudio';
const UI_KEY = 'uiState';

/** @type {Object | false} - in-memory mirror, so reads do not hit storage. */
let cache = false;

/**
 * Reads the whole UI state object.
 * @returns {Object}
 */
function readAll() {
	if (cache) return cache;

	cache = {};
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (raw) {
			const stored = JSON.parse(raw)?.[UI_KEY];
			if (stored && typeof stored === 'object') cache = stored;
		}
	} catch {
		// Unreadable storage. Defaults it is.
	}
	return cache;
}

/**
 * Writes the whole UI state object back, preserving the rest of the
 * app's localStorage payload.
 */
function writeAll() {
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		const data = raw ? JSON.parse(raw) : {};
		data[UI_KEY] = cache;
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
	} catch {
		// The preference will not survive a reload. The session still works.
	}
}

/**
 * Reads one UI preference.
 * @param {String} key - dot-free preference name
 * @param {*} fallback - returned when nothing is stored
 * @returns {*}
 */
export function getUIState(key, fallback) {
	const all = readAll();
	return Object.prototype.hasOwnProperty.call(all, key) ? all[key] : fallback;
}

/**
 * Writes one UI preference.
 * @param {String} key - dot-free preference name
 * @param {*} value - JSON-serializable value
 */
export function setUIState(key, value) {
	readAll();
	cache[key] = value;
	writeAll();
}

/**
 * Reads one entry out of an object-valued preference.
 * Used for per-section and per-sidebar maps.
 * @param {String} key - the preference holding an object
 * @param {String} entry - key within that object
 * @param {*} fallback - returned when the entry is missing
 * @returns {*}
 */
export function getUIStateEntry(key, entry, fallback) {
	const map = getUIState(key, {});
	if (map && typeof map === 'object' && Object.prototype.hasOwnProperty.call(map, entry)) {
		return map[entry];
	}
	return fallback;
}

/**
 * Writes one entry into an object-valued preference.
 * @param {String} key - the preference holding an object
 * @param {String} entry - key within that object
 * @param {*} value - JSON-serializable value
 */
export function setUIStateEntry(key, entry, value) {
	const map = { ...getUIState(key, {}) };
	map[entry] = value;
	setUIState(key, map);
}
