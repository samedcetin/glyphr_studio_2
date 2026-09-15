import { PRODUCT_NAME } from '../app/brand.js';
import { getCurrentProject, getCurrentProjectEditor } from '../app/main.js';
import { decToHex, hexesToChars } from '../common/character_ids.js';
import { addAsChildren, makeElement, textToNode } from '../common/dom.js';
import { remove } from '../common/functions.js';
import {
	closeEveryTypeOfDialog,
	showError,
	showModalDialog,
	showToast,
} from '../controls/dialogs/dialogs.js';
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
	} else {
		if (manageDialogs) {
			closeEveryTypeOfDialog();
			showToast(`Something went wrong with removing this character range.`);
		}
	}
}

function showDeleteCharacterRangeDialog(range) {
	const wrapper = makeElement({
		id: 'delete-character-range__wrapper',
		innerHTML: '<h1>Delete character range</h1>',
	});

	const deleteData = findCharactersToDelete(range);

	const rangeBlurb = `
	<p>
		Character ranges are a simple grouping mechanism with beginning and end points.
		They are useful to group characters with IDs that fall within that range.
		Character ranges can be created before actual character objects exist within that range.
		Alternately, character ranges can be created that overlap other character ranges.
		<br><br>
		When deleting a character range, you will have two options:
	</p>
	`;

	// Checkbox grid
	const checkboxes = makeElement({
		tag: 'div',
		className: 'character-range-delete__checkboxes',
	});

	addAsChildren(checkboxes, [
		makeDirectCheckbox(characterRangeDeleteOptions, 'removeRange', updateDeleteButtonText),
		textToNode('<label>Remove character range</label'),
		textToNode('<span></span>'),
		textToNode(
			'<p>Data for this character range (name, begin, end) will be removed from the project.</p>'
		),
		textToNode('<span></span>'),
		makeElement({
			tag: 'div',
			className: 'character-range-delete__preview-area',
			content: `
				&quot;${range.name}&quot;&emsp;
				<code>${decToHex(range.begin)}</code>
				through
				<code>${decToHex(range.end)}</code>`,
		}),
		textToNode('<span>&nbsp;</span>'),
		textToNode('<span>&nbsp;</span>'),
		makeDirectCheckbox(characterRangeDeleteOptions, 'deleteCharacters', updateDeleteButtonText),
		textToNode('<label>Delete characters</label>'),
		textToNode('<span></span>'),
		textToNode(
			'<p>Characters with IDs that fall within this range will have their project data deleted.</p>'
		),
		textToNode('<span></span>'),
		makeElement({
			tag: 'div',
			className: 'character-range-delete__preview-area',
			content: `${deleteData.map((id) => `<code>glyph-${id}</code>`).join('')}`,
		}),
		textToNode('<span>&nbsp;</span>'),
		textToNode('<span>&nbsp;</span>'),
	]);

	// Footer buttons
	const buttonBar = makeElement({ className: 'glyph-range-editor__footer' });

	const buttonSave = makeElement({
		tag: 'fancy-button',
		id: 'character-range-delete__button',
		innerHTML: 'Delete selected items',
		attributes: { danger: '' },
		onClick: () => deleteCharactersFromRange(range, deleteData),
	});

	const buttonCancel = makeElement({
		tag: 'fancy-button',
		attributes: { secondary: '' },
		innerHTML: 'Cancel',
		onClick: closeEveryTypeOfDialog,
	});

	addAsChildren(buttonBar, [
		buttonSave,
		buttonCancel,
		makeElement({
			className: 'delete-note',
			content: `<span class="info-icon">i</span>Don't worry, this action can be undone`,
		}),
		textToNode(`<span></span>`),
	]);

	// Put it all together
	addAsChildren(wrapper, [textToNode(rangeBlurb), checkboxes, buttonBar]);

	showModalDialog(wrapper);
}

const characterRangeDeleteOptions = {
	removeRange: true,
	deleteCharacters: false,
};

function updateDeleteButtonText() {
	const button = document.querySelector('#character-range-delete__button');
	if (characterRangeDeleteOptions.removeRange || characterRangeDeleteOptions.deleteCharacters) {
		button.removeAttribute('disabled');
		button.addEventListener('click', deleteCharactersFromRange);
	} else {
		button.setAttribute('disabled', '');
		button.removeEventListener('click', deleteCharactersFromRange);
	}
}

function findCharactersToDelete(range) {
	const result = [];
	const project = getCurrentProject();

	const ids = range.getMemberIDs();
	range.count = 0;
	ids.forEach((id) => {
		if (project.glyphs[`glyph-${id}`]) result.push(id);
	});

	return result;
}

function deleteCharactersFromRange(range, deleteList = []) {
	// log(`deleteCharactersFromRange`, 'start');
	// log(`\n⮟deleteList⮟`);
	// log(deleteList);
	const removeInfo = characterRangeDeleteOptions.removeRange;
	const removeChars = characterRangeDeleteOptions.deleteCharacters;
	const editor = getCurrentProjectEditor();
	const name = range.name;

	if (removeChars && deleteList.length) {
		const message = `Deleted ${deleteList.length} characters and removed character range: ${name}`;
		editor.history.addWholeProjectChangePreState(message);
		deleteList.forEach((id) => {
			const item = editor.project.getItem(`glyph-${id}`);
			resolveItemLinks(item, true);
			delete editor.project.glyphs[`glyph-${id}`];
		});
		editor.history.addWholeProjectChangePostState();
		editor.project.updateAllCharacterRangeCounts();
		updateRangesTables();
		closeEveryTypeOfDialog();
		showToast(message);
	}

	if (removeInfo) {
		removeCharacterRange(range, removeInfo && !removeChars);
	}

	// log(`deleteCharactersFromRange`, 'end');
}

// --------------------------------------------------------------
// Edit Range or Add Custom Range
// --------------------------------------------------------------
function showEditCharacterRangeDialog(range = false) {
	// log(`showEditCharacterRangeDialog`, 'start');
	// log(`\n⮟range⮟`);
	// log(range);
	const unicodeHelp = `
		Start and End inputs are Unicode or number IDs for the characters on each end of the range. ${PRODUCT_NAME} accepts three flavors of this ID number:<br>
		<ul>
			<li><b>Unicode Number</b> - a base-16 number with a U+&nbsp;prefix. For example, <code>U+4E</code> corresponds to Capital&nbsp;N.</li>
			<li><b>Hexadecimal Number</b> - a base-16 number with a 0x&nbsp;prefix. For example, <code>0x4E</code> corresponds to Capital&nbsp;N.</li>
			<li><b>Decimal Number</b> - a base-10 number. For example, <code>78</code> corresponds to Capital&nbsp;N.</li>
		</ul>
	`;

	const rangeNote = !range
		? '<span></span>'
		: `
	<p>
		Note: All characters must have at least one parent character range.
		If you edit a range to be smaller, a new hidden character range may be created to
		contain orphaned characters.
	</p>
	`;

	const content = makeElement({
		className: 'glyph-range-editor__wrapper',
		innerHTML: `
			<h1>${range ? 'Edit' : 'Add'} character range</h1>
		`,
	});

	const inputName = makeElement({
		tag: 'input',
		id: 'glyph-range-editor__name',
		attributes: { type: 'text' },
	});
	inputName.addEventListener('change', (event) => {
		// @ts-expect-error 'property does exist'
		event.target.value = sanitizeUnicodeInput(event.target.value);
	});

	const inputBegin = makeElement({
		tag: 'input',
		id: 'glyph-range-editor__begin',
		attributes: { type: 'text' },
	});
	inputBegin.addEventListener('change', (event) => {
		// @ts-expect-error 'property does exist'
		event.target.value = sanitizeUnicodeInput(event.target.value);
	});

	const inputEnd = makeElement({
		tag: 'input',
		id: 'glyph-range-editor__end',
		attributes: { type: 'text' },
	});
	inputEnd.addEventListener('change', (event) => {
		// @ts-expect-error 'property does exist'
		event.target.value = sanitizeUnicodeInput(event.target.value);
	});

	if (range) {
		// @ts-expect-error 'property does exist'
		inputName.value = range.name;
		// @ts-expect-error 'property does exist'
		inputBegin.value = '' + decToHex(range.begin);
		// @ts-expect-error 'property does exist'
		inputEnd.value = '' + decToHex(range.end);
	}

	const buttonBar = makeElement({ className: 'glyph-range-editor__footer' });

	const buttonSave = makeElement({
		tag: 'fancy-button',
		innerHTML: 'Save',
		onClick: () => validateAndSaveCharacterRange(range),
	});

	const buttonCancel = makeElement({
		tag: 'fancy-button',
		attributes: { secondary: '' },
		innerHTML: 'Cancel',
		onClick: closeEveryTypeOfDialog,
	});

	addAsChildren(buttonBar, [buttonSave, buttonCancel, textToNode('<span></span><span></span>')]);

	addAsChildren(content, [
		textToNode('<label>Range name</label>'),
		textToNode('<span></span>'),
		inputName,
		textToNode('<label>Start</label>'),
		makeElement({ tag: 'info-bubble', innerHTML: unicodeHelp }),
		inputBegin,
		textToNode('<label>End</label>'),
		makeElement({ tag: 'info-bubble', innerHTML: unicodeHelp }),
		inputEnd,
		textToNode(rangeNote),
		buttonBar,
	]);

	showModalDialog(content, 500);

	// log(`showEditCharacterRangeDialog`, 'end');
}

function validateAndSaveCharacterRange(range) {
	// log(`validateAndSaveCharacterRange`, 'start');
	// log(`\n⮟range⮟`);
	// log(range);

	/** @type {HTMLInputElement} */
	const newNameInput = document.querySelector('#glyph-range-editor__name');
	let newName = newNameInput.value;

	/** @type {HTMLInputElement} */
	const newBeginInput = document.querySelector('#glyph-range-editor__begin');
	let newBegin = parseInt(newBeginInput.value);

	/** @type {HTMLInputElement} */
	const newEndInput = document.querySelector('#glyph-range-editor__end');
	let newEnd = parseInt(newEndInput.value);

	if (isNaN(newBegin)) {
		showError(`Start must be a number, a Unicode code point, or a Hexadecimal number.`);
		return;
	} else if (isNaN(newEnd)) {
		showError(`End must be a number, a Unicode code point, or a Hexadecimal number.`);
		return;
	} else if (newName === '') {
		showError(`Name must not be blank.`);
		return;
	}

	if (newBegin > newEnd) {
		let temp = newEnd;
		newEnd = newBegin;
		newBegin = temp;
	}

	const checkForOrphans = range && (newBegin > range.begin || newEnd < range.end);

	// Make the update
	if (range) {
		range.begin = newBegin;
		range.end = newEnd;
		range.name = newName;
		showToast(`Saved changes to character range:<br>${range.name}`);
	} else {
		addCharacterRangeToCurrentProject(
			{
				begin: newBegin,
				end: newEnd,
				name: newName,
			},
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
	// log(`validateAndSaveCharacterRange`, 'end');
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
	const previewBody = makeElement({ className: 'dialog-picker__body' });
	const previewGrid = makeElement({ className: 'dialog-picker__grid' });

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
		const tile = /** @type {HTMLElement} */ (event.target)?.closest?.('.dialog-picker__tile');
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
					className: 'dialog-picker__tile',
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
