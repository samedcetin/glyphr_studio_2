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
import { makeDirectToggle, makeOpacitySlider, makeSingleInput, makeSingleLabel } from './cards.js';
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
 * The guides you have added yourself, and the way to add another.
 *
 * @param {HTMLElement} card
 * @param {Object} guides - settings.app.guides
 */
function fillCustomGuides(card, guides) {
	if (guides.customShowGuides) {
		guides.custom.forEach((guide, number) => card.appendChild(makeCustomGuideRow(guide, number)));
	}

	const addGuideButton = makeElement({
		tag: 'fancy-button',
		attributes: { secondary: '' },
		innerHTML: 'Add a custom guide',
	});
	addGuideButton.addEventListener('click', () => {
		guides.custom.push(new Guide({ visible: true, color: makeRandomSaturatedColor() }));
		guides.customShowGuides = true;
		refreshGuideChange();
	});

	card.appendChild(addGuideButton);
}

/**
 * One custom guide, on two rows.
 *
 * It was one row of five controls in 235px, which left 63px for the name -
 * three characters, holding `Horizontal guide`. And two of those five were
 * bar icons meaning opposite things: the switch on the left showed the
 * orientation the guide has, the button on the right showed the orientation
 * it would become. Nothing said which was the state and which was the verb.
 *
 * So: the name gets a row with the two controls that act on the guide as a
 * whole, and the orientation becomes a pair of buttons side by side with the
 * current one held down - a state you read rather than a verb you decode.
 *
 * @param {Object} guide
 * @param {Number} number - its index, for delete
 * @returns {HTMLElement}
 */
function makeCustomGuideRow(guide, number) {
	const horizontal = guide.angle === 90;
	const row = makeElement({ className: 'guides-card__custom-row' });

	// --------------------------------------------------------------
	// Whether it is drawn, what it is called, and getting rid of it
	// --------------------------------------------------------------

	/*
		An eye, like every other show-and-hide in the app. It used to be the
		orientation mark, which is what put two bar icons in one row. It keeps
		the guide's colour, which is the part that was doing real work: it is
		how you tell one guide from another.
	*/
	const showToggle = makeDirectToggle(guide, 'visible', () => {
		getCurrentProjectEditor().editCanvas.redraw('guides custom view toggle');
	}, {
		icon: 'eye',
		name: guide.name || 'Guide',
		body: 'Show this guide on the canvas.',
		color: guide.color,
	});

	const nameInput = makeSingleInput(guide, 'name', 'editCanvasView', 'input');
	nameInput.classList.add('guides-card__custom-name');

	const deleteButton = makeIconButton({
		icon: 'delete',
		name: 'Delete guide',
		onClick: () => {
			getCurrentProject().settings.app.guides.custom.splice(number, 1);
			refreshGuideChange();
		},
	});

	const head = makeElement({ className: 'guides-card__custom-head' });
	addAsChildren(head, [showToggle, nameInput, deleteButton]);
	row.appendChild(head);

	// --------------------------------------------------------------
	// Which way it runs, and where
	// --------------------------------------------------------------

	/**
	 * @param {Boolean} wantsHorizontal
	 * @param {String} icon
	 * @param {String} name
	 * @returns {HTMLElement}
	 */
	const orientationButton = (wantsHorizontal, icon, name) => {
		const button = makeIconButton({
			icon: icon,
			name: name,
			className: 'guides-card__orientation-button',
			onClick: () => {
				const target = getCurrentProject().settings.app.guides.custom[number];
				if (wantsHorizontal === (target.angle === 90)) return;
				target.angle = wantsHorizontal ? 90 : 0;
				target.name = wantsHorizontal
					? target.name.replace('Vertical', 'Horizontal')
					: target.name.replace('Horizontal', 'Vertical');
				refreshGuideChange();
			},
		});
		button.setAttribute('aria-pressed', `${wantsHorizontal === horizontal}`);
		return button;
	};

	const orientation = makeElement({ className: 'guides-card__orientation' });
	addAsChildren(orientation, [
		orientationButton(true, 'command_horizontalBar', 'Horizontal'),
		orientationButton(false, 'command_verticalBar', 'Vertical'),
	]);

	/*
		The axis, on the field. A horizontal guide sits at a y, a vertical one
		at an x - so the prefix says which number this is, and it changes when
		the orientation does.
	*/
	const valueInput = makeSingleInput(guide, 'location', 'editCanvasView', 'input-number');
	valueInput.classList.add('guides-card__custom-value');
	valueInput.setAttribute('prefix', horizontal ? 'Y' : 'X');
	valueInput.setAttribute('suffix', 'em');

	const place = makeElement({ className: 'guides-card__custom-place' });
	addAsChildren(place, [orientation, valueInput]);
	row.appendChild(place);

	return row;
}
