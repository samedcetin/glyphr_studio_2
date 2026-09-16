import { getCurrentProject, getCurrentProjectEditor } from '../app/main.js';
import { addAsChildren, makeElement } from '../common/dom.js';
import { closeEveryTypeOfDialog, showModalDialog, showToast } from '../controls/dialogs/dialogs.js';
import { hideTooltip, showTooltip } from '../controls/tooltip/tooltip.js';
import { getUnicodeName } from '../lib/unicode/unicode_names.js';
import { planComposition } from './compose.js';
import { composeCharacter, glyphHasContent } from './compose_glyphs.js';
import { glyphIDForCodePoint } from '../icon_font/pua.js';

/**
	COMPOSE DIALOG
	--------------
	Building a set of accented characters in one go.

	Like the icon import, this plans first and shows the plan: for every
	character, which base and which marks it would be made from, or the reason
	it cannot be. A run that silently produces forty glyphs and skips twelve is
	no use to anyone - the twelve are the interesting ones.

	WHAT THIS DIALOG WAS. A heading and a paragraph loose in the body, its
	buttons at the bottom of the body's own scroll rather than in the frame's
	footer - so on a full set the one control that finishes the job was off
	the bottom of the screen. Its form was built on the atlas export dialog's
	classes, which is how it lost its layout entirely when that dialog was
	rebuilt. It showed what it could not build and never showed what it could.
	And the summary read `0 ready to build · 53 cannot be`, a sentence with its
	last word missing.
 */

/** Ready-made sets, from the smallest useful one upwards. */
const characterSets = {
	'Western European': 'ÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝàáâãäåçèéêëìíîïñòóôõöùúûüýÿ',
	'Central European': 'ĀāĂăĄąĆćČčĎďĒēĖėĘęĚěĢģĪīĮįĶķĹĺĻļĽľŃńŅņŇňŌōŐőŔŕŖŗŚśŞşŠšŢţŤťŪūŮůŰűŲųŹźŻżŽž',
	Turkish: 'ÇçĞğİıÖöŞşÜü',
	Vietnamese:
		'ẠạẢảẤấẦầẨẩẪẫẬậẮắẰằẲẳẴẵẶặẸẹẺẻẼẽẾếỀềỂểỄễỆệỈỉỊịỌọỎỏỐốỒồỔổỖỗỘộỚớỜờỞởỠỡỢợỤụỦủỨứỪừỬửỮữỰựỲỳỴỵỶỷỸỹ',
};

/** What the set chooser says once the list is no longer one of the sets. */
const CUSTOM_SET_LABEL = 'Custom';

/** How many characters a group names before it counts the rest. */
const NAMED_CHARACTER_LIMIT = 60;

/**
 * Opens the compose dialog.
 */
export function showComposeDialog() {
	const project = getCurrentProject();
	const content = makeElement({ className: 'dialog-layout dialog-form compose' });

	/** @type {Array<Object>} */
	let plans = [];

	// --------------------------------------------------------------
	// What to build
	// --------------------------------------------------------------

	const charactersInput = makeElement({
		tag: 'textarea',
		id: 'compose__characters',
		className: 'dialog-textarea compose__input',
		attributes: { rows: '3', spellcheck: 'false' },
	});
	/** @type {HTMLTextAreaElement} */ (charactersInput).value = characterSets['Western European'];

	const setSelect = makeChooser(
		'compose__set',
		Object.keys(characterSets).map((label) => ({ value: label, label: label })),
		(chosen) => {
			if (chosen === CUSTOM_SET_LABEL) return;
			/** @type {HTMLTextAreaElement} */ (charactersInput).value = characterSets[chosen] || '';
			syncSetChooser();
			refresh();
		}
	);

	/*
		A slot for "none of the above", added only while it is the answer. The
		chooser went on reading `Western European` over a list that had been
		edited by hand.
	*/
	const customOption = makeElement({ tag: 'option', innerHTML: CUSTOM_SET_LABEL });
	customOption.setAttribute('selection-id', CUSTOM_SET_LABEL);

	/** Puts the set chooser back in step with whatever the box holds. */
	function syncSetChooser() {
		const value = `${/** @type {HTMLTextAreaElement} */ (charactersInput).value}`;
		const match = Object.keys(characterSets).find((label) => characterSets[label] === value);
		if (match) {
			customOption.remove();
			setSelect.set(match);
		} else {
			if (!customOption.parentElement) setSelect.element.appendChild(customOption);
			setSelect.element.setAttribute('selected-name', CUSTOM_SET_LABEL);
			setSelect.element.setAttribute('selected-id', CUSTOM_SET_LABEL);
		}
	}

	const replaceOption = makeOptionRow(
		'compose__replace',
		'Rebuild characters that are already drawn',
		'Off, a character you have already drawn by hand is left exactly as it is.',
		false
	);

	// --------------------------------------------------------------
	// What will happen
	// --------------------------------------------------------------

	const summary = makeElement({
		className: 'compose__summary',
		attributes: { role: 'status', 'aria-live': 'polite' },
	});

	/* What it will build, as the characters themselves. The dialog showed
		every character it could not build and none that it could. */
	const readySection = makeElement({ tag: 'div', className: 'compose__section' });
	const readyLabel = makeElement({ tag: 'span', className: 'compose__section-label' });
	const readyWall = makeCharacterWall();
	addAsChildren(readySection, [readyLabel, readyWall.element]);

	const blockedSection = makeElement({ tag: 'div', className: 'compose__section' });
	const blockedLabel = makeElement({
		tag: 'span',
		className: 'compose__section-label',
		content: 'Cannot be built',
	});
	const blockedList = makeElement({ tag: 'div', className: 'compose__blocked' });
	addAsChildren(blockedSection, [blockedLabel, blockedList]);

	/*
		The one case where every line of the table says the same thing: a font
		with no letters drawn yet. Fifty-three rows of "no glyph for the base
		letter" is a wall of failures where one sentence is an instruction.
	*/
	const nothingToBuildOn = makeElement({ className: 'dialog-note' });

	// --------------------------------------------------------------
	// Actions
	// --------------------------------------------------------------

	const buildButton = makeElement({
		tag: 'fancy-button',
		content: 'Build characters',
		attributes: { disabled: '' },
	});

	const cancelButton = makeElement({
		tag: 'fancy-button',
		attributes: { secondary: '' },
		content: 'Cancel',
		onClick: closeEveryTypeOfDialog,
	});

	// --------------------------------------------------------------
	// Planning
	// --------------------------------------------------------------

	/** Re-plans and redraws everything that describes the plan. */
	function refresh() {
		const characters = Array.from(
			String(/** @type {HTMLTextAreaElement} */ (charactersInput).value || '')
		);
		const replaceExisting = replaceOption.checked();

		plans = planComposition(project, characters).map((plan) => {
			const id = glyphIDForCodePoint(String(plan.character).codePointAt(0));
			if (plan.ok && !replaceExisting && glyphHasContent(project, id)) {
				return { ...plan, ok: false, reason: 'Already drawn — left alone.' };
			}
			return plan;
		});

		const ready = plans.filter((plan) => plan.ok);
		const blocked = plans.filter((plan) => !plan.ok);

		summary.textContent = characters.length
			? `${ready.length} of ${plans.length} can be built` +
			  (blocked.length ? ` · ${blocked.length} cannot` : '')
			: 'Nothing to build — the list is empty.';

		// --- What it will build -----------------------------------
		readyLabel.textContent = `Will be built`;
		readyWall.set(ready.map((plan) => plan.character));
		readySection.hidden = !ready.length;

		// --- What it cannot, and why ------------------------------
		blockedList.innerHTML = '';
		blockedSection.hidden = !blocked.length;

		/*
			Reasons are grouped rather than listed one per character. Forty
			rows saying "No glyph for the base letter o" is a wall; one row
			saying it about forty characters is a to-do item.
		*/
		const byReason = new Map();
		blocked.forEach((plan) => {
			const list = byReason.get(plan.reason) || [];
			list.push(plan.character);
			byReason.set(plan.reason, list);
		});

		[...byReason.entries()]
			.sort((a, b) => b[1].length - a[1].length)
			.forEach(([reason, characters]) => {
				const row = makeElement({ tag: 'div', className: 'compose__blocked-row' });

				const reasonText = makeElement({ tag: 'span', className: 'compose__reason' });
				reasonText.textContent = reason;
				row.appendChild(reasonText);

				const wall = makeCharacterWall();
				wall.set(characters);
				row.appendChild(wall.element);

				blockedList.appendChild(row);
			});

		/*
			Nothing at all can be built, which on a font this empty means the
			pieces are missing rather than the set wrong. Fifty rows, each
			naming a different absent letter or mark, is a wall of failures;
			one sentence saying to draw the letters and the marks first is an
			instruction. The list stays underneath for anyone who wants the
			detail.

			The first version of this asked whether every reason was a missing
			base, which is almost never true - a Western European set against
			an empty font fails on ten missing letters and a dozen missing
			marks, so the note that was meant for exactly that case never
			appeared.
		*/
		const nothingPossible = blocked.length > 0 && ready.length === 0;
		nothingToBuildOn.hidden = !nothingPossible;
		if (nothingPossible) nothingToBuildOn.innerHTML = describeWhatIsMissing(blocked);

		/* The button says how many, and why it cannot be pressed when it
			cannot. */
		if (ready.length) {
			buildButton.removeAttribute('disabled');
			buildButton.innerHTML = `Build ${ready.length} character${ready.length === 1 ? '' : 's'}`;
		} else {
			buildButton.setAttribute('disabled', '');
			buildButton.innerHTML = 'Nothing to build';
		}
	}

	charactersInput.addEventListener('change', () => {
		syncSetChooser();
		refresh();
	});
	replaceOption.input.addEventListener('change', refresh);

	buildButton.addEventListener('click', () => {
		if (buildButton.hasAttribute('disabled')) return;
		const editor = getCurrentProjectEditor();
		const replaceExisting = replaceOption.checked();

		/*
			A whole-project entry: this writes many glyphs at once, and it can
			be run from a page where nothing in particular is selected.
		*/
		editor.history.addWholeProjectChangePreState('Compose accented characters');

		let built = 0;
		plans.forEach((plan) => {
			if (!plan.ok) return;
			if (composeCharacter(project, plan, replaceExisting).ok) built++;
		});

		if (!built) {
			/*
				The pre-state comes back off the queue. It used to return here
				with the pre-state pushed and no post-state to close it, so a
				failed run left a half-written entry in History for the next
				undo to walk into.
			*/
			editor.history.queue.shift();
			summary.textContent = 'Nothing could be built.';
			return;
		}

		editor.history.addWholeProjectChangePostState();
		editor.publish('whichGlyphIsSelected', editor.selectedItemID);
		closeEveryTypeOfDialog();
		showToast(`Built ${built} character${built === 1 ? '' : 's'}`);
	});

	// --------------------------------------------------------------
	// Assembly
	// --------------------------------------------------------------

	addAsChildren(content, [
		makeField(
			'Character set',
			setSelect.element,
			'A starting point — edit the list below to taste.'
		),
		makeField('Characters', charactersInput, '', charactersInput),
		makeElement({ className: 'dialog-field__label', content: 'Options' }),
		replaceOption.wrapper,
		summary,
		nothingToBuildOn,
		readySection,
		blockedSection,
		makeInfoBlock(),
	]);

	syncSetChooser();
	refresh();

	showModalDialog(content, 720, {
		title: 'Compose accented characters',
		subtitle: 'Built from the letters and marks already in this font, placed by their anchors.',
		actions: [cancelButton, buildButton],
	});
}

/**
 * What to draw first, when nothing in the set can be built.
 *
 * The note used to say the font had no letters, which is only one of the two
 * ways to get here - a font with every letter drawn and no combining marks
 * fails just as completely, and was told it had no letters. It reads the
 * reasons and names whichever half is actually missing.
 *
 * @param {Array} blocked - the plans that cannot be built
 * @returns {String} - HTML
 */
function describeWhatIsMissing(blocked) {
	const reasons = blocked.map((plan) => `${plan.reason}`);
	const missingBase = reasons.some((reason) => reason.startsWith('No glyph for the base letter'));
	const missingMark = reasons.some((reason) => reason.startsWith('Missing mark:'));

	if (missingBase && !missingMark) {
		return 'This font has no letters to build on yet. Draw the plain letters first &mdash; <b>a</b>, <b>e</b>, <b>o</b> &mdash; and every accented character that uses them can be composed here.';
	}

	if (missingMark && !missingBase) {
		return 'The letters are here but the marks are not. Draw the combining marks &mdash; <b>Combining Acute Accent</b> and the rest, listed below &mdash; and every character that uses them can be composed here.';
	}

	if (missingBase && missingMark) {
		return 'Neither half is drawn yet. A composed character is a plain letter plus a combining mark, positioned by their anchors &mdash; <b>a</b> and <b>Combining Acute Accent</b> make <b>á</b> &mdash; so both have to exist in the font first.';
	}

	return 'Nothing in this set can be built yet. The reasons are listed below.';
}

/**
 * How the pieces go in, and why that matters later.
 * @returns {Element}
 */
function makeInfoBlock() {
	const info = makeElement({ className: 'dialog-info' });
	info.appendChild(
		makeElement({
			tag: 'span',
			className: 'dialog-info__title',
			content: 'These stay linked to their pieces',
		})
	);
	info.appendChild(
		makeElement({
			className: 'dialog-info__body',
			content:
				'Each character goes in as <b>component instances</b> of the letter and the marks, positioned by the anchors they already carry — so redrawing the <code>a</code> later updates every accent built on it, and moving an anchor moves every mark that attaches to it.',
		})
	);
	return info;
}

/**
 * A row of characters, each naming itself on hover.
 * @returns {Object} - {element, set}
 */
function makeCharacterWall() {
	const wall = makeElement({ tag: 'div', className: 'dialog-charwall compose__wall' });

	wall.addEventListener('mouseover', (event) => {
		const tile = /** @type {HTMLElement} */ (event.target)?.closest?.('.dialog-charwall__tile');
		if (!(tile instanceof HTMLElement)) return;
		showTooltip(
			tile,
			tile.getAttribute('data-tip-name') || '',
			tile.getAttribute('data-tip-body') || ''
		);
	});
	wall.addEventListener('mouseleave', hideTooltip);

	return {
		element: wall,
		/** @param {Array} characters - what to show */
		set: (characters) => {
			wall.innerHTML = '';
			characters.slice(0, NAMED_CHARACTER_LIMIT).forEach((character) => {
				const code = String(character).codePointAt(0);
				const hexString = `0x${code.toString(16).toUpperCase()}`;
				const tile = makeElement({ className: 'dialog-charwall__tile' });
				tile.textContent = character;
				const name = getUnicodeName(hexString);
				tile.setAttribute('data-tip-name', `U+${code.toString(16).toUpperCase()}`);
				tile.setAttribute('data-tip-body', name);
				tile.setAttribute('aria-label', `${character} ${name}`);
				wall.appendChild(tile);
			});
			if (characters.length > NAMED_CHARACTER_LIMIT) {
				wall.appendChild(
					makeElement({
						tag: 'span',
						className: 'compose__wall-more',
						content: `and ${characters.length - NAMED_CHARACTER_LIMIT} more`,
					})
				);
			}
		},
	};
}

/**
 * The app's select, driven by value rather than by the label it shows.
 * @param {String} id - for the label to name it by
 * @param {Array} entries - {value, label}
 * @param {Function} onChange - called with the chosen value
 * @returns {Object} - {element, get, set}
 */
function makeChooser(id, entries, onChange) {
	const chooser = makeElement({ tag: 'option-chooser', id: id, className: 'dialog-select' });
	let current = entries[0] ? entries[0].value : '';

	entries.forEach((entry) => {
		const option = makeElement({ tag: 'option', innerHTML: entry.label });
		option.setAttribute('selection-id', entry.value);
		option.addEventListener('click', () => {
			current = entry.value;
			if (onChange) onChange(entry.value);
		});
		chooser.appendChild(option);
	});

	const apply = (value) => {
		const entry = entries.find((one) => one.value === value) || entries[0];
		if (!entry) return;
		current = entry.value;
		chooser.setAttribute('selected-name', entry.label);
		chooser.setAttribute('selected-id', entry.value);
	};
	apply(current);

	return { element: chooser, get: () => current, set: apply };
}

/**
 * A boolean setting as the app's option row.
 * @param {String} id - checkbox id
 * @param {String} title - what it is called
 * @param {String} hint - what it does
 * @param {Boolean} initial - starting state
 * @returns {Object}
 */
function makeOptionRow(id, title, hint, initial) {
	const wrapper = makeElement({ tag: 'label', className: 'dialog-option' });

	const input = makeElement({ tag: 'input', id: id, attributes: { type: 'checkbox' } });
	/** @type {HTMLInputElement} */ (input).checked = initial;

	wrapper.appendChild(input);
	wrapper.appendChild(
		makeElement({ tag: 'span', className: 'dialog-option__title', content: title })
	);
	wrapper.appendChild(
		makeElement({ tag: 'span', className: 'dialog-option__hint', content: hint })
	);

	return {
		wrapper: wrapper,
		input: input,
		checked: () => !!(/** @type {HTMLInputElement} */ (input).checked),
	};
}

/**
 * One field: a label that names its control, the control, and a sentence.
 * @param {String} label - field label
 * @param {Element} control - the control
 * @param {String} hint - optional explanation
 * @param {Element =} labelFor - the control the label names
 * @returns {Element}
 */
function makeField(label, control, hint, labelFor = undefined) {
	const field = makeElement({ className: 'dialog-field' });

	const labelElement = makeElement({
		tag: 'label',
		className: 'dialog-field__label',
		content: label,
	});
	const target = labelFor || control;
	if (target && target.id) {
		/* A chooser is not a labelable element - its tab stop is the wrapper
			inside its shadow root - so it is named rather than pointed at. */
		if (target.tagName === 'OPTION-CHOOSER') {
			labelElement.id = `${target.id}__label`;
			target.setAttribute('aria-labelledby', labelElement.id);
		} else {
			labelElement.setAttribute('for', target.id);
		}
	}
	field.appendChild(labelElement);

	field.appendChild(control);
	if (hint) field.appendChild(makeElement({ className: 'dialog-field__hint', content: hint }));

	return field;
}
