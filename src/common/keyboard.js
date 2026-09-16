/**
	KEYBOARD
	--------
	What a key is called on the keyboard in front of the person.

	The bindings are the same everywhere - events_keyboard.js reads
	metaKey || ctrlKey - but the key that fires them is not: on a Mac it is
	⌘, and a Mac keyboard has no key that says "Ctrl" in the place the finger
	goes. Every place that writes a shortcut down - the palette rows, the
	shortcut sheet, the menu notes, the rail's search button - asks here, so
	the app says ⌘ Z on a Mac and Ctrl Z everywhere else, and says it the
	same way in every one of those places.
 */

/**
 * Whether this is running on macOS. Read once: platforms do not change
 * mid-session, and the sheet asks for it once per key.
 */
const isMac = (() => {
	if (typeof navigator === 'undefined') return false;
	const platform = `${navigator.platform || ''} ${navigator.userAgent || ''}`.toLowerCase();
	return platform.includes('mac');
})();

/**
 * How a Mac writes the modifier and editing keys. Everything else - letters,
 * punctuation, "scroll", "drag" - reads the same on both.
 */
const macNames = {
	ctrl: '⌘',
	shift: '⇧',
	alt: '⌥',
	del: '⌫',
};

/**
 * Is this a Mac, for the places that phrase a whole sentence around it.
 * @returns {Boolean}
 */
export function isMacPlatform() {
	return isMac;
}

/**
 * The name of one key, for the platform this is running on.
 * @param {String} key - the key as the bindings name it: 'Ctrl', 'Shift', 'Z'
 * @returns {String}
 */
export function keyLabel(key) {
	const name = String(key);
	if (!isMac) return name;
	return macNames[name.toLowerCase()] || name;
}

/**
 * A whole shortcut as one string, for prose: 'Ctrl Z' → '⌘ Z' on a Mac.
 * @param {Array<String>} keys - the keys, in order
 * @returns {String}
 */
export function shortcutLabel(keys) {
	return keys.map(keyLabel).join(' ');
}
