import { getCurrentProject, getCurrentProjectEditor } from '../app/main.js';
import { makeRandomSaturatedColor } from '../common/colors.js';
import { addAsChildren, makeElement } from '../common/dom.js';
import { makeIconButton } from '../controls/icon-toggle/icon_toggle.js';
import { attachTooltip } from '../controls/tooltip/tooltip.js';

import {
	Guide,
	guideColorDark,
	guideColorLight,
	guideColorMedium,
} from '../project_editor/guide.js';
import { makeDirectToggle, makeOpacitySlider, makeSingleInput, makeSingleLabel, startRenamingInPlace } from './cards.js';
import { refreshPanel } from './panels.js';

// --------------------------------------------------------------
// Guides panel
// --------------------------------------------------------------

/**
 * One setting: what it is on the left, the control for it on the right.
 *
 * @param {String} title
 * @param {HTMLElement} control
 * @returns {HTMLElement}
 */
function makeOptionRow(title, control) {
	const row = makeElement({ className: 'guides-card__option' });
	row.appendChild(makeSingleLabel(title));
	row.appendChild(control);
	return row;
}

/**
 * A group of guides: what it is called, the switch that shows the lot, and
 * the two settings that apply to all of them.
 *
 * Each group used to be named twice - once in a "View options" card holding
 * its switch and its settings, and again two hundred pixels down as the
 * heading of the card listing its members. One name, one place.
 *
 * @param {String} title
 * @param {String} prefix - `system` or `custom`
 * @param {Object} guides - settings.app.guides
 * @returns {HTMLElement} - the card to fill with the group’s members
 */
function makeGuideGroupCard(title, prefix, guides) {
	const card = makeElement({ className: `panel__card guides-card__${prefix}` });

	const head = makeElement({ className: 'guides-card__group-head' });
	head.appendChild(makeElement({ tag: 'h3', content: title }));
	head.appendChild(
		makeDirectToggle(guides, `${prefix}ShowGuides`, () => getCurrentProjectEditor().navigate(), {
			icon: 'eye',
			name: `Show ${title.toLowerCase()}`,
		})
	);
	card.appendChild(head);

	if (!guides[`${prefix}ShowGuides`]) return card;

	addAsChildren(card, [
		makeOptionRow(
			'Opacity',
			makeOpacitySlider(guides, `${prefix}Transparency`, () =>
				getCurrentProjectEditor().editCanvas.redraw(`guides ${prefix} opacity`)
			)
		),
		makeOptionRow(
			'Show labels',
			makeDirectToggle(guides, `${prefix}ShowLabels`, refreshGuideChange, {
				icon: 'label',
				name: 'Show labels',
				body: 'Name each guide where it meets the edge of the canvas.',
			})
		),
	]);

	return card;
}

export function makePanel_Guides() {
	const guides = getCurrentProject().settings.app.guides;

	/*
		One row, so it does not need a card or a heading over it. It was a
		"View options" card whose entire contents were this line and the two
		group switches - and the section header already says Guides.
	*/
	const topCard = makeElement({ className: 'panel__card guides-card__view-options' });
	topCard.appendChild(
		makeOptionRow(
			'Draw guides over shapes',
			makeDirectToggle(guides, 'drawGuidesOnTop', refreshGuideChange, {
				icon: 'panel_guides',
				name: 'Draw guides over shapes',
				body: 'Off, the outline covers them.',
			})
		)
	);

	const systemCard = makeGuideGroupCard('Key metrics guides', 'system', guides);
	if (guides.systemShowGuides) fillSystemGuides(systemCard);

	const customCard = makeGuideGroupCard('Custom guides', 'custom', guides);
	fillCustomGuides(customCard, guides);

	return [topCard, systemCard, customCard];
}

function refreshGuideChange() {
	refreshPanel();
	getCurrentProjectEditor().editCanvas.redraw('guides refresh');
}

/**
 * The seven lines the font's key metrics draw.
 * @param {HTMLElement} card
 */
function fillSystemGuides(card) {
	const metrics = getCurrentProject().settings.font;
	const advanceWidth = getCurrentProjectEditor().selectedItem.advanceWidth;
	addAsChildren(card, [
		makeSystemGuideRow('ascent', 'Ascent', metrics.ascent, guideColorMedium),
		makeSystemGuideRow('capHeight', 'Cap height', metrics.capHeight, guideColorLight),
		makeSystemGuideRow('xHeight', 'X height', metrics.xHeight, guideColorLight),
		makeSystemGuideRow('baseline', 'Baseline', '0', guideColorDark),
		makeSystemGuideRow('descent', 'Descent', metrics.descent, guideColorMedium),
		makeSystemGuideRow('leftSide', 'Left side', '0', guideColorDark),
		makeSystemGuideRow('rightSide', 'Right side', advanceWidth, guideColorDark),
	]);
}

/**
 * One key metric, on one row: its switch, its name, its position.
 *
 * It used to be four separate children pushed into a card that collapses to
 * a single column in a sidebar this narrow, so each metric stacked into a
 * 107px tower - checkbox, label, an empty span, value - and seven of them
 * made a 777px card. Measured; the whole panel was 2516px against a 910px
 * window.
 *
 * The orientation mark and the switch are the same control now. The mark
 * says which way the line runs, being pressed says the line is on, and it
 * carries the line’s own colour - so the switch here and the line out there
 * are recognisably one thing.
 *
 * @param {String} property - the key in systemGuides
 * @param {String} title - what it is called
 * @param {String | Number} value - where it sits
 * @param {String} color - the colour the line is drawn in
 * @returns {HTMLElement}
 */
function makeSystemGuideRow(property, title, value = '0000', color) {
	const systemGuides = getCurrentProjectEditor().systemGuides;
	const vertical = property === 'leftSide' || property === 'rightSide';

	/*
		Five of these come from the font and never change as you work; two
		come from this glyph's own advance width and move as you edit it.
		They happen to be exactly the horizontal ones and the vertical ones,
		so the mark on the switch already separates them - the tooltip says
		which is which, and a rule in the list groups them.
	*/
	const fromGlyph = vertical;
	const fromOrigin = property === 'leftSide';

	const toggle = makeDirectToggle(systemGuides, property, (newValue) => {
		const editor = getCurrentProjectEditor();
		let shownGuides = editor.project.settings.app.guides.systemGuides;
		if (newValue) {
			if (!shownGuides.includes(property)) {
				shownGuides.push(property);
			}
		} else {
			if (shownGuides.includes(property)) {
				shownGuides = shownGuides.filter((g) => g !== property);
			}
		}
		editor.editCanvas.redraw('guides system view toggle');
	}, {
		icon: vertical ? 'command_verticalBar' : 'command_horizontalBar',
		name: title,
		body: fromGlyph
			? `A vertical line at ${value} em, ${fromOrigin ? 'at the glyph origin' : 'at the advance width'}.`
			: `A horizontal line at ${value} em, from the font’s key metrics.`,
		color: color,
	});

	const row = makeElement({
		className: `guides-card__metric${fromGlyph ? ' guides-card__metric--glyph' : ''}`,
	});
	row.appendChild(toggle);

	const name = makeElement({ className: 'guides-card__metric-name' });
	name.textContent = title;
	row.appendChild(name);

	/*
		Not editable here, and it no longer looks it. The unit is written out
		because every other distance in this app carries one, and a bare 1490
		beside a name is as easily a count of something.
	*/
	const valueDisplay = makeElement({ className: 'guides-card__metric-value' });
	valueDisplay.innerHTML = `${value}<span class='guides-card__metric-unit'>em</span>`;
	attachTooltip(valueDisplay, {
		name: 'Guide position',
		body: fromGlyph
			? (fromOrigin ? 'Always zero: it is where the glyph starts.' : 'Follows this glyph’s advance width.')
			: 'Set on the Font settings page.',
	});
	row.appendChild(valueDisplay);

	return row;
}

/**
 * The guides you have added yourself, and the two ways to add another.
 *
 * A list, not a form. Every row is the same 28px shape with its controls at
 * the two ends - show it on the left, delete it on the right - which is what
 * the Layers rows and the Anchors rows already do, and what makes five of
 * them scan as five of one thing instead of a wall.
 *
 * @param {HTMLElement} card
 * @param {Object} guides - settings.app.guides
 */
function fillCustomGuides(card, guides) {
	if (guides.customShowGuides) {
		guides.custom.forEach((guide, number) => card.appendChild(makeCustomGuideRow(guide, number)));
	}

	/*
		Two ways in, because orientation is a decision you make once, when you
		add the guide - not a state you flip afterwards. It used to be a button
		on every row forever, showing the orientation the guide would become
		next to a mark showing the one it had; moving it here takes a control
		off every row and removes the thing that made two marks ambiguous.
	*/
	const adders = makeElement({ className: 'guides-card__add' });
	addAsChildren(adders, [
		makeAddGuideButton('Horizontal', 90, guides),
		makeAddGuideButton('Vertical', 0, guides),
	]);
	card.appendChild(adders);
}

/**
 * @param {String} label
 * @param {Number} angle - 90 horizontal, 0 vertical
 * @param {Object} guides - settings.app.guides
 * @returns {HTMLElement}
 */
function makeAddGuideButton(label, angle, guides) {
	const button = makeElement({
		tag: 'fancy-button',
		attributes: { secondary: '' },
		innerHTML: `Add ${label.toLowerCase()}`,
	});

	button.addEventListener('click', () => {
		guides.custom.push(
			new Guide({ visible: true, color: makeRandomSaturatedColor(), angle: angle })
		);
		/* Adding one and not seeing it is the wrong first impression. */
		guides.customShowGuides = true;
		refreshGuideChange();
	});

	attachTooltip(button, {
		name: `Add a ${label.toLowerCase()} guide`,
		body:
			angle === 90
				? 'A line across the glyph, at a y position.'
				: 'A line down the glyph, at an x position.',
	});

	return button;
}

/**
 * One custom guide, on one row.
 *
 * Its controls sit at the two ends and nowhere else: the eye on the left,
 * carrying the guide’s own colour so you can tell one from another, and
 * delete on the right. Between them the row is what the guide IS - which way
 * it runs, what it is called, where it sits.
 *
 * The name is text until you click it, which is how the Layers rows work and
 * is what buys the row its width back: an always-there field left 63px for a
 * name, and the same row without one leaves twice that.
 *
 * @param {Object} guide
 * @param {Number} number - its index, for delete
 * @returns {HTMLElement}
 */
function makeCustomGuideRow(guide, number) {
	const horizontal = guide.angle === 90;
	const row = makeElement({ className: 'guides-card__custom-row' });

	/* Show it. Carries the colour, which is how one guide is told from the
		next once there are several. */
	row.appendChild(
		makeDirectToggle(guide, 'visible', () => {
			getCurrentProjectEditor().editCanvas.redraw('guides custom view toggle');
		}, {
			icon: 'eye',
			name: guide.name,
			body: `${horizontal ? `Horizontal, at y ${guide.location}` : `Vertical, at x ${guide.location}`} em.`,
			color: guide.color,
		})
	);

	/* Which way it runs: a mark, not a button. The only bar in the row now,
		so it cannot be read as the verb the old one was. */
	const mark = makeElement({
		className: `guides-card__mark guides-card__mark--${horizontal ? 'horizontal' : 'vertical'}`,
	});
	mark.style.setProperty('--mark', guide.color);
	row.appendChild(mark);

	// Its name, until you click it.
	const isDefaultName =
		guide.name === 'Horizontal guide' ||
		guide.name === 'Vertical guide' ||
		guide.name === 'Guide';
	const name = makeElement({
		className: `guides-card__custom-name${isDefaultName ? ' guides-card__custom-name--default' : ''}`,
	});
	/*
		An unnamed guide shows the invitation, not its default name. That default
		is the orientation - 'Horizontal guide' - which the mark two pixels to its
		left already says, so printing it spent the widest slot in the row on a
		repetition. The slot is a prompt until it holds something only you know.
	*/
	name.textContent = isDefaultName ? 'Name it' : guide.name;
	attachTooltip(name, {
		name: isDefaultName ? 'Name this guide' : guide.name,
		body: isDefaultName ? 'So you can tell it from the others on the canvas.' : 'Click to rename it.',
	});
	name.addEventListener('click', () =>
		startRenamingInPlace(name, {
			value: isDefaultName ? `` : guide.name,
			className: 'guides-card__rename',
			onCommit: (newName) => {
				const target = getCurrentProject().settings.app.guides.custom[number];
				if (newName && target) target.name = newName;
				refreshGuideChange();
			},
		})
	);
	row.appendChild(name);

	/* Where it sits. The prefix says which number this is: a horizontal
		guide is at a y, a vertical one at an x. */
	const valueInput = makeSingleInput(guide, 'location', 'editCanvasView', 'input-number');
	valueInput.classList.add('guides-card__custom-value');
	valueInput.setAttribute('prefix', horizontal ? 'Y' : 'X');
	row.appendChild(valueInput);

	row.appendChild(
		makeIconButton({
			icon: 'delete',
			name: `Delete ${guide.name}`,
			onClick: () => {
				getCurrentProject().settings.app.guides.custom.splice(number, 1);
				refreshGuideChange();
			},
		})
	);

	return row;
}