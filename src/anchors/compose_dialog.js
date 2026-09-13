import { getCurrentProject, getCurrentProjectEditor } from '../app/main.js';
import { addAsChildren, makeElement } from '../common/dom.js';
import { closeEveryTypeOfDialog, showModalDialog, showToast } from '../controls/dialogs/dialogs.js';
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
 */

/** Ready-made sets, from the smallest useful one upwards. */
const characterSets = {
	'Western European': 'ÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝàáâãäåçèéêëìíîïñòóôõöùúûüýÿ',
	'Central European':
		'ĀāĂăĄąĆćČčĎďĒēĖėĘęĚěĢģĪīĮįĶķĹĺĻļĽľŃńŅņŇňŌōŐőŔŕŖŗŚśŞşŠšŢţŤťŪūŮůŰűŲųŹźŻżŽž',
	Turkish: 'ÇçĞğİıÖöŞşÜü',
	Vietnamese: 'ẠạẢảẤấẦầẨẩẪẫẬậẮắẰằẲẳẴẵẶặẸẹẺẻẼẽẾếỀềỂểỄễỆệỈỉỊịỌọỎỏỐốỒồỔổỖỗỘộỚớỜờỞởỠỡỢợỤụỦủỨứỪừỬửỮữỰựỲỳỴỵỶỷỸỹ',
};

/**
 * Opens the compose dialog.
 */
export function showComposeDialog() {
	const project = getCurrentProject();
	const content = makeElement({ className: 'compose' });

	content.appendChild(
		makeElement({
			className: 'compose__header',
			innerHTML: `
				<h2>Compose accented characters</h2>
				<p>
					Builds each character out of the letter and marks already in this font,
					positioned by their anchors. The pieces go in as <b>component instances</b>,
					so redrawing the <code>a</code> later updates every accent built on it.
				</p>
			`,
		})
	);

	const setSelect = makeElement({ tag: 'select', className: 'atlas-export__select' });
	Object.keys(characterSets).forEach((label) => {
		setSelect.appendChild(
			makeElement({ tag: 'option', content: label, attributes: { value: label } })
		);
	});

	const charactersInput = makeElement({
		tag: 'textarea',
		className: 'atlas-export__characters',
		attributes: { rows: '3', spellcheck: 'false' },
	});
	// @ts-expect-error - textareas have a value
	charactersInput.value = characterSets['Western European'];

	const replaceToggle = makeElement({ tag: 'input', attributes: { type: 'checkbox' } });
	const replaceLabel = makeElement({ tag: 'label', className: 'atlas-export__checkbox' });
	replaceLabel.appendChild(replaceToggle);
	replaceLabel.appendChild(
		makeElement({ tag: 'span', content: 'Rebuild characters that are already drawn' })
	);

	const summary = makeElement({ className: 'compose__summary' });
	const tableHolder = makeElement({ className: 'compose__table' });

	const buildButton = makeElement({
		tag: 'button',
		className: 'hub-button hub-button--primary hub-button--large',
		attributes: { type: 'button' },
		content: 'Build characters',
	});

	/** @type {Array<Object>} */
	let plans = [];

	/** Re-plans and redraws the table. */
	function refresh() {
		// @ts-expect-error - textareas have a value
		const characters = Array.from(String(charactersInput.value || ''));
		// @ts-expect-error - checkboxes have a checked property
		const replaceExisting = !!replaceToggle.checked;

		plans = planComposition(project, characters).map((plan) => {
			const id = glyphIDForCodePoint(String(plan.character).codePointAt(0));
			if (plan.ok && !replaceExisting && glyphHasContent(project, id)) {
				return { ...plan, ok: false, reason: 'Already drawn — left alone.' };
			}
			return plan;
		});

		tableHolder.innerHTML = '';

		const ready = plans.filter((plan) => plan.ok);
		const blocked = plans.filter((plan) => !plan.ok);

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
				const row = makeElement({ className: 'compose__row' });
				row.appendChild(
					makeElement({ className: 'compose__characters', content: characters.join(' ') })
				);
				row.appendChild(makeElement({ className: 'compose__reason', content: reason }));
				tableHolder.appendChild(row);
			});

		summary.innerHTML = `<b>${ready.length}</b> ready to build${
			blocked.length ? ` · <span class="compose__warning">${blocked.length} cannot be</span>` : ''
		}`;

		if (ready.length) buildButton.removeAttribute('disabled');
		else buildButton.setAttribute('disabled', 'disabled');
	}

	setSelect.addEventListener('change', () => {
		// @ts-expect-error - selects and textareas have values
		charactersInput.value = characterSets[setSelect.value] || '';
		refresh();
	});

	charactersInput.addEventListener('change', refresh);
	replaceToggle.addEventListener('change', refresh);

	buildButton.addEventListener('click', () => {
		const editor = getCurrentProjectEditor();
		// @ts-expect-error - checkboxes have a checked property
		const replaceExisting = !!replaceToggle.checked;

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
			showToast('Nothing could be built.');
			return;
		}

		editor.history.addWholeProjectChangePostState();
		editor.publish('whichGlyphIsSelected', editor.selectedItemID);
		closeEveryTypeOfDialog();
		showToast(`Built ${built} character${built === 1 ? '' : 's'}`);
	});

	const form = makeElement({ className: 'atlas-export__form' });
	addAsChildren(form, [
		makeRow('Character set', setSelect, 'A starting point — edit the list below to taste.'),
		makeRow('Characters', charactersInput, ''),
		makeRow('Options', replaceLabel, ''),
	]);

	content.appendChild(form);
	content.appendChild(summary);
	content.appendChild(tableHolder);

	const cancelButton = makeElement({
		tag: 'button',
		className: 'hub-button hub-button--large',
		attributes: { type: 'button' },
		content: 'Cancel',
		onClick: closeEveryTypeOfDialog,
	});

	const actions = makeElement({ className: 'atlas-export__actions' });
	addAsChildren(actions, [cancelButton, buildButton]);
	content.appendChild(actions);

	showModalDialog(content, 720);
	refresh();
}

/**
 * One labelled row.
 * @param {String} label - row label
 * @param {Element} control - the control
 * @param {String} hint - explanation
 * @returns {Element}
 */
function makeRow(label, control, hint) {
	const row = makeElement({ className: 'atlas-export__row' });
	row.appendChild(makeElement({ className: 'atlas-export__label', content: label }));

	const wrapper = makeElement({ className: 'atlas-export__control' });
	wrapper.appendChild(control);
	if (hint) wrapper.appendChild(makeElement({ className: 'atlas-export__hint', content: hint }));

	row.appendChild(wrapper);
	return row;
}
