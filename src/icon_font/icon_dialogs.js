import { getCurrentProject, getCurrentProjectEditor } from '../app/main.js';
import { addAsChildren, makeElement } from '../common/dom.js';
import { closeEveryTypeOfDialog, showModalDialog, showToast } from '../controls/dialogs/dialogs.js';
import { saveFile } from '../project_editor/file_io.js';
import { defaultIconBox } from './fit_icon.js';
import { slugFromFileName, uniqueSlug } from './icon_names.js';
import { importIcons, planIconImport } from './import_icons.js';
import { collectIconMap, makeIconMapCSS, makeIconMapJSON, makeIconMapTable } from './name_map.js';
import { listIconGlyphs } from './pua.js';

/**
	ICON FONT DIALOGS
	-----------------
	Bringing a folder of SVGs in, and getting the name map back out.

	The import dialog shows the plan before it runs anything - which file
	becomes which code point, under which name, and which files cannot be used.
	The plan comes from the same function that does the import, so the table is
	not a guess about what will happen.
 */

/**
 * Opens the icon import dialog.
 */
export function showIconImportDialog() {
	const project = getCurrentProject();
	const content = makeElement({ className: 'icon-import' });

	content.appendChild(
		makeElement({
			className: 'icon-import__header',
			innerHTML: `
				<h2>Import SVG icons</h2>
				<p>
					Each SVG becomes a glyph in the <b>Private Use Area</b> — the part of Unicode
					that will never be assigned a meaning, which is where every icon font lives.
					Icons are named after their files, and the names are exported alongside the
					font so your game refers to <code>heart</code> rather than <code>U+E000</code>.
				</p>
			`,
		})
	);

	/** @type {Array<Object>} - {name, text} */
	let files = [];
	/** @type {Array<Object>} - the current plan */
	let plan = [];
	/** @type {Object} - slug overrides, keyed by file name */
	const renamed = {};

	const fileInput = makeElement({
		tag: 'input',
		attributes: { type: 'file', accept: '.svg,image/svg+xml', multiple: 'multiple', hidden: 'hidden' },
	});

	const chooseButton = makeElement({
		tag: 'button',
		className: 'hub-button hub-button--primary',
		attributes: { type: 'button' },
		content: 'Choose SVG files…',
		onClick: () => fileInput.click(),
	});

	const sizeSelect = makeSelect([
		{ value: 'cap', label: 'Cap height — lines up with capitals' },
		{ value: 'em', label: 'Full em — as large as the square allows' },
		{ value: 'xheight', label: 'x-height — lines up with lowercase' },
	]);

	const advanceSelect = makeSelect([
		{ value: 'fixed', label: 'Fixed — every icon the same width' },
		{ value: 'fit', label: 'Fit — each icon as wide as its own drawing' },
	]);

	const tableHolder = makeElement({ className: 'icon-import__table' });
	const summary = makeElement({ className: 'icon-import__summary' });

	const importButton = makeElement({
		tag: 'button',
		className: 'hub-button hub-button--primary hub-button--large',
		attributes: { type: 'button', disabled: 'disabled' },
		content: 'Import icons',
	});

	/**
	 * The icon box the selected options describe.
	 * @returns {Object}
	 */
	function readBox() {
		const font = project.settings.font;
		const upm = Number(font.upm) || 1000;
		const box = defaultIconBox(project);

		// @ts-expect-error - selects have a value
		if (sizeSelect.value === 'em') {
			// The full square, with the descender's share below the baseline,
			// so a full-em icon is centred the way the font's own letters are.
			const descent = Math.abs(Number(font.descent) || 0);
			box.boxHeight = upm;
			box.boxBottom = -descent;
			// @ts-expect-error - selects have a value
		} else if (sizeSelect.value === 'xheight') {
			const xHeight = Number(font.xHeight) || Math.round(upm * 0.5);
			const drop = Math.round(xHeight * 0.1);
			box.boxHeight = xHeight + drop;
			box.boxBottom = -drop;
		}

		// @ts-expect-error - selects have a value
		if (advanceSelect.value === 'fit') {
			box.advanceWidth = false;
			box.sidebearing = Math.round(upm * 0.05);
		}

		return box;
	}

	/** Re-plans and redraws the table. */
	function refreshPlan() {
		plan = planIconImport(project, files);

		// Anything renamed by hand wins, and uniqueness is worked out again
		// over the edited names rather than the file names.
		const taken = new Set(listIconGlyphs(project).map((entry) => entry.name));
		plan = plan.map((entry) => {
			const wanted = renamed[entry.fileName] || entry.slug;
			const slug = uniqueSlug(slugFromFileName(wanted), taken);
			taken.add(slug);
			return { ...entry, slug: slug };
		});

		drawTable();
	}

	/** Renders one row per file. */
	function drawTable() {
		tableHolder.innerHTML = '';

		if (!files.length) {
			summary.textContent = '';
			importButton.setAttribute('disabled', 'disabled');
			return;
		}

		plan.forEach((entry) => {
			const row = makeElement({ className: 'icon-import__row' });

			row.appendChild(
				makeElement({ className: 'icon-import__file', content: entry.fileName, title: entry.fileName })
			);

			const nameInput = makeElement({
				tag: 'input',
				className: 'icon-import__name',
				attributes: { type: 'text', value: entry.slug, spellcheck: 'false' },
			});

			nameInput.addEventListener('change', (event) => {
				// @ts-expect-error - inputs have a value
				renamed[entry.fileName] = event.target.value;
				refreshPlan();
			});

			row.appendChild(nameInput);

			row.appendChild(
				makeElement({
					className: entry.ok ? 'icon-import__code' : 'icon-import__code icon-import__code--none',
					content: entry.ok ? `U+${entry.codePoint.toString(16).toUpperCase()}` : '—',
				})
			);

			row.appendChild(
				makeElement({
					className: entry.ok ? 'icon-import__status' : 'icon-import__status icon-import__warning',
					content: entry.ok ? 'Ready' : entry.reason,
				})
			);

			tableHolder.appendChild(row);
		});

		const ready = plan.filter((entry) => entry.ok).length;
		const skipped = plan.length - ready;

		summary.innerHTML = `<b>${ready}</b> icon${ready === 1 ? '' : 's'} ready${
			skipped ? ` · <span class="icon-import__warning">${skipped} cannot be used</span>` : ''
		}`;

		if (ready) importButton.removeAttribute('disabled');
		else importButton.setAttribute('disabled', 'disabled');
	}

	fileInput.addEventListener('change', () => {
		// @ts-expect-error - file inputs have files
		const chosen = [...(fileInput.files || [])];
		if (!chosen.length) return;

		summary.textContent = `Reading ${chosen.length} file${chosen.length === 1 ? '' : 's'}…`;

		Promise.all(
			chosen.map(
				(file) =>
					new Promise((resolve) => {
						const reader = new FileReader();
						reader.onload = () => resolve({ name: file.name, text: String(reader.result || '') });
						reader.onerror = () => resolve({ name: file.name, text: '' });
						reader.readAsText(file);
					})
			)
		).then((loaded) => {
			// Sorted by name, so the code points follow the order the files
			// appear in on disk rather than whichever finished reading first.
			files = loaded.sort((a, b) => String(a.name).localeCompare(String(b.name)));
			refreshPlan();
		});
	});

	[sizeSelect, advanceSelect].forEach((select) => select.addEventListener('change', refreshPlan));

	importButton.addEventListener('click', () => {
		const editor = getCurrentProjectEditor();

		/*
			A whole-project history entry, not a single-item one. An import
			creates many glyphs at once, and it can be run from a page where
			nothing is selected at all - which is where the single-item path
			has no item to save.
		*/
		editor.history.addWholeProjectChangePreState(`Import ${plan.length} SVG icons`);
		const result = importIcons(project, plan, readBox());

		if (!result.imported.length) {
			showToast('Nothing could be imported.');
			return;
		}

		editor.history.addWholeProjectChangePostState();
		editor.publish('whichGlyphIsSelected', editor.selectedItemID);
		closeEveryTypeOfDialog();

		const first = result.imported[0];
		showToast(
			`Imported ${result.imported.length} icon${result.imported.length === 1 ? '' : 's'}<br>` +
				`starting at U+${first.codePoint.toString(16).toUpperCase()}` +
				(result.skipped.length ? `<br>${result.skipped.length} skipped` : '')
		);
	});

	const form = makeElement({ className: 'icon-import__form' });
	addAsChildren(form, [
		makeRow('Files', chooseButton, 'SVG only. Strokes need expanding to outlines first — a line with no fill has no area to make a glyph from.'),
		makeRow('Icon size', sizeSelect, 'How tall each icon is drawn, whatever size its own file was.'),
		makeRow('Advance width', advanceSelect, 'Fixed keeps icons in a column, which is what a HUD or a toolbar wants.'),
	]);

	content.appendChild(form);
	content.appendChild(fileInput);
	content.appendChild(summary);
	content.appendChild(tableHolder);

	const cancelButton = makeElement({
		tag: 'button',
		className: 'hub-button hub-button--large',
		attributes: { type: 'button' },
		content: 'Cancel',
		onClick: closeEveryTypeOfDialog,
	});

	const actions = makeElement({ className: 'icon-import__actions' });
	addAsChildren(actions, [cancelButton, importButton]);
	content.appendChild(actions);

	showModalDialog(content, 720);
}

/**
 * Opens the icon name map export dialog.
 */
export function showIconMapDialog() {
	const project = getCurrentProject();
	const entries = collectIconMap(project);
	const family = project.settings.font.family || 'Icons';

	const content = makeElement({ className: 'icon-import' });

	content.appendChild(
		makeElement({
			className: 'icon-import__header',
			innerHTML: `
				<h2>Export icon names</h2>
				<p>
					${
						entries.length
							? `<b>${entries.length}</b> icons in the Private Use Area. This is the file that keeps
								<code>U+E000</code> out of your game's source.`
							: `No icons found. Import some SVGs into the Private Use Area first, or rename the
								glyphs there — an icon with no name has nothing to export.`
					}
				</p>
			`,
		})
	);

	if (entries.length) {
		const preview = makeElement({
			tag: 'pre',
			className: 'icon-import__preview',
			content: makeIconMapTable(entries),
		});
		content.appendChild(preview);

		const buttons = makeElement({ className: 'icon-import__actions' });
		addAsChildren(buttons, [
			makeExportButton('JSON', `${family}.icons.json`, () => makeIconMapJSON(entries, family), 'application/json'),
			makeExportButton('CSS', `${family}.icons.css`, () => makeIconMapCSS(entries, { fontFamily: family }), 'text/css'),
			makeExportButton('Text table', `${family}.icons.txt`, () => makeIconMapTable(entries), 'text/plain'),
		]);
		content.appendChild(buttons);
	}

	const closeButton = makeElement({
		tag: 'button',
		className: 'hub-button hub-button--large',
		attributes: { type: 'button' },
		content: 'Close',
		onClick: closeEveryTypeOfDialog,
	});

	const footer = makeElement({ className: 'icon-import__actions' });
	footer.appendChild(closeButton);
	content.appendChild(footer);

	showModalDialog(content, 640);
}

/**
 * A button that writes one flavour of the map.
 * @param {String} label - button text
 * @param {String} fileName - what to call the file
 * @param {Function} make - produces the contents
 * @param {String} type - mime type
 * @returns {Element}
 */
function makeExportButton(label, fileName, make, type) {
	return makeElement({
		tag: 'button',
		className: 'hub-button',
		attributes: { type: 'button' },
		content: label,
		onClick: () => {
			saveFile(new Blob([make()], { type: `${type};charset=utf-8` }), fileName);
			showToast(`Saved ${fileName}`);
		},
	});
}

/**
 * A select built from {value, label} entries.
 * @param {Array} entries - the options
 * @returns {Element}
 */
function makeSelect(entries) {
	const select = makeElement({ tag: 'select', className: 'atlas-export__select' });
	entries.forEach((entry) => {
		select.appendChild(
			makeElement({ tag: 'option', content: entry.label, attributes: { value: entry.value } })
		);
	});
	return select;
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
