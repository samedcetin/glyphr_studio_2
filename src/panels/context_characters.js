import { getCurrentProject, getCurrentProjectEditor } from '../app/main.js';
import { addAsChildren, makeElement } from '../common/dom.js';
import { makeFancySlider } from '../controls/fancy-slider/fancy_slider.js';
import { makeLivePreviewPopOutCard } from '../project_editor/pop_out_window.js';
import { makeDirectToggle, makeSingleInput, makeSingleLabel } from './cards.js';

/**
	CONTEXT CHARACTERS PANEL
	------------------------
	The letters shown either side of the one you are editing, and how they
	are drawn.

	Every setting in here used to be a label and a control emitted as two
	separate children of a card that collapses to one column in a sidebar
	this narrow - so the label appeared, and then its control appeared on the
	line below it, the width of the panel away from the thing it named. The
	card also opened with two lines of explanation on every glyph forever.
	Each setting is a row now, and the explanation moved to the field it
	explains.
 */

/**
 * One setting: what it is on the left, the control for it on the right.
 *
 * @param {String} title
 * @param {HTMLElement} control
 * @returns {HTMLElement}
 */
function makeOptionRow(title, control) {
	const row = makeElement({ className: 'context-card__option' });
	row.appendChild(makeSingleLabel(title));
	row.appendChild(control);
	return row;
}

export function makePanel_ContextCharacters() {
	const editor = getCurrentProjectEditor();
	const project = getCurrentProject();
	const ccOptions = project.settings.app.contextCharacters;

	// --------------------------------------------------------------
	// The characters themselves
	// --------------------------------------------------------------

	const charsCard = makeElement({
		tag: 'div',
		className: 'panel__card context-card',
		innerHTML: `<h3>Characters</h3>`,
	});

	const charsInput = makeSingleInput(
		editor.selectedItem,
		'contextCharacters',
		'editCanvasView',
		'input',
		['input']
	);
	charsInput.addEventListener('input', () => getCurrentProjectEditor().autoFitView());
	charsInput.classList.add('context-card__input');
	/*
		The explanation is the field's placeholder and its tooltip rather than
		two permanent lines above it. It was a `<p class="spanAll">` on every
		glyph forever - right the first time and furniture after that.
	*/
	charsInput.setAttribute('placeholder', 'Letters to show either side');
	charsInput.setAttribute(
		'title',
		'Context characters\nA small set of letters drawn around the one you are editing, so you can judge its spacing in a word.'
	);

	addAsChildren(charsCard, [
		charsInput,
		makeOptionRow(
			'Show them',
			makeDirectToggle(ccOptions, 'showCharacters', () => {
				getCurrentProjectEditor().autoFitView();
				refresh();
			}, { icon: 'eye', name: 'Show context characters' })
		),
		makeOptionRow(
			'Transparency',
			makeFancySlider(ccOptions.characterTransparency, (newValue) => {
				ccOptions.characterTransparency = newValue;
				getCurrentProjectEditor().editCanvas.redraw('context characters transparency slider');
			})
		),
	]);

	// --------------------------------------------------------------
	// How they are drawn
	// --------------------------------------------------------------

	const optionsCard = makeElement({
		tag: 'div',
		className: 'panel__card context-card',
		innerHTML: `<h3>Guides and labels</h3>`,
	});

	addAsChildren(optionsCard, [
		makeOptionRow(
			'Show them',
			makeDirectToggle(ccOptions, 'showGuides', refresh, {
				icon: 'panel_guides',
				name: 'Show guides and labels',
				body: 'The side bearings and the name of each context character.',
			})
		),
		makeOptionRow(
			'Transparency',
			makeFancySlider(ccOptions.guidesTransparency, (newValue) => {
				ccOptions.guidesTransparency = newValue;
				getCurrentProjectEditor().editCanvas.redraw('guides transparency slider');
			})
		),
	]);

	return [charsCard, optionsCard, makeLivePreviewPopOutCard()];
}

function refresh() {
	const editor = getCurrentProjectEditor();
	editor.editCanvas.redraw('context characters refresh');
}
