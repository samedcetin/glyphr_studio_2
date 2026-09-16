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

	WHAT THESE WERE. Both were built on the atlas export dialog's row, label,
	hint and select classes, and on the project hub's buttons - so neither one
	owned its own layout, and when the atlas dialog was rebuilt onto the shared
	dialog vocabulary these two lost their form grid and collapsed into flowing
	text, with the file button sitting on top of its own label.

	They are on the frame and the shared vocabulary now, which is where they
	should have been to begin with: the header and the footer belong to the
	frame, the fields are .dialog-field, and the select is the app's own
	chooser.
 */

/**
 * Opens the icon import dialog.
 */
export function showIconImportDialog() {
	const project = getCurrentProject();
	const content = makeElement({ className: 'dialog-layout dialog-form icon-import' });

	/** @type {Array<Object>} - {name, text} */
	let files = [];
	/** @type {Array<Object>} - the current plan */
	let plan = [];
	/** @type {Object} - slug overrides, keyed by file name */
	const renamed = {};

	// --------------------------------------------------------------
	// Files
	// --------------------------------------------------------------

	const fileInput = makeElement({
		tag: 'input',
		attributes: {
			type: 'file',
			accept: '.svg,image/svg+xml',
			multiple: 'multiple',
			hidden: 'hidden',
		},
	});

	const chooseButton = makeElement({
		tag: 'fancy-button',
		attributes: { secondary: '' },
		content: 'Choose SVG files…',
		onClick: () => fileInput.click(),
	});

	/*
		A folder of icons arrives as a folder, so it can be dropped. The dialog
		only had a file picker, which means opening a chooser and navigating
		back to the directory already open in the window behind it.
	*/
	const dropZone = makeElement({
		className: 'icon-import__drop',
		attributes: { role: 'group', 'aria-label': 'SVG files to import' },
	});
	const dropLabel = makeElement({
		tag: 'span',
		className: 'icon-import__drop-label',
		content: 'Drop SVG files here',
	});
	addAsChildren(dropZone, [dropLabel, chooseButton]);

	// --------------------------------------------------------------
	// How they are drawn
	// --------------------------------------------------------------

	const sizeSelect = makeChooser('icon-import__size', [
		{ value: 'cap', label: 'Cap height — lines up with capitals' },
		{ value: 'em', label: 'Full em — as large as the square allows' },
		{ value: 'xheight', label: 'x-height — lines up with lowercase' },
	]);

	const advanceSelect = makeChooser('icon-import__advance', [
		{ value: 'fixed', label: 'Fixed — every icon the same width' },
		{ value: 'fit', label: 'Fit — each icon as wide as its own drawing' },
	]);

	// --------------------------------------------------------------
	// The plan
	// --------------------------------------------------------------

	const planSection = makeElement({ className: 'icon-import__plan' });
	const planHead = makeElement({ className: 'icon-import__plan-head' });
	const summary = makeElement({
		tag: 'span',
		className: 'icon-import__summary',
		attributes: { role: 'status', 'aria-live': 'polite' },
	});
	planHead.appendChild(summary);

	const columns = makeElement({ className: 'icon-import__row icon-import__columns' });
	addAsChildren(columns, [
		makeElement({ tag: 'span', content: 'File' }),
		makeElement({ tag: 'span', content: 'Name' }),
		makeElement({ tag: 'span', content: 'Code point' }),
		makeElement({ tag: 'span', content: 'Status' }),
	]);

	const tableHolder = makeElement({ className: 'icon-import__table' });

	const empty = makeElement({
		className: 'dialog-empty',
		content:
			'Nothing chosen yet. Every file you pick is listed here, with the name and code point it will get, before anything is written.',
	});

	addAsChildren(planSection, [planHead, columns, tableHolder, empty]);

	// --------------------------------------------------------------
	// Actions
	// --------------------------------------------------------------

	const importButton = makeElement({
		tag: 'fancy-button',
		content: 'Import icons',
		attributes: { disabled: '' },
	});

	const cancelButton = makeElement({
		tag: 'fancy-button',
		attributes: { secondary: '' },
		content: 'Cancel',
		onClick: closeEveryTypeOfDialog,
	});

	/**
	 * The icon box the selected options describe.
	 * @returns {Object}
	 */
	function readBox() {
		const font = project.settings.font;
		const upm = Number(font.upm) || 1000;
		const box = defaultIconBox(project);

		if (sizeSelect.get() === 'em') {
			// The full square, with the descender's share below the baseline,
			// so a full-em icon is centred the way the font's own letters are.
			const descent = Math.abs(Number(font.descent) || 0);
			box.boxHeight = upm;
			box.boxBottom = -descent;
		} else if (sizeSelect.get() === 'xheight') {
			const xHeight = Number(font.xHeight) || Math.round(upm * 0.5);
			const drop = Math.round(xHeight * 0.1);
			box.boxHeight = xHeight + drop;
			box.boxBottom = -drop;
		}

		if (advanceSelect.get() === 'fit') {
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

		const anyFiles = files.length > 0;
		empty.hidden = anyFiles;
		columns.hidden = !anyFiles;
		tableHolder.hidden = !anyFiles;

		if (!anyFiles) {
			summary.textContent = '';
			importButton.setAttribute('disabled', '');
			importButton.innerHTML = 'Import icons';
			return;
		}

		plan.forEach((entry) => {
			const row = makeElement({ className: 'icon-import__row' });
			if (!entry.ok) row.setAttribute('skipped', '');

			const fileName = makeElement({ tag: 'span', className: 'icon-import__file' });
			fileName.textContent = entry.fileName;
			fileName.setAttribute('title', entry.fileName);
			row.appendChild(fileName);

			const nameInput = makeElement({
				tag: 'input',
				className: 'icon-import__name',
				attributes: {
					type: 'text',
					value: entry.slug,
					spellcheck: 'false',
					'aria-label': `Name for ${entry.fileName}`,
				},
			});
			nameInput.addEventListener('change', (event) => {
				renamed[entry.fileName] = `${/** @type {HTMLInputElement} */ (event.target).value}`;
				refreshPlan();
			});
			row.appendChild(nameInput);

			const code = makeElement({ tag: 'span', className: 'icon-import__code' });
			code.textContent = entry.ok ? `U+${entry.codePoint.toString(16).toUpperCase()}` : '—';
			row.appendChild(code);

			const status = makeElement({ tag: 'span', className: 'icon-import__status' });
			status.textContent = entry.ok ? 'Ready' : entry.reason;
			row.appendChild(status);

			tableHolder.appendChild(row);
		});

		const ready = plan.filter((entry) => entry.ok).length;
		const skipped = plan.length - ready;

		summary.textContent =
			`${ready} icon${ready === 1 ? '' : 's'} ready` +
			(skipped ? ` · ${skipped} cannot be used` : '');

		/*
			The button says what it is about to do. It read `Import icons`
			whether it was about to write one glyph or ninety, and whether two
			of the chosen files were going to be skipped or none.
		*/
		if (ready) {
			importButton.removeAttribute('disabled');
			importButton.innerHTML = `Import ${ready} icon${ready === 1 ? '' : 's'}`;
		} else {
			importButton.setAttribute('disabled', '');
			importButton.innerHTML = 'Nothing to import';
		}
	}

	/**
	 * Reads a set of chosen or dropped files.
	 * @param {Array} chosen - File objects
	 */
	function loadFiles(chosen) {
		if (!chosen.length) return;

		/* Only the SVGs. A dropped folder arrives with whatever else is in it,
			and a PNG among the icons is not an error worth a dialog. */
		const svgs = chosen.filter(
			(file) => /\.svg$/i.test(file.name) || file.type === 'image/svg+xml'
		);
		if (!svgs.length) {
			summary.textContent = 'None of those are SVG files.';
			return;
		}

		summary.textContent = `Reading ${svgs.length} file${svgs.length === 1 ? '' : 's'}…`;

		Promise.all(
			svgs.map(
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
	}

	fileInput.addEventListener('change', () => {
		loadFiles([...(/** @type {HTMLInputElement} */ (fileInput).files || [])]);
		/* Cleared, so picking the same folder twice fires change the second
			time. */
		/** @type {HTMLInputElement} */ (fileInput).value = '';
	});

	dropZone.addEventListener('dragover', (event) => {
		event.preventDefault();
		dropZone.setAttribute('dragging', '');
	});
	dropZone.addEventListener('dragleave', () => dropZone.removeAttribute('dragging'));
	dropZone.addEventListener('drop', (/** @type {DragEvent} */ event) => {
		event.preventDefault();
		dropZone.removeAttribute('dragging');
		loadFiles([...(event.dataTransfer?.files || [])]);
	});

	/*
		Not re-planned on these two. The size and the advance width describe
		where each icon sits on the em square, which planIconImport knows
		nothing about - it parses the files and assigns code points. Bound to
		them, changing `Icon size` re-parsed every SVG to produce the same
		table.
	*/

	importButton.addEventListener('click', () => {
		if (importButton.hasAttribute('disabled')) return;
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
			/*
				The pre-state comes back off the queue. It used to return here
				with the pre-state pushed and no post-state to close it, so a
				failed import left a half-written entry in History that the
				next undo would walk into.
			*/
			editor.history.queue.shift();
			summary.textContent = 'Nothing could be imported.';
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

	// --------------------------------------------------------------
	// Assembly
	// --------------------------------------------------------------

	addAsChildren(content, [
		makeField(
			'Files',
			dropZone,
			'SVG only. Strokes need expanding to outlines first — a line with no fill has no area to make a glyph from.'
		),
		makeField(
			'Icon size',
			sizeSelect.element,
			'How tall each icon is drawn, whatever size its own file was.'
		),
		makeField(
			'Advance width',
			advanceSelect.element,
			'Fixed keeps icons in a column, which is what a HUD or a toolbar wants.'
		),
		planSection,
		fileInput,
		makeInfoBlock(),
	]);

	drawTable();

	showModalDialog(content, 780, {
		title: 'Import SVG icons',
		subtitle: 'Each file becomes a glyph in the Private Use Area.',
		actions: [cancelButton, importButton],
	});
}

/**
 * What the Private Use Area is and why the names matter.
 * @returns {Element}
 */
function makeInfoBlock() {
	const info = makeElement({ className: 'dialog-info' });
	info.appendChild(
		makeElement({
			tag: 'span',
			className: 'dialog-info__title',
			content: 'Why the Private Use Area',
		})
	);
	info.appendChild(
		makeElement({
			className: 'dialog-info__body',
			content:
				'The Private Use Area is the part of Unicode that will never be assigned a meaning, which is where every icon font lives — nothing else can ever claim the code point your icon is on. Icons are named after their files, and <b>Export icon names</b> writes those names out beside the font, so your game refers to <code>heart</code> rather than <code>U+E000</code>.',
		})
	);
	return info;
}

/**
 * Opens the icon name map export dialog.
 */
export function showIconMapDialog() {
	const project = getCurrentProject();
	const entries = collectIconMap(project);
	const family = project.settings.font.family || 'Icons';

	const content = makeElement({ className: 'dialog-layout dialog-form icon-map' });

	if (!entries.length) {
		content.appendChild(
			makeElement({
				className: 'dialog-empty',
				content:
					'No icons found in the Private Use Area.<br>Import some SVGs first, or give the glyphs there names — an icon with no name has nothing to export.',
			})
		);
	} else {
		content.appendChild(
			makeElement({
				className: 'dialog-field__label',
				content: `${entries.length} icon${entries.length === 1 ? '' : 's'}`,
			})
		);
		content.appendChild(
			makeElement({
				tag: 'pre',
				className: 'icon-map__preview',
				content: makeIconMapTable(entries),
			})
		);

		const formats = makeElement({ className: 'icon-map__formats' });
		addAsChildren(formats, [
			makeExportButton(
				'JSON',
				`${family}.icons.json`,
				() => makeIconMapJSON(entries, family),
				'application/json'
			),
			makeExportButton(
				'CSS',
				`${family}.icons.css`,
				() => makeIconMapCSS(entries, { fontFamily: family }),
				'text/css'
			),
			makeExportButton(
				'Text table',
				`${family}.icons.txt`,
				() => makeIconMapTable(entries),
				'text/plain'
			),
		]);
		content.appendChild(makeField('Save as', formats, ''));

		const info = makeElement({ className: 'dialog-info' });
		info.appendChild(
			makeElement({
				tag: 'span',
				className: 'dialog-info__title',
				content: 'What this is for',
			})
		);
		info.appendChild(
			makeElement({
				className: 'dialog-info__body',
				content:
					'This is the file that keeps <code>U+E000</code> out of your game’s source. JSON for code, CSS for a web build’s <code>::before</code> rules, the text table for anyone reading.',
			})
		);
		content.appendChild(info);
	}

	const closeButton = makeElement({
		tag: 'fancy-button',
		content: 'Close',
		onClick: closeEveryTypeOfDialog,
	});

	showModalDialog(content, 640, {
		title: 'Export icon names',
		subtitle: 'The map from a name your code can read to the code point it sits on.',
		actions: [closeButton],
	});
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
		tag: 'fancy-button',
		attributes: { secondary: '' },
		content: label,
		onClick: () => {
			saveFile(new Blob([make()], { type: `${type};charset=utf-8` }), fileName);
			showToast(`Saved ${fileName}`);
		},
	});
}

/**
 * The app's select, driven by value rather than by the label it shows.
 * @param {String} id - for the label to name it by
 * @param {Array} entries - {value, label}
 * @returns {Object} - {element, get, set}
 */
function makeChooser(id, entries) {
	const chooser = makeElement({ tag: 'option-chooser', id: id, className: 'dialog-select' });
	let current = entries[0] ? entries[0].value : '';

	entries.forEach((entry) => {
		const option = makeElement({ tag: 'option', innerHTML: entry.label });
		option.setAttribute('selection-id', entry.value);
		option.addEventListener('click', () => {
			current = entry.value;
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
 * One field: a label that names its control, the control, and a sentence.
 * @param {String} label - field label
 * @param {Element} control - the control
 * @param {String} hint - optional explanation
 * @returns {Element}
 */
function makeField(label, control, hint) {
	const field = makeElement({ className: 'dialog-field' });

	const labelElement = makeElement({
		tag: 'label',
		className: 'dialog-field__label',
		content: label,
	});
	if (control.id) {
		/* A chooser is not a labelable element - its tab stop is the wrapper
			inside its shadow root - so it is named rather than pointed at. */
		if (control.tagName === 'OPTION-CHOOSER') {
			labelElement.id = `${control.id}__label`;
			control.setAttribute('aria-labelledby', labelElement.id);
		} else {
			labelElement.setAttribute('for', control.id);
		}
	}
	field.appendChild(labelElement);

	field.appendChild(control);
	if (hint) field.appendChild(makeElement({ className: 'dialog-field__hint', content: hint }));

	return field;
}
