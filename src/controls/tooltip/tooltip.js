import { makeElement } from '../../common/dom.js';

/**
	TOOLTIP
	-------
	The app's own hover label, in place of the browser's.

	A native `title` is a second of nothing, then an OS tooltip in an OS font,
	unstyled and untimed. That is tolerable on a control whose name is written
	beside it and useless on a grid of icons, which is exactly where this app
	puts its densest surfaces: the twelve origin points, and the thirty-odd
	action buttons behind the toolbar's quick actions.

	It was built for the origin grid first and lived there. This is the same
	code, moved rather than copied, so the two surfaces cannot drift.

	ONE ELEMENT, moved and refilled. Twelve or thirty of them would animate
	once per icon on a single sweep across a grid; this fades in once and then
	follows the pointer from icon to icon.
 */

/** The one tip element, made on first use. */
let tip = null;

/** So a sweep across a grid does not fade in once per target. */
let timer = 0;

/**
 * @returns {HTMLElement} the tip, attached to the app shell
 */
function getTooltip() {
	if (tip && tip.isConnected) return tip;

	tip = makeElement({ className: 'tooltip', attributes: { role: 'tooltip' } });
	tip.appendChild(makeElement({ className: 'tooltip__name' }));
	tip.appendChild(makeElement({ className: 'tooltip__body' }));

	/*
		On the shell rather than beside its target: the surfaces that want this
		clip their own overflow to keep their contents inside their corners, and
		a tip inside one would be cut in half.
	*/
	(document.querySelector('#app__wrapper') || document.body).appendChild(tip);
	return tip;
}

/**
 * Show the tip over one element.
 *
 * @param {HTMLElement} target - what is being pointed at
 * @param {String} name - the bold first line
 * @param {String} body - the rest, or empty
 */
export function showTooltip(target, name, body) {
	const element = getTooltip();

	element.querySelector('.tooltip__name').textContent = name;
	const bodyElement = element.querySelector('.tooltip__body');
	bodyElement.textContent = body;
	bodyElement.hidden = !body;

	/*
		Measure with the closed state's transform off. getBoundingClientRect
		reports the transformed box, so measuring through a scale and an offset
		lands the tip a few pixels short of where it belongs.
	*/
	element.setAttribute('measuring', '');
	const targetBox = target.getBoundingClientRect();
	const tipBox = element.getBoundingClientRect();
	const gap = 8;

	/* Centred on the target, then pulled back inside the window. */
	const left = Math.min(
		Math.max(targetBox.left + targetBox.width / 2 - tipBox.width / 2, gap),
		window.innerWidth - tipBox.width - gap
	);

	/* Above, unless there is no room up there. */
	const above = targetBox.top - tipBox.height - gap;
	const flipped = above < gap;

	element.style.left = `${Math.round(left)}px`;
	element.style.top = `${Math.round(flipped ? targetBox.bottom + gap : above)}px`;
	element.removeAttribute('measuring');

	window.clearTimeout(timer);
	if (element.hasAttribute('open')) return;

	/* A beat before the first one, so brushing past a grid shows nothing. */
	timer = window.setTimeout(() => element.setAttribute('open', ''), 80);
}

/**
 * Take it away.
 */
export function hideTooltip() {
	window.clearTimeout(timer);
	if (tip) tip.removeAttribute('open');
}

/**
 * Set or change what an element’s tooltip says.
 *
 * Read at hover rather than captured at bind, because a toolbar face says
 * whichever tool it is currently showing - the label changes under a
 * listener that was attached once.
 *
 * @param {HTMLElement} element - the target
 * @param {String} name - the bold first line
 * @param {String =} body - the rest
 */
export function setTooltip(element, name, body = '') {
	element.setAttribute('data-tip-name', name);
	if (body) element.setAttribute('data-tip-body', body);
	else element.removeAttribute('data-tip-body');
}

/**
 * Give one element the app’s tooltip instead of the browser’s.
 *
 * With no text passed, the element’s own `title` is used and then removed -
 * the first line as the name, the rest as the body, which is the shape every
 * action button in this app already writes its title in. Removing it matters:
 * left in place, the OS tooltip appears a second later on top of this one.
 *
 * Binding is idempotent, so calling this again only updates the text.
 *
 * @param {HTMLElement} element - the target
 * @param {Object =} text - { name, body }, or omitted to read the title
 */
export function attachTooltip(element, text) {
	let name = text?.name;
	let body = text?.body;

	if (name === undefined) {
		const title = element.getAttribute('title') || '';
		if (!title) return;
		const [first, ...rest] = title.split('\n');
		name = first;
		body = rest.join(' ').trim();
		/* The accessible name has to survive the title going away. */
		if (!element.getAttribute('aria-label')) element.setAttribute('aria-label', title);
		element.removeAttribute('title');
	}

	setTooltip(element, name, body);

	if (element.hasAttribute('data-tip-bound')) return;
	element.setAttribute('data-tip-bound', '');

	const show = () =>
		showTooltip(
			element,
			element.getAttribute('data-tip-name') || '',
			element.getAttribute('data-tip-body') || ''
		);

	element.addEventListener('mouseenter', show);
	element.addEventListener('focus', show);
	element.addEventListener('mouseleave', hideTooltip);
	element.addEventListener('blur', hideTooltip);
	/* Acting on it ends the errand - a tip left over a menu that just opened
		sits on top of the menu. */
	element.addEventListener('click', hideTooltip);
}
