import { PRODUCT_NAME } from '../app/brand.js';
import { getCurrentProject } from '../app/main';
import { addAsChildren, makeElement, textToNode } from '../common/dom';
import { closeEveryTypeOfDialog, showModalDialog } from '../controls/dialogs/dialogs';
import { panoseData } from '../lib/panose';
import { makePixelFontSettings } from '../pixel_font/settings_ui.js';
import { makeOneSettingsRow } from './settings';

let workingPanoseValue;
/**
 * Makes the content for the Settings > Font tab
 * @returns {Element}
 */
export function makeSettingsTabContentFont() {
	const tabContent = makeElement({
		tag: 'div',
		className: 'settings-page__tab-content settings-table',
		id: 'tab-content__font',
		innerHTML: `
			<h1>Font metadata</h1>
			<p>
				These settings will be exported with any font you save,
				and will be used around ${PRODUCT_NAME} while you are making edits.
			</p>
		`,
	});

	addAsChildren(tabContent, [
		makeOneSettingsRow('font', 'family'),
		makeOneSettingsRow('font', 'style'),
		makeOneSettingsRow('font', 'version'),
		makeOneSettingsRow('font', 'description'),
		makeOneSettingsRow('font', 'panose'),
		makePanoseLauncherRow(),
		textToNode('<h2>Font metrics</h2>'),
		textToNode('<h3>Key metrics</h3>'),
		makeOneSettingsRow('font', 'upm'),
		makeOneSettingsRow('font', 'ascent'),
		makeOneSettingsRow('font', 'descent'),
		makeOneSettingsRow('font', 'capHeight'),
		makeOneSettingsRow('font', 'xHeight'),
		...makePixelFontSettings(),
		textToNode('<h3>Other metrics</h3>'),
		makeOneSettingsRow('font', 'overshoot'),
		makeOneSettingsRow('font', 'lineGap'),
		makeOneSettingsRow('font', 'weight'),
		makeOneSettingsRow('font', 'stretch'),
		makeOneSettingsRow('font', 'italicAngle'),
		makeOneSettingsRow('font', 'underlinePosition'),
		makeOneSettingsRow('font', 'underlineThickness'),
		textToNode('<h2>Links</h2>'),
		makeOneSettingsRow('font', 'designer'),
		makeOneSettingsRow('font', 'designerURL'),
		makeOneSettingsRow('font', 'manufacturer'),
		makeOneSettingsRow('font', 'manufacturerURL'),
		makeOneSettingsRow('font', 'license'),
		makeOneSettingsRow('font', 'licenseURL'),
		makeOneSettingsRow('font', 'copyright'),
		makeOneSettingsRow('font', 'trademark'),
		textToNode('<h2>Properties for SVG Fonts</h2>'),
		makeOneSettingsRow('font', 'variant'),
		makeOneSettingsRow('font', 'stemv'),
		makeOneSettingsRow('font', 'stemh'),
		makeOneSettingsRow('font', 'slope'),
		makeOneSettingsRow('font', 'strikethroughPosition'),
		makeOneSettingsRow('font', 'strikethroughThickness'),
		makeOneSettingsRow('font', 'overlinePosition'),
		makeOneSettingsRow('font', 'overlineThickness'),
	]);

	return tabContent;
}

/**
 * Special settings row for the PANOSE launcher
 * @returns {Array}
 */
function makePanoseLauncherRow() {
	const button = makeElement({ tag: 'a', content: 'Launch the interactive PANOSE builder' });
	button.addEventListener('click', showPanoseBuilderDialog);
	return [
		textToNode('<span></span>'),
		textToNode('<span></span>'),
		button,
		textToNode('<span></span>'),
	];
}

/**
 * The ten digits that describe a font's visual style.
 *
 * WHAT IT WAS. Two paragraphs of explanation above the form, a table with
 * lowercase headers reading `value`, `name` and `options`, and ten rows of
 * fixed ids that a refresh function filled in by hand. Nine of those rows
 * arrived empty - no name, an empty select - and stayed empty until you
 * chose the first one, because in PANOSE the first digit decides what the
 * other nine mean. Nothing on the screen said so, so a dialog that was
 * working correctly looked like one that had failed to build. And the thing
 * being assembled - the ten digit string that gets saved - was never shown;
 * it was ten separate cells, each holding one character.
 *
 * WHAT IT IS. The string first, changing as you choose. Family kind as its
 * own field, named as the one that governs the rest. The nine below it only
 * when there are nine to show, and a sentence in their place when there are
 * not, because `Any` and `No Fit` are whole answers on their own.
 */
function showPanoseBuilderDialog() {
	workingPanoseValue = getCurrentProject().settings.font.panose.split(' ');
	while (workingPanoseValue.length < 10) workingPanoseValue.push('0');

	const content = makeElement({ className: 'dialog-layout dialog-form' });

	/*
		What is being built, in the form it is saved in. It was ten separate
		cells each holding one digit, in a 50px column at 2em - so the one
		string this dialog exists to produce could not be read as a string.
	*/
	const summary = makeElement({ className: 'dialog-form__summary panose__result' });
	const summaryValue = makeElement({ tag: 'span', className: 'panose__result-value' });
	const summaryCaption = makeElement({
		tag: 'span',
		className: 'dialog-form__summary-text',
		content: 'Saved to Settings &rsaquo; Font as Panose-1',
	});
	addAsChildren(summary, [summaryValue, summaryCaption]);

	// --- The digit that decides the other nine ----------------------
	const familyField = makeElement({ className: 'dialog-field' });
	familyField.appendChild(
		makeElement({ className: 'dialog-field__label', content: 'Family kind' })
	);
	const familyChooser = makeElement({ tag: 'option-chooser', className: 'dialog-select' });
	familyField.appendChild(familyChooser);
	familyField.appendChild(
		makeElement({
			className: 'dialog-field__hint',
			content: 'Choose this first. It decides what the nine digits under it mean.',
		})
	);

	// --- The nine that follow ---------------------------------------
	const rows = makeElement({ className: 'panose__rows' });
	const rowsHead = makeElement({ className: 'panose__row panose__head' });
	addAsChildren(rowsHead, [
		makeElement({ tag: 'span', content: 'Position' }),
		makeElement({ tag: 'span', content: 'Value' }),
		makeElement({ tag: 'span', content: 'Digit' }),
	]);

	const noRows = makeElement({
		className: 'dialog-empty',
		content:
			'<strong>Any</strong> and <strong>No Fit</strong> are complete answers on their own.<br>The nine digits below the family kind carry no meaning for them.',
	});

	// --- What PANOSE is, for whoever has not met it ------------------
	const info = makeElement({ className: 'dialog-info' });
	info.appendChild(
		makeElement({ tag: 'span', className: 'dialog-info__title', content: 'What PANOSE is' })
	);
	info.appendChild(
		makeElement({
			className: 'dialog-info__body',
			content:
				'A ten digit classification of a typeface&rsquo;s shape, used by systems picking a substitute font. Each position asks one question, and the answers depend on the family kind. <a href="https://monotype.github.io/panose/pan1.htm" target="_blank">Monotype&rsquo;s reference</a> explains every digit.',
		})
	);

	// --- Actions -----------------------------------------------------
	const saveButton = makeElement({ tag: 'fancy-button', content: 'Save' });
	saveButton.addEventListener('click', () => {
		const result = workingPanoseValue.join(' ');
		getCurrentProject().settings.font.panose = result;
		/** @type {HTMLInputElement} */
		const setting = document.querySelector('#settings-page-input__font-panose');
		if (setting) setting.value = result;
		closeEveryTypeOfDialog();
	});

	const cancelButton = makeElement({
		tag: 'fancy-button',
		attributes: { secondary: '' },
		content: 'Cancel',
		onClick: closeEveryTypeOfDialog,
	});

	addAsChildren(content, [summary, familyField, rows, noRows, info]);

	showModalDialog(content, 560, {
		title: 'PANOSE builder',
		/* The frame writes the subtitle with textContent - it is a sentence,
			not markup - so the apostrophe is the character, not the entity. */
		subtitle: 'Ten digits that describe this font’s visual style.',
		actions: [cancelButton, saveButton],
	});

	refreshPanoseBuilder({
		summaryValue: summaryValue,
		familyChooser: familyChooser,
		rows: rows,
		rowsHead: rowsHead,
		noRows: noRows,
	});
}

/**
 * Draws the builder from workingPanoseValue.
 *
 * It used to fill ten rows of hard-coded ids in place, which is why the nine
 * dependent rows existed whether or not they had anything in them. The rows
 * are built from the data now, so a family kind with no sub-questions has no
 * empty selects to explain.
 *
 * @param {Object} parts - the elements to write into
 */
function refreshPanoseBuilder(parts) {
	const familyIndex = parseInt(`${workingPanoseValue[0]}`) || 0;
	const familyData = panoseData[familyIndex];

	parts.summaryValue.textContent = workingPanoseValue.join(' ');

	// --- Family kind -------------------------------------------------
	parts.familyChooser.innerHTML = '';
	addAsChildren(
		parts.familyChooser,
		makePanoseOptions(
			panoseData.map((entry) => entry.name),
			0,
			parts
		)
	);
	parts.familyChooser.setAttribute('selected-name', familyData.name);
	parts.familyChooser.setAttribute('selected-id', `${familyData.name} ${familyIndex}`);

	// --- The nine below it -------------------------------------------
	const positions = familyData?.values || [];
	parts.rows.innerHTML = '';
	parts.rows.hidden = positions.length === 0;
	parts.noRows.hidden = positions.length > 0;
	if (!positions.length) return;

	parts.rows.appendChild(parts.rowsHead);

	positions.forEach((position, index) => {
		const digit = index + 1;
		const row = makeElement({ className: 'panose__row' });

		row.appendChild(
			makeElement({ tag: 'span', className: 'panose__name', content: position.name })
		);

		const chooser = makeElement({ tag: 'option-chooser', className: 'dialog-select' });
		addAsChildren(chooser, makePanoseOptions(position.values, digit, parts));

		/*
			`No Fit` is digit 1 wherever it appears, which is also where it sits
			in every one of these lists - so the two agree, and the value is
			read straight off the list.
		*/
		const selected = position.values[parseInt(`${workingPanoseValue[digit]}`) || 0] || '';
		chooser.setAttribute('selected-name', selected);
		chooser.setAttribute('selected-id', `${selected} ${workingPanoseValue[digit]}`);
		/* One option is not a choice. */
		if (position.values.length === 1) chooser.setAttribute('disabled', '');
		row.appendChild(chooser);

		row.appendChild(
			makeElement({
				tag: 'span',
				className: 'panose__digit',
				content: `${workingPanoseValue[digit]}`,
			})
		);

		parts.rows.appendChild(row);
	});
}

/**
 * The options for one digit, each carrying the number it stands for.
 *
 * @param {Array} options - option names
 * @param {Number} position - which digit this is
 * @param {Object} parts - the elements to redraw after a choice
 * @returns {Array} - option elements
 */
function makePanoseOptions(options, position, parts) {
	return options.map((value, index) => {
		const option = makeElement({
			tag: 'option',
			innerHTML: value,
			attributes: { note: value === 'No Fit' ? 1 : index },
		});

		option.addEventListener('click', () => {
			if (position === 0) {
				/*
					A new family kind means nine new questions, so the nine old
					answers cannot be carried over. Any is ten zeroes and No Fit
					is ten ones, which is what those two mean in every position.
				*/
				if (index === 0) workingPanoseValue = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
				else if (index === 1) workingPanoseValue = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
				else workingPanoseValue = [index, 0, 0, 0, 0, 0, 0, 0, 0, 0];
			} else {
				workingPanoseValue[position] = index;
			}
			refreshPanoseBuilder(parts);
		});

		return option;
	});
}
