import { getCurrentProject, getCurrentProjectEditor } from '../app/main.js';
import { addAsChildren, makeElement, textToNode } from '../common/dom.js';
import { showToast } from '../controls/dialogs/dialogs.js';
import { TabControl } from '../controls/tabs/tab_control.js';
import { makeDirectToggle } from '../panels/cards.js';
import { makeSettingsTabContentApp } from './settings_app.js';
import settingsMap from './settings_data.js';
import { makeSettingsTabContentFont } from './settings_font.js';
import { makeSettingsTabContentProject } from './settings_project.js';

/**
	PAGE > SETTINGS
	---------------
	One place to edit all the settings for the app.

	WHAT THIS PAGE WAS. The content-page shell: a 450px column holding a
	dropdown repeating the page you were already on, and under it the three
	tab names as a vertical list - 450 pixels wide to hold the words Project,
	Font and App - beside the settings themselves.

	It is the same shape as the other content pages now: the shared shell, the
	tabs as a row of three under the head, and the settings in one card that
	scrolls. See .studio-page and .studio-card in content-pages.css.
 */

/**
 * Page > Settings
 * @returns {Element} - page content
 */
export function makePage_Settings() {
	const project = getCurrentProject();

	const content = makeElement({ tag: 'div', id: 'app__page' });
	const page = makeElement({ className: 'studio-page settings' });
	content.appendChild(page);

	// --- Head ----------------------------------------------------
	const head = makeElement({ className: 'studio-page__head' });
	const titles = makeElement({ className: 'studio-page__titles' });
	titles.appendChild(
		makeElement({ tag: 'h1', className: 'studio-page__title', content: 'Settings' })
	);
	titles.appendChild(
		makeElement({
			className: 'studio-page__subtitle',
			content: 'How this project, this font, and the app behave.',
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
	page.appendChild(head);

	// --- Tabs, and what they switch ------------------------------
	const body = makeElement({ className: 'studio-card studio-tab-body settings__body' });
	const tabControl = new TabControl(body);

	tabControl.registerTab('Project', makeSettingsTabContentProject, { icon: 'settings_project' });
	tabControl.registerTab('Font', makeSettingsTabContentFont, { icon: 'settings_font' });
	tabControl.registerTab('App', makeSettingsTabContentApp, { icon: 'settings_app' });

	/*
		A segmented control - one track, the selected tab raised on a thumb
		that slides between them - rather than three loose buttons. .studio-tabs
		is the shared treatment; About opts into the same one, and Help keeps
		the stacked tabs until it moves onto this shell too.
	*/
	const tabs = makeElement({ className: 'studio-tabs settings__tabs' });
	addAsChildren(tabs, tabControl.makeTabs({ segmented: true }));
	page.appendChild(tabs);

	page.appendChild(body);
	tabControl.selectTab('Project');

	return content;
}

// --------------------------------------------------------------
// Individual settings
// --------------------------------------------------------------
/**
 * Centralized way to make one row in a settings table.
 * @param {String} groupName - section
 * @param {String} propertyName - property
 * @param {Function =} callback - called after a change
 * @param {Boolean =} inputFirst - switch the order of the label / input
 * @returns {Array}
 */
export function makeOneSettingsRow(groupName, propertyName, callback, inputFirst = false) {
	// log(`makeOneSettingsRow`, 'start');
	// log(`groupName: ${groupName}`);
	// log(`propertyName: ${propertyName}`);
	const settings = getCurrentProject().settings;
	const thisSetting = settingsMap[groupName][propertyName];
	const settingType = thisSetting?.type;
	const settingValue = settings[groupName][propertyName];
	// log(`thisSetting: ${thisSetting}`);
	// log(`settingValue: ${settingValue}`);

	let displayLabel = thisSetting.label;
	displayLabel = displayLabel.replaceAll(' ', '&nbsp;');
	displayLabel = displayLabel.replaceAll('-', '&#8209;');
	displayLabel = `${displayLabel}${inputFirst ? '' : ':&emsp;'}`;

	const label = makeElement({
		tag: 'label',
		className: 'settings__label',
		innerHTML: displayLabel,
	});

	let type = textToNode('<span></span>');
	let input;

	if (settingType === 'Degree' || settingType === 'Em' || settingType === 'Number') {
		input = makeElement({
			tag: 'input-number',
			attributes: { value: parseInt(settingValue) },
		});

		input.addEventListener('change', (event) => {
			// @ts-expect-error 'property does exist'
			let newValue = parseInt(event.target.value);
			if (isNaN(newValue)) {
				showToast(`Could not save value - needs to be a number.`);
			} else {
				settings[groupName][propertyName] = newValue;
			}
			if (callback) callback();
		});
	}

	if (!settingType) {
		input = makeElement({
			tag: 'input',
			attributes: { type: 'text', value: sanitizeValueWithJSON(settingValue) },
		});

		input.addEventListener('change', (event) => {
			// @ts-expect-error 'property does exist'
			let newValue = sanitizeValueWithJSON(event.target.value);
			settings[groupName][propertyName] = newValue;
			if (callback) callback();
		});
	}

	if (settingType === 'Boolean') {
		/*
			A toggle, like every other on-or-off control in the app. It was a
			native checkbox, and the one thing that had to change with it is how
			the extra work below attaches: a checkbox fires `change` and a button
			does not, so what was a second listener is part of the callback now.

			No description on the switch. Every row already carries one in the
			info bubble beside its label, and these run to paragraphs.
		*/
		const clearRangeCaches = () => {
			const project = getCurrentProject();
			project.settings.project.characterRanges.forEach((range) => {
				range.cachedArray = false;
			});
			getCurrentProjectEditor().selectedCharacterRange.cachedArray = false;
		};

		input = makeDirectToggle(
			settings[groupName],
			propertyName,
			(newValue) => {
				if (propertyName === 'showNonCharPoints') clearRangeCaches();
				if (callback) callback(newValue);
			},
			{ icon: 'check', name: thisSetting.label }
		);
	} else {
		type = makeElement({
			tag: 'pre',
			innerHTML: settingType || 'Text',
			title: `Expected value type`,
			className: 'value-type',
		});
	}

	if (settingType === 'Read only') {
		/*
			content, not innerHTML: the project ID is read-only to the UI but not
			to the file. A .gs2 keeps whatever id it arrives with (see
			glyphr_studio_project.js, "Project ID"), so this value is as
			untrusted as anything else that file carries.
		*/
		input = makeElement({
			content: settingValue,
			className: 'settings_read-only-value',
		});
	}

	input.setAttribute('id', `settings-page-input__${groupName}-${propertyName}`);

	let info;
	if (thisSetting?.description) {
		info = makeElement({
			tag: 'info-bubble',
			innerHTML: thisSetting?.description || `${groupName}.${propertyName}`,
		});

		if (thisSetting?.example) {
			info.innerHTML += `
			<h4>Example</h4>
			${thisSetting.example}
			`;
		}
	} else {
		info = textToNode('<span></span>');
	}

	// log(`makeOneSettingsRow`, 'end');
	if (inputFirst) return [input, label, info, type];
	else return [label, info, input, type];
}

/**
 * Use JSON stringify / parse to sanitize input.
 * @param {String} input - input from a form field
 * @returns {String}
 */
function sanitizeValueWithJSON(input) {
	let j = JSON.stringify(input);

	if (j) {
		let p = JSON.parse(j);
		return p || '';
	}

	return '';
}
