import { PRODUCT_NAME } from '../app/brand.js';
import { getCurrentProject, getCurrentProjectEditor } from '../app/main.js';
import { decToHex, hexesToChars } from '../common/character_ids.js';
import { addAsChildren, makeElement, textToNode } from '../common/dom.js';
import { remove } from '../common/functions.js';
import { closeEveryTypeOfDialog, showModalDialog, showToast } from '../controls/dialogs/dialogs.js';
import { unicodeBlocksBMP } from '../lib/unicode/unicode_blocks_0_bmp.js';
import { unicodeBlocksSMP } from '../lib/unicode/unicode_blocks_1_smp.js';
import { unicodeBlocksSIP } from '../lib/unicode/unicode_blocks_2_sip.js';
import { unicodeBlocksTIP } from '../lib/unicode/unicode_blocks_3_tip.js';
import { getUnicodeName } from '../lib/unicode/unicode_names.js';
import { hideTooltip, showTooltip } from '../controls/tooltip/tooltip.js';
import { makeDirectCheckbox } from '../panels/cards';
import { CharacterRange } from '../project_data/character_range.js';
import { resolveItemLinks } from '../project_editor/cross_item_actions';
import { makeOneSettingsRow } from './settings.js';

/**
 * Makes the content for the Settings > Project tab
 * @returns {Element}
 */
export function makeSettingsTabContentProject() {
	updateAllCharacterRangeCounts();

	const tabContent = makeElement({
		tag: 'div',
		className: 'settings-page__tab-content',
		id: 'tab-content__project',
		innerHTML: `
			<h1>Project settings</h1>
			<p>These settings affect how this ${PRODUCT_NAME} Project behaves.</p>
		`,
	});

	const settingsArea = makeElement({
		tag: 'div',
		className: 'settings-table',
	});

	addAsChildren(settingsArea, [
		makeOneSettingsRow('project', 'name'),
		makeOneSettingsRow('project', 'latestVersion'),
		makeOneSettingsRow('project', 'initialVersion'),
		makeOneSettingsRow('project', 'id'),
		makeOneSettingsRow('project', 'exportComponentsAsComposites'),
		makeOneSettingsRow('project', 'importComponentsFromComposites'),
		textToNode('<br>'),
	]);

	const rangesArea = makeElement({
		tag: 'div',
		innerHTML: `
			<h2>Character ranges</h2>
			<p>
				Character ranges are based on the <a href="https://en.wikipedia.org/wiki/Unicode" target="_blank">Unicode Standard</a>,
				which assigns a <a href="https://en.wikipedia.org/wiki/Hexadecimal" target="_blank">hexadecimal number</a>
				to all possible characters in a font.
				<a href="https://en.wikipedia.org/wiki/Unicode_block" target="_blank">Wikipedia's Unicode Block page</a>
				is a good place to get familiar with all the different characters it's possible to have in a font.
			</p>
		`,
	});

	const addStandardRangeButton = makeElement({
		tag: 'fancy-button',
		style: 'margin-bottom: 10px;',
		innerHTML: 'Add standard character ranges from Unicode',
		onClick: showUnicodeCharacterRangeDialog,
	});
	// Have to add attribute after the button is created
	addStandardRangeButton.setAttribute('secondary', '');

	const addCustomRangeButton = makeElement({
		tag: 'fancy-button',
		style: 'margin-bottom: 10px;',
		innerHTML: 'Add a custom character range',
		onClick: () => showEditCharacterRangeDialog(),
	});
	// Have to add attribute after the button is created
	addCustomRangeButton.setAttribute('minimal', '');

	addAsChildren(rangesArea, [
		addStandardRangeButton,
		textToNode('<span>&emsp;</span>'),
		addCustomRangeButton,
		textToNode('<br>'),
		textToNode('<br>'),
		textToNode('<h3>Enabled character ranges</h3>'),
		textToNode(`
			<p>
				These character ranges will be visible on the Characters page,
				and they will be exported to fonts.
				<br>
				Hiding a character range <strong>will not</strong>
				delete individual glyphs from the project.
			</p>
		`),
		textToNode('<div id="enabled-range-table__wrapper"></div>'),
		textToNode('<br>'),
		textToNode('<br>'),
		textToNode('<h3>Hidden character ranges</h3>'),
		textToNode(`
			<p>
				These are ranges with characters that are saved in your project,
				but are not part of enabled character ranges.
				<br>
				These will be saved to your ${PRODUCT_NAME} Project File, but
				will not be exported to fonts.
			</p>
		`),
		textToNode('<div id="hidden-range-table__wrapper"></div>'),
	]);

	sortCharacterRanges();

	addAsChildren(
		rangesArea.querySelector('#enabled-range-table__wrapper'),
		makeEnabledRangesTable()
	);
	addAsChildren(rangesArea.querySelector('#hidden-range-table__wrapper'), makeHiddenRangesTable());

	addAsChildren(tabContent, [settingsArea, rangesArea]);

	return tabContent;
}

function updateRangesTables() {
	const enabled = document.querySelector('#enabled-range-table__wrapper');
	const hidden = document.querySelector('#hidden-range-table__wrapper');
	if (enabled && hidden) {
		enabled.innerHTML = '';
		hidden.innerHTML = '';
		addAsChildren(enabled, makeEnabledRangesTable());
		addAsChildren(hidden, makeHiddenRangesTable());
	}
}

// --------------------------------------------------------------
// Current Ranges
// --------------------------------------------------------------

function makeEnabledRangesTable() {
	const rangeTable = makeElement({
		tag: 'div',
		className: 'range-table__list-area',
	});

	addAsChildren(rangeTable, [
		textToNode('<span class="list__column-header">Range name</span>'),
		textToNode('<span class="list__column-header">Start</span>'),
		textToNode('<span class="list__column-header">End</span>'),
		textToNode('<span class="list__column-header">Characters</span>'),
		textToNode('<span class="list__column-header">Actions</span>'),
	]);

	const project = getCurrentProject();
	const projectRanges = project.settings.project.characterRanges;
	if (projectRanges.length === 0) {
		projectRanges.unshift(
			new CharacterRange({
				name: 'Basic Latin',
				begin: 0x20,
				end: 0x7f,
				enabled: true,
			})
		);
	}

	let displayRanges = projectRanges.filter((range) => range.enabled);

	// log(`\n⮟displayRanges⮟`);
	// log(displayRanges);

	displayRanges.forEach((range) => {
		let actions = makeElement();
		addAsChildren(actions, [
			makeElement({
				tag: 'a',
				innerHTML: 'Edit',
				onClick: () => {
					showEditCharacterRangeDialog(range);
				},
			}),
			textToNode('<span>&nbsp;&nbsp;</span>'),
		]);
		if (displayRanges.length <= 1) {
			actions.appendChild(
				textToNode(`
				<span disabled="disabled" title="At least one character range must be enabled">Hide</span>
			`)
			);
		} else {
			actions.appendChild(
				makeElement({
					tag: 'a',
					innerHTML: 'Hide',
					onClick: () => hideCharacterRange(range),
				})
			);
		}

		// Assemble row
		const rowWrapper = makeElement({
			className: 'list__row-wrapper__static',
		});

		addAsChildren(rowWrapper, [
			textToNode(`<span>${range.name}</span>`),
			textToNode(`<code>${decToHex(range.begin)}</code>`),
			textToNode(`<code>${decToHex(range.end)}</code>`),
			textToNode(`<span>${range.count}</span>`),
			actions,
		]);

		addAsChildren(rangeTable, rowWrapper);
	});

	return rangeTable;
}

// --------------------------------------------------------------
// Hidden Ranges
// --------------------------------------------------------------

function makeHiddenRangesTable() {
	// log(`makeHiddenRagesTable`, 'start');
	const rangeTable = makeElement({
		tag: 'div',
		className: 'range-table__list-area',
	});

	addAsChildren(rangeTable, [
		textToNode('<span class="list__column-header">Range name</span>'),
		textToNode('<span class="list__column-header">Start</span>'),
		textToNode('<span class="list__column-header">End</span>'),
		textToNode('<span class="list__column-header">Characters</span>'),
		textToNode('<span class="list__column-header">Action</span>'),
	]);

	const project = getCurrentProject();
	let displayRanges = project.settings.project.characterRanges.filter((range) => !range.enabled);

	// log(`\n⮟displayRanges⮟`);
	// log(displayRanges);

	if (displayRanges.length > 0) {
		displayRanges.forEach((range) => {
			let actions = makeElement();
			addAsChildren(actions, [
				makeElement({
					tag: 'a',
					innerHTML: 'Show',
					onClick: () => enableCharacterRange(range),
				}),
				textToNode('<span>&nbsp;&nbsp;</span>'),
			]);

			if (range.count <= 0) {
				actions.appendChild(
					makeElement({
						tag: 'a',
						innerHTML: 'Remove',
						onClick: () => removeCharacterRange(range),
					})
				);
			} else {
				actions.appendChild(
					makeElement({
						tag: 'a',
						innerHTML: 'Delete',
						attributes: { danger: '' },
						onClick: () => showDeleteCharacterRangeDialog(range),
					})
				);
			}

			// Assemble row
			const rowWrapper = makeElement({
				className: 'list__row-wrapper__static',
			});

			addAsChildren(rowWrapper, [
				textToNode(`<span>${range.name}</span>`),
				textToNode(`<code>${decToHex(range.begin)}</code>`),
				textToNode(`<code>${decToHex(range.end)}</code></span>`),
				textToNode(`<span>${range.count}</span>`),
				actions,
			]);

			addAsChildren(rangeTable, rowWrapper);
		});
	} else {
		addAsChildren(
			rangeTable,
			textToNode(`
			<em class="span-all-columns" style="padding-top: 10px;">
				All characters in this project are members of enabled character ranges.
			</em>
		`)
		);
	}

	// log(`makeHiddenRagesTable`, 'end');
	return rangeTable;
}

// --------------------------------------------------------------
// Remove and delete ranges
// --------------------------------------------------------------

/**
 * Takes a range out of the project, leaving every glyph where it is.
 *
 * @param {Object} range - the range to remove
 * @param {Boolean} manageDialogs - close and announce, or leave that to the
 *	caller. deleteCharactersFromRange owns both halves of its action, so it
 *	says so once rather than letting this speak for half of it.
 * @returns {Number} - hidden ranges created to hold whatever fell outside
 */
function removeCharacterRange(range, manageDialogs = true) {
	const editor = getCurrentProjectEditor();
	const fallback = areCharacterRangesEqual(range, editor.selectedCharacterRange);
	const projectRanges = editor.project.settings.project.characterRanges;
	let index = projectRanges.indexOf(range);
	if (index > -1) {
		let name = range.name;
		projectRanges.splice(index, 1);
		if (fallback) {
			editor.selectedCharacterRange = false;
			editor.chooserPage.characters = 0;
			editor.selectFallbackItem('Characters');
		}
		let newRanges = enableRangesForOrphanedItems();
		updateRangesTables();
		if (manageDialogs) {
			closeEveryTypeOfDialog();
			let duration = 3000;
			let message = `Removed character range:<br>${name}<br>No glyph data was deleted.`;
			if (newRanges > 0) {
				message += `<br><br>
					Created ${newRanges} new hidden range${newRanges === 1 ? '' : 's'} to cover orphaned characters.
				`;
				duration = 6000;
			}
			showToast(message, duration);
		}
		return newRanges;
	} else {
		if (manageDialogs) {
			closeEveryTypeOfDialog();
			showToast(`Something went wrong with removing this character range.`);
		}
	}
	return 0;
}

/**
 * Two things you might mean by deleting a character range, and which of them
 * you are about to do.
 *
 * WHAT IT WAS. Four sentences of theory about what a character range is, at
 * the top of a destructive dialog - where the thing you need to read is what
 * is about to happen to your project. Two checkboxes in a raw grid with a
 * label, a paragraph and a preview box each, and no hierarchy between them.
 * One button reading `Delete selected items`, which said nothing about which
 * items. And a reassurance - "Don't worry, this action can be undone" - that
 * was only half true: the character deletion was wrapped in a history state
 * and the range removal was not, so undo brought the glyphs back and left the
 * range gone.
 *
 * Three faults underneath it:
 *
 *   updateDeleteButtonText ran `button.addEventListener('click',
 *   deleteCharactersFromRange)` every time a box was ticked. The button
 *   already had a handler that passed the range and the delete list; this
 *   second one passed the click event as the range. So after touching either
 *   checkbox, pressing Delete ran the real delete and then a second call that
 *   looked for a MouseEvent in the project's range list, failed, and put
 *   "Something went wrong with removing this character range" on screen.
 *
 *   findCharactersToDelete set `range.count = 0` and never put it back, so
 *   opening this dialog and pressing Cancel left the range reading as empty -
 *   which is also what the hidden ranges table uses to decide whether a range
 *   offers Remove or Delete.
 *
 *   characterRangeDeleteOptions is module state, so the boxes remembered what
 *   you ticked the last time you opened it, for a different range.
 *
 * @param {Object} range - the range to delete
 */
function showDeleteCharacterRangeDialog(range) {
	const deleteData = findCharactersToDelete(range);

	/* Fresh every time. These are answers about this range, not a preference. */
	characterRangeDeleteOptions.removeRange = true;
	characterRangeDeleteOptions.deleteCharacters = false;

	const content = makeElement({ className: 'dialog-layout dialog-form' });

	// --- Remove the range ------------------------------------------
	const removeOption = makeElement({ tag: 'label', className: 'dialog-option' });
	const removeBox = makeDirectCheckbox(
		characterRangeDeleteOptions,
		'removeRange',
		() => refresh(),
		'character-range-delete__remove'
	);
	removeOption.appendChild(removeBox);
	removeOption.appendChild(
		makeElement({
			tag: 'span',
			className: 'dialog-option__title',
			content: 'Remove the range',
		})
	);
	removeOption.appendChild(
		makeElement({
			tag: 'span',
			className: 'dialog-option__hint',
			/*
				The name and the two code points are in the dialog's subtitle,
				so this says what happens to them rather than printing them
				again - and nothing lands a comma against a code chip, which
				reads as a space before the punctuation.
			*/
			content: 'Takes the name and its two end points out of the project. No character is deleted.',
		})
	);

	// --- Delete the characters -------------------------------------
	const deleteOption = makeElement({ tag: 'label', className: 'dialog-option' });
	const deleteBox = makeDirectCheckbox(
		characterRangeDeleteOptions,
		'deleteCharacters',
		() => refresh(),
		'character-range-delete__characters'
	);
	deleteOption.appendChild(deleteBox);
	deleteOption.appendChild(
		makeElement({
			tag: 'span',
			className: 'dialog-option__title',
			content: `Delete the ${deleteData.length} character${
				deleteData.length === 1 ? '' : 's'
			} inside it`,
		})
	);
	deleteOption.appendChild(
		makeElement({
			tag: 'span',
			className: 'dialog-option__hint',
			content: 'Every outline, side bearing and anchor you have drawn for them goes with them.',
		})
	);
	if (!deleteData.length) deleteOption.setAttribute('disabled', '');

	// --- What is inside it -----------------------------------------

	/*
		The characters themselves, not their ids. It was a run of
		`glyph-0x41` chips - the project's internal name for a thing you know
		by its shape - and there was no cap on how many of them it drew.
	*/
	const preview = makeElement({
		tag: 'div',
		className: 'dialog-charwall dialog-form__preview',
		attributes: { role: 'group', 'aria-label': 'Characters in this range' },
	});
	const previewNote = makeElement({ tag: 'span', className: 'dialog-picker__note' });

	const summary = makeElement({ className: 'dialog-form__summary' });
	const summaryText = makeElement({ tag: 'span', className: 'dialog-form__summary-text' });
	addAsChildren(summary, [summaryText, preview, previewNote]);

	if (deleteData.length) {
		const shown = Math.min(deleteData.length, PREVIEW_LIMIT);
		summaryText.textContent = `${deleteData.length} character${
			deleteData.length === 1 ? '' : 's'
		} in this range have project data`;
		deleteData.slice(0, shown).forEach((id) => {
			const hexString = `${decToHex(id)}`;
			const tile = makeElement({
				className: 'dialog-charwall__tile',
				innerHTML: hexesToChars(hexString) || '',
			});
			const characterName = getUnicodeName(hexString);
			tile.setAttribute('data-tip-name', hexString);
			tile.setAttribute('data-tip-body', characterName);
			tile.setAttribute('aria-label', `${hexString} ${characterName}`);
			preview.appendChild(tile);
		});
		previewNote.textContent =
			deleteData.length > shown
				? `Showing the first ${shown}. All ${deleteData.length} would be deleted.`
				: '';
		previewNote.hidden = !previewNote.textContent;
	} else {
		summary.hidden = true;
	}

	preview.addEventListener('mouseover', (event) => {
		const tile = /** @type {HTMLElement} */ (event.target)?.closest?.('.dialog-charwall__tile');
		if (!(tile instanceof HTMLElement)) return;
		showTooltip(
			tile,
			tile.getAttribute('data-tip-name') || '',
			tile.getAttribute('data-tip-body') || ''
		);
	});
	preview.addEventListener('mouseleave', hideTooltip);

	// --- What it costs ---------------------------------------------
	const undoNote = makeElement({
		className: 'dialog-info',
	});
	undoNote.appendChild(
		makeElement({ tag: 'span', className: 'dialog-info__title', content: 'This can be undone' })
	);
	undoNote.appendChild(
		makeElement({
			className: 'dialog-info__body',
			content:
				'Both halves are recorded as one step in History, so Ctrl Z puts the range and everything in it back.',
		})
	);

	// --- Actions ----------------------------------------------------
	const deleteButton = makeElement({
		tag: 'fancy-button',
		attributes: { danger: '' },
		content: 'Delete',
	});
	deleteButton.addEventListener('click', () => {
		if (deleteButton.hasAttribute('disabled')) return;
		deleteCharactersFromRange(range, deleteData);
	});

	const cancelButton = makeElement({
		tag: 'fancy-button',
		attributes: { secondary: '' },
		content: 'Cancel',
		onClick: closeEveryTypeOfDialog,
	});

	/**
	 * The button says what it is about to do, because the two checkboxes make
	 * four different actions out of one button. `Delete selected items` was
	 * the same words whether it removed a name and two numbers or erased every
	 * outline in the range.
	 */
	function refresh() {
		const removing = characterRangeDeleteOptions.removeRange;
		const deleting = characterRangeDeleteOptions.deleteCharacters && deleteData.length > 0;
		const characters = `${deleteData.length} character${deleteData.length === 1 ? '' : 's'}`;

		let label = 'Nothing selected';
		if (removing && deleting) label = `Delete ${characters} and remove the range`;
		else if (deleting) label = `Delete ${characters}`;
		else if (removing) label = 'Remove the range';

		deleteButton.innerHTML = label;
		if (removing || deleting) deleteButton.removeAttribute('disabled');
		else deleteButton.setAttribute('disabled', '');

		/* Only the half that erases drawings is the dangerous half. */
		if (deleting) deleteButton.setAttribute('danger', '');
		else deleteButton.removeAttribute('danger');

		summary.hidden = !deleting;
	}

	addAsChildren(content, [removeOption, deleteOption, summary, undoNote]);
	refresh();

	showModalDialog(content, 520, {
		title: 'Delete character range',
		subtitle: `${range.name} · ${decToHex(range.begin)} – ${decToHex(range.end)}`,
		actions: [cancelButton, deleteButton],
	});
}

const characterRangeDeleteOptions = {
	removeRange: true,
	deleteCharacters: false,
};

/**
 * Which characters in this range have project data.
 *
 * It used to set `range.count = 0` on the way past and never put it back, so
 * opening the delete dialog and cancelling left the range reading as empty -
 * and the hidden ranges table decides between Remove and Delete on that
 * number. Counting is updateCharacterRangeCount's job; this only reads.
 *
 * @param {Object} range - the range to look inside
 * @returns {Array} - character ids
 */
function findCharactersToDelete(range) {
	const project = getCurrentProject();
	return range.getMemberIDs().filter((id) => project.glyphs[`glyph-${id}`]);
}

/**
 * Does whichever halves were ticked, as one step.
 *
 * The two used to be recorded differently: the character deletion took a
 * whole-project pre and post state, and then removeCharacterRange ran after
 * the post state, outside the record. So undo brought the glyphs back and
 * left the range gone - under a dialog that said the action could be undone.
 * One state now covers both.
 *
 * @param {Object} range - the range being deleted
 * @param {Array} deleteList - character ids to delete
 */
function deleteCharactersFromRange(range, deleteList = []) {
	const removeInfo = characterRangeDeleteOptions.removeRange;
	const removeChars = characterRangeDeleteOptions.deleteCharacters && deleteList.length > 0;
	if (!removeInfo && !removeChars) return;

	const editor = getCurrentProjectEditor();
	const name = range.name;

	const parts = [];
	if (removeChars) parts.push(`deleted ${deleteList.length} characters`);
	if (removeInfo) parts.push(`removed character range ${name}`);
	const message = `Deleting: ${parts.join(' and ')}`;

	editor.history.addWholeProjectChangePreState(message);

	if (removeChars) {
		deleteList.forEach((id) => {
			const item = editor.project.getItem(`glyph-${id}`);
			resolveItemLinks(item, true);
			delete editor.project.glyphs[`glyph-${id}`];
		});
	}

	/*
		No dialogs or toasts from in there - this function owns both, so that
		two halves of one action do not announce themselves twice.
	*/
	let newRanges = 0;
	if (removeInfo) newRanges = removeCharacterRange(range, false);

	editor.history.addWholeProjectChangePostState();

	editor.project.updateAllCharacterRangeCounts();
	updateRangesTables();
	closeEveryTypeOfDialog();

	let toast = removeChars
		? `Deleted ${deleteList.length} character${deleteList.length === 1 ? '' : 's'}`
		: '';
	if (removeInfo) {
		toast += toast
			? `<br>and removed character range:<br>${name}`
			: `Removed character range:<br>${name}`;
	}
	if (newRanges > 0) {
		toast += `<br><br>Created ${newRanges} new hidden range${
			newRanges === 1 ? '' : 's'
		} to cover orphaned characters.`;
	}
	showToast(toast, newRanges > 0 ? 6000 : 3000);
}

// --------------------------------------------------------------
// Edit Range or Add Custom Range
// --------------------------------------------------------------
/**
 * The three numbers a character range is made of.
 *
 * WHAT IT WAS. An h1 in the body and the buttons at the bottom of it, so
 * neither the name of the dialog nor the way out belonged to the frame. Three
 * labels in a grid whose middle column existed to hold two copies of the same
 * info bubble, and a third empty span where the name's would have gone. No
 * hint about what Start and End accept, on fields that accept three different
 * notations. Save always enabled, on a form that starts empty.
 *
 * And two real faults:
 *
 *   The name field ran its value through sanitizeUnicodeInput on change, the
 *   same as Start and End. A range called `2024 Icons` parses as 2024, so the
 *   field rewrote it to `0x7E8` - silently, on blur, before anyone pressed
 *   Save.
 *
 *   Every validation failure went to showError, and showError begins with
 *   closeEveryTypeOfDialog. So submitting a range with a blank name threw away
 *   the two numbers you had just typed and left a red panel at the top of the
 *   window explaining what you should have done.
 *
 * @param {Object | false} range - the range to edit, or false to add one
 */
function showEditCharacterRangeDialog(range = false) {
	const content = makeElement({ className: 'dialog-layout dialog-form' });

	// --- Name ------------------------------------------------------
	const nameField = makeElement({ className: 'dialog-field' });
	nameField.appendChild(
		makeElement({
			tag: 'label',
			className: 'dialog-field__label',
			attributes: { for: 'glyph-range-editor__name' },
			content: 'Range name',
		})
	);
	const inputName = makeElement({
		tag: 'input',
		id: 'glyph-range-editor__name',
		className: 'dialog-field__control',
		attributes: { type: 'text', placeholder: 'Game icons', spellcheck: 'false' },
	});
	/*
		No sanitizeUnicodeInput here. A name is a name - see the note above the
		function.
	*/
	nameField.appendChild(inputName);

	// --- Start and End, one pair with one hint ---------------------
	const spanGroup = makeElement({ className: 'dialog-field' });
	/*
		The label, and under the pair the one thing you have to know to fill
		them in. It used to be the same paragraph inside two identical info
		bubbles, one beside Start and one beside End - so the answer to "what
		do I type here" was behind a click, twice, on a field whose whole
		difficulty is that it reads three notations and says so nowhere.
	*/
	spanGroup.appendChild(makeElement({ className: 'dialog-field__label', content: 'Code points' }));

	const spanRow = makeElement({ className: 'dialog-span-row' });
	const makeSpanInput = (id, placeholder, label) => {
		const wrapper = makeElement({ className: 'dialog-span-row__field' });
		wrapper.appendChild(
			makeElement({
				tag: 'label',
				className: 'dialog-span-row__label',
				attributes: { for: id },
				content: label,
			})
		);
		const input = makeElement({
			tag: 'input',
			id: id,
			attributes: { type: 'text', placeholder: placeholder, spellcheck: 'false' },
		});
		input.addEventListener('change', (event) => {
			/** @type {HTMLInputElement} */ (event.target).value = sanitizeUnicodeInput(
				/** @type {HTMLInputElement} */ (event.target).value
			);
			refresh();
		});
		wrapper.appendChild(input);
		return { wrapper: wrapper, input: input };
	};

	const begin = makeSpanInput('glyph-range-editor__begin', '0x20', 'Start');
	const end = makeSpanInput('glyph-range-editor__end', '0x7F', 'End');
	addAsChildren(spanRow, [begin.wrapper, end.wrapper]);
	spanGroup.appendChild(spanRow);
	spanGroup.appendChild(
		makeElement({
			className: 'dialog-field__hint',
			/* The punctuation follows a word rather than a chip. Written the
				short way - chip, comma, chip - every comma and full stop sat
				against a padded box and read as a space before it. */
			content:
				'Three ways to write one: <code>0x4E</code> hexadecimal, <code>U+4E</code> Unicode, or <code>78</code> decimal. All three are Capital&nbsp;N.',
		})
	);

	// --- What you have described -----------------------------------

	/*
		The range, read back. These three fields are numbers in one of three
		notations, and until now nothing said what they added up to until after
		you had saved them - so a typo in Start was a range you found out about
		on the Characters page.
	*/
	const summary = makeElement({ className: 'dialog-form__summary' });
	const summaryText = makeElement({ tag: 'span', className: 'dialog-form__summary-text' });
	/*
		Named, because it is a tab stop. Chrome makes a scrolling box keyboard
		focusable when nothing inside it is - which is right, or a keyboard could
		not scroll this strip at all - and a focusable region with no accessible
		name announces itself as nothing.
	*/
	const preview = makeElement({
		tag: 'div',
		className: 'dialog-charwall dialog-form__preview',
		attributes: { role: 'group', 'aria-label': 'Characters in this range' },
	});
	addAsChildren(summary, [summaryText, preview]);

	const problem = makeElement({ className: 'dialog-form__problem' });
	problem.hidden = true;

	// --- What a range is, for whoever has not met one ---------------

	/*
		Last, not first. It is reference rather than instruction - you can fill
		this form in without reading it - and a paragraph above the fields
		pushes the fields down the dialog to explain something most people
		opening it already know.
	*/
	const info = makeElement({ className: 'dialog-info' });
	info.appendChild(
		makeElement({ tag: 'span', className: 'dialog-info__title', content: 'What a range does' })
	);
	info.appendChild(
		makeElement({
			className: 'dialog-info__body',
			content:
				'A range decides which characters appear on the Characters page and which are written into the exported font. It is a span of code points and nothing else, so ranges may overlap, and one can exist long before you have drawn anything inside it &ndash; which is how you lay out the shape of a font before you start drawing.',
		})
	);

	// --- The note that only applies to an edit ----------------------
	const orphanNote = makeElement({
		className: 'dialog-note',
		content:
			'Every character has to belong to a range. Making this one smaller creates a hidden range to hold whatever falls outside it.',
	});
	if (!range) orphanNote.hidden = true;

	// --- Actions ----------------------------------------------------
	const saveButton = makeElement({
		tag: 'fancy-button',
		content: 'Save',
		attributes: { disabled: '' },
	});
	saveButton.addEventListener('click', () => {
		const values = read();
		if (!values.valid) return;
		saveCharacterRange(range, values.name, values.begin, values.end);
	});

	const cancelButton = makeElement({
		tag: 'fancy-button',
		attributes: { secondary: '' },
		content: 'Cancel',
		onClick: closeEveryTypeOfDialog,
	});

	// --- Reading and saying what is there ---------------------------

	/**
	 * What the three fields currently hold, and whether it is a range.
	 * @returns {Object} - { name, begin, end, valid, problem }
	 */
	function read() {
		const name = `${/** @type {HTMLInputElement} */ (inputName).value}`.trim();
		const rawBegin = `${/** @type {HTMLInputElement} */ (begin.input).value}`.trim();
		const rawEnd = `${/** @type {HTMLInputElement} */ (end.input).value}`.trim();
		let low = parseInt(sanitizeUnicodeInput(rawBegin));
		let high = parseInt(sanitizeUnicodeInput(rawEnd));

		if (!rawBegin || !rawEnd || !name) {
			return { valid: false, problem: '' };
		}
		if (isNaN(low)) {
			return { valid: false, problem: 'Start is not a code point. Try 0x20, U+20 or 32.' };
		}
		if (isNaN(high)) {
			return { valid: false, problem: 'End is not a code point. Try 0x7F, U+7F or 127.' };
		}

		/* Typed the other way round is still a range, so it is turned round
			rather than refused - and said out loud, because a field that holds
			one number and means another is a field you cannot trust. */
		const swapped = low > high;
		if (swapped) [low, high] = [high, low];

		return { name: name, begin: low, end: high, swapped: swapped, valid: true, problem: '' };
	}

	/** Says what the fields add up to, and whether Save can be pressed. */
	function refresh() {
		const values = read();

		problem.textContent = values.problem;
		problem.hidden = !values.problem;

		if (!values.valid) {
			summaryText.textContent = '';
			preview.innerHTML = '';
			saveButton.setAttribute('disabled', '');
			return;
		}

		saveButton.removeAttribute('disabled');

		const count = values.end - values.begin + 1;
		const shown = Math.min(count, PREVIEW_LIMIT);
		summaryText.textContent =
			`${decToHex(values.begin)} – ${decToHex(values.end)} · ${count} character${
				count === 1 ? '' : 's'
			}` +
			(values.swapped ? ' · Start and End are the other way round, and will be saved swapped' : '');

		preview.innerHTML = '';
		for (let point = values.begin; point < values.begin + shown; point++) {
			const hexString = `${decToHex(point)}`;
			const tile = makeElement({
				className: 'dialog-charwall__tile',
				innerHTML: hexesToChars(hexString) || '',
			});
			const characterName = getUnicodeName(hexString);
			tile.setAttribute('data-tip-name', hexString);
			tile.setAttribute('data-tip-body', characterName);
			tile.setAttribute('aria-label', `${hexString} ${characterName}`);
			preview.appendChild(tile);
		}
	}

	preview.addEventListener('mouseover', (event) => {
		const tile = /** @type {HTMLElement} */ (event.target)?.closest?.('.dialog-charwall__tile');
		if (!(tile instanceof HTMLElement)) return;
		showTooltip(
			tile,
			tile.getAttribute('data-tip-name') || '',
			tile.getAttribute('data-tip-body') || ''
		);
	});
	preview.addEventListener('mouseleave', hideTooltip);

	[inputName, begin.input, end.input].forEach((input) => {
		input.addEventListener('input', refresh);
	});

	if (range) {
		/** @type {HTMLInputElement} */ (inputName).value = range.name;
		/** @type {HTMLInputElement} */ (begin.input).value = `${decToHex(range.begin)}`;
		/** @type {HTMLInputElement} */ (end.input).value = `${decToHex(range.end)}`;
	}

	addAsChildren(content, [nameField, spanGroup, problem, summary, info, orphanNote]);
	refresh();

	showModalDialog(content, 520, {
		title: `${range ? 'Edit' : 'Add'} character range`,
		subtitle: 'A span of Unicode code points, and what to call it.',
		actions: [cancelButton, saveButton],
	});

	/** @type {HTMLElement} */ (inputName).focus();
}

/**
 * Writes the range, having already been told it is a range.
 *
 * It used to read the three fields back out of the document by id and validate
 * them here, which is why the failure path had to reach for showError - there
 * was nowhere else to put the message. The dialog validates as you type now,
 * so by the time this runs there is nothing left to refuse.
 *
 * @param {Object | false} range - the range being edited, or false to add one
 * @param {String} newName - what to call it
 * @param {Number} newBegin - first code point
 * @param {Number} newEnd - last code point
 */
function saveCharacterRange(range, newName, newBegin, newEnd) {
	const checkForOrphans = range && (newBegin > range.begin || newEnd < range.end);

	if (range) {
		range.begin = newBegin;
		range.end = newEnd;
		range.name = newName;
		showToast(`Saved changes to character range:<br>${range.name}`);
	} else {
		addCharacterRangeToCurrentProject(
			{ begin: newBegin, end: newEnd, name: newName },
			false,
			false
		);
	}

	// If there are orphaned glyphs, we need to create hidden ranges for them
	let newRanges = 0;
	if (checkForOrphans) {
		newRanges = enableRangesForOrphanedItems();
	}

	// Finish up
	closeEveryTypeOfDialog();
	if (newRanges > 0) {
		showToast(`
		All characters must be in at least one character range.<br>
		Created ${newRanges} new hidden range${newRanges === 1 ? '' : 's'} to cover orphaned characters.
		`);
	} else {
		getCurrentProject().updateAllCharacterRangeCounts();
		sortCharacterRanges();
	}
	updateRangesTables();
}

function enableRangesForOrphanedItems() {
	const project = getCurrentProject();
	let newRanges = 0;
	for (const glyphID in project.glyphs) {
		let hasParent = false;
		let hex = Number(remove(glyphID, 'glyph-'));
		// log(`hex: ${hex}`);
		for (const range of project.settings.project.characterRanges) {
			if (range.isWithinRange(hex)) {
				hasParent = true;
				break;
			}
		}
		if (!hasParent) {
			project.createRangeForHex(hex, true);
			newRanges++;
		}
	}
	if (newRanges > 0) {
		getCurrentProject().updateAllCharacterRangeCounts();
		sortCharacterRanges();
	}
	return newRanges;
}

function hideCharacterRange(range) {
	// log(`hideCharacterRange`, 'start');
	// log(`\n⮟range⮟`);
	// log(range);

	const editor = getCurrentProjectEditor();
	if (areCharacterRangesEqual(range, editor.selectedCharacterRange)) {
		editor.selectedCharacterRange = false;
		editor.chooserPage.characters = 0;
	}

	range.enabled = false;

	const glyphID = editor.selectedGlyphID;
	if (glyphID !== false) {
		if (range.getMemberIDs().indexOf(glyphID.substring(6)) > -1) {
			editor.selectFallbackItem('Characters');
		}
	}

	updateRangesTables();
	closeEveryTypeOfDialog();
	showToast(`Hid character range:<br>${range.name}`);

	// log(`\n⮟range⮟`);
	// log(range);
	// log(`hideCharacterRange`, 'end');
}

function enableCharacterRange(range) {
	range.enabled = true;
	updateRangesTables();
	closeEveryTypeOfDialog();
	showToast(`Enabled character range:<br>${range.name}`);
}

function sanitizeUnicodeInput(inputString) {
	let sanString = inputString.replace(/U\+/gi, '0x');
	let sanInt = parseInt(sanString);

	if (!isNaN(sanInt)) return decToHex(Math.abs(sanInt));
	else return inputString;
}

export function sortCharacterRanges() {
	const ranges = getCurrentProject().settings.project.characterRanges;
	ranges.sort((a, b) => parseInt(a.begin) - parseInt(b.begin));
}

// --------------------------------------------------------------
// Range Chooser
// --------------------------------------------------------------

/*
	The four planes, named. The blocks were four arrays appended to one list,
	so `Egyptian Hieroglyphs` sat under `Specials` with nothing to say that the
	code points had jumped from 0xFFFF to 0x13000 - which is the one thing a
	person picking a block out of three hundred and seventy needs to know about
	where they have ended up.
*/
const UNICODE_PLANES = [
	{ label: 'Basic Multilingual Plane', blocks: unicodeBlocksBMP },
	{ label: 'Supplementary Multilingual Plane', blocks: unicodeBlocksSMP },
	{ label: 'Supplementary Ideographic Plane', blocks: unicodeBlocksSIP },
	{ label: 'Tertiary Ideographic Plane', blocks: unicodeBlocksTIP },
];

/*
	How much of a block the preview draws.

	It used to draw all of it, synchronously, on click. CJK Unified Ideographs
	Extension B is 42,720 code points, each one a getUnicodeName lookup and a
	DOM node - so picking it locked the tab. The point of the preview is to
	recognise a script, and the first 256 characters do that for every block in
	the standard; the rest is said in words. 256 is the item chooser's own page
	size, for the same reason.
*/
const PREVIEW_LIMIT = 256;

/**
 * Every block in the Unicode standard, and a way into your project.
 *
 * WHAT IT WAS. An h1, three h3s and an h4 doing the work of labels; the
 * preview on the left and the list you pick from on the right, so the dialog
 * read backwards; no search over three hundred and seventy blocks, so finding
 * Devanagari meant scrolling for it; no mark on the row you had picked, and
 * none on the ones already in the project - you found that out from a toast
 * after you had added a second copy; Start and End as two columns writing one
 * fact; the only action loose at the bottom of the left column; and a preview
 * that built a DOM node per code point.
 */
function showUnicodeCharacterRangeDialog() {
	/** @type {Object | false} */
	let selectedBlock = false;

	const content = makeElement({ className: 'dialog-layout dialog-picker' });

	// --------------------------------------------------------------
	// Left: search, then the blocks
	// --------------------------------------------------------------

	const listColumn = makeElement({ className: 'dialog-picker__column' });

	const searchField = makeElement({ className: 'dialog-search' });
	const searchInput = makeElement({
		tag: 'input',
		attributes: {
			type: 'search',
			placeholder: 'Search blocks',
			spellcheck: 'false',
			'aria-label': 'Search Unicode blocks',
		},
	});
	/*
		A way out of a search. The field suppresses the browser's own clear
		button - it is drawn in the browser's language rather than the app's -
		and Escape in a dialog closes the dialog, so a typed term could only be
		undone by selecting it and deleting it.
	*/
	const clearSearch = makeElement({
		tag: 'button',
		className: 'dialog-search__clear',
		attributes: { type: 'button', 'aria-label': 'Clear the search' },
		content: '&times;',
	});
	clearSearch.hidden = true;
	clearSearch.addEventListener('click', () => {
		/** @type {HTMLInputElement} */ (searchInput).value = '';
		runSearch();
		/** @type {HTMLElement} */ (searchInput).focus();
	});
	addAsChildren(searchField, [searchInput, clearSearch]);

	const list = makeElement({
		className: 'dialog-picklist',
		attributes: { role: 'listbox', 'aria-label': 'Unicode blocks' },
	});

	const noMatches = makeElement({
		className: 'dialog-empty',
		content: 'No block matches that.',
	});
	noMatches.hidden = true;

	/*
		How many there are, and how many of them you are looking at. A filter
		that says nothing about what it removed leaves you unable to tell a
		term that narrowed the list from one that nearly emptied it.
	*/
	const listCount = makeElement({ className: 'dialog-picker__count' });

	/** @type {Array<Object>} */
	const entries = [];
	/** @type {Array<Object>} */
	const groups = [];

	UNICODE_PLANES.forEach((plane) => {
		const heading = makeElement({
			className: 'dialog-picklist__group',
			attributes: { role: 'presentation' },
		});
		heading.textContent = plane.label;
		list.appendChild(heading);

		const group = { heading: heading, entries: [] };
		groups.push(group);

		plane.blocks.forEach((block) => {
			const row = makeElement({
				tag: 'div',
				className: 'dialog-picklist__row',
				attributes: { role: 'option', 'aria-selected': 'false', tabindex: '-1' },
			});

			const name = makeElement({ tag: 'span', className: 'dialog-picklist__name' });
			name.textContent = block.name;

			const span = makeElement({ tag: 'span', className: 'dialog-picklist__span' });
			/* No spaces round the dash: this column has to hold 0x10FFFF at both
				ends and still leave the name room to be read. */
			span.textContent = `${decToHex(block.begin)}–${decToHex(block.end)}`;

			/*
				Already in the project, said on the row. It used to be said by a
				toast after you had picked the block, read the preview and
				pressed Add - three steps to find out the answer was no.
			*/
			const state = makeElement({ tag: 'span', className: 'dialog-picklist__state' });
			state.textContent = findCharacterRange(block) ? 'Added' : '';

			addAsChildren(row, [name, span, state]);
			row.addEventListener('click', () => selectBlock(block));
			list.appendChild(row);

			const entry = { block: block, row: row, state: state };
			entries.push(entry);
			group.entries.push(entry);
		});
	});

	addAsChildren(listColumn, [searchField, list, noMatches, listCount]);

	// --------------------------------------------------------------
	// Right: what is in the block you picked
	// --------------------------------------------------------------

	const previewColumn = makeElement({ className: 'dialog-picker__column' });

	const previewHead = makeElement({ className: 'dialog-picker__head' });
	const previewName = makeElement({ tag: 'span', className: 'dialog-picker__name' });
	const previewMeta = makeElement({ tag: 'span', className: 'dialog-picker__meta' });
	addAsChildren(previewHead, [previewName, previewMeta]);
	previewHead.hidden = true;

	/*
		The grid and the empty state share the column's scrolling row, so the
		message that stands in for the characters stands where they would.
	*/
	const previewBody = makeElement({
		className: 'dialog-picker__body',
		attributes: { role: 'group', 'aria-label': 'Characters in this block' },
	});
	const previewGrid = makeElement({ className: 'dialog-charwall' });

	const previewEmpty = makeElement({
		className: 'dialog-empty',
		content: 'Pick a block on the left to see what is in it.',
	});

	/*
		A block with nothing to draw, said in words.

		The Controls blocks are code points with no shape at all, so their
		preview was 32 empty squares - which is indistinguishable from a
		preview that failed to build. And the thing worth knowing about them is
		not what they look like: adding one turns on an app setting, which
		addCharacterRangeToCurrentProject does quietly. It says so here first.
	*/
	const previewControls = makeElement({
		className: 'dialog-empty',
		content:
			'Control codes have no visible shape.<br>Adding this block turns on <strong>Settings &rsaquo; App &rsaquo; Show non-graphic control characters</strong>, so the slots appear on the Characters page.',
	});
	previewControls.hidden = true;

	const previewNote = makeElement({ tag: 'span', className: 'dialog-picker__note' });
	previewNote.hidden = true;

	/*
		The app's tooltip rather than the browser's, and bound once to the grid
		rather than 256 times to the tiles inside it. The native `title` waits a
		second, draws itself in the operating system's language and sits over
		whatever is under it; every other hover label in this app is the one in
		controls/tooltip. It is also what makes the tile's hover state honest -
		a tile is not clickable, and the highlight is there to say which one is
		telling you its name.
	*/
	previewGrid.addEventListener('mouseover', (event) => {
		const tile = /** @type {HTMLElement} */ (event.target)?.closest?.('.dialog-charwall__tile');
		if (!(tile instanceof HTMLElement)) return;
		showTooltip(
			tile,
			tile.getAttribute('data-tip-name') || '',
			tile.getAttribute('data-tip-body') || ''
		);
	});
	previewGrid.addEventListener('mouseleave', hideTooltip);

	addAsChildren(previewBody, [previewGrid, previewControls, previewEmpty]);
	addAsChildren(previewColumn, [previewHead, previewBody, previewNote]);

	// --------------------------------------------------------------
	// The one action
	// --------------------------------------------------------------

	const addButton = makeElement({
		tag: 'fancy-button',
		content: 'Add range to project',
		attributes: { disabled: '' },
	});

	addButton.addEventListener('click', () => {
		if (!selectedBlock || findCharacterRange(selectedBlock)) return;
		addCharacterRangeToCurrentProject(selectedBlock);
		/*
			The dialog stays open. Adding three scripts to a project used to be
			three trips back through the Settings page to reopen this.
		*/
		entries.forEach((entry) => {
			entry.state.textContent = findCharacterRange(entry.block) ? 'Added' : '';
		});
		refreshAddButton();
	});

	const closeButton = makeElement({
		tag: 'fancy-button',
		attributes: { secondary: '' },
		content: 'Close',
		onClick: closeEveryTypeOfDialog,
	});

	function refreshAddButton() {
		const already = selectedBlock && findCharacterRange(selectedBlock);
		if (!selectedBlock || already) addButton.setAttribute('disabled', '');
		else addButton.removeAttribute('disabled');
		addButton.innerHTML = already ? 'Already in project' : 'Add range to project';
	}

	// --------------------------------------------------------------
	// Selecting, searching, and the keyboard between them
	// --------------------------------------------------------------

	/**
	 * @param {Object} block - the Unicode block to show
	 * @param {Boolean} moveFocus - whether the row should take focus
	 */
	function selectBlock(block, moveFocus = false) {
		selectedBlock = block;

		entries.forEach((entry) => {
			const on = entry.block === block;
			entry.row.setAttribute('aria-selected', `${on}`);
			entry.row.setAttribute('tabindex', on ? '0' : '-1');
			if (on && moveFocus) {
				/** @type {HTMLElement} */ (entry.row).focus();
				entry.row.scrollIntoView({ block: 'nearest' });
			}
		});

		const count = block.end - block.begin + 1;
		const shown = Math.min(count, PREVIEW_LIMIT);

		previewName.textContent = block.name;
		/* An en dash with air round it. The row in the list runs the same span
			together because its column is 104px; here there is room to set it
			properly, and the two should at least agree on the dash. */
		previewMeta.textContent = `${decToHex(block.begin)} – ${decToHex(
			block.end
		)} · ${count} character${count === 1 ? '' : 's'}`;
		previewHead.hidden = false;
		previewEmpty.hidden = true;

		const isControls = `${block.name}`.includes('Controls');
		previewControls.hidden = !isControls;
		previewGrid.hidden = isControls;

		previewGrid.innerHTML = '';
		if (!isControls) {
			for (let point = block.begin; point < block.begin + shown; point++) {
				const hexString = `${decToHex(point)}`;
				const tile = makeElement({
					className: 'dialog-charwall__tile',
					innerHTML: hexesToChars(hexString) || '',
				});
				/*
					Read by the grid's delegated hover handler, and carried as the
					accessible name too - the title that used to do both jobs is
					gone with the browser's tooltip.
				*/
				const characterName = getUnicodeName(hexString);
				tile.setAttribute('data-tip-name', hexString);
				tile.setAttribute('data-tip-body', characterName);
				tile.setAttribute('aria-label', `${hexString} ${characterName}`);
				previewGrid.appendChild(tile);
			}
		}

		/*
			Back to the top. The scroller belongs to the column rather than to
			the block in it, so picking Arabic after scrolling to the end of
			Cyrillic - both 256 characters, so both the same height - left you
			at the bottom of a block you had never seen the start of.
		*/
		previewBody.scrollTop = 0;
		hideTooltip();

		previewNote.textContent =
			count > shown && !isControls ? `Showing the first ${shown}. The block holds ${count}.` : '';
		previewNote.hidden = !previewNote.textContent;

		refreshAddButton();
	}

	/** Filters the list, and says what it did. */
	function runSearch() {
		const term = `${/** @type {HTMLInputElement} */ (searchInput).value}`.trim().toLowerCase();
		let shown = 0;

		entries.forEach((entry) => {
			const match =
				!term ||
				entry.block.name.toLowerCase().includes(term) ||
				`${decToHex(entry.block.begin)}`.toLowerCase().includes(term) ||
				`${decToHex(entry.block.end)}`.toLowerCase().includes(term);
			/** @type {HTMLElement} */ (entry.row).hidden = !match;
			if (match) shown++;
		});

		/* A plane heading with nothing under it is a heading for nothing. */
		groups.forEach((group) => {
			group.heading.hidden = !group.entries.some((entry) => !entry.row.hidden);
		});

		noMatches.hidden = shown > 0;
		list.hidden = shown === 0;
		clearSearch.hidden = !term;
		listCount.textContent = term
			? `${shown} of ${entries.length} blocks`
			: `${entries.length} blocks`;
	}

	searchInput.addEventListener('input', runSearch);

	searchInput.addEventListener('keydown', (event) => {
		/*
			Enter and ArrowDown both go to the first match. Enter is what you
			press after typing a search; it did nothing at all.
		*/
		if (event.key === 'ArrowDown' || event.key === 'Enter') {
			event.preventDefault();
			const first = entries.find((entry) => !entry.row.hidden);
			if (first) selectBlock(first.block, true);
			return;
		}

		/*
			Escape clears the search. It only stops here while there is
			something to clear, so an empty field passes the key on to whatever
			else wants it.

			Which today is nothing, on this page: the app's Escape-closes-every-
			dialog handler is attached to `document` by initEventHandlers, and
			that runs when an edit canvas is built - so on Settings, in a
			session that has not opened an editor page yet, Escape closes no
			dialog at all. That is app-wide and not this dialog's to fix.
		*/
		if (event.key === 'Escape' && /** @type {HTMLInputElement} */ (searchInput).value) {
			event.preventDefault();
			event.stopPropagation();
			/** @type {HTMLInputElement} */ (searchInput).value = '';
			runSearch();
		}
	});

	/*
		Roving tabindex, which is what a list of three hundred and seventy
		options needs: one tab stop, and the arrows move inside it. Every row
		as its own tab stop would put the preview, the Add button and the way
		out three hundred presses away.
	*/
	list.addEventListener('keydown', (event) => {
		const visible = entries.filter((entry) => !entry.row.hidden);
		if (!visible.length) return;

		const current = visible.findIndex((entry) => entry.block === selectedBlock);
		let next;

		if (event.key === 'ArrowDown') next = Math.min(current + 1, visible.length - 1);
		else if (event.key === 'ArrowUp') next = Math.max(current - 1, 0);
		else if (event.key === 'Home') next = 0;
		else if (event.key === 'End') next = visible.length - 1;
		else if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			if (!addButton.hasAttribute('disabled')) /** @type {HTMLElement} */ (addButton).click();
			return;
		} else return;

		event.preventDefault();
		selectBlock(visible[Math.max(next, 0)].block, true);
	});

	// --------------------------------------------------------------

	addAsChildren(content, [listColumn, previewColumn]);

	runSearch();

	showModalDialog(content, 900, {
		title: 'Add character ranges from Unicode',
		subtitle: 'Every block in the standard. Pick one to see what is in it.',
		actions: [closeButton, addButton],
	});

	/*
		Typing is the first thing you do to three hundred and seventy blocks, so
		the caret is already there. showModalDialog appends synchronously, so
		the field is in the document by now - focus() on a detached node does
		nothing and says nothing.
	*/
	/** @type {HTMLElement} */ (searchInput).focus();
}

export function addCharacterRangeToCurrentProject(range, successCallback, showNotification = true) {
	// log(`addCharacterRangeToCurrentProject`, 'start');
	// log(`\n⮟range⮟`);
	// log(range);
	// log(`showNotification: ${showNotification}`);
	const searchResult = findCharacterRange(range);
	if (!searchResult) {
		const project = getCurrentProject();
		let ranges = project.settings.project.characterRanges;
		const newRange = new CharacterRange(range);
		ranges.push(newRange);

		if (newRange.name.includes('Controls')) {
			project.settings.app.showNonCharPoints = true;
			// log(`clearing new range`);
			newRange.cachedArray = false;
		}
		if (showNotification) showToast(`Enabled character range:<br>${range.name}`);
		project.updateCharacterRangeCount(newRange);
		sortCharacterRanges();
		updateRangesTables();
		if (successCallback) successCallback();
	} else {
		searchResult.enabled = true;
		if (showNotification) showToast(`Glyph range is already enabled for your project.`);
	}
	// log(`addCharacterRangeToCurrentProject`, 'end');
}

export function updateAllCharacterRangeCounts() {
	const project = getCurrentProject();
	const ranges = project.settings.project.characterRanges;
	ranges.forEach((range) => project.updateCharacterRangeCount(range));
}

export function findCharacterRange(range, ranges) {
	if (!ranges) ranges = getCurrentProject().settings.project.characterRanges;

	for (let r = 0; r < ranges.length; r++) {
		if (ranges[r].begin === range.begin && ranges[r].end === range.end) return ranges[r];
	}

	return false;
}

export function areCharacterRangesEqual(range1, range2) {
	// log(`areCharacterRangesEqual`, 'start');
	// log(`range1: ${json(range1)}`);
	// log(`range2: ${json(range2)}`);

	const result =
		parseInt(range1.begin) === parseInt(range2.begin) &&
		parseInt(range1.end) === parseInt(range2.end);
	// log(`result: ${result}`);

	// log(`areCharacterRangesEqual`, 'end');
	return result;
}
