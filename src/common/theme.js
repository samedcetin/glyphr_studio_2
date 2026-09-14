/**
	THEME CONTROLLER
	----------------
	Owns three things:
		1. The user's theme preference ('system' | 'light' | 'dark') and its persistence.
		2. Stamping data-theme onto <html> so the CSS token layer resolves.
		3. Handing canvas-drawing code the current theme's colors, since a
			2D canvas context cannot read CSS custom properties itself.

	This module deliberately does NOT import from app/ or project_editor/.
	It has to be able to run before the app boots, to avoid a flash of the
	wrong theme, so it talks to localStorage directly.
 */

const STORAGE_KEY = 'GlyphrStudio';
const PREF_KEY = 'themePreference';

/** @type {'system'|'light'|'dark'} */
let currentPreference = 'system';

/** @type {Set<Function>} */
const listeners = new Set();

/** @type {MediaQueryList | false} */
let systemQuery = false;

/**
 * Canvas colors are read out of CSS custom properties once per theme change
 * and cached, because getComputedStyle is far too slow to call inside a
 * render loop. Every key here must exist as a --token in tokens.css.
 */
const CANVAS_TOKENS = [
	'canvas-bg',
	'canvas-ink',
	'canvas-ink-muted',
	'canvas-metric',
	'canvas-metric-strong',
	'canvas-guide',
	'canvas-grid',
	'canvas-anchor',
	'canvas-selection',
	'canvas-selection-fill',
	'canvas-handle',
	'canvas-handle-stroke',
	'canvas-handle-line',
	'canvas-point',
	'canvas-point-selected',
	'canvas-snap',
	'canvas-check-near-point',
	'canvas-check-short-handle',
	'canvas-check-near-x',
	'canvas-check-near-y',
];

/** @type {Object | false} */
let canvasColorCache = false;

// --------------------------------------------------------------
// Preference storage
// --------------------------------------------------------------

/**
 * Reads the saved preference. Returns 'system' for anything unreadable -
 * a private window, blocked site data, or a first run all land here.
 * @returns {'system'|'light'|'dark'}
 */
function readStoredPreference() {
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) return 'system';
		const value = JSON.parse(raw)?.[PREF_KEY];
		if (value === 'light' || value === 'dark' || value === 'system') return value;
	} catch {
		// Storage unavailable or malformed. Not worth surfacing to the user.
	}
	return 'system';
}

/**
 * Persists the preference alongside the app's other local storage data.
 * @param {'system'|'light'|'dark'} preference
 */
function writeStoredPreference(preference) {
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		const data = raw ? JSON.parse(raw) : {};
		data[PREF_KEY] = preference;
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
	} catch {
		// Preference simply will not survive a reload. The session still works.
	}
}

// --------------------------------------------------------------
// Public API
// --------------------------------------------------------------

/**
 * The raw preference, which may be 'system'.
 * @returns {'system'|'light'|'dark'}
 */
export function getThemePreference() {
	return currentPreference;
}

/**
 * The theme actually in effect right now - never 'system'.
 * @returns {'light'|'dark'}
 */
export function getResolvedTheme() {
	if (currentPreference === 'light') return 'light';
	if (currentPreference === 'dark') return 'dark';
	return systemPrefersDark() ? 'dark' : 'light';
}

/**
 * @returns {Boolean} - whether the OS is currently asking for dark
 */
function systemPrefersDark() {
	if (!window.matchMedia) return false;
	return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * Sets and persists the theme preference, then applies it.
 * @param {'system'|'light'|'dark'} preference
 */
export function setThemePreference(preference) {
	if (preference !== 'light' && preference !== 'dark' && preference !== 'system') {
		preference = 'system';
	}
	currentPreference = preference;
	writeStoredPreference(preference);
	applyTheme();
}

/**
 * Cycles system -> light -> dark -> system. Used by the top bar toggle.
 * @returns {'system'|'light'|'dark'} - the new preference
 */
export function cycleThemePreference() {
	const order = ['system', 'light', 'dark'];
	const next = order[(order.indexOf(currentPreference) + 1) % order.length];
	// @ts-expect-error - next is constrained by the order array above
	setThemePreference(next);
	return currentPreference;
}

/**
 * Stamps the resolved theme on <html> and notifies listeners.
 * Safe to call repeatedly; it is idempotent apart from the notification.
 */
export function applyTheme() {
	const resolved = getResolvedTheme();
	document.documentElement.setAttribute('data-theme', resolved);

	// The cache is keyed to the theme, so any change invalidates it.
	canvasColorCache = false;

	listeners.forEach((callback) => {
		try {
			callback(resolved);
		} catch (error) {
			console.error('Theme listener failed', error);
		}
	});
}

/**
 * Registers a callback for theme changes. Returns an unsubscribe function.
 * @param {Function} callback - receives 'light' or 'dark'
 * @returns {Function} - call to unsubscribe
 */
export function onThemeChange(callback) {
	listeners.add(callback);
	return () => listeners.delete(callback);
}

/**
 * Call once, as early in app startup as possible.
 */
export function initTheme() {
	currentPreference = readStoredPreference();

	// Follow the OS while the preference is 'system'.
	if (window.matchMedia) {
		systemQuery = window.matchMedia('(prefers-color-scheme: dark)');
		const handler = () => {
			if (currentPreference === 'system') applyTheme();
		};
		if (systemQuery.addEventListener) systemQuery.addEventListener('change', handler);
		else if (systemQuery.addListener) systemQuery.addListener(handler);
	}

	applyTheme();
}

// --------------------------------------------------------------
// Canvas colors
// --------------------------------------------------------------

/**
 * The current theme's canvas colors, as plain CSS color strings ready to
 * assign to ctx.fillStyle / ctx.strokeStyle.
 *
 * Cached until the theme changes. Do NOT hold onto the returned object
 * across a theme change - call this again inside the draw function.
 *
 * @returns {Object} - keys are the token names without the 'canvas-' prefix,
 *                     camelCased. e.g. --canvas-ink-muted -> inkMuted
 */
export function getCanvasColors() {
	if (canvasColorCache) return canvasColorCache;

	const computed = getComputedStyle(document.documentElement);
	const colors = {};

	CANVAS_TOKENS.forEach((token) => {
		const value = computed.getPropertyValue(`--${token}`).trim();
		// 'canvas-ink-muted' -> 'inkMuted'
		const key = token
			.replace(/^canvas-/, '')
			.replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
		colors[key] = value || '#888';
	});

	canvasColorCache = colors;
	return colors;
}

/**
 * Forces the next getCanvasColors call to re-read from CSS. Only needed if
 * something outside this module mutates the token values at runtime.
 */
export function invalidateCanvasColors() {
	canvasColorCache = false;
}
