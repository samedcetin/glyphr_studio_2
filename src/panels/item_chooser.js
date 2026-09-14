import { getCurrentProject, getCurrentProjectEditor } from '../app/main.js';
import { addAsChildren, makeElement } from '../common/dom.js';
import { countItems } from '../common/functions.js';
import { GlyphTile } from '../controls/glyph-tile/glyph_tile.js';
import { showAddComponentDialog } from '../pages/components.js';
import { makeKernGroupCharChips, showAddEditKernGroupDialog } from '../pages/kerning.js';
import { showAddLigatureDialog } from '../pages/ligatures.js';

// --------------------------------------------------------------
// Chooser panels
// --------------------------------------------------------------

let savedClickHandler;
let savedRegisterSubscriptions;
/*
	Which size of tile this chooser is currently building, remembered the same
	way the click handler is and for the same reason: changing range rebuilds
	the grid from inside this module, with nothing of the caller's in hand.
	See the `compact` and `large` blocks in glyph-tile.css.
*/
let savedTileSize = '';

/**
 * How many characters are in the range on screen, and how many of them are
 * drawn.
 *
 * The first half answers "is this all of them", which a grid that scrolls
 * cannot. The second half is the one number a font in progress is actually
 * measured by, and it is not written anywhere else in the app - you could
 * only get it by scrolling the grid and counting the empty tiles.
 *
 * @param {Object} editor - project editor
 * @returns {String}
 */
export function rangeCountText(editor = getCurrentProjectEditor()) {
	const ids = editor.selectedCharacterRange?.getMemberIDs?.() || [];
	const total = ids.length;
	if (!total) return '';

	const glyphs = editor.project.glyphs;
	const drawn = ids.filter((id) => glyphs[`glyph-${id}`]?.shapes?.length).length;

	return `${total} character${total === 1 ? '' : 's'} · ${drawn} drawn`;
}

export function makeAllItemTypeChooserContent(
	clickHandler,
	itemType = '',
	editor = getCurrentProjectEditor(),
	tileSize = ''
) {
	// log(`makeAllItemTypeChooserContent`, 'start');
	// log(`Project Name: ${editor.project.settings.project.name}`);
	savedClickHandler = clickHandler;
	savedRegisterSubscriptions = true;
	savedTileSize = tileSize;

	let wrapper = makeElement({ tag: 'div', className: 'item-chooser__wrapper' });
	let header = makeElement({ tag: 'div', className: 'item-chooser__header' });
	header.appendChild(makeRangeAndItemTypeChooser(editor, itemType));
	/*
		The same count the breadcrumb's dropdown carries. It was only in the
		compact one, which is the smaller of the two places you need it: the
		dropdown shows a range in a box you can see the end of, and the page
		shows it in a grid that runs off the bottom of the screen.
	*/
	header.appendChild(
		makeElement({ className: 'item-chooser__count', content: rangeCountText(editor) })
	);
	wrapper.appendChild(header);

	let show = itemType || editor.nav.page;
	if (show === 'Ligatures' && countItems(editor.project.ligatures) > 0) {
		// Ligature Chooser
		wrapper.appendChild(makeLigatureChooserTileGrid(editor));
	} else if (show === 'Components' && countItems(editor.project.components) > 0) {
		// Component Chooser
		wrapper.appendChild(makeComponentChooserTileGrid(editor));
	} else {
		// Overview and Character = Character Chooser
		wrapper.appendChild(makeCharacterChooserTileGrid(editor));
	}

	// log(`makeAllItemTypeChooserContent`, 'end');
	return wrapper;
}

export function makeSingleItemTypeChooserContent(itemPageName, clickHandler) {
	// log(`makeSingleItemTypeChooserContent`, 'start');
	savedClickHandler = clickHandler;
	savedRegisterSubscriptions = true;
	savedTileSize = '';
	let wrapper = makeElement({ tag: 'div', className: 'item-chooser__wrapper' });

	if (itemPageName === 'Ligatures') {
		// Ligature Chooser
		wrapper.appendChild(makeLigatureChooserTileGrid());
		wrapper.appendChild(
			makeElement({
				tag: 'fancy-button',
				innerHTML: 'Create a new ligature',
				attributes: { secondary: '' },
				onClick: showAddLigatureDialog,
			})
		);
	} else if (itemPageName === 'Components') {
		// Component Chooser
		wrapper.appendChild(makeComponentChooserTileGrid());
		wrapper.appendChild(
			makeElement({
				tag: 'fancy-button',
				innerHTML: 'Create a new component',
				attributes: { secondary: '' },
				onClick: showAddComponentDialog,
			})
		);
	} else if (itemPageName === 'Kerning') {
		/*
			The same three-row shell the character chooser uses: a header, the
			list, and one action at the foot, spaced by the wrapper rather than
			by each part carrying its own margin. It was the uncompacted
			wrapper before - 20px of padding, a 20px header inset, 20 under the
			list and 10 more on the button, four numbers for one rhythm.
		*/
		wrapper.classList.add('item-chooser__wrapper--compact');
		wrapper.appendChild(makeKernSortControl());
		wrapper.appendChild(makeKernGroupChooserList());
		const kernFooter = makeElement({ className: 'item-chooser__footer' });
		kernFooter.appendChild(
			makeElement({
				tag: 'fancy-button',
				innerHTML: 'Create a new kern group',
				attributes: { secondary: '' },
				onClick: () => showAddEditKernGroupDialog(false),
			})
		);
		wrapper.appendChild(kernFooter);
	} else {
		/*
			Character chooser, as it appears in the breadcrumb's dropdown.

			It used to be the Characters page at 80% of the window - 1300px by
			530 to pick one letter - with no way to find anything in it other
			than reading. Ctrl+K already searches every character by name, by
			the character itself and by its id, so searching is not this
			control's job. Browsing is: seeing which glyphs are drawn and which
			are still empty, and stepping to a neighbour. So it is sized to its
			grid, the tiles are the letterforms and nothing else, and the way to
			the search is written at the bottom.
		*/
		wrapper.classList.add('item-chooser__wrapper--compact');
		const editor = getCurrentProjectEditor();

		const header = makeElement({ tag: 'div', className: 'item-chooser__header' });
		header.appendChild(makeRangeChooser());
		header.appendChild(
			makeElement({ className: 'item-chooser__count', content: rangeCountText(editor) })
		);
		wrapper.appendChild(header);
		wrapper.appendChild(makeCharacterChooserTileGrid(editor, true));
		wrapper.appendChild(
			makeElement({
				className: 'item-chooser__footer',
				innerHTML: `Somewhere else? Search every character with <code>Ctrl</code><code>K</code>`,
			})
		);
	}

	// log(`makeSingleItemTypeChooserContent`, 'end');
	return wrapper;
}

export function makeRangeAndItemTypeChooser(editor = getCurrentProjectEditor(), rangeName = '') {
	// log(`makeRangeAndItemTypeChooser`, 'start');
	// log(`Project Name: ${editor.project.settings.project.name}`);

	let componentCount = countItems(editor.project.components);
	let ligatureCount = countItems(editor.project.ligatures);

	let selectedRange;
	if (rangeName === 'Components' && componentCount > 0) {
		selectedRange = {
			name: 'Components',
			id: `Components ${componentCount}&nbsp;items`,
		};
	} else if (rangeName === 'Ligatures' && ligatureCount > 0) {
		selectedRange = {
			name: 'Ligatures',
			id: `Ligatures ${ligatureCount}&nbsp;items`,
		};
	} else {
		selectedRange = editor.selectedCharacterRange;
	}
	// log(selectedRange);

	let optionChooser = makeElement({
		tag: 'option-chooser',
		attributes: {
			'selected-name': selectedRange.name,
			'selected-id': selectedRange.id,
		},
	});
	let option;

	if (ligatureCount) {
		// log(`range.name: Ligatures`);
		option = makeElement({
			tag: 'option',
			innerHTML: 'Ligatures',
			attributes: { note: `${ligatureCount}&nbsp;items` },
		});

		option.addEventListener('click', () => {
			editor.selectedCharacterRange = 'Ligatures';
			let tileGrid = document.querySelector('.item-chooser__tile-grid');
			tileGrid.remove();
			let wrapper = document.querySelector('.item-chooser__wrapper');
			wrapper.appendChild(makeLigatureChooserTileGrid(editor));
		});

		optionChooser.appendChild(option);
	}

	if (componentCount) {
		// log(`range.name: Components`);
		option = makeElement({
			tag: 'option',
			innerHTML: 'Components',
			attributes: { note: `${componentCount}&nbsp;items` },
		});

		option.addEventListener('click', () => {
			editor.selectedCharacterRange = 'Components';
			let tileGrid = document.querySelector('.item-chooser__tile-grid');
			tileGrid.remove();
			let wrapper = document.querySelector('.item-chooser__wrapper');
			wrapper.appendChild(makeComponentChooserTileGrid(editor));
		});

		optionChooser.appendChild(option);
	}

	if (ligatureCount || componentCount) optionChooser.appendChild(makeElement({ tag: 'hr' }));

	addRangeOptionsToOptionChooser(optionChooser, editor);

	// log(`makeRangeAndItemTypeChooser`, 'end');
	return optionChooser;
}

function makeRangeChooser(editor = getCurrentProjectEditor()) {
	let selectedRange = editor.selectedCharacterRange;
	// log(selectedRange);
	let optionChooser = makeElement({
		tag: 'option-chooser',
		attributes: {
			'selected-name': selectedRange.name,
			'selected-id': selectedRange.id,
		},
	});

	addRangeOptionsToOptionChooser(optionChooser);

	return optionChooser;
}

function addRangeOptionsToOptionChooser(optionChooser, editor = getCurrentProjectEditor()) {
	// log(`addRangeOptionsToOptionChooser`, 'start');
	// log(`Project Name: ${editor.project.settings.project.name}`);

	let ranges = editor.project.settings.project.characterRanges;
	let option;
	ranges.forEach((range) => {
		if (range.enabled) {
			// log(`range.name: ${range.name}`);

			option = makeElement({
				tag: 'option',
				innerHTML: range.name,
				attributes: { note: range.note },
			});

			option.addEventListener('click', () => {
				// log(`OPTION.click - range: ${range.name}`);
				editor.selectedCharacterRange = range;
				editor.chooserPage.characters = 0;

				/*
					Replaced where it stood, not appended.

					It used to remove the grid and append a fresh one to the end
					of the wrapper - which was harmless while the wrapper held
					nothing else, and put the grid below the footer the moment
					one existed. The new grid also arrived without the compact
					flag, so changing range in the breadcrumb's dropdown turned
					every tile back into the full 52 by 75 one.
				*/
				const wrapper = document.querySelector('.item-chooser__wrapper');
				const tileGrid = wrapper?.querySelector('.item-chooser__tile-grid');
				if (!wrapper || !tileGrid) return;

				const isCompact = wrapper.classList.contains('item-chooser__wrapper--compact');
				tileGrid.replaceWith(makeCharacterChooserTileGrid(editor, isCompact));

				// The count belongs to the range, so it changes with it.
				const count = wrapper.querySelector('.item-chooser__count');
				if (count) count.textContent = rangeCountText(editor);
			});

			optionChooser.appendChild(option);
		}
	});
	// log(`addRangeOptionsToOptionChooser`, 'end');
}

function makeCharacterChooserTileGrid(editor = getCurrentProjectEditor(), compact = false) {
	// log(`makeCharacterChooserTileGrid`, 'start');
	// console.time('makeCharacterChooserTileGrid');
	// log(`Project Name: ${editor.project.settings.project.name}`);
	// log(editor.project.settings.project.characterRanges);
	// log(editor.selectedCharacterRange);

	const isPrimaryProject = editor === getCurrentProjectEditor();
	let tileGrid = makeElement({ tag: 'div', className: 'item-chooser__tile-grid' });
	let rangeArray = editor.selectedCharacterRange.getMemberIDs();

	if (rangeArray?.length) {
		const pagedCharacters = getItemsFromPage(rangeArray, editor.chooserPage.characters, editor);
		if (rangeArray.length > pagedCharacters.length) {
			tileGrid.appendChild(makePageControl('characters', rangeArray, editor));
		}
		pagedCharacters.forEach((charID) => {
			const glyphID = `glyph-${charID}`;
			// log(`glyphID: ${glyphID}`);
			let oneTile = new GlyphTile({ 'displayed-item-id': glyphID, project: editor.project });
			// In the breadcrumb's dropdown the tile is the letterform and nothing
			// else; on the Overview page it is as large as the page can give it.
			// See :host([compact]) and :host([large]) in glyph-tile.css.
			if (compact) oneTile.setAttribute('compact', '');
			else if (savedTileSize) oneTile.setAttribute(savedTileSize, '');
			if (isPrimaryProject && editor.selectedGlyphID === glyphID) {
				oneTile.setAttribute('selected', '');
			}

			oneTile.addEventListener('click', () => savedClickHandler(glyphID));

			if (savedRegisterSubscriptions) {
				editor.subscribe({
					topic: 'whichGlyphIsSelected',
					subscriberID: `glyphTile.${glyphID}`,
					callback: (newGlyphID) => {
						// log('whichGlyphIsSelected subscriber callback');
						// log(`checking if ${newGlyphID} === ${glyphID}`);
						if (parseInt(newGlyphID) === parseInt(glyphID)) {
							// log(`Callback: setting ${oneTile.getAttribute('glyph')} attribute to selected`);
							if (isPrimaryProject) oneTile.setAttribute('selected', '');
						} else {
							// log(`Callback: removing ${oneTile.getAttribute('glyph')} attribute selected`);
							oneTile.removeAttribute('selected');
						}
					},
				});
			}
			tileGrid.appendChild(oneTile);
		});
	} else {
		tileGrid.appendChild(
			makeElement({
				tag: 'i',
				content: `No characters in this range.<br><br>If this is a range of Control Characters, make sure they are enabled in: Settings > App > Show non-graphic control characters.`,
			})
		);
	}

	// console.timeEnd('makeCharacterChooserTileGrid');
	// log(`makeCharacterChooserTileGrid`, 'end');
	return tileGrid;
}

function makeLigatureChooserTileGrid(editor = getCurrentProjectEditor(), showSelected = true) {
	// log(`makeLigatureChooserTileGrid`, 'start');

	const tileGrid = makeElement({ tag: 'div', className: 'item-chooser__tile-grid' });
	const sortedLigatures = editor.project.sortedLigatures;
	const pagedLigatures = getItemsFromPage(sortedLigatures, editor.chooserPage.ligatures, editor);

	if (sortedLigatures.length > pagedLigatures.length) {
		tileGrid.appendChild(makePageControl('ligatures', sortedLigatures, editor));
	}

	pagedLigatures.forEach((ligature) => {
		let oneTile = new GlyphTile({ 'displayed-item-id': ligature.id, project: editor.project });
		if (showSelected && editor.selectedLigatureID === ligature.id) {
			oneTile.setAttribute('selected', '');
		}

		oneTile.addEventListener('click', () => savedClickHandler(ligature.id));

		if (savedRegisterSubscriptions) {
			editor.subscribe({
				topic: 'whichLigatureIsSelected',
				subscriberID: `glyphTile.${ligature.id}`,
				callback: (newLigatureID) => {
					// log('whichLigatureIsSelected subscriber callback');
					// log(`checking if ${glyph.id} === ${ligature}`);
					if (newLigatureID === ligature.id) {
						// log(`Callback: setting ${oneTile.getAttribute('glyph')} attribute to selected`);
						if (showSelected) oneTile.setAttribute('selected', '');
					} else {
						// log(`Callback: removing ${oneTile.getAttribute('glyph')} attribute selected`);
						oneTile.removeAttribute('selected');
					}
				},
			});
		}

		tileGrid.appendChild(oneTile);
	});

	// log(`makeLigatureChooserTileGrid`, 'end');
	return tileGrid;
}

function makeComponentChooserTileGrid(editor = getCurrentProjectEditor(), showSelected = true) {
	// log(`makeComponentChooserTileGrid`, 'start');

	let tileGrid = makeElement({ tag: 'div', className: 'item-chooser__tile-grid' });
	const sortedComponents = editor.project.sortedComponents;
	const pagedComponents = getItemsFromPage(sortedComponents, editor.chooserPage.components, editor);

	if (sortedComponents.length > pagedComponents.length) {
		tileGrid.appendChild(makePageControl('components', sortedComponents, editor));
	}

	pagedComponents.forEach((component) => {
		let oneTile = new GlyphTile({ 'displayed-item-id': component.id, project: editor.project });
		if (showSelected && editor.selectedComponentID === component.id) {
			oneTile.setAttribute('selected', '');
		}

		oneTile.addEventListener('click', () => savedClickHandler(component.id));

		if (savedRegisterSubscriptions) {
			editor.subscribe({
				topic: 'whichComponentIsSelected',
				subscriberID: `glyphTile.${component.id}`,
				callback: (newComponentID) => {
					// log('whichComponentIsSelected subscriber callback');
					// log(`checking if ${glyph.id} === ${Component}`);
					if (newComponentID === component.id) {
						// log(`Callback: setting ${oneTile.getAttribute('glyph')} attribute to selected`);
						if (showSelected) oneTile.setAttribute('selected', '');
					} else {
						// log(`Callback: removing ${oneTile.getAttribute('glyph')} attribute selected`);
						oneTile.removeAttribute('selected');
					}
				},
			});
		}

		tileGrid.appendChild(oneTile);
	});

	// log(`makeComponentChooserTileGrid`, 'end');
	return tileGrid;
}

// --------------------------------------------------------------
// Kern Group Sort Control
// --------------------------------------------------------------

function makeKernSortControl() {
	const editor = getCurrentProjectEditor();
	const sortBy = editor.kernGroupListSortBy || 'ID';
	const count = countItems(editor.project.kerning);
	const sortControl = makeElement({
		tag: 'div',
		className: 'item-chooser__header',
		innerHTML: `
		<option-chooser id="kern-group-chooser__sort-control" selected-id="${sortBy}" selected-name="${sortBy}" selected-prefix="Sort by:">
			<option>ID</option>
			<option selected>Left Group</option>
			<option>Right Group</option>
		</option-chooser>
		<span class="item-chooser__count">${count} group${count === 1 ? '' : 's'}</span>`,
	});

	sortControl.addEventListener('click', () => {
		log(`sortControl CLICK`, 'start');
		const newSelection = document
			.getElementById('kern-group-chooser__sort-control')
			.getAttribute('selected-id');
		log(`newSelection: ${newSelection}`);
		getCurrentProjectEditor().kernGroupListSortBy = newSelection;
		updateKernGroupChooserList();
		log(`sortControl CLICK`, 'end');
	});

	return sortControl;
}

function updateKernGroupChooserList() {
	log(`updateKernGroupChooserList`, 'start');
	const list = document.querySelector('.kern-group-chooser__list');
	list.innerHTML = '';
	list.appendChild(makeKernGroupChooserList());
	log(`updateKernGroupChooserList`, 'end');
}

// --------------------------------------------------------------
// Kern Group Chooser List
// --------------------------------------------------------------

function makeKernGroupChooserList(editor = getCurrentProjectEditor()) {
	// log(`makeKernGroupChooserList`, 'start');

	let kernGroupRows = makeElement({ tag: 'div', className: 'kern-group-chooser__list' });
	const sortedKernGroups = editor.project.getSortedKernGroups(editor.kernGroupListSortBy);
	// log(`\n⮟sortedKernGroups⮟`);
	// log(sortedKernGroups);
	const pagedComponents = getItemsFromPage(sortedKernGroups, editor.chooserPage.kerning, editor);

	// log(`\n⮟pagedComponents⮟`);
	// log(pagedComponents);

	if (sortedKernGroups.length > pagedComponents.length) {
		kernGroupRows.appendChild(makePageControl('kerning', sortedKernGroups, editor));
	}

	pagedComponents.forEach((kernGroup) => {
		// log(kernGroup);
		let oneRow = makeOneKernGroupRow(kernGroup.id);
		if (editor.selectedKernGroupID === kernGroup.id) oneRow.setAttribute('selected', '');

		oneRow.addEventListener('click', () => savedClickHandler(kernGroup.id));

		if (savedRegisterSubscriptions) {
			editor.subscribe({
				topic: 'whichKernGroupIsSelected',
				subscriberID: `kernGroupRow.${kernGroup.id}`,
				callback: (newKernGroupID) => {
					// log('whichKernGroupIsSelected subscriber callback');
					if (newKernGroupID === kernGroup.id) {
						oneRow.setAttribute('selected', '');
					} else {
						oneRow.removeAttribute('selected');
					}
				},
			});
		}

		kernGroupRows.appendChild(oneRow);
	});

	// log(`makeKernGroupChooserList`, 'end');
	return kernGroupRows;
}

export function makeOneKernGroupRow(kernID, project = getCurrentProject()) {
	// log(`makeOneKernGroupRow`, 'start');
	// log(`kernID: ${kernID}`);

	const kernGroup = project.getItem(kernID);
	// log(`\n⮟kernGroup⮟`);
	// log(kernGroup);
	const rowWrapper = makeElement({ className: 'kern-group-chooser__row' });
	const leftMembers = makeElement({
		className: 'kern-group-chooser__left-members',
	});
	leftMembers.appendChild(makeKernGroupCharChips(kernGroup.leftGroupSorted));
	const rightMembers = makeElement({
		className: 'kern-group-chooser__right-members',
	});
	rightMembers.appendChild(makeKernGroupCharChips(kernGroup.rightGroupSorted));

	/*
		A hairline, not `&emsp;|&emsp;`. The divider used to be a pipe
		between two em spaces, so it was as wide as whatever font happened
		to render it - measured at 28.69px - and it sat in a content-sized
		column, which put it at a different x on every row. The two sides of
		a kern pair mirror each other; they can only read that way if the
		line between them holds still.
	*/
	const divider = makeElement({ className: 'kern-group-chooser__members-divider' });

	/*
		The value. It is what the group does, and the list left it out - so
		picking between two groups meant opening each one to find out which
		was the tight one.
	*/
	const value = makeElement({ className: 'kern-group-chooser__value' });
	value.textContent = `${kernGroup.value}`;

	const id = makeElement({ className: 'kern-group-chooser__id' });
	id.textContent = kernID;

	addAsChildren(rowWrapper, [id, leftMembers, divider, rightMembers, value]);

	// log(rowWrapper);
	// log(`makeOneKernGroupRow`, 'end');
	return rowWrapper;
}

// --------------------------------------------------------------
// Paging
// --------------------------------------------------------------

function getItemsFromPage(itemsArray = [], pageNumber = 0, editor = getCurrentProjectEditor()) {
	const pageSize = parseInt(editor.project.settings.app.itemChooserPageSize) || 256;
	if (itemsArray.length < pageSize) return itemsArray;
	const startIndex = pageNumber * pageSize;
	const endIndex = startIndex + pageSize;
	let resultArray = itemsArray.slice(startIndex, endIndex);
	return resultArray;
}

function makePageControl(area, allItems = [], editor = getCurrentProjectEditor()) {
	const refreshFunctions = {
		characters: makeCharacterChooserTileGrid,
		ligatures: makeLigatureChooserTileGrid,
		components: makeComponentChooserTileGrid,
		kerning: makeKernGroupChooserList,
	};

	const pageSize = parseInt(editor.project.settings.app.itemChooserPageSize) || 256;
	const currentPage = editor.chooserPage[area];
	const totalPages = Math.ceil(allItems.length / pageSize);
	const previousButton = makeElement({
		tag: 'button',
		className: 'editor-page__tool',
		content: '◁',
	});
	if (editor.chooserPage[area] === 0) {
		previousButton.setAttribute('disabled', '');
	} else {
		previousButton.addEventListener('click', () => {
			editor.chooserPage[area] -= 1;
			editor.chooserPage[area] = Math.max(editor.chooserPage[area], 0);
			let tileGrid;
			if (area === 'kerning') tileGrid = document.querySelector('.kern-group-chooser__list');
			else tileGrid = document.querySelector('.item-chooser__tile-grid');
			tileGrid.innerHTML = '';
			tileGrid.appendChild(refreshFunctions[area]());
		});
	}

	const nextButton = makeElement({
		tag: 'button',
		className: 'editor-page__tool',
		content: '▷',
	});
	if (editor.chooserPage[area] === totalPages - 1) {
		nextButton.setAttribute('disabled', '');
	} else {
		nextButton.addEventListener('click', () => {
			editor.chooserPage[area] += 1;
			editor.chooserPage[area] = Math.min(editor.chooserPage[area], totalPages - 1);
			let tileGrid;
			if (area === 'kerning') tileGrid = document.querySelector('.kern-group-chooser__list');
			else tileGrid = document.querySelector('.item-chooser__tile-grid');
			tileGrid.innerHTML = '';
			tileGrid.appendChild(refreshFunctions[area]());
		});
	}

	const pageControlWrapper = makeElement({ tag: 'div', className: 'item-chooser__page-control' });
	addAsChildren(pageControlWrapper, [
		previousButton,
		makeElement({ content: `Page ${currentPage + 1} of ${totalPages}` }),
		nextButton,
	]);

	return pageControlWrapper;
}
