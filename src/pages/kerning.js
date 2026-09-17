import { getCurrentProject, getCurrentProjectEditor } from '../app/main.js';
import { charToHex, charsToHexArray, hexesToChars } from '../common/character_ids.js';
import { addAsChildren, makeElement } from '../common/dom.js';
import { attachTooltip } from '../controls/tooltip/tooltip.js';
import { countItems } from '../common/functions.js';
import {
	closeAllInfoBubbles,
	closeEveryTypeOfDialog,
	showError,
	showModalDialog,
	showToast,
} from '../controls/dialogs/dialogs.js';
import { fillEditorToolBar, makeKernToolButton } from '../edit_canvas/tools/tools.js';
import { getUnicodeName } from '../lib/unicode/unicode_names.js';
import { makeOneKernGroupRow } from '../panels/item_chooser.js';
import { makePanel, refreshPanel } from '../panels/panels.js';
import { KernGroup } from '../project_data/kern_group.js';
import {
	goToCharacters,
	makeEditorEmptyState,
	projectHasDrawnCharacters,
} from './editor_empty_state.js';

/**
 * Page > Kerning
 * Edit surface for Kerning, comprised of Panels of tools, and the Edit Canvas.
 * @returns {Element} - page content
 */
export function makePage_Kerning() {
	// log(`makePage_Kerning`, 'start');
	const editor = getCurrentProjectEditor();
	// log('current ProjectEditor');
	// log(editor);
	// log(editor.nav);
	// log(`editor.selectedKernGroupID: ${editor.selectedKernGroupID}`);
	// log(`editor.selectedItemID: ${editor.selectedItemID}`);
	// log(`editor.nav.panel: ${editor.nav.panel}`);

	const selectedKernGroupID = editor.selectedKernGroupID;

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
		<div class="editor__page${selectedKernGroupID ? '' : ' editor__page--empty'}">
			${selectedKernGroupID ? '<div class="editor-page__left-area"><div id="editor-page__panel"></div></div>' : ''}
			${selectedKernGroupID ? editingContent : firstRunContent}
		</div>
	`,
	});

	if (editor.showPageTransitions) content.classList.add('app__page-animation');

	const canvasArea = content.querySelector('.editor-page__edit-canvas-wrapper');

	if (!selectedKernGroupID) {
		// Early return for project with zero Kern Groups
		addAsChildren(canvasArea, makeKerningFirstRunContent());
		// log(`makePage_Kerning`, 'end');
		return content;
	}

	const editCanvas = makeElement({
		tag: 'edit-canvas',
		id: 'editor-page__edit-canvas',
		attributes: { 'editing-item-id': editor.selectedKernGroupID },
	});

	canvasArea.appendChild(editCanvas);

	/*
		The page and item choosers live in the app top bar breadcrumb now -
		see makeBreadcrumb in project_editor/navigator.js.
	*/
	editor.subscribe({
		topic: 'whichKernGroupIsSelected',
		subscriberID: 'nav.kernChooserButton',
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
		topic: ['whichKernGroupIsSelected'],
		subscriberID: 'nav.panelChooserButton',
		callback: () => {
			refreshPanel();
		},
	});

	// Tools
	editor.selectedTool = 'kern';
	let toolsButtons = makeKernToolButton();
	fillEditorToolBar(content, toolsButtons);

	// Canvas
	editor.subscribe({
		topic: 'whichKernGroupIsSelected',
		subscriberID: 'editCanvas.selectedKernGroup',
		callback: (newKernID) => {
			// log(`Main Canvas subscriber callback`, 'start');
			// log(`new id ${newKernID} on the main canvas`);
			content.querySelector('#editor-page__edit-canvas').setAttribute('editing-item-id', newKernID);
			// log(`Main Canvas subscriber callback`, 'end');
		},
	});

	// log(`makePage_Kerning`, 'end');
	return content;
}

/**
 * What the page shows when the project has no kern groups.
 *
 * Kerning adjusts the space between characters that exist, so on a project
 * with nothing drawn yet the sentence and the button both point at
 * Characters first; the dialog is still there, one step down.
 *
 * @returns {Element}
 */
function makeKerningFirstRunContent() {
	const drawn = projectHasDrawnCharacters();
	return makeEditorEmptyState({
		icon: 'page_kerning',
		title: 'No kern groups yet',
		body: drawn
			? 'A kern group sets the spacing between pairs of characters that look too far apart at their default sidebearings, like V and A — a per-pair offset.'
			: 'A kern group sets the spacing between pairs of characters that look too far apart at their default sidebearings, like V and A. Nothing is drawn yet, so there is nothing to pair: draw a few characters first.',
		actions: drawn
			? [{ label: 'Create a kern group…', onClick: () => showAddEditKernGroupDialog(false) }]
			: [
					{ label: 'Go to Characters', onClick: goToCharacters },
					{
						label: 'Create a kern group…',
						onClick: () => showAddEditKernGroupDialog(false),
						secondary: true,
					},
				],
	});
}

/**
 * New kern group dialog handler
 * @param {Array} leftGroup - left kern members
 * @param {Array} rightGroup - right kern members
 * @param {Number} value - kern value
 * @returns {KernGroup}
 */
function addKernGroup(leftGroup, rightGroup, value) {
	// log(`addKernGroup`, 'start');
	// log(leftGroup);
	// log(rightGroup);
	// log(value);
	// Finish up creating new ID and Kern
	const newID = makeKernGroupID();
	// log(`newID: ${newID}`);

	const project = getCurrentProject();

	project.addItemByType(
		new KernGroup({
			leftGroup: leftGroup,
			rightGroup: rightGroup,
			value: value,
		}),
		'KernGroup',
		newID
	);

	// log(`addKernGroup`, 'end');
	return project.kerning[newID];
}

/**
 * Makes a new Kern Group ID, without colliding with old ones.
 * @param {Object} kernGroups - current kern groups
 * @returns {String}
 */
export function makeKernGroupID(kernGroups = getCurrentProject().kerning) {
	// log(`makeKernGroupID`, 'start');
	let counter = countItems(kernGroups);
	while (kernGroups[`kern-${counter}`]) counter++;
	const newID = `kern-${counter}`;
	// log(`newID: ${newID}`);
	// log(`makeKernGroupID`, 'end');
	return newID;
}

/**
 * Shows an edit dialog for a given Kern Group - or, if
 * one is not provided, used as a 'create new' Kern Group dialog.
 * @param {KernGroup | false =} kernGroup
 */
export function showAddEditKernGroupDialog(kernGroup) {
	// log(`showAddEditKernGroupDialog`, 'start');
	// log(`kernGroup`);
	// log(kernGroup);

	const content = makeElement({
		innerHTML: `
		<div class="dialog-field">
			<label class="dialog-field__label" for="kerning__add-new-kern-group__left-group">Left group</label>
			<div class="dialog-field__control">
				<input id="kerning__add-new-kern-group__left-group" type="text"
					aria-describedby="kerning__add-new-kern-group__left-hint"
					value="${kernGroup ? kernGroup.leftGroupAsString : ''}"
					autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
				/>
			</div>
			<div class="dialog-field__hint" id="kerning__add-new-kern-group__left-hint">
				Every character that can sit on the left of the pair.
			</div>
		</div>

		<div class="dialog-field">
			<label class="dialog-field__label" for="kerning__add-new-kern-group__right-group">Right group</label>
			<div class="dialog-field__control">
				<input id="kerning__add-new-kern-group__right-group" type="text"
					aria-describedby="kerning__add-new-kern-group__right-hint"
					value="${kernGroup ? kernGroup.rightGroupAsString : ''}"
					autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
				/>
			</div>
			<div class="dialog-field__hint" id="kerning__add-new-kern-group__right-hint">
				Every character that can sit on the right. The group kerns all of the
				pairs the two lists make between them.
			</div>
		</div>

		<div class="dialog-field dialog-field--narrow dialog-field--numeric">
			<label class="dialog-field__label" for="kerning__add-new-kern-group__value">Value</label>
			<div class="dialog-field__control">
				<input id="kerning__add-new-kern-group__value" type="text" inputmode="numeric"
					aria-describedby="kerning__add-new-kern-group__value-hint"
					value="${kernGroup ? kernGroup.value : '0'}"
					autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
				/>
				<span class="dialog-field__suffix" aria-hidden="true">Em</span>
			</div>
			<div class="dialog-field__hint" id="kerning__add-new-kern-group__value-hint">
				How far to move the pair. Negative pulls the two characters together.
			</div>
		</div>
		`,
	});

	const cancelButton = makeElement({
		tag: 'fancy-button',
		attributes: { secondary: '' },
		innerHTML: 'Cancel',
		onClick: closeEveryTypeOfDialog,
	});

	const submitButton = makeElement({
		tag: 'fancy-button',
		attributes: { disabled: '' },
		innerHTML: kernGroup ? 'Save changes' : 'Create kern group',
	});

	/** @type {HTMLInputElement} */
	const leftGroupInput = content.querySelector('#kerning__add-new-kern-group__left-group');
	/** @type {HTMLInputElement} */
	const rightGroupInput = content.querySelector('#kerning__add-new-kern-group__right-group');
	/** @type {HTMLInputElement} */
	const valueInput = content.querySelector('#kerning__add-new-kern-group__value');

	leftGroupInput.addEventListener('change', inputChange);
	rightGroupInput.addEventListener('change', inputChange);
	valueInput.addEventListener('change', inputChange);
	leftGroupInput.addEventListener('keyup', inputChange);
	rightGroupInput.addEventListener('keyup', inputChange);
	valueInput.addEventListener('keyup', inputChange);

	if (kernGroup) {
		submitButton.removeAttribute('disabled');
		submitButton.addEventListener('click', addEditDialogSubmit);
	}

	function inputChange() {
		if (leftGroupInput.value !== '' && rightGroupInput.value !== '' && valueInput.value) {
			submitButton.removeAttribute('disabled');
			submitButton.addEventListener('click', addEditDialogSubmit);
		} else {
			submitButton.setAttribute('disabled', '');
			submitButton.removeEventListener('click', addEditDialogSubmit);
		}
	}

	function addEditDialogSubmit() {
		// log(`showAddEditKernGroupDialog button click handler`, 'start');
		const editor = getCurrentProjectEditor();
		let leftNew = charsToHexArray(leftGroupInput.value);
		// log(`leftNew: ${leftNew}`);
		let rightNew = charsToHexArray(rightGroupInput.value);
		// log(`rightNew: ${rightNew}`);
		let valueNew = parseInt(valueInput.value);
		// log(`valueNew: ${valueNew}`);

		if (kernGroup) {
			// log(kernGroup.print());
			kernGroup.leftGroup = leftNew;
			kernGroup.rightGroup = rightNew;
			kernGroup.value = valueNew;
			// log(kernGroup.print());
			editor.history.addState('Edited kern group: ' + editor.selectedKernGroupID);
			editor.publish('currentKernGroup', editor.selectedKernGroup);
			editor.navigate();
			closeEveryTypeOfDialog();
		} else {
			const result = addKernGroup(leftNew, rightNew, valueNew);
			// log(`result: ${result}`);

			if (typeof result === 'string') {
				showError(result);
			} else {
				editor.selectedItemID = result.id;
				editor.navigate();
				editor.history.addWholeProjectChangePostState();
				closeEveryTypeOfDialog();
			}
		}
		// log(`showAddEditKernGroupDialog button click handler`, 'end');
	}

	showModalDialog(content, 500, {
		title: `${kernGroup ? 'Edit this' : 'Create a new'} kern group`,
		subtitle: 'Two lists of characters, and one distance applied to every pair they make.',
		actions: [cancelButton, submitButton],
	});
	leftGroupInput.focus();
	// log(`showAddEditKernGroupDialog`, 'end');
}

/*
	FIND A LETTER PAIR.

	What it was: a title and two paragraphs of prose, then two single-character
	fields under two long column headers, then Search floating in the middle of
	the body, then a rule, then the words "Search results..." in italics - a
	placeholder standing in for a result set that did not exist yet.

	Four things changed beyond the frame.

	Search is in the footer, where the thing you press to commit a dialog goes.
	It was in the body, halfway down, while the footer stood empty.

	The results are a section that appears when there are results, with a count
	at the top of it. Nothing stands in for them beforehand: an empty area
	labelled "Search results..." tells you less than an empty area does.

	The advice about duplicates - "the value that actually gets used may not be
	the expected one" - is shown when the search returns more than one group,
	which is the only moment it is about anything. It used to be the second
	paragraph you read before you had searched for anything.

	And Enter searches, which is what Enter in a search field is for.
 */
export function showFindSingleLetterPairDialog() {
	const content = makeElement({
		innerHTML: `
		<div class="dialog-field">
			<span class="dialog-field__label" id="kerning__letter-pair__label">Letter pair</span>
			<div class="dialog-pair">
				<input
					id="kerning__letter-pair__left-group" type="text" value=""
					aria-label="Left character" aria-describedby="kerning__letter-pair__hint"
					autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" maxlength="1"
				/>
				<input
					id="kerning__letter-pair__right-group" type="text" value=""
					aria-label="Right character" aria-describedby="kerning__letter-pair__hint"
					autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" maxlength="1"
				/>
			</div>
			<div class="dialog-field__hint" id="kerning__letter-pair__hint">
				One character on each side. Selecting a result selects that kern group
				behind this dialog.
			</div>
		</div>

		<div class="dialog-results" id="kerning__letter-pair__results" hidden></div>
		`,
	});

	/** @type {HTMLInputElement} */
	const leftSearch = content.querySelector('#kerning__letter-pair__left-group');
	/** @type {HTMLInputElement} */
	const rightSearch = content.querySelector('#kerning__letter-pair__right-group');

	const closeButton = makeElement({
		tag: 'fancy-button',
		attributes: { secondary: '' },
		innerHTML: 'Close',
		onClick: closeEveryTypeOfDialog,
	});

	const searchButton = makeElement({
		tag: 'fancy-button',
		attributes: { disabled: '', id: 'kerning__letter-pair__search-button' },
		innerHTML: 'Search',
		onClick: searchForLetterPairs,
	});

	[leftSearch, rightSearch].forEach((field) => {
		field.addEventListener('change', updateSearchButton);
		field.addEventListener('keyup', updateSearchButton);
		/* Was an inline onclick attribute on each field. */
		field.addEventListener('focus', () => field.select());
		field.addEventListener('keydown', (/** @type {KeyboardEvent} */ event) => {
			if (event.key === 'Enter' && !searchButton.hasAttribute('disabled')) {
				searchForLetterPairs();
			}
		});
	});

	showModalDialog(content, 560, {
		title: 'Find a letter pair',
		subtitle: 'Every kern group that contains the pair.',
		actions: [closeButton, searchButton],
	});
	leftSearch.focus();
}

/**
 * Makes the content for the Delete Single Letter Pair dialog, and shows it.
 */
/**
	DELETE LETTER PAIRS.

	This deleted without showing you what it was about to delete. One button
	said "Find and delete", and pressing it did both: the finding was the
	deleting. What was going to be removed, and from which groups, was only
	ever legible afterwards.

	It is two steps now. Find shows the groups the pair will be taken out of,
	and the ones it cannot be taken out of, and only then does the destructive
	button appear - in the footer, in the app's danger colour, naming the
	number it is about to change.

	The five-line Note about multi-member groups is gone from the top of the
	dialog and is shown as a list instead: those groups are named, when there
	are any, under a line saying why they cannot be touched. A caveat you read
	before you have typed anything is a caveat about nothing.
 */
export function showDeleteSingleLetterPairDialog() {
	const content = makeElement({
		innerHTML: `
		<div class="dialog-field">
			<span class="dialog-field__label">Letter pair</span>
			<div class="dialog-pair">
				<input
					id="kerning__letter-pair__left-group" type="text" value=""
					aria-label="Left character" aria-describedby="kerning__delete-pair__hint"
					autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" maxlength="1"
				/>
				<input
					id="kerning__letter-pair__right-group" type="text" value=""
					aria-label="Right character" aria-describedby="kerning__delete-pair__hint"
					autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" maxlength="1"
				/>
			</div>
			<div class="dialog-field__hint" id="kerning__delete-pair__hint">
				One character on each side. Find first — nothing is removed until you
				have seen what it would be removed from.
			</div>
		</div>

		<div class="dialog-results" id="kerning__letter-pair__results" hidden></div>
		`,
	});

	/** @type {HTMLInputElement} */
	const leftSearch = content.querySelector('#kerning__letter-pair__left-group');
	/** @type {HTMLInputElement} */
	const rightSearch = content.querySelector('#kerning__letter-pair__right-group');
	const resultsArea = content.querySelector('#kerning__letter-pair__results');

	const cancelButton = makeElement({
		tag: 'fancy-button',
		attributes: { secondary: '' },
		innerHTML: 'Cancel',
		onClick: closeEveryTypeOfDialog,
	});

	/*
		One action button with two states. It starts as Find; once a search has
		shown what would go, it becomes the destructive one and says how many.
		Changing either field puts it back, because the preview it was standing
		on no longer describes what is in the fields.
	*/
	const actionButton = makeElement({
		tag: 'fancy-button',
		attributes: { disabled: '', id: 'kerning__letter-pair__search-button' },
		innerHTML: 'Find pairs',
	});

	let removableIDs = [];

	function resetToFind() {
		removableIDs = [];
		actionButton.removeAttribute('danger');
		actionButton.innerHTML = 'Find pairs';
		resultsArea.innerHTML = '';
		resultsArea.setAttribute('hidden', '');
		updateSearchButton();
	}

	function runFind() {
		const leftLetter = leftSearch.value.charAt(0);
		const rightLetter = rightSearch.value.charAt(0);
		const found = findLetterPairMatches(leftLetter, rightLetter);
		removableIDs = found.removable;

		resultsArea.innerHTML = '';
		resultsArea.removeAttribute('hidden');
		const pair = `${leftLetter}${rightLetter}`;

		if (!found.removable.length && !found.blocked.length) {
			resultsArea.appendChild(
				makeElement({
					className: 'dialog-empty',
					innerHTML: `No kern group contains <code>${pair}</code>.`,
				})
			);
			return;
		}

		if (found.removable.length) {
			const head = makeElement({ className: 'dialog-results__head' });
			head.appendChild(
				makeElement({
					className: 'studio-eyebrow',
					content:
						found.removable.length === 1
							? 'Will be removed from 1 group'
							: `Will be removed from ${found.removable.length} groups`,
				})
			);
			resultsArea.appendChild(head);

			const list = makeElement({ className: 'dialog-results__list' });
			found.removable.forEach((id) => list.appendChild(makeOneKernGroupRow(id)));
			resultsArea.appendChild(list);

			actionButton.setAttribute('danger', '');
			actionButton.innerHTML =
				found.removable.length === 1
					? 'Remove from 1 group'
					: `Remove from ${found.removable.length} groups`;
		}

		if (found.blocked.length) {
			resultsArea.appendChild(
				makeElement({
					className: 'dialog-note',
					innerHTML: `${
						found.blocked.length === 1 ? 'One group has' : `${found.blocked.length} groups have`
					} more than one character on both sides, so
						<code>${pair}</code> cannot be taken out on its own — removing a character would
						change every pair it makes. Edit ${
							found.blocked.length === 1 ? 'it' : 'them'
						} by hand instead: ${found.blocked.join(', ')}.`,
				})
			);
		}
	}

	actionButton.addEventListener('click', () => {
		if (removableIDs.length) deleteLetterPairs(removableIDs);
		else runFind();
	});

	[leftSearch, rightSearch].forEach((field) => {
		field.addEventListener('change', resetToFind);
		field.addEventListener('keyup', resetToFind);
		field.addEventListener('focus', () => field.select());
		field.addEventListener('keydown', (/** @type {KeyboardEvent} */ event) => {
			if (event.key === 'Enter' && !actionButton.hasAttribute('disabled')) actionButton.click();
		});
	});

	showModalDialog(content, 560, {
		title: 'Delete letter pairs',
		subtitle: 'Take one pair out of the kern groups that carry it.',
		actions: [cancelButton, actionButton],
	});
	leftSearch.focus();
}

/**
 * Which kern groups carry a letter pair, and which of those the pair can
 * actually be taken out of.
 *
 * A group can only lose a pair when one of its two sides has a single member:
 * a group is every permutation of its two lists, so removing a character from
 * a side that has several would change every pair that character makes, not
 * just this one.
 *
 * @param {String} leftLetter
 * @param {String} rightLetter
 * @returns {Object} - { removable: Array<String>, blocked: Array<String> }
 */
function findLetterPairMatches(leftLetter, rightLetter) {
	const groups = getCurrentProject().kerning;
	const leftHex = charToHex(leftLetter);
	const rightHex = charToHex(rightLetter);
	const removable = [];
	const blocked = [];

	Object.keys(groups).forEach((id) => {
		const { leftGroup, rightGroup } = groups[id];
		if (!leftGroup.includes(leftHex) || !rightGroup.includes(rightHex)) return;
		if (leftGroup.length === 1 || rightGroup.length === 1) removable.push(id);
		else blocked.push(id);
	});

	return { removable, blocked };
}

/**
 * Enables or disables the search button based on input fields.
 */
function updateSearchButton() {
	/** @type {HTMLInputElement} */
	const leftSearch = document.querySelector('#kerning__letter-pair__left-group');
	/** @type {HTMLInputElement} */
	const rightSearch = document.querySelector('#kerning__letter-pair__right-group');
	const searchButton = document.querySelector('#kerning__letter-pair__search-button');

	if (leftSearch.value.length && rightSearch.value.length) {
		searchButton.removeAttribute('disabled');
	} else {
		searchButton.setAttribute('disabled', '');
	}
}

/**
 * Does the search for letter pairs
 */
function searchForLetterPairs() {
	// log(`searchForLetterPairs`, 'start');
	/** @type {HTMLInputElement} */
	const leftGroup = document.querySelector('#kerning__letter-pair__left-group');
	const leftLetter = leftGroup.value.charAt(0);
	// log(`leftLetter: ${leftLetter} : ${charToHex(leftLetter)}`);
	/** @type {HTMLInputElement} */
	const rightGroup = document.querySelector('#kerning__letter-pair__right-group');
	const rightLetter = rightGroup.value.charAt(0);
	// log(`rightLetter: ${rightLetter} : ${charToHex(rightLetter)}`);

	const groups = getCurrentProject().kerning;
	const results = [];

	Object.keys(groups).forEach((id) => {
		// log(`checking ${groups[id].leftGroup}`);
		// log(`checking ${groups[id].rightGroup}`);
		if (
			groups[id].leftGroup.includes(charToHex(leftLetter)) &&
			groups[id].rightGroup.includes(charToHex(rightLetter))
		) {
			results.push(id);
		}
	});

	/*
		The section exists only once there is something in it. Before the first
		search it is hidden rather than showing the words "Search results..." -
		a label for an absence, which told the reader less than the absence did.
	*/
	const resultsArea = document.querySelector('#kerning__letter-pair__results');
	resultsArea.innerHTML = '';
	resultsArea.removeAttribute('hidden');

	const pair = `${leftLetter}${rightLetter}`;

	if (!results.length) {
		resultsArea.appendChild(
			makeElement({
				className: 'dialog-empty',
				innerHTML: `No kern group contains <code>${pair}</code>.`,
			})
		);
		return;
	}

	/* A count, because "how many" is the first thing a result set is asked. */
	const head = makeElement({ className: 'dialog-results__head' });
	head.appendChild(
		makeElement({
			className: 'studio-eyebrow',
			content: results.length === 1 ? '1 kern group' : `${results.length} kern groups`,
		})
	);
	resultsArea.appendChild(head);

	const list = makeElement({ className: 'dialog-results__list' });
	const selectedKernGroupID = getCurrentProjectEditor().selectedKernGroupID;
	results.forEach((id) => {
		let row = makeOneKernGroupRow(id);
		row.addEventListener('click', () => {
			const editor = getCurrentProjectEditor();
			editor.selectedItemID = id;
			editor.history.addState(`Navigated to ${editor.project.getItemName(id, true)}`);
			let resultRows = document.querySelectorAll('.kern-group-chooser__row');
			resultRows.forEach((result) => result.removeAttribute('selected'));
			row.setAttribute('selected', '');
		});
		if (id === selectedKernGroupID) row.setAttribute('selected', '');
		list.appendChild(row);
	});
	resultsArea.appendChild(list);

	/*
		The duplicates warning, at the one moment it is about something. It used
		to be the second paragraph of the dialog, read before you had searched
		for anything - advice about a situation you could not yet be in.
	*/
	if (results.length > 1) {
		resultsArea.appendChild(
			makeElement({
				className: 'dialog-note',
				innerHTML: `More than one group covers <code>${pair}</code>, so which value is
					used may not be the one you expect. It is worth leaving the pair in only one
					of them.`,
			})
		);
	}
	// log(`searchForLetterPairs`, 'end');
}

/**
 * Removes a letter pair from the kern groups the preview said it could come
 * out of, and says what happened.
 *
 * It takes the list rather than searching again: the list is what the user was
 * shown and agreed to, and a second search could disagree with it.
 *
 * @param {Array<String>} kernIDs - ids from findLetterPairMatches().removable
 */
function deleteLetterPairs(kernIDs) {
	/** @type {HTMLInputElement} */
	const leftGroup = document.querySelector('#kerning__letter-pair__left-group');
	/** @type {HTMLInputElement} */
	const rightGroup = document.querySelector('#kerning__letter-pair__right-group');
	const leftLetter = leftGroup.value.charAt(0);
	const rightLetter = rightGroup.value.charAt(0);

	const removed = kernIDs.filter((id) => deleteLetterPair(leftLetter, rightLetter, id));

	if (!removed.length) {
		showToast(`Nothing was removed.<br>${leftLetter}${rightLetter} was not found.`);
		return;
	}

	const editor = getCurrentProjectEditor();
	editor.history.addWholeProjectChangePostState();
	showToast(
		`Removed ${leftLetter}${rightLetter} from<br>${removed.length} kern group${
			removed.length > 1 ? 's' : ''
		}`
	);
	/* navigate() closes every dialog, so this is also what dismisses this one. */
	editor.navigate();
}

/**
 * Given a Kern ID, removes a letter pair from it.
 * @param {String} leftLetter - left letter
 * @param {String} rightLetter - right letter
 * @param {String} kernID - which Kern Group to use
 * @returns {Boolean} - successful or not
 */
function deleteLetterPair(leftLetter = '', rightLetter = '', kernID = '') {
	// log(`deleteLetterPair`, 'start');
	let list = {};
	let leftHex = charToHex(leftLetter);
	let rightHex = charToHex(rightLetter);
	const editor = getCurrentProjectEditor();
	let success = false;

	if (kernID) {
		let selected = editor.project.getItem(kernID);
		if (selected) list[kernID] = selected;
	} else {
		list = editor.project.kerning;
	}
	// log(`\n⮟list⮟`);
	// log(list);

	Object.keys(list).forEach((id) => {
		// log(`id: ${id}`);
		let leftGroup = list[id].leftGroup;
		let rightGroup = list[id].rightGroup;
		if (leftGroup.includes(leftHex) && rightGroup.includes(rightHex)) {
			if (leftGroup.length === 1 && rightGroup.length === 1) {
				// log(`Removing the Kern Group ${id}`);
				editor.deleteItem(id, editor.project.kerning);
				success = true;
			} else if (leftGroup.length === 1) {
				// log(`Removing ${rightHex} from the right group`);
				rightGroup.splice(rightGroup.indexOf(rightHex), 1);
				success = true;
			} else if (rightGroup.length === 1) {
				// log(`Removing ${leftHex} from the left group`);
				leftGroup.splice(leftGroup.indexOf(leftHex), 1);
				success = true;
			}
		}
	});

	// log(`success: ${success}`);
	// log(`deleteLetterPair`, 'end');
	return success;
}

/**
 * The characters on one side of a kern group, as a wrapped row of chips.
 *
 * The wrapper used to be a bare span, so the chips were inline boxes with
 * nothing between them: eight of them measured 160px across in a 160px span,
 * touching edge to edge. A row of twenty read as a brick wall rather than as
 * twenty characters, which is the one thing this row exists to tell you.
 *
 * @param {Array} group - char IDs
 * @param {Object=} project - the project the group belongs to; the current one by default
 * @returns {HTMLElement}
 */
export function makeKernGroupCharChips(group, project = getCurrentProject()) {
	const wrapper = makeElement({ className: 'kern-chips' });
	group.forEach((charID) => wrapper.appendChild(makeCharChip(charID, project)));
	return wrapper;
}

/**
 * Makes a small element that represents a single character.
 *
 * "Missing" is judged against the project the group belongs to - the
 * cross-project page lists the other project's groups, and a character that
 * project has is not missing because this one lacks it.
 *
 * @param {String} charID - char to make a chip for
 * @param {Object=} project - the project the group belongs to; the current one by default
 * @returns {Element}
 */
export function makeCharChip(charID, project = getCurrentProject()) {
	const char = hexesToChars(charID) || '';
	const name = getUnicodeName(charID);
	const exists = !!project.getItem(`glyph-${charID}`, false);

	const chip = makeElement({
		tag: 'code',
		className: `kern-chips__chip${exists ? '' : ' kern-chips__chip--missing'}`,
	});
	/* textContent: a kern group can hold `<` and `&` like any other range. */
	chip.textContent = char;

	/*
		The app's tooltip rather than the OS one, like every other surface. A
		missing character is the thing worth saying here: the group still holds
		it, and the pair it is part of does nothing.
	*/
	attachTooltip(chip, {
		name: name || charID,
		body: exists ? charID : `${charID} \u2014 not in this project, so this pair does nothing.`,
	});

	return chip;
}
