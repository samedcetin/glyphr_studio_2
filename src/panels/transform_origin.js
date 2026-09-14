import { makeElement } from '../common/dom.js';

// --------------------------------------------------------------
// Transform origin
// --------------------------------------------------------------

/*
	The point every transform holds still, and the two controls that set it.

	It appears twice: as a chooser beside width and height in Properties, and
	as a grid at the top of the Transform panel, where rotation, skew and the
	one-click turns read it. Two views of one property on one object, so this
	module owns both the names and the job of keeping them showing the same
	thing - neither panel is rebuilt on the other's account.
*/

/** Top to bottom. `baseline` is y = 0, not the bottom of the shape. */
const yNames = ['top', 'middle', 'baseline', 'bottom'];

/** Left to right. */
const xNames = ['left', 'center', 'right'];

/**
 * What each row and column actually points at.
 *
 * The grid is twelve identical dots in a box, and three of the four rows are
 * self-evident from where they sit. `baseline` is the one that is not: it is
 * the em baseline, y = 0, which a glyph with a descender hangs below - so the
 * third row and the fourth row are different points and the drawing alone
 * cannot say so. That is what the rule across the grid marks, and this is
 * what says it in words.
 */
const originGloss = {
	/* Which column: the phrase the sentence starts on. */
	left: 'Left edge',
	center: 'Horizontal centre',
	right: 'Right edge',
	/* Which row: the phrase it ends on. */
	top: 'at the top of the selection',
	middle: 'halfway up the selection',
	baseline: 'on the baseline — y = 0, not the bottom of the shape',
	bottom: 'at the bottom of the selection',
};

/**
 * "baseline-left" as "baseline left".
 * @param {String} origin - a transformOrigins name
 * @returns {String}
 */
export function transformOriginName(origin) {
	return `${origin}`.replace(/-/g, ' ');
}

/**
 * Show the same origin in every control on screen that sets it.
 * @param {String} origin - a transformOrigins name
 */
export function syncTransformOriginChoosers(origin) {
	const name = transformOriginName(origin);

	document.querySelectorAll('.transform-origin-chooser').forEach((chooser) => {
		/* selected-name only - writing selected-id fires a change event back out. */
		chooser.setAttribute('selected-name', name);
	});

	document.querySelectorAll('.origin-grid__cell').forEach((cell) => {
		const isCurrent = cell.getAttribute('data-origin') === `${origin}`;
		cell.setAttribute('aria-checked', `${isCurrent}`);
		if (isCurrent) cell.setAttribute('selected', '');
		else cell.removeAttribute('selected');
	});
}

/**
 * The origin as a grid of the twelve points, drawn as the em box they sit in.
 *
 * Twelve names in a dropdown asked the reader to hold a coordinate system in
 * their head and then find its name in a list. Illustrator and Figma both put
 * this on a reference-point grid instead, and a designer can hit the corner
 * they want without reading anything.
 *
 * @param {Function} onPick - called with the chosen origin name
 * @returns {HTMLElement}
 */
export function makeTransformOriginGrid(onPick) {
	const grid = makeElement({
		tag: 'div',
		className: 'origin-grid',
		attributes: { role: 'radiogroup', 'aria-label': 'Transform origin' },
	});

	yNames.forEach((y) => {
		xNames.forEach((x) => {
			const origin = `${y}-${x}`;
			const cell = makeElement({
				tag: 'button',
				className: 'origin-grid__cell',
				attributes: {
					'data-origin': origin,
					role: 'radio',
					'aria-checked': 'false',
					'aria-label': transformOriginName(origin),
					/* Read by the tip, which stands in for the native title. */
					'data-gloss': `${originGloss[x]}, ${originGloss[y]}.`,
				},
			});

			cell.addEventListener('click', () => onPick(origin));
			/* Pointer and keyboard both, so tabbing the grid explains itself too. */
			cell.addEventListener('mouseenter', () => showOriginTip(cell));
			cell.addEventListener('focus', () => showOriginTip(cell));
			cell.addEventListener('mouseleave', hideOriginTip);
			cell.addEventListener('blur', hideOriginTip);
			grid.appendChild(cell);
		});
	});

	grid.addEventListener('mouseleave', hideOriginTip);

	return grid;
}

// --------------------------------------------------------------
// The tip
// --------------------------------------------------------------

/*
	Twelve dots in a box is a fast control to aim at and a slow one to learn,
	and the native `title` is the wrong teacher: a second of nothing, then an
	OS tooltip in an OS font saying the two words the dot already implies.

	This says what the point actually is, in the app's own surface, quickly
	enough to read while sweeping across the grid. One element, moved and
	refilled - twelve of them would animate twelve times on one sweep.
*/

/** The one tip element, made on first hover. */
let originTip = null;

/** So a sweep across the grid does not fade in once per dot. */
let originTipTimer = 0;

/**
 * @returns {HTMLElement} the tip, attached to the app shell
 */
function getOriginTip() {
	if (originTip && originTip.isConnected) return originTip;

	originTip = makeElement({ className: 'origin-tip', attributes: { role: 'tooltip' } });
	originTip.appendChild(makeElement({ className: 'origin-tip__name' }));
	originTip.appendChild(makeElement({ className: 'origin-tip__gloss' }));

	/*
		On the shell rather than in the grid: the grid clips its own overflow to
		keep the dots inside its corners, which would cut the tip in half.
	*/
	(document.querySelector('#app__wrapper') || document.body).appendChild(originTip);
	return originTip;
}

/**
 * Put the tip over one cell.
 * @param {HTMLElement} cell - the dot being pointed at
 */
function showOriginTip(cell) {
	const tip = getOriginTip();
	const origin = cell.getAttribute('data-origin');

	tip.querySelector('.origin-tip__name').textContent = transformOriginName(origin);
	tip.querySelector('.origin-tip__gloss').textContent = cell.getAttribute('data-gloss');

	/* Measure after filling, so the width is the width it will actually be. */
	tip.setAttribute('measuring', '');
	const cellBox = cell.getBoundingClientRect();
	const tipBox = tip.getBoundingClientRect();
	const gap = 8;

	/* Centred on the dot, then pulled back inside the window. */
	const left = Math.min(
		Math.max(cellBox.left + cellBox.width / 2 - tipBox.width / 2, gap),
		window.innerWidth - tipBox.width - gap
	);

	/* Above, unless the dot is too near the top of the window to fit there. */
	const above = cellBox.top - tipBox.height - gap;
	const flipped = above < gap;

	tip.style.left = `${Math.round(left)}px`;
	tip.style.top = `${Math.round(flipped ? cellBox.bottom + gap : above)}px`;
	tip.removeAttribute('measuring');

	window.clearTimeout(originTipTimer);
	if (tip.hasAttribute('open')) return;

	/* A beat before the first one, so brushing past the grid shows nothing. */
	originTipTimer = window.setTimeout(() => tip.setAttribute('open', ''), 80);
}

/**
 * Take it away.
 */
function hideOriginTip() {
	window.clearTimeout(originTipTimer);
	if (originTip) originTip.removeAttribute('open');
}
