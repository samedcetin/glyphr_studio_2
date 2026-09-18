/**
	SPECIMEN SHEET — THE ARRIVAL

	When a sheet goes straight in, the user never sees the review - so the
	first thing they see is the Overview with a font in it that was not there a
	moment ago. Without a beat of motion that reads as a page that was already
	like this, and the thing they just did is invisible.

	So the characters land: in reading order, quickly, once.

	ONCE is the hard part and it is why this is JavaScript rather than a class
	in the stylesheet. The coverage grid is rebuilt every time the page
	navigates, the range changes or the search is typed in - and an `animation`
	on a tile selector replays on every one of those. That is the exact bug
	`.panel__card` carries, where both sidebars shimmer for the whole of a
	canvas drag. The names are handed over, played against the tiles that are
	on screen, and forgotten.

	Reduced motion needs nothing here: tokens.css already flattens every
	animation-duration to 0.01ms under the media query, so this becomes an
	instant state change rather than something to check for.
*/

/** Ids waiting to be played, from the import that just happened. */
let pending = null;

/** Between one tile starting and the next. */
const STEP_MS = 16;

/** However many arrive, the whole run is over inside this. */
const MAX_RUN_MS = 900;

/**
 * Says what just landed, for the next Overview to play.
 *
 * @param {Array} itemIDs - project ids, in the order they were imported
 */
export function announceArrival(itemIDs) {
	pending = itemIDs?.length ? new Set(itemIDs) : null;
}

/** Forgets an announcement that was never played. */
export function cancelArrival() {
	pending = null;
}

/**
 * Plays the arrival across a grid of tiles, if one is waiting.
 *
 * Called by whoever builds the grid. Does nothing at all on an ordinary
 * visit, which is most of them.
 *
 * @param {Element} root - a container holding glyph-tile elements
 * @returns {Number} how many tiles were played
 */
export function playArrival(root) {
	if (!pending || !root) return 0;

	const tiles = [...root.querySelectorAll('glyph-tile[displayed-item-id]')].filter((tile) =>
		pending.has(tile.getAttribute('displayed-item-id'))
	);

	// Cleared before anything is animated, so a rebuild triggered by the
	// animation itself cannot start a second run.
	pending = null;
	if (!tiles.length) return 0;

	// The stagger shortens as the set grows: sixty characters at a comfortable
	// 40ms each is two and a half seconds of waiting to use the page.
	const step = Math.min(STEP_MS, MAX_RUN_MS / tiles.length);

	tiles.forEach((tile, index) => {
		tile.style.setProperty('--arrival-delay', `${Math.round(index * step)}ms`);
		tile.setAttribute('arriving', '');
		tile.addEventListener(
			'animationend',
			() => {
				tile.removeAttribute('arriving');
				tile.style.removeProperty('--arrival-delay');
			},
			{ once: true }
		);
	});

	return tiles.length;
}

/**
 * Whether an arrival is waiting to be played.
 * @returns {Boolean}
 */
export function hasPendingArrival() {
	return Boolean(pending);
}
