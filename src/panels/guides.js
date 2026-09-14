import { getCurrentProject, getCurrentProjectEditor } from '../app/main.js';
import { makeRandomSaturatedColor } from '../common/colors.js';
import { addAsChildren, makeElement } from '../common/dom.js';
import { makeIconButton } from '../controls/icon-toggle/icon_toggle.js';
import { attachTooltip } from '../controls/tooltip/tooltip.js';
import { makeFancySlider } from '../controls/fancy-slider/fancy_slider.js';
import {
	Guide,
	guideColorDark,
	guideColorLight,
	guideColorMedium,
} from '../project_editor/guide.js';
import { makeDirectToggle, makeSingleInput, makeSingleLabel } from './cards.js';
import { refreshPanel } from './panels.js';

// --------------------------------------------------------------
// Guides panel
// --------------------------------------------------------------

/**
 * A group heading with the switch that turns the whole group on.
 *
 * The switch used to be emitted before its own heading, so the card read
 * `[ ] Key metrics guides [ ]` down a single column and which box belonged
 * to which heading was a guess. Same shape as the handle groups in the
 * Properties panel: eyebrow left, control right, one row.
 *
 * @param {String} title
 * @param {HTMLElement} control
 * @returns {HTMLElement}
 */
function makeGroupHead(title, control) {
	const head = makeElement({ className: 'guides-card__group-head' });
	head.appendChild(makeElement({ tag: 'h4', content: title }));
	head.appendChild(control);
	return head;
}

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

export function makePanel_Guides() {
	let viewOptionsCard = makeElement({
		className: 'panel__card guides-card__view-options',
		innerHTML: '<h3>View options</h3>',
	});
	const guides = getCurrentProject().settings.app.guides;
	const showSystem = guides.systemShowGuides;
	const showCustom = guides.customShowGuides;

	viewOptionsCard.appendChild(
		makeOptionRow(
			'Draw guides over shapes',
			makeDirectToggle(guides, 'drawGuidesOnTop', refreshGuideChange, {
				icon: 'panel_guides',
				name: 'Draw guides over shapes',
				body: 'Off, the outline covers them.',
			})
		)
	);

	const systemShowGuidesToggle = makeDirectToggle(guides, 'systemShowGuides', () =>
		getCurrentProjectEditor().navigate()
	, { icon: 'eye', name: 'Show key metrics guides' });
	viewOptionsCard.appendChild(makeGroupHead('Key metrics guides', systemShowGuidesToggle));

	if (showSystem) {
		addAsChildren(viewOptionsCard, [
			makeOptionRow(
				'Transparency',
				makeFancySlider(guides.systemTransparency, (newValue) => {
					guides.systemTransparency = newValue;
					getCurrentProjectEditor().editCanvas.redraw('guides system transparency');
				})
			),
			makeOptionRow(
				'Show labels',
				makeDirectToggle(guides, 'systemShowLabels', refreshGuideChange, {
					icon: 'keyboard',
					name: 'Show labels',
					body: 'Name each guide where it meets the edge of the canvas.',
				})
			),
		]);
	}

	const customShowGuidesToggle = makeDirectToggle(guides, 'customShowGuides', () =>
		getCurrentProjectEditor().navigate()
	, { icon: 'eye', name: 'Show custom guides' });
	viewOptionsCard.appendChild(makeGroupHead('Custom guides', customShowGuidesToggle));

	if (showCustom) {
		addAsChildren(viewOptionsCard, [
			makeOptionRow(
				'Transparency',
				makeFancySlider(guides.customTransparency, (newValue) => {
					guides.customTransparency = newValue;
					getCurrentProjectEditor().editCanvas.redraw('guides custom transparency');
				})
			),
			makeOptionRow(
				'Show labels',
				makeDirectToggle(guides, 'customShowLabels', refreshGuideChange, {
					icon: 'keyboard',
					name: 'Show labels',
					body: 'Name each guide where it meets the edge of the canvas.',
				})
			),
		]);
	}

	let result = [viewOptionsCard];
	if (showSystem) result.push(makeSystemGuidesCard());
	if (showCustom) result.push(makeCustomGuidesCard());
	return result;
}

function refreshGuideChange() {
	refreshPanel();
	getCurrentProjectEditor().editCanvas.redraw('guides refresh');
}

export function makeSystemGuidesCard() {
	let systemCard = makeElement({
		className: 'panel__card guides-card__system',
		innerHTML: '<h3>Key metrics guides</h3>',
	});

	const metrics = getCurrentProject().settings.font;
	const advanceWidth = getCurrentProjectEditor().selectedItem.advanceWidth;
	addAsChildren(systemCard, [
		makeSystemGuideRow('ascent', 'Ascent', metrics.ascent, guideColorMedium),
		makeSystemGuideRow('capHeight', 'Cap height', metrics.capHeight, guideColorLight),
		makeSystemGuideRow('xHeight', 'X height', metrics.xHeight, guideColorLight),
		makeSystemGuideRow('baseline', 'Baseline', '0', guideColorDark),
		makeSystemGuideRow('descent', 'Descent', metrics.descent, guideColorMedium),
		makeSystemGuideRow('leftSide', 'Left side', '0', guideColorDark),
		makeSystemGuideRow('rightSide', 'Right side', advanceWidth, guideColorDark),
	]);
	return systemCard;
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
		body: `${vertical ? 'Vertical' : 'Horizontal'} guide at ${value}.`,
		color: color,
	});

	const row = makeElement({ className: 'guides-card__metric' });
	row.appendChild(toggle);

	const name = makeElement({ className: 'guides-card__metric-name' });
	name.textContent = title;
	row.appendChild(name);

	/*
		Not editable here, and it no longer looks it. These come from the
		font's key metrics, which are edited on the Font Settings page.
	*/
	const valueDisplay = makeElement({ className: 'guides-card__metric-value' });
	valueDisplay.textContent = `${value}`;
	attachTooltip(valueDisplay, {
		name: 'Guide position',
		body: 'Set by the font’s key metrics, on the Font Settings page.',
	});
	row.appendChild(valueDisplay);

	return row;
}

function makeCustomGuidesCard() {
	let customCard = makeElement({
		className: 'panel__card guides-card__custom',
		innerHTML: '<h3>Custom guides</h3>',
	});

	const guides = getCurrentProject().settings.app.guides.custom;

	if (guides.length) {
		guides.forEach((guide, number) => {
			customCard.appendChild(makeCustomGuideRow(guide, number));
		});

	}

	const addGuideButton = makeElement({
		tag: 'fancy-button',
		attributes: { secondary: '' },
		innerHTML: 'Add a custom guide',
	});
	addGuideButton.addEventListener('click', () => {
		getCurrentProject().settings.app.guides.custom.push(
			new Guide({ visible: true, color: makeRandomSaturatedColor() })
		);
		refreshGuideChange();
	});

	customCard.appendChild(addGuideButton);
	return customCard;
}

/**
 * One custom guide, on one row: show it, name it, place it, delete it.
 *
 * It used to return six children into a card that collapses to a single
 * column in a sidebar this narrow, so one guide stacked six deep.
 *
 * The colour well is gone from the row. A custom guide gets a colour when it
 * is made, and changing it is a once-in-a-while thing that was taking a slot
 * on every row forever - the switch carries the colour instead, which is
 * what the row actually needed it for: telling one guide from another.
 *
 * @param {Object} guide
 * @param {Number} number - its index, for delete
 * @returns {HTMLElement}
 */
function makeCustomGuideRow(guide, number) {
	const horizontal = guide.angle === 90;

	const toggle = makeDirectToggle(guide, 'visible', () => {
		getCurrentProjectEditor().editCanvas.redraw('guides custom view toggle');
	}, {
		icon: horizontal ? 'command_horizontalBar' : 'command_verticalBar',
		name: guide.name || 'Guide',
		body: 'Click the name to rename it, the arrow to turn it.',
		color: guide.color,
	});

	const nameInput = makeSingleInput(guide, 'name', 'editCanvasView', 'input');
	nameInput.classList.add('guides-card__custom-name');

	const valueInput = makeSingleInput(guide, 'location', 'editCanvasView', 'input-number');
	valueInput.classList.add('guides-card__custom-value');

	/*
		Turning a guide and deleting it are both one button, both --control-h,
		both the corner every other button in the sidebar takes. They were an
		action button and a bare <button> with a hand-coloured icon in it.
	*/
	const angleButton = makeIconButton({
		icon: horizontal ? 'command_verticalBar' : 'command_horizontalBar',
		name: horizontal ? 'Make it vertical' : 'Make it horizontal',
		onClick: () => {
			const target = getCurrentProject().settings.app.guides.custom[number];
			if (target.angle === 90) {
				target.angle = 0;
				target.name = target.name.replace('Horizontal', 'Vertical');
			} else {
				target.angle = 90;
				target.name = target.name.replace('Vertical', 'Horizontal');
			}
			refreshGuideChange();
		},
	});

	const deleteButton = makeIconButton({
		icon: 'delete',
		name: 'Delete guide',
		onClick: () => {
			getCurrentProject().settings.app.guides.custom.splice(number, 1);
			refreshGuideChange();
		},
	});

	const row = makeElement({ className: 'guides-card__custom-row' });
	addAsChildren(row, [toggle, nameInput, valueInput, angleButton, deleteButton]);
	return row;
}
