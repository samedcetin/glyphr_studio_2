import { getCurrentProject, getCurrentProjectEditor } from '../app/main.js';
import {
	charToHex,
	hexesToChars,
	normalizePrefixes,
	validateDecOrHexSuffix,
} from '../common/character_ids.js';
import { addAsChildren, makeElement } from '../common/dom.js';
import {
	closeAllInfoBubbles,
	closeEveryTypeOfDialog,
	showError,
	showModalDialog,
} from '../controls/dialogs/dialogs.js';
import { removeStopCreatingNewPathButton } from '../edit_canvas/tools/new_path.js';
import { fillEditorToolBar, makeEditToolsButtons } from '../edit_canvas/tools/tools.js';
import { makePanel, refreshPanel } from '../panels/panels.js';
import { Glyph } from '../project_data/glyph.js';
import { makeEditorEmptyState } from './editor_empty_state.js';

/**
 * Page > Ligatures
 * Edit surface for Ligatures, comprised of Panels of tools, and the Edit Canvas.
 * @returns {Element} - page content
 */
export function makePage_Ligatures() {
	// log(`makePage_Ligatures`, 'start');
	const editor = getCurrentProjectEditor();
	// log('current ProjectEditor');
	// log(editor);
	// log(editor.nav);
	// log(`editor.selectedLigatureID: ${editor.selectedLigatureID}`);
	// log(`editor.selectedItemID: ${editor.selectedItemID}`);
	// log(`editor.nav.panel: ${editor.nav.panel}`);

	const selectedLigatureID = editor.selectedLigatureID;

	const editingContent = `
		<div class="editor-page__tools-area"></div>
		<div class="editor-page__edit-canvas-wrapper"></div>
	`;

	/*
		No left area on an empty page: there is no item to inspect, so the
		panel would be a blank column sitting on top of the empty state. The
		modifier on .editor__page moves the breadcrumb to the edge to match.
	*/
	const firstRunContent = `<div class="editor-page__edit-canvas-wrapper"></div>`;

	const content = makeElement({
		tag: 'div',
		id: 'app__page',
		innerHTML: `
		<div class="editor__page${selectedLigatureID ? '' : ' editor__page--empty'}">
			${selectedLigatureID ? '<div class="editor-page__left-area"><div id="editor-page__panel"></div></div>' : ''}
			${selectedLigatureID ? editingContent : firstRunContent}
		</div>
	`,
	});

	if (editor.showPageTransitions) content.classList.add('app__page-animation');


	const canvasArea = content.querySelector('.editor-page__edit-canvas-wrapper');

	if (!selectedLigatureID) {
		// Early return for project with zero ligatures
		addAsChildren(canvasArea, makeLigaturesFirstRunContent());
		// log(`makePage_Ligatures`, 'end');
		return content;
	}



	const editCanvas = makeElement({
		tag: 'edit-canvas',
		id: 'editor-page__edit-canvas',
		attributes: { 'editing-item-id': editor.selectedLigatureID },
	});

	canvasArea.appendChild(editCanvas);

	/*
		The page and item choosers live in the app top bar breadcrumb now -
		see makeBreadcrumb in project_editor/navigator.js.
	*/
	editor.subscribe({
		topic: 'whichLigatureIsSelected',
		subscriberID: 'nav.ligatureChooserButton',
		callback: () => {
			// The breadcrumb is rebuilt with the top bar on navigate.
		},
	});

	/*
		The PANEL selector is gone: every panel is mounted at once in the
		sidebars now, so there is nothing to choose between.
	*/

	// Panel
	const panel = content.querySelector('#editor-page__panel');
	panel.appendChild(makePanel());
	panel.addEventListener('scroll', closeAllInfoBubbles);
	editor.subscribe({
		topic: ['whichLigatureIsSelected', 'whichShapeIsSelected'],
		subscriberID: 'nav.panelChooserButton',
		callback: () => {
			refreshPanel();
		},
	});

	// Tools
	if (editor.selectedTool === 'kern') editor.selectedTool = 'resize';
	fillEditorToolBar(content, makeEditToolsButtons());

	// Canvas
	editor.subscribe({
		topic: 'whichLigatureIsSelected',
		subscriberID: 'editCanvas.selectedLigature',
		callback: (newLigatureID) => {
			// log(`Main Canvas subscriber callback`, 'start');
			removeStopCreatingNewPathButton();
			// log(`new id ${newLigatureID} on the main canvas`);
			content
				.querySelector('#editor-page__edit-canvas')
				.setAttribute('editing-item-id', newLigatureID);
			// log(`Main Canvas subscriber callback`, 'end');
		},
	});

	editor.subscribe({
		topic: 'whichShapeIsSelected',
		subscriberID: 'editCanvas.selectedPath',
		callback: () => {
			removeStopCreatingNewPathButton();
			editor.editCanvas.redraw('subscription:whichShapeIsSelected');
		},
	});

	editor.subscribe({
		topic: 'whichPathPointIsSelected',
		subscriberID: 'editCanvas.selectedPathPoint',
		callback: () => {
			editor.editCanvas.redraw('subscription:whichPathPointIsSelected');
		},
	});

	// log(`makePage_Ligatures`, 'end');
	return content;
}

/**
 * What the page shows when the project has no ligatures.
 * @returns {Element}
 */
function makeLigaturesFirstRunContent() {
	return makeEditorEmptyState({
		icon: 'page_ligatures',
		title: 'No ligatures yet',
		body:
			'A ligature replaces a sequence of characters, like f and i, with one glyph you draw — a multi-character sprite. Text that has ligatures enabled swaps the sequence for it.',
		actions: [{ label: 'Create a ligature…', onClick: showAddLigatureDialog }],
	});
}

// The 'display' property intentionally have zero-width
// invisible characters between the 'chars' to prevent
// triggering a ligature
const ligaturesWithCodePoints = [
	{ chars: 'ae', display: 'ae', point: '0xE6' },
	{ chars: 'AE', display: 'AE', point: '0xC6' },
	{ chars: 'ff', display: 'f‌f', point: '0xFB00' },
	{ chars: 'fi', display: 'f‌i', point: '0xFB01' },
	{ chars: 'fl', display: 'f‌l', point: '0xFB02' },
	{ chars: 'oe', display: 'oe', point: '0x153' },
	{ chars: 'OE', display: 'OE', point: '0x152' },
	{ chars: 'st', display: 'st', point: '0xFB06' },
	{ chars: 'ffi', display: 'f‌f‌i', point: '0xFB03' },
	{ chars: 'ffl', display: 'f‌f‌l', point: '0xFB04' },
];

/**
 * Adds the list of common ligatures to the current project
 */
/**
 * Adds the ten common Latin ligatures - ae, fi, fl and the rest - as empty
 * ligatures, then lands on the page. Reached from the command palette; the
 * empty state offers one action, the dialog, like the other two pages.
 */
export function addCommonLigaturesToProject() {
	ligaturesWithCodePoints.forEach((lig) => addLigature(lig.chars));
	const editor = getCurrentProjectEditor();
	editor.nav.page = 'Ligatures';
	editor.navigate();
	editor.history.addWholeProjectChangePostState();
}

/**
 * Given a text sequence of characters, creates a Ligature object,
 * and adds it to the current project.
 * @param {String} sequence - characters that make up this Ligature
 * @returns {String | Glyph}
 */
function addLigature(sequence) {
	// log(`addLigature`, 'start');

	// Use spread operator to count actual characters, not code units (for surrogate pairs)
	if ([...sequence].length < 2) {
		// log(`addLigature`, 'end');
		return 'Ligature sequences need to be two or more characters.';
	}

	// Test to see if Unicode or Hex notation is being used
	let prefix = '';
	const workingSequence = normalizePrefixes(sequence);
	let workingArr = [];
	if (workingSequence.startsWith('U+')) {
		workingArr = workingSequence.split('U+');
		workingArr = workingArr.slice(1);
		prefix = 'U+';
	} else if (workingSequence.startsWith('0x')) {
		workingArr = workingSequence.split('0x');
		workingArr = workingArr.slice(1);
		prefix = '0x';
	}

	// log(`prefix: ${prefix}`);
	// log(`workingArr: ${workingArr}`);

	if (prefix && workingArr.length > 1) {
		sequence = '';
		for (let i = 0; i < workingArr.length; i++) {
			let id = workingArr[i];
			// log(`id: ${id}`);
			let validatedSuffix = validateDecOrHexSuffix(id);
			// log(`validatedSuffix: ${validatedSuffix}`);

			if (validatedSuffix) sequence += hexesToChars(`0x${validatedSuffix}`);
			else {
				// log(`addLigature`, 'end');
				return `Invalid Hex or Unicode format: ${prefix}${id}.`;
			}
		}
	}

	// log(`sequence: ${sequence}`);

	// Finish up creating new ID and Ligature
	const newID = makeLigatureID(sequence);
	// log(`newID: ${newID}`);

	const project = getCurrentProject();
	if (project.ligatures[newID]) {
		// log(`addLigature`, 'end');
		return 'Ligature already exists.';
	}

	if (newID === false) {
		return 'Characters could not be read for the ligature sequence.';
	}

	project.addItemByType(
		new Glyph({
			id: newID,
			parent: project,
			objType: 'Ligature',
			// Use spread operator to correctly handle surrogate pairs
			gsub: [...sequence].map((char) => char.codePointAt(0)),
		}),
		'Ligature',
		newID
	);

	// log(`addLigature`, 'end');
	return project.ligatures[newID];
}

/**
 * Given an input sequence of ligature source characters, creates a
 * new unique ligature project id.
 * @param {String} sequence - characters that make up this ligature
 * @returns {String | false}
 */
export function makeLigatureID(sequence = '') {
	// log(`makeLigatureID`, 'start');
	// log(`sequence: ${sequence}`);
	if (sequence === '') return false;
	let newID = 'liga';
	// Use spread operator to correctly handle surrogate pairs
	let chars = [...sequence];
	chars.forEach((char) => {
		// If basic latin letter, use the letter
		// Use codePointAt instead of charCodeAt to handle surrogate pairs
		let code = char.codePointAt(0);
		if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) {
			newID += '-' + char;
		} else {
			newID += '-' + charToHex(char);
		}
	});
	// log(`newID: ${newID}`);

	// log(`makeLigatureID`, 'end');
	return newID;
}

/**
 * Makes the Add Ligature dialog and shows it.
 */
/**
	CREATE A NEW LIGATURE.

	The first dialog onto the frame's header and footer. What it was: an <h2>
	and a sentence loose in the body, a checkbox sitting in a sidebar row grid
	with its label stranded across a 96px gutter, a 90% input with the info
	bubble hanging off its right, two <br>s, and a button floating at the
	bottom of the scroll.

	What it is: the dialog's name in the header where the frame keeps it, one
	field with a label, the option under it as an option, and Cancel / Create
	in a footer that does not move. See makeModalDialog.

	The name still changes with the checkbox - one ligature or many - so the
	heading and the commit button are held rather than written once.
 */
export function showAddLigatureDialog() {
	const content = makeElement({
		innerHTML: `
			<div class="dialog-field">
				<label class="dialog-field__label" for="ligatures__new-ligature-input">Characters</label>
				<div class="dialog-field__control">
					<!--
						aria-describedby, because the hint is not decoration here: ticking
						"Create many at once" rewrites it, so what you are required to type
						changes. Without the link a screen reader hears the checkbox's new
						name and is never told the format changed.
					-->
					<input id="ligatures__new-ligature-input" type="text"
						aria-describedby="ligatures__new-ligature-hint"
						autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
					/>
					<info-bubble>
						Ligature characters can be specified in three different formats:
						<ul>
							<li>By just typing characters: <code>ff</code></li>
							<li>Specifying Unicode code points: <code>U+66U+66</code></li>
							<li>Specifying Hexadecimal format: <code>0x660x66</code></li>
						</ul>
						<br><br>
						Hexadecimal, Unicode, and regular character formats cannot be mixed - choose one type!
						<br><br>
						<b>Warning!</b><br>
						Specifying ligature characters beyond the Basic Multilingual Plane
						(above Unicode <code>U+FFFF</code>) will cause errors!
					</info-bubble>
				</div>
				<div class="dialog-field__hint" id="ligatures__new-ligature-hint">
					Two or more characters, like <code>ff</code> or <code>ffi</code>.
				</div>
			</div>

		`,
	});

	/*
		The option, built rather than written as a string.

		It was a bordered box holding a nested span of two more spans, with the
		label carrying a `for` that pointed at the input inside it - two ways of
		associating the same control, which is one more than the spec needs. The
		box was 458px around 208px of text, so three quarters of it was empty,
		and it brought its own hover, focus and checked states to sit beside the
		checkbox's, which is what made the row read as coming apart.

		This is the shape the atlas export and anchor compose dialogs already
		use: a plain label row. No border, no second set of states, and the ring
		goes on the checkbox the way it does everywhere else in the app.
	*/
	/*
		The name and the description are different things, and a <label> that
		wraps its control does not know that: it builds the name out of its
		whole subtree, so the hint was being read as part of the checkbox's
		name - "Create many at once Type a list instead of one ligature at a
		time., checkbox, not checked", every time it took focus. The two
		attributes below split them: the title names it, the hint describes it,
		and both spans stay inside the label so the whole row is still a target.
	*/
	const option = makeElement({ tag: 'label', className: 'dialog-option' });
	const multiLigatureCheckbox = /** @type {HTMLInputElement} */ (makeElement({
		tag: 'input',
		attributes: {
			type: 'checkbox',
			id: 'ligatures__multi-input-checkbox',
			'aria-labelledby': 'ligatures__multi-input-title',
			'aria-describedby': 'ligatures__multi-input-hint',
		},
	}));
	option.appendChild(multiLigatureCheckbox);
	option.appendChild(
		makeElement({
			tag: 'span',
			className: 'dialog-option__title',
			id: 'ligatures__multi-input-title',
			content: 'Create many at once',
		})
	);
	option.appendChild(
		makeElement({
			tag: 'span',
			className: 'dialog-option__hint',
			id: 'ligatures__multi-input-hint',
			content: 'Type a list instead of one ligature at a time.',
		})
	);
	content.appendChild(option);

	const cancelButton = makeElement({
		tag: 'fancy-button',
		attributes: { secondary: '' },
		innerHTML: 'Cancel',
		onClick: closeEveryTypeOfDialog,
	});

	/** @type {HTMLElement} */
	const submitButton = makeElement({
		tag: 'fancy-button',
		attributes: { disabled: '' },
		innerHTML: 'Create ligature',
	});

	/** @type {HTMLInputElement} */
	const newLigatureInput = content.querySelector('#ligatures__new-ligature-input');
	const hint = content.querySelector('#ligatures__new-ligature-hint');

	newLigatureInput.addEventListener('keyup', () => {
		// Use spread operator to count actual characters, not code units (for surrogate pairs)
		if ([...newLigatureInput.value].length < 2) {
			submitButton.setAttribute('disabled', '');
		} else {
			submitButton.removeAttribute('disabled');
		}
	});

	/*
		Four things say singular or plural, and they change together.

		The header's subtitle is one of them. It used to be written once and
		left, so ticking the box gave "Create new ligatures" over "Two or more
		characters, drawn as one" - a plural title above a singular sentence.

		The hint under the field owns the format, and the option under it owns
		what the switch does. They used to overlap: with the box ticked the
		hint said "separated by commas" and the option said "a comma separated
		list", twenty pixels apart.
	*/
	multiLigatureCheckbox.addEventListener('change', () => {
		const many = multiLigatureCheckbox.checked;
		const title = document.querySelector('.modal-dialog__title');
		const subtitle = document.querySelector('.modal-dialog__subtitle');
		if (title) title.textContent = many ? 'Create new ligatures' : 'Create a new ligature';
		if (subtitle) {
			subtitle.textContent = many
				? 'Several at once, from one list.'
				: 'Two or more characters, drawn as one.';
		}
		submitButton.innerHTML = many ? 'Create ligatures' : 'Create ligature';
		hint.innerHTML = many
			? 'Separate each one with a comma — <code>ff, fi, ffl</code>. No spaces.'
			: 'Two or more characters, like <code>ff</code> or <code>ffi</code>.';
	});

	submitButton.addEventListener('click', () => {
		// log(`showAddLigatureDialog button click handler`, 'start');
		let result;
		let latestID;

		if (multiLigatureCheckbox.checked) {
			const sanitizedString = newLigatureInput.value.replaceAll(' ', '');
			const inputList = sanitizedString.split(',');
			inputList.forEach((input) => {
				let oneResult = addLigature(input);
				if (typeof oneResult === 'string') {
					if (typeof result !== 'string')
						result = 'One or more ligature could not be created:<br><br>';
					result = '' + result + oneResult + '<br><br>';
				} else {
					oneResult.hasChangedThisSession = false;
					oneResult.wasCreatedThisSession = true;
					latestID = oneResult.id;
				}
			});
		} else {
			result = addLigature(newLigatureInput.value);
			if (typeof result !== 'string') {
				result.hasChangedThisSession = false;
				result.wasCreatedThisSession = true;
				latestID = result.id;
			}
		}
		// log(`result: ${result}`);

		if (typeof result === 'string') {
			showError(result);
		} else {
			const editor = getCurrentProjectEditor();
			editor.selectedLigatureID = latestID;
			editor.navigate();
			editor.history.addWholeProjectChangePostState();
			closeEveryTypeOfDialog();
		}
		// log(`showAddLigatureDialog button click handler`, 'end');
	});

	showModalDialog(content, 500, {
		title: 'Create a new ligature',
		subtitle: 'Two or more characters, drawn as one.',
		actions: [cancelButton, submitButton],
	});
	newLigatureInput.focus();
}
