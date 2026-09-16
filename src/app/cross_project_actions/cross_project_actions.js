import { addAsChildren, makeElement } from '../../common/dom.js';
import { makeLineIcon } from '../../common/icons.js';
import { showToast } from '../../controls/dialogs/dialogs.js';
import { TabControl } from '../../controls/tabs/tab_control.js';
import { attachTooltip } from '../../controls/tooltip/tooltip.js';
import { getCurrentProjectEditor, getGlyphrStudioApp } from '../main.js';
import { crossProjectActions } from './actions.js';
import { makeItemTable } from './item_table.js';
import { createSelection } from './selection.js';

/**
	PAGE > CROSS-PROJECT ACTIONS
	----------------------------
	Moving things between the two projects that are open.

	WHAT THIS PAGE WAS. Its own dark shell with its own token block, a native
	select to pick the action, three checkboxes stacked with <br>s, and a
	five-column grid built by hand in five files - one per action, each with
	its own toggle-all handler and its own copy of the bug in it (see
	selection.js). The colours were fixed on the last pass; nothing under them
	was.

	It is the same shape as the other pages now: the shared shell, the actions
	as a segmented row under the head, one card that holds the action's
	sentence, its options, the list of what it will touch, and the button that
	does it. The two projects and the way to swap them sit in the head, where
	every page puts its context.

	Two things are true of every action here that were not before:
	- What gets written is bracketed in the *destination's* history, and the
	  destination's ids are counted in the destination. Undo works, and adding
	  a component cannot replace one that was already there.
	- The two that destroy something ask first - in place, with the count and
	  the project name, the way §8 of the design bar has it.
 */

/** @type {Object} - the ProjectEditor items come from */
let sourceEditor;
/** @type {Object} - the ProjectEditor items go to */
let destinationEditor;
/** @type {Map<String, Object>} - one selection per action, kept across re-renders */
const selections = new Map();
/** @type {Map<String, Object>} - one options object per action */
const optionState = new Map();
/** @type {Object|String|false} - the range on screen for the current action */
let currentRange = false;
/** @type {Object|null} - the action on screen */
let currentAction = null;
/** @type {HTMLElement|null} - the card body the action renders into */
let cardBody = null;

/**
 * Make the Cross-project actions page
 * @returns {HTMLElement}
 */
export function makePage_CrossProjectActions() {
	const app = getGlyphrStudioApp();
	sourceEditor = app.otherProjectEditor;
	destinationEditor = app.selectedProjectEditor;
	currentRange = false;

	const content = makeElement({ tag: 'div', id: 'app__page' });
	const page = makeElement({ className: 'studio-page cross-project' });
	content.appendChild(page);

	// --- Head ------------------------------------------------------
	const head = makeElement({ className: 'studio-page__head' });
	const titles = makeElement({ className: 'studio-page__titles' });
	titles.appendChild(
		makeElement({ tag: 'h1', className: 'studio-page__title', content: 'Cross‑project actions' })
	);
	titles.appendChild(
		makeElement({
			className: 'studio-page__subtitle',
			content:
				'Copy shapes, components, kern groups and settings from one open project to the other.',
		})
	);
	head.appendChild(titles);
	head.appendChild(makeHeadControls());
	page.appendChild(head);

	if (!sourceEditor || !destinationEditor || sourceEditor === destinationEditor) {
		page.appendChild(
			makeElement({
				className: 'studio-card cross-project__note',
				content:
					'Only one project is open. Open a second one from the Projects menu, then come back here.',
			})
		);
		return content;
	}

	// --- The actions, and the card they switch ----------------------
	const card = makeElement({ className: 'studio-card cross-project__card' });
	cardBody = makeElement({ className: 'cross-project__body' });
	const tabControl = new TabControl(cardBody);

	crossProjectActions.forEach((action) => {
		tabControl.registerTab(action.label, () => renderAction(action), { icon: action.icon });
	});

	const tabs = makeElement({ className: 'studio-tabs cross-project__tabs' });
	addAsChildren(tabs, tabControl.makeTabs({ segmented: true }));
	page.appendChild(tabs);

	card.appendChild(cardBody);
	page.appendChild(card);

	tabControl.selectTab(crossProjectActions[0].label);
	return content;
}

// --------------------------------------------------------------
// Head: the two projects, the swap, the way out
// --------------------------------------------------------------

/**
 * Source → destination, a button to swap them, and the way back.
 * @returns {Element}
 */
function makeHeadControls() {
	const controls = makeElement({ className: 'cross-project__head-controls' });

	const flipper = makeElement({
		className: 'cross-project__flipper',
		attributes: { 'aria-live': 'polite' },
	});
	fillFlipper(flipper);
	controls.appendChild(flipper);

	const back = makeElement({
		tag: 'fancy-button',
		attributes: { secondary: '' },
		content: 'Back to the editor',
		onClick: () => getCurrentProjectEditor().navigate(),
	});
	controls.appendChild(back);

	return controls;
}

/**
 * Writes the two project names and the swap button into the flipper.
 * @param {Element} flipper - the container
 */
function fillFlipper(flipper) {
	flipper.innerHTML = '';
	if (!sourceEditor || !destinationEditor) return;

	const name = (editor, role) => {
		const project = editor.project.settings.project;
		const chip = makeElement({
			tag: 'span',
			className: `cross-project__project cross-project__project--${role}`,
		});
		chip.textContent = project.name;
		attachTooltip(chip, {
			name: project.name,
			body: `${role === 'from' ? 'Source' : 'Destination'} · ${project.id}`,
		});
		return chip;
	};

	const swap = makeElement({
		tag: 'button',
		className: 'cross-project__swap',
		attributes: { type: 'button', 'aria-label': 'Swap source and destination' },
		innerHTML: makeLineIcon('flipHorizontal', 16),
		onClick: () => {
			[sourceEditor, destinationEditor] = [destinationEditor, sourceEditor];
			currentRange = false;
			fillFlipper(flipper);
			if (currentAction) renderAction(currentAction, true);
		},
	});
	attachTooltip(swap, {
		name: 'Swap',
		body: 'Makes the destination the source, and the source the destination.',
	});

	addAsChildren(flipper, [
		makeElement({ tag: 'span', className: 'cross-project__flipper-label', content: 'From' }),
		name(sourceEditor, 'from'),
		makeElement({ tag: 'span', className: 'cross-project__flipper-label', content: 'to' }),
		name(destinationEditor, 'to'),
		swap,
	]);
}

// --------------------------------------------------------------
// One action's view
// --------------------------------------------------------------

/**
 * Everything the action needs to know, gathered once.
 * @param {Object} action
 * @returns {Object} - an ActionContext
 */
function contextFor(action) {
	if (!optionState.has(action.id)) optionState.set(action.id, {});
	return {
		source: sourceEditor,
		destination: destinationEditor,
		range: currentRange,
		options: optionState.get(action.id),
	};
}

/**
 * Builds the card body for one action.
 *
 * Called by the tab control when a tab is picked, and again by this file when
 * the range changes, the projects swap, or an action has run - so the rows
 * always show the projects as they are now.
 *
 * @param {Object} action - one of crossProjectActions
 * @param {Boolean=} inPlace - true to redraw the current body rather than
 *     return a fresh one for the tab control to mount
 * @returns {Element|undefined}
 */
function renderAction(action, inPlace = false) {
	currentAction = action;
	if (!selections.has(action.id)) selections.set(action.id, createSelection());
	const selection = selections.get(action.id);

	// The default range is the source's own selected one; it survives a
	// re-render but resets when the projects swap.
	if (action.ranges && !currentRange) currentRange = sourceEditor.selectedCharacterRange;
	const context = contextFor(action);

	const view = makeElement({ className: 'cross-project__view' });

	// --- What it does ----------------------------------------------
	view.appendChild(
		makeElement({
			tag: 'p',
			className: 'cross-project__describe',
			content: action.describe(context),
		})
	);

	// --- Options ---------------------------------------------------
	const options = action.options(context);
	if (options.length) view.appendChild(makeOptions(options, context.options));

	// --- Range -----------------------------------------------------
	if (action.ranges) view.appendChild(makeRangeChooser(action));

	// --- The rows --------------------------------------------------
	const rows = action.rows(context);
	const table = makeItemTable({
		columns: action.columns,
		rows: rows,
		emptyMessage: action.emptyMessage,
		selection: selection,
		onChange: () => refreshFooter(),
	});
	view.appendChild(table.element);

	// --- The button ------------------------------------------------
	const footer = makeElement({ className: 'cross-project__footer' });
	view.appendChild(footer);

	/** Rewrites the footer for the current selection. */
	function refreshFooter() {
		footer.innerHTML = '';
		const count = selection.size;
		const label = `${action.verb} ${count} ${action.noun}${count === 1 ? '' : 's'}`;

		// With nothing ticked the button says what the action is, not "0 items".
		const run = makeElement({
			tag: 'fancy-button',
			content: count ? label : action.label,
		});
		if (!count) run.setAttribute('disabled', '');

		run.addEventListener('click', () => {
			if (!selection.size) return;
			if (action.destructive) {
				showConfirm(footer, action, selection.size, () => runAction(action, selection));
			} else {
				runAction(action, selection);
			}
		});

		const note = makeElement({ className: 'cross-project__footer-note' });
		note.textContent = count
			? `Into ${destinationEditor.project.settings.project.name}. One Undo there takes it back.`
			: 'Tick the rows to act on.';

		addAsChildren(footer, [note, run]);
	}
	refreshFooter();

	if (inPlace && cardBody) {
		cardBody.innerHTML = '';
		cardBody.appendChild(view);
		return undefined;
	}
	return view;
}

/**
 * The checkboxes for an action's options.
 *
 * The same rows the "Choose item from other project" dialog draws for the
 * same three choices - .dialog-option, a box with a title and a hint - so
 * the option reads the same whichever way you reach it.
 *
 * @param {Array<Object>} options - {id, label, hint}
 * @param {Object} state - where the values live
 * @returns {Element}
 */
function makeOptions(options, state) {
	const list = makeElement({ className: 'cross-project__options' });

	options.forEach((option) => {
		if (!(option.id in state)) state[option.id] = false;
		const titleID = `cross-project-${option.id}-title`;
		const hintID = `cross-project-${option.id}-hint`;

		const row = makeElement({ tag: 'label', className: 'dialog-option' });
		const box = /** @type {HTMLInputElement} */ (
			makeElement({
				tag: 'input',
				attributes: {
					type: 'checkbox',
					'aria-labelledby': titleID,
					'aria-describedby': hintID,
				},
			})
		);
		box.checked = !!state[option.id];
		box.addEventListener('change', () => {
			state[option.id] = box.checked;
		});
		addAsChildren(row, [
			box,
			makeElement({
				tag: 'span',
				className: 'dialog-option__title',
				id: titleID,
				content: option.label,
			}),
			makeElement({
				tag: 'span',
				className: 'dialog-option__hint',
				id: hintID,
				content: option.hint,
			}),
		]);
		list.appendChild(row);
	});

	return list;
}

/**
 * Picks which slice of the source is listed.
 * @param {Object} action - the action, for which extra groups it accepts
 * @returns {Element}
 */
function makeRangeChooser(action) {
	const project = sourceEditor.project;
	const rangeName = typeof currentRange === 'string' ? currentRange : currentRange?.name || '';

	const chooser = makeElement({
		tag: 'option-chooser',
		className: 'dialog-select cross-project__range',
		attributes: {
			'selected-name': rangeName,
			'selected-id':
				typeof currentRange === 'string' ? currentRange : currentRange?.id || rangeName,
			'aria-label': 'Which items to list',
		},
	});

	const choose = (range) => {
		currentRange = range;
		if (currentAction) renderAction(currentAction, true);
	};

	/** @type {Array<[String, Number]>} */
	const groups = [];
	if (action.ranges.ligatures && Object.keys(project.ligatures).length) {
		groups.push(['Ligatures', Object.keys(project.ligatures).length]);
	}
	if (action.ranges.components && Object.keys(project.components).length) {
		groups.push(['Components', Object.keys(project.components).length]);
	}
	groups.forEach(([label, count]) => {
		const option = makeElement({
			tag: 'option',
			innerHTML: label,
			attributes: { note: `${count}&nbsp;item${count === 1 ? '' : 's'}` },
		});
		option.addEventListener('click', () => choose(label));
		chooser.appendChild(option);
	});
	if (groups.length) chooser.appendChild(makeElement({ tag: 'hr' }));

	project.settings.project.characterRanges.forEach((range) => {
		const option = makeElement({
			tag: 'option',
			innerHTML: range.name,
			attributes: { note: range.note },
		});
		option.addEventListener('click', () => choose(range));
		chooser.appendChild(option);
	});

	const field = makeElement({ className: 'cross-project__range-field' });
	field.appendChild(
		makeElement({ tag: 'span', className: 'cross-project__range-label', content: 'List' })
	);
	field.appendChild(chooser);
	return field;
}

// --------------------------------------------------------------
// Running an action
// --------------------------------------------------------------

/**
 * A two-step confirm, in place of the footer.
 *
 * Not a second dialog: the footer's own contents are swapped for a sentence
 * that names what will be destroyed and where, a cancel that puts the footer
 * back, and a confirm labelled with the verb. Focus lands on cancel; Escape
 * cancels.
 *
 * @param {Element} footer - the footer to swap
 * @param {Object} action - the destructive action
 * @param {Number} count - how many items
 * @param {Function} onConfirm - what to do if confirmed
 */
function showConfirm(footer, action, count, onConfirm) {
	const previous = [...footer.childNodes];
	footer.innerHTML = '';
	footer.classList.add('cross-project__footer--confirm');

	const noun = `${count} ${action.noun}${count === 1 ? '' : 's'}`;
	const destination = destinationEditor.project.settings.project.name;
	const sentence = makeElement({
		className: 'cross-project__footer-note',
		attributes: { role: 'alert' },
	});
	sentence.textContent = `${action.verb} ${noun} in ${destination}? The current versions are replaced; Undo in that project brings them back.`;

	const restore = () => {
		footer.classList.remove('cross-project__footer--confirm');
		footer.innerHTML = '';
		previous.forEach((node) => footer.appendChild(node));
		const button = footer.querySelector('fancy-button');
		if (button instanceof HTMLElement) button.focus();
		document.removeEventListener('keydown', onKey, true);
	};

	const onKey = (event) => {
		if (event.key === 'Escape') {
			event.stopPropagation();
			restore();
		}
	};
	document.addEventListener('keydown', onKey, true);

	const cancel = makeElement({
		tag: 'fancy-button',
		attributes: { secondary: '' },
		content: 'Keep them',
		onClick: restore,
	});
	const confirm = makeElement({
		tag: 'fancy-button',
		attributes: { secondary: '', danger: '' },
		content: `${action.verb} ${noun}`,
		onClick: () => {
			document.removeEventListener('keydown', onKey, true);
			footer.classList.remove('cross-project__footer--confirm');
			onConfirm();
		},
	});

	const buttons = makeElement({ className: 'cross-project__confirm-buttons' });
	addAsChildren(buttons, [cancel, confirm]);
	addAsChildren(footer, [sentence, buttons]);
	requestAnimationFrame(() => cancel.focus());
}

/**
 * Does the work, says what it did, and redraws.
 * @param {Object} action - the action
 * @param {Object} selection - what is ticked
 */
function runAction(action, selection) {
	const ids = selection.list;
	const result = action.run(contextFor(action), ids);

	selection.clear();
	renderAction(action, true);

	const where = escapeHTML(destinationEditor.project.settings.project.name);
	let message = `${countPhrase(result.count, result.noun)} ${pastTense(action.verb)} into ${where}`;
	if (result.skipped) {
		message += `<br>${countPhrase(result.skipped, result.noun)} left alone — ${result.reason}`;
	}
	showToast(message);
}

/**
 * @param {Number} count
 * @param {String} noun - singular
 * @returns {String}
 */
function countPhrase(count, noun) {
	return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/**
 * "Copy shapes" → "copied", "Overwrite" → "overwritten", "Add" → "added".
 * @param {String} verb
 * @returns {String}
 */
function pastTense(verb) {
	const first = verb.split(' ')[0].toLowerCase();
	if (first === 'copy') return 'copied';
	if (first === 'overwrite') return 'overwritten';
	if (first === 'add') return 'added';
	return `${first}ed`;
}

/**
 * @param {String} text
 * @returns {String}
 */
function escapeHTML(text) {
	return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
