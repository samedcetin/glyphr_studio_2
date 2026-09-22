import { getCurrentProject, getCurrentProjectEditor } from '../app/main.js';
import { decToHex } from '../common/character_ids.js';
import { addAsChildren, makeElement } from '../common/dom.js';
import { remove } from '../common/functions.js';
import {
	closeAllModalDialogs,
	showError,
	showModalDialog,
	showToast,
} from '../controls/dialogs/dialogs.js';
import { makeDirectToggle } from '../panels/cards.js';
import { CharacterRange } from '../project_data/character_range.js';
import { glyphChanged } from '../project_editor/cross_item_actions.js';
import {
	makeCard_AllCaps,
	makeCard_Diacritics,
	makeCard_DiacriticsAdvanced,
	makeCard_Flatten,
	makeCard_Monospace,
	makeCard_Move,
	makeCard_RemoveItems,
	makeCard_Resize,
	makeCard_Round,
	makeCard_ScaleHorizontal,
	makeCard_ScaleVertical,
	makeCard_SideBearings,
	makeCard_Skew,
} from './global_actions_cards.js';
import { updateAllCharacterRangeCounts } from './settings_project.js';
/**
	PAGE > GLOBAL ACTIONS
	---------------------
	Things you do to the whole font at once.

	WHAT THIS PAGE WAS. The content-page shell: a 450px column holding a
	dropdown repeating the page you were already on, the filters, a bulleted
	wall of caveats, and an invitation to email in ideas - beside a single
	column of thirteen action cards.

	It is the same shape as the Overview and the Live preview now: the shared
	page shell, one scope at the top because every action below obeys it, and
	the actions themselves laid out in a grid rather than stacked one per
	screen. See .studio-page and .studio-card in content-pages.css.

	The caveats are one line under the scope. Three of the four were about the
	selection - what it does not reach, and that it all undoes at once - which
	is what the scope block is; the fourth is about component roots, and every
	card that can hit that already says so in its own warning.
 */

/**
 * Page > Global Actions
 * @returns {Element} - page content
 */
export function makePage_GlobalActions() {
	// Start things off by defaulting to selecting all ranges
	selectAllRanges();

	const content = makeElement({ tag: 'div', id: 'app__page' });
	const page = makeElement({ className: 'studio-page global-actions' });
	content.appendChild(page);

	page.appendChild(makeGlobalActionsHead());
	page.appendChild(makeScopeCard());

	const groups = makeElement({ className: 'global-actions__groups' });
	/** @type {Array<[String, Array<Element>]>} */
	const sections = [
		[
			'Move and resize',
			[
				makeCard_Move(),
				makeCard_ScaleHorizontal(),
				makeCard_ScaleVertical(),
				makeCard_Resize(),
				makeCard_Skew(),
				makeCard_SideBearings(),
			],
		],
		['Project cleanup', [makeCard_Flatten(), makeCard_Round(), makeCard_RemoveItems()]],
		['Font types', [makeCard_Monospace(), makeCard_AllCaps()]],
		['Diacritics', [makeCard_Diacritics(), makeCard_DiacriticsAdvanced()]],
	];

	sections.forEach(([title, cards]) => {
		groups.appendChild(
			makeElement({ tag: 'h2', className: 'global-actions__group-title', content: title })
		);
		const grid = makeElement({ className: 'global-actions__grid' });
		cards.forEach((card) => {
			/* The cards build themselves - see global_actions_cards.js. All this
				adds is the page's own card treatment. */
			card.classList.add('studio-card');
			liftCaveats(card);
			grid.appendChild(card);
		});
		groups.appendChild(grid);
	});
	page.appendChild(groups);

	return content;
}

/**
 * Takes the "Note:" caveat out of an effect description and gives it its own
 * line under it.
 *
 * Five of the thirteen cards end their effect description with a sentence
 * about component instances being skipped, or counted twice. That is the only
 * genuine caution on this page - and it was buried mid-paragraph inside a
 * block that was entirely amber, so it had nothing to stand out from.
 *
 * Done here rather than in each card because every card passes through this
 * loop, and because the thirteen descriptions are easier to read in the source
 * as the single strings they are. The marker is the same in all five.
 *
 * @param {Element} card - one global actions card
 */
function liftCaveats(card) {
	const NOTE = /<strong>\s*Note:?\s*<\/strong>/i;

	card.querySelectorAll('.global-actions__effect-description').forEach((block) => {
		const match = block.innerHTML.match(NOTE);
		if (!match) return;

		const effect = block.innerHTML.slice(0, match.index).replace(/(?:<br\s*\/?>|\s)+$/i, '');
		const caveat = block.innerHTML.slice(match.index + match[0].length).trim();
		if (!effect || !caveat) return;

		block.innerHTML = effect;
		block.after(
			makeElement({
				className: 'global-actions__caveat',
				innerHTML: `<strong>Note</strong> ${caveat}`,
			})
		);
	});
}

/**
 * @returns {Element}
 */
function makeGlobalActionsHead() {
	const project = getCurrentProject();
	const head = makeElement({ className: 'studio-page__head' });

	const titles = makeElement({ className: 'studio-page__titles' });
	titles.appendChild(
		makeElement({ tag: 'h1', className: 'studio-page__title', content: 'Global actions' })
	);
	titles.appendChild(
		makeElement({
			className: 'studio-page__subtitle',
			content: 'Change every glyph in the font at once.',
		})
	);
	head.appendChild(titles);

	const context = makeElement({ className: 'studio-page__context' });
	context.appendChild(makeElement({ tag: 'span', content: project.settings.font.family }));
	context.appendChild(makeElement({ tag: 'span', className: 'studio-page__dot' }));
	context.appendChild(
		makeElement({ tag: 'span', content: project.settings.font.style || 'Regular' })
	);
	head.appendChild(context);

	return head;
}

/**
 * What the actions below will run on.
 *
 * At the top, full width, because it is not one more setting among the
 * thirteen cards - it is the sentence every one of them finishes.
 *
 * @returns {Element}
 */
function makeScopeCard() {
	const card = makeElement({ className: 'studio-card global-actions__scope' });
	card.appendChild(makeElement({ className: 'studio-eyebrow', content: 'Scope' }));

	const row = makeElement({ className: 'global-actions__scope-row' });

	const ranges = makeElement({ className: 'global-actions__ranges' });
	ranges.appendChild(
		makeElement({
			tag: 'span',
			id: 'globalActionsCharacterRangesDisplay',
			className: 'global-actions__range-count',
			content: rangeCountLabel(),
		})
	);
	const chooseButton = makeElement({
		tag: 'fancy-button',
		attributes: { secondary: '' },
		content: 'Select character ranges',
	});
	chooseButton.addEventListener('click', showFilterDialog);
	ranges.appendChild(chooseButton);
	row.appendChild(ranges);

	/*
		Ligatures and Components as toggles rather than checkboxes, which is
		what the rest of the app switched to - and what these are: two things
		that are either in the scope or out of it.
	*/
	const types = makeElement({ className: 'global-actions__types' });
	[
		['Ligatures', 'ligatures', 'page_ligatures'],
		['Components', 'components', 'page_components'],
	].forEach(([label, property, icon]) => {
		const group = makeElement({ className: 'global-actions__type' });
		group.appendChild(makeElement({ tag: 'span', content: label }));
		group.appendChild(
			makeDirectToggle(itemFilterInputs, property, () => {}, {
				icon: icon,
				name: label,
				body: `Include ${label.toLowerCase()} in every action on this page.`,
			})
		);
		types.appendChild(group);
	});
	row.appendChild(types);
	card.appendChild(row);

	card.appendChild(
		makeElement({
			className: 'global-actions__scope-note',
			content: `Everything below runs on this selection and lands in one History entry, so one Undo takes all of it back. Characters that do not exist yet are not created, and hidden ranges are left alone.`,
		})
	);

	return card;
}

/**
 * @returns {String}
 */
function rangeCountLabel() {
	const count = itemFilterInputs.characterRanges.length;
	return `${count} range${count === 1 ? '' : 's'} selected`;
}

//	------------------
//	Glyph Iterator
//	------------------

/**
 * Centralized way to iterate over specific items in the
 * project, applying changes from a callback function, and
 * optionally collecting errors.
 * @param {Object} oa - options argument
 */
export function glyphIterator(oa) {
	// log(`glyphIterator`, 'start');
	// log(oa);
	// log(itemFilterInputs);

	const project = getCurrentProject();
	let listOfItemIDs = [];
	let itemNumber = 0;
	let title = oa.title || 'Iterating on Glyph';
	const includeGlyphs = oa.includeGlyphs || true;
	const includeLigatures = oa.includeLigatures || true;
	const includeComponents = oa.includeComponents || true;
	let callback = oa.callback || false;
	let currentItem, currentItemID;

	function processOneItem() {
		// log(`glyphIterator>processOneItem`, 'start');
		let failures = [];
		// log(`itemNumber: ${itemNumber}`);
		currentItemID = listOfItemIDs[itemNumber];
		currentItem = project.getItem(currentItemID, true);
		// log(`Got glyph: ${currentItem.name}`);

		showToast(title + '<br>' + currentItem.name, 10000);

		try {
			oa.action(currentItem, listOfItemIDs);
			glyphChanged(currentItem);
		} catch (e) {
			failures.push({
				itemID: currentItemID,
				item: currentItem,
				error: e.message,
			});
		}

		if (itemNumber < listOfItemIDs.length - 1) {
			itemNumber++;
			setTimeout(processOneItem, 10);
		} else {
			showToast(title + '<br>Done!', 1000);
			if (failures.length) {
				showError(
					`Some items were skipped due to errors. Check the browser console for more information.`
				);
				console.warn(`\n⮟Global Action failures⮟`);
				console.warn(failures);
			}
			getCurrentProjectEditor().history.addWholeProjectChangePreState(
				`Global action: ${title.replace('ing', 'ed')} (${listOfItemIDs.length} items)`
			);
			if (callback) callback();
		}
		// log(`glyphIterator>processOneItem`, 'end');
	}

	function makeItemList() {
		// log(`makeItemList`, 'start');
		// log(`\n⮟itemFilterInputs⮟`);
		// log(itemFilterInputs);
		// Components
		if (includeComponents && itemFilterInputs.components) {
			Object.keys(project.components).forEach((componentID) => listOfItemIDs.push(componentID));
		}

		// Ligatures
		if (includeLigatures && itemFilterInputs.ligatures) {
			Object.keys(project.ligatures).forEach((ligatureID) => listOfItemIDs.push(ligatureID));
		}

		// Glyphs
		if (includeGlyphs) {
			const selectedCharacterRanges = itemFilterInputs.characterRanges.map((rangeID) =>
				getRangeById(rangeID)
			);
			// log(`\n⮟selectedCharacterRanges⮟`);
			// log(selectedCharacterRanges);
			Object.keys(project.glyphs).forEach((glyphID) => {
				for (let i = 0; i < selectedCharacterRanges.length; i++) {
					const range = selectedCharacterRanges[i];
					const hexID = Number(remove(glyphID, 'glyph-'));
					if (range.isWithinRange(hexID)) {
						listOfItemIDs.push(glyphID);
						break;
					}
				}
			});
		}

		// log('item list');
		// log(listOfItemIDs);
		getCurrentProjectEditor().history.addWholeProjectChangePostState();
		// Kick off the process
		setTimeout(processOneItem, 10);
		// log(`makeItemList`, 'end');
	}

	// Do Stuff

	showToast(title + '<br>Starting...', 10000);
	setTimeout(makeItemList, 500);
	// log(`glyphIterator`, 'end');
}

const itemFilterInputs = {
	characterRanges: [],
	ligatures: true,
	components: true,
};

function selectAllRanges() {
	itemFilterInputs.characterRanges = [];
	getCurrentProject().settings.project.characterRanges.forEach((range) => {
		if (range.enabled) itemFilterInputs.characterRanges.push(range.id);
	});
}

export function addRangeToSelectedFilterInputs(range) {
	// log(`addCharacterRangesToSelectedRanges`, 'start');
	// log(`\n⮟range⮟`);
	// log(range);
	itemFilterInputs.characterRanges.push(range.id);
	// log(`\n⮟itemFilterInputs.characterRanges⮟`);
	// log(itemFilterInputs.characterRanges);
	// log(`addCharacterRangesToSelectedRanges`, 'end');
}

function getRangeById(id) {
	return getCurrentProject().settings.project.characterRanges.find((range) => range.id === id);
}

/**
 * The scope block, after the range dialog has changed the selection.
 *
 * Only the count now. The two type switches are bound straight to
 * itemFilterInputs and keep their own state, which is what they did not do as
 * checkboxes - this had to reach in and set a  attribute on each of
 * them by id every time the dialog closed.
 */
function updateFilterCard() {
	const display = document.getElementById('globalActionsCharacterRangesDisplay');
	if (display) display.textContent = rangeCountLabel();
}

/**
 * Which character ranges the actions on this page reach.
 *
 * WHAT IT WAS. An <h1> and a paragraph loose in the body, a five column table
 * whose header cells were italic with a rule under them and whose first one
 * was an &emsp;, two of those columns spent writing one fact - a range is a
 * span, and it was `Start` and `End` set as two separate code chips - and the
 * two buttons at the bottom of the scroll, separated by another &emsp;. Only
 * the 13px checkbox was clickable. `Select all` closed the dialog and built a
 * new one, so the list flashed and went back to the top.
 *
 * WHAT IT IS. The frame's header and footer, so the title and the way out
 * hold still while the list scrolls. One row per range, and the whole row is
 * the target. A count of what you have picked, in characters as well as
 * ranges - which is the number the actions actually operate on and was
 * written nowhere. And it says so when you have picked nothing, because an
 * empty scope is a page of buttons that silently do nothing.
 */
function showFilterDialog() {
	const project = getCurrentProject();

	/*
		A project with no ranges at all gets Basic Latin, so the scope is never
		an empty list you cannot fill from here. Pre-existing, and kept: the
		alternative is a dialog that can only tell you to go somewhere else.
	*/
	const projectRanges = project.settings.project.characterRanges;
	if (projectRanges.length === 0) {
		projectRanges.unshift(
			new CharacterRange({ name: 'Basic Latin', begin: 0x20, end: 0x7f, enabled: true })
		);
	}

	updateAllCharacterRangeCounts();
	const ranges = projectRanges.filter((range) => range.enabled);

	const content = makeElement({ className: 'dialog-layout dialog-layout--checklist' });

	// --- What you have picked, and the way to pick all of it ------
	const toolbar = makeElement({ className: 'dialog-checklist__toolbar' });
	const summary = makeElement({ className: 'dialog-checklist__summary' });
	const toggleAll = makeElement({
		tag: 'button',
		className: 'studio-link',
		attributes: { type: 'button' },
	});
	addAsChildren(toolbar, [summary, toggleAll]);

	// --- The ranges -----------------------------------------------
	const list = makeElement({ className: 'dialog-checklist' });
	const head = makeElement({ className: 'dialog-checklist__head' });
	addAsChildren(head, [
		/* The checkbox column's header. Nothing to say, and saying it with an
			&emsp; made it a cell of whitespace that could be selected. */
		makeElement({ tag: 'span' }),
		makeElement({ tag: 'span', content: 'Range' }),
		makeElement({ tag: 'span', content: 'Code points' }),
		makeElement({ tag: 'span', content: 'Characters' }),
	]);
	list.appendChild(head);

	/*
		Nothing to show, said out loud. A range has to be enabled on the
		Settings page before it can be in a scope, so a project whose ranges
		are all hidden gets an empty list here - which looks exactly like a
		list that failed to build.
	*/
	const empty = makeElement({
		className: 'dialog-empty',
		innerHTML:
			'No character ranges are enabled in this project.<br>Enable one on Settings &rsaquo; Project, then come back.',
	});

	const note = makeElement({
		className: 'dialog-note',
		content:
			'Nothing is selected, so the actions on this page have nothing to change. Pick at least one range.',
	});

	/** @type {HTMLInputElement[]} */
	const boxes = [];

	ranges.forEach((range) => {
		const row = makeElement({ tag: 'label', className: 'dialog-checklist__row' });

		const box = makeElement({ tag: 'input', attributes: { type: 'checkbox' } });
		if (itemFilterInputs.characterRanges.includes(range.id)) box.setAttribute('checked', '');
		box.addEventListener('change', () => {
			/*
				The old handler read the index once and then branched on the
				checkbox: unchecking a range that was not in the list ran
				splice(-1, 1), which drops whatever happens to be last. Ticking
				twice fast was enough to make the scope lose a range nobody
				touched.
			*/
			const index = itemFilterInputs.characterRanges.indexOf(range.id);
			// @ts-expect-error 'property does exist'
			if (box.checked) {
				if (index === -1) itemFilterInputs.characterRanges.push(range.id);
			} else if (index !== -1) {
				itemFilterInputs.characterRanges.splice(index, 1);
			}
			refresh();
		});
		// @ts-expect-error 'HTMLInputElement'
		boxes.push(box);

		const name = makeElement({ tag: 'span', className: 'dialog-checklist__name' });
		/* textContent, not content: a range name is typed by hand on the
			Settings page and arrives here as whatever was typed. */
		name.textContent = range.name;

		const span = makeElement({ tag: 'span', className: 'dialog-checklist__span' });
		span.textContent = `${decToHex(range.begin)} – ${decToHex(range.end)}`;

		const count = makeElement({ tag: 'span', className: 'dialog-checklist__count' });
		count.textContent = `${range.count}`;

		addAsChildren(row, [box, name, span, count]);
		list.appendChild(row);
	});

	/**
	 * The summary, the all/none control and the empty-scope note all say the
	 * same thing about the same state, so they are written in one place and
	 * run after anything that changes it.
	 */
	function refresh() {
		const selected = ranges.filter((range) => itemFilterInputs.characterRanges.includes(range.id));
		const characters = selected.reduce((total, range) => total + (range.count || 0), 0);

		summary.textContent = ranges.length
			? `${selected.length} of ${ranges.length} range${
					ranges.length === 1 ? '' : 's'
			  } · ${characters} character${characters === 1 ? '' : 's'}`
			: '';

		const all = ranges.length > 0 && selected.length === ranges.length;
		toggleAll.textContent = all ? 'Clear all' : 'Select all';
		toggleAll.hidden = ranges.length === 0;

		note.hidden = ranges.length === 0 || selected.length > 0;
	}

	toggleAll.addEventListener('click', () => {
		const all =
			ranges.length > 0 &&
			ranges.every((range) => itemFilterInputs.characterRanges.includes(range.id));
		/*
			The boxes are ticked where they stand. It used to call this function
			again, which closed the dialog and built a second one - so the list
			flashed, and a list you had scrolled halfway down came back at the
			top.
		*/
		if (all) itemFilterInputs.characterRanges = [];
		else selectAllRanges();

		boxes.forEach((box, index) => {
			box.checked = itemFilterInputs.characterRanges.includes(ranges[index].id);
		});
		refresh();
	});

	addAsChildren(content, ranges.length ? [toolbar, list, note] : [empty]);
	refresh();

	const doneButton = makeElement({
		tag: 'fancy-button',
		content: 'Done',
		onClick: () => {
			closeAllModalDialogs();
			updateFilterCard();
		},
	});

	showModalDialog(content, 640, {
		title: 'Select character ranges',
		subtitle: 'Global actions only change glyphs inside the ranges you pick here.',
		actions: [doneButton],
	});
}
