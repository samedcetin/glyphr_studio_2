import { getCurrentProject, getCurrentProjectEditor } from '../app/main.js';
import { addAsChildren, makeElement } from '../common/dom.js';

import { attachTooltip } from '../controls/tooltip/tooltip.js';
import { makeLivePreviewPopOutCard } from '../project_editor/pop_out_window.js';
import { makeDirectToggle, makeOpacitySlider, makeSingleInput, makeSingleLabel } from './cards.js';

/**
	CONTEXT CHARACTERS PANEL
	------------------------
	The letters drawn either side of the one you are editing, so you can judge
	its spacing in a word rather than on its own.

	THE RULE THIS PANEL HAS TO TEACH. You type a string. The app finds the
	character you are editing inside that string: everything before it is
	drawn to the left, everything after it to the right, with kerning applied
	between them. If the character is not in the string at all, the whole
	string goes to the left.

	Nothing said that. You typed `HOAOH` while editing `A` and there was no
	way to know why the A was not drawn three times, and no way at all to
	discover the not-in-the-string case except by falling into it. The split
	is drawn under the field now, live, so the rule explains itself.

	It was also two cards with the same two controls in each - `Show them`
	and `Transparency`, twice, a hundred pixels apart - which is what you get
	from shortening a label past its referent. One card, and each control
	says what it shows.
 */

/**
 * The string, split the way the canvas splits it.
 *
 * The same rule as splitContextCharacterString in edit_canvas, deliberately
 * duplicated in nine lines rather than exported: that module owns drawing
 * state, and importing it here to ask one question about a string would tie
 * a panel to a canvas.
 *
 * @param {String} chars - what is in the field
 * @param {String} current - the character being edited
 * @returns {Object} - { left, right, found }
 */
function splitPreview(chars, current) {
	if (!chars || !current) return { left: '', right: '', found: false };
	const position = chars.indexOf(current);
	if (position === -1) return { left: chars, right: '', found: false };
	return {
		left: chars.substring(0, position),
		right: chars.substring(position + current.length),
		found: true,
	};
}

/**
 * A live picture of what the field will do.
 *
 * @param {HTMLElement} element - the preview line
 * @param {String} chars
 * @param {String} current
 */
function fillSplitPreview(element, chars, current) {
	element.innerHTML = '';
	const split = splitPreview(chars, current);

	if (!chars) {
		element.textContent = 'Type the letters to show around this one.';
		element.classList.add('context-card__split--empty');
		return;
	}
	element.classList.remove('context-card__split--empty');

	const part = (text, className) => {
		const span = makeElement({ className: `context-card__split-part ${className}` });
		span.textContent = text;
		return span;
	};

	if (split.left) element.appendChild(part(split.left, 'context-card__split-side'));
	element.appendChild(part(current, 'context-card__split-current'));
	if (split.right) element.appendChild(part(split.right, 'context-card__split-side'));

	/*
		The one case nobody discovers on purpose. Saying it only when it
		happens costs a line when it matters and nothing when it does not.
	*/
	if (!split.found) {
		const note = makeElement({ className: 'context-card__split-note' });
		note.textContent = `${current} is not in the string, so all of it goes left`;
		element.appendChild(note);
	}
}

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
	const currentChar = editor.selectedItem?.char || '';

	const card = makeElement({ tag: 'div', className: 'panel__card context-card' });

	// --------------------------------------------------------------
	// The string, and what it will do
	// --------------------------------------------------------------

	/*
		A label, not a placeholder. A placeholder leaves the moment you type,
		so the one thing this field needed to keep saying was the one thing it
		stopped saying as soon as it had a value in it.
	*/
	const charsLabel = makeSingleLabel('Characters');
	charsLabel.classList.add('context-card__field-label');
	card.appendChild(charsLabel);

	const charsInput = makeSingleInput(
		editor.selectedItem,
		'contextCharacters',
		'editCanvasView',
		'input',
		['input']
	);
	charsInput.classList.add('context-card__input');
	attachTooltip(charsInput, {
		name: 'Context characters',
		body: 'Kept with this character, so every glyph can have its own spacing string.',
	});
	card.appendChild(charsInput);

	const splitLine = makeElement({ className: 'context-card__split' });
	fillSplitPreview(splitLine, editor.selectedItem?.contextCharacters || '', currentChar);
	card.appendChild(splitLine);

	charsInput.addEventListener('input', () => {
		getCurrentProjectEditor().autoFitView();
		fillSplitPreview(
			splitLine,
			/** @type {HTMLInputElement} */ (charsInput).value,
			currentChar
		);
	});

	// --------------------------------------------------------------
	// How much of it you see
	// --------------------------------------------------------------

	addAsChildren(card, [
		makeOptionRow(
			'Show characters',
			makeDirectToggle(ccOptions, 'showCharacters', () => {
				getCurrentProjectEditor().autoFitView();
				refresh();
			}, { icon: 'eye', name: 'Show context characters' })
		),
		makeOptionRow(
			'Character opacity',
			makeOpacitySlider(ccOptions, 'characterTransparency', () =>
				getCurrentProjectEditor().editCanvas.redraw('context characters opacity slider')
			)
		),
		makeOptionRow(
			'Show guides',
			makeDirectToggle(ccOptions, 'showGuides', refresh, {
				icon: 'panel_guides',
				name: 'Show guides and labels',
				body: 'The side bearings of each context character, and its name.',
			})
		),
		makeOptionRow(
			'Guide opacity',
			makeOpacitySlider(ccOptions, 'guidesTransparency', () =>
				getCurrentProjectEditor().editCanvas.redraw('guides opacity slider')
			)
		),
	]);

	return [card, makeLivePreviewPopOutCard()];
}

function refresh() {
	const editor = getCurrentProjectEditor();
	editor.editCanvas.redraw('context characters refresh');
}
