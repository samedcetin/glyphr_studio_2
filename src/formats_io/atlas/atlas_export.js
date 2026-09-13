import { getCurrentProject } from '../../app/main.js';
import { addAsChildren, makeElement } from '../../common/dom.js';
import { closeEveryTypeOfDialog, showError, showModalDialog, showToast } from '../../controls/dialogs/dialogs.js';
import { saveFile } from '../../project_editor/file_io.js';
import { buildAtlas, makeDefaultAtlasOptions } from './build_atlas.js';
import { applyEnginePreset, enginePresets, getEnginePreset, makeImportInstructions } from './engine_presets.js';
import { getPixelMode, isPixelModeOn, isPixelPerfectSize } from '../../pixel_font/pixel_grid.js';
import { analyzeCoverage, extractCharacters, groupByBlock, textFromSource } from './subset.js';

/**
	ATLAS EXPORT
	------------
	The dialog for exporting a bitmap font, and the file saving that follows.

	Everything the export actually does lives in build_atlas.js, which knows
	nothing about the DOM beyond needing somewhere to make a canvas. This file
	is the part that talks to the user.
 */

/** Character set presets, from smallest payload to largest. */
const characterPresets = {
	'Everything in this project': '',
	'ASCII printable': makeRange(0x20, 0x7e),
	'Letters and digits':
		'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
	'Digits and punctuation': '0123456789.,:;!?%+-/()[]{}<>=*#@&$',
};

/**
 * @param {Number} from - first code point
 * @param {Number} to - last code point, inclusive
 * @returns {String}
 */
function makeRange(from, to) {
	let result = '';
	for (let code = from; code <= to; code++) result += String.fromCodePoint(code);
	return result;
}

/**
 * Opens the bitmap font export dialog.
 */
export function showAtlasExportDialog() {
	const options = makeDefaultAtlasOptions();
	const pixelMode = getPixelMode(getCurrentProject());

	/*
		A pixel font has exactly one right answer for most of these, so it
		starts on it: its own size, no padding to blur the edges, and coverage
		rather than a distance field - a distance field of a pixel font throws
		away the only thing that made it a pixel font.
	*/
	if (pixelMode.enabled) {
		options.pixelSize = pixelMode.pixelsPerEm;
		options.padding = 0;
		options.spacing = 1;
		options.fieldType = 'bitmap';
	}

	const content = makeElement({ className: 'atlas-export' });

	content.appendChild(
		makeElement({
			className: 'atlas-export__header',
			innerHTML: `
				<h2>Export font atlas</h2>
				<p>
					A PNG texture atlas plus an AngelCode <code>.fnt</code> descriptor and a
					<code>.json</code> sidecar. <b>Bitmap</b> is the classic format read by
					Phaser, LÖVE, Godot, Defold, libGDX, MonoGame and PixiJS. <b>MSDF</b>
					stores distances instead of coverage, so the same texture stays sharp at
					any size and supports outline and glow in a shader — that is what Unity
					TextMeshPro and Godot 4 want.
				</p>
			`,
		})
	);

	if (pixelMode.enabled) {
		content.appendChild(
			makeElement({
				className: 'atlas-export__hint',
				innerHTML: `This project is a <b>${pixelMode.pixelsPerEm}px pixel font</b>, so the settings below start where they should: one texel per pixel, no padding, plain coverage.`,
			})
		);
	}

	const form = makeElement({ className: 'atlas-export__form' });

	// ---- Controls ----
	const sizeInput = makeNumberField('Pixel size', options.pixelSize, 4, 512);
	const pageInput = makeNumberField('Texture size', options.pageSize, 64, 4096);
	const paddingInput = makeNumberField('Padding', options.padding, 0, 16);
	const spacingInput = makeNumberField('Spacing', options.spacing, 0, 16);

	const potToggle = makeCheckboxField('Round texture to a power of two', options.powerOfTwo);
	const kerningToggle = makeCheckboxField('Include kerning pairs', options.includeKerning);
	const instructionsToggle = makeCheckboxField('Write import instructions alongside the files', true);

	const fieldSelect = makeSelectField([
		{ value: 'bitmap', label: 'Bitmap — plain coverage' },
		{ value: 'msdf', label: 'MSDF — scalable distance field' },
	]);

	const formatSelect = makeSelectField([
		{ value: 'text', label: 'Text — classic .fnt' },
		{ value: 'xml', label: 'XML — .xml, for Phaser and PixiJS' },
	]);

	// ---- Engine preset ----
	const engineSelect = makeSelectField(
		Object.keys(enginePresets).map((id) => ({ value: id, label: enginePresets[id].label }))
	);
	const engineNote = makeElement({ className: 'atlas-export__hint' });

	/**
	 * Pushes a preset's settings into the form.
	 *
	 * A preset only names the settings it cares about, so this writes back
	 * what came out of applyEnginePreset rather than the preset itself -
	 * everything else keeps whatever the user had already chosen.
	 */
	function applyPreset() {
		// @ts-expect-error - selects have a value
		const id = engineSelect.value;
		const applied = applyEnginePreset(readOptions(), id);

		sizeInput.set(applied.pixelSize);
		pageInput.set(applied.pageSize);
		paddingInput.set(applied.padding);
		spacingInput.set(applied.spacing);
		potToggle.set(applied.powerOfTwo);
		kerningToggle.set(applied.includeKerning);
		// @ts-expect-error - selects have a value
		fieldSelect.value = applied.fieldType;
		// @ts-expect-error - selects have a value
		formatSelect.value = applied.descriptorFormat;
		rangeInput.set(applied.pxRange);

		const preset = getEnginePreset(id);
		engineNote.textContent = preset ? preset.note : '';

		updateFieldTypeVisibility();
		refreshPreview();
	}

	engineSelect.addEventListener('change', applyPreset);

	const rangeInput = makeNumberField('Distance range', options.pxRange, 1, 32);
	const rangeRow = makeFieldRow(
		'Distance range',
		rangeInput.wrapper,
		'MSDF only. How far the field spreads either side of the outline, in pixels — also how much room an outline or glow effect has.'
	);

	/**
	 * The distance range only means anything for MSDF, so it is hidden
	 * rather than left on screen doing nothing.
	 */
	function updateFieldTypeVisibility() {
		// @ts-expect-error - select elements have a value
		rangeRow.hidden = fieldSelect.value !== 'msdf';
	}

	fieldSelect.addEventListener('change', () => {
		updateFieldTypeVisibility();
		refreshPreview();
	});

	const presetSelect = makeElement({ tag: 'select', className: 'atlas-export__select' });
	Object.keys(characterPresets).forEach((label) => {
		presetSelect.appendChild(makeElement({ tag: 'option', content: label, attributes: { value: label } }));
	});

	const charactersInput = makeElement({
		tag: 'textarea',
		className: 'atlas-export__characters',
		attributes: { rows: '3', spellcheck: 'false', placeholder: 'Every glyph in the project' },
	});

	presetSelect.addEventListener('change', () => {
		// @ts-expect-error - select elements have a value
		charactersInput.value = characterPresets[presetSelect.value] || '';
		refreshPreview();
	});

	// ---- Subsetting from the game's own text ----
	const subsetPanel = makeSubsetPanel((subsetString) => {
		// @ts-expect-error - textareas have a value
		charactersInput.value = subsetString;
		refreshPreview();
	});

	addAsChildren(form, [
		makeFieldRow('Target engine', makeStack([engineSelect, engineNote]), ''),
		makeFieldRow(
			'Field type',
			fieldSelect,
			'Bitmap for classic 2D engines, MSDF when the text is scaled or needs effects.'
		),
		makeFieldRow(
			'Descriptor',
			formatSelect,
			'Identical data either way. Phaser 3 and PixiJS parse the XML form; almost everything else reads the text form.'
		),
		makeFieldRow('Pixel size', sizeInput.wrapper, 'The em square, in pixels.'),
		rangeRow,
		makeFieldRow('Texture size', pageInput.wrapper, 'More pages are added if glyphs do not fit.'),
		makeFieldRow('Padding', paddingInput.wrapper, 'Transparent border baked around each glyph.'),
		makeFieldRow('Spacing', spacingInput.wrapper, 'Gap left between glyphs on the texture.'),
		makeFieldRow(
			'Options',
			makeStack([potToggle.wrapper, kerningToggle.wrapper, instructionsToggle.wrapper]),
			''
		),
		makeFieldRow(
			'Characters',
			makeStack([presetSelect, charactersInput]),
			'Leave empty for everything. Paste your game’s strings to ship only what you draw.'
		),
		makeFieldRow(
			'From your game',
			subsetPanel.wrapper,
			'Drop in your dialogue, UI strings or a localisation file. Every character in it is counted, and anything this font is missing is listed.'
		),
	]);

	content.appendChild(form);

	// ---- Preview ----
	const previewWrapper = makeElement({ className: 'atlas-export__preview' });
	const previewCanvasHolder = makeElement({ className: 'atlas-export__preview-canvas' });
	const previewStats = makeElement({ className: 'atlas-export__stats' });
	addAsChildren(previewWrapper, [previewCanvasHolder, previewStats]);
	content.appendChild(previewWrapper);

	// ---- Actions ----
	const exportButton = makeElement({
		tag: 'button',
		className: 'hub-button hub-button--primary hub-button--large',
		attributes: { type: 'button' },
		content: 'Export atlas',
	});

	const cancelButton = makeElement({
		tag: 'button',
		className: 'hub-button hub-button--large',
		attributes: { type: 'button' },
		content: 'Cancel',
		onClick: closeEveryTypeOfDialog,
	});

	const actions = makeElement({ className: 'atlas-export__actions' });
	addAsChildren(actions, [cancelButton, exportButton]);
	content.appendChild(actions);

	/**
	 * Reads the form back into an options object.
	 * @returns {Object}
	 */
	function readOptions() {
		return {
			pixelSize: sizeInput.value(),
			pageSize: pageInput.value(),
			padding: paddingInput.value(),
			spacing: spacingInput.value(),
			powerOfTwo: potToggle.checked(),
			includeKerning: kerningToggle.checked(),
			// @ts-expect-error - selects have a value
			fieldType: fieldSelect.value,
			// @ts-expect-error - selects have a value
			descriptorFormat: formatSelect.value,
			pxRange: rangeInput.value(),
			// @ts-expect-error - textareas have a value
			characters: charactersInput.value,
		};
	}

	/** @type {Object | false} - the most recent successful build */
	let lastResult = false;
	/** @type {Object} - the options that produced it */
	let lastOptions = readOptions();

	/**
	 * Rebuilds the atlas and redraws the preview.
	 *
	 * Building is the same work as exporting, so what you see is exactly what
	 * gets written - there is no separate preview path to drift out of sync.
	 */
	function refreshPreview() {
		const project = getCurrentProject();
		lastOptions = readOptions();
		try {
			lastResult = buildAtlas(project, lastOptions);
		} catch (error) {
			console.error('Atlas preview failed:', error);
			lastResult = false;
			previewStats.innerHTML = `<span class="atlas-export__warning">This atlas could not be built.</span>`;
			return;
		}

		previewCanvasHolder.innerHTML = '';
		lastResult.pages.forEach((canvas, index) => {
			const figure = makeElement({ className: 'atlas-export__page' });
			canvas.classList.add('atlas-export__page-canvas');
			figure.appendChild(canvas);
			figure.appendChild(
				makeElement({ className: 'atlas-export__page-label', content: `Page ${index + 1}` })
			);
			previewCanvasHolder.appendChild(figure);
		});

		const stats = lastResult.stats;
		const coverage = Math.round(stats.coverage * 100);
		let summary = `${stats.fieldType === 'msdf' ? 'MSDF' : 'Bitmap'} &middot; ${
			stats.glyphCount
		} glyphs &middot; ${stats.pageCount} × ${stats.pageSize}px page${
			stats.pageCount === 1 ? '' : 's'
		} &middot; ${coverage}% used`;
		if (stats.fieldType === 'msdf') summary += ` &middot; range ${stats.pxRange}px`;
		if (stats.kerningCount) summary += ` &middot; ${stats.kerningCount} kerning pairs`;

		previewStats.innerHTML = summary;

		/*
			The one thing that can quietly ruin a pixel font export. The size
			itself is legal, so nothing else would complain - it just comes out
			with grey edges everywhere.
		*/
		if (isPixelModeOn(project) && !isPixelPerfectSize(project, lastOptions.pixelSize)) {
			const perEm = getPixelMode(project).pixelsPerEm;
			previewStats.innerHTML += `<br><span class="atlas-export__warning">
				This is a ${perEm}px pixel font being exported at ${lastOptions.pixelSize}px, so its
				pixels do not line up with the texture's. Use ${perEm}, ${perEm * 2} or ${perEm * 3}
				for hard edges.
			</span>`;
		}

		if (lastResult.tooLarge.length) {
			previewStats.innerHTML += `<br><span class="atlas-export__warning">
				${lastResult.tooLarge.length} glyph(s) are bigger than one texture and were left out.
				Raise the texture size or lower the pixel size.
			</span>`;
		}
	}

	[sizeInput, pageInput, paddingInput, spacingInput, rangeInput].forEach((field) => {
		field.input.addEventListener('change', refreshPreview);
	});
	[potToggle, kerningToggle].forEach((field) => {
		field.input.addEventListener('change', refreshPreview);
	});
	formatSelect.addEventListener('change', refreshPreview);
	charactersInput.addEventListener('change', refreshPreview);

	exportButton.addEventListener('click', () => {
		if (!lastResult) {
			showError('The atlas could not be built with these settings.');
			return;
		}
		saveAtlasFiles(lastResult, lastOptions, {
			// @ts-expect-error - selects have a value
			presetId: engineSelect.value,
			withInstructions: instructionsToggle.checked(),
		});
	});

	showModalDialog(content, 760);
	applyPreset();
}

/**
 * Writes the descriptor and every texture page to disk.
 * @param {Object} result - output of buildAtlas
 * @param {Object} options - the options it was built with
 * @param {Object} extras - {presetId, withInstructions}
 */
function saveAtlasFiles(result, options, extras) {
	const isXML = options.descriptorFormat === 'xml';

	/*
		Both flavours carry the same fields, so only the chosen one is written -
		shipping two descriptors of the same font is a way to end up editing
		one and loading the other.
	*/
	const descriptorBlob = new Blob([isXML ? result.descriptorXML : result.descriptor], {
		type: isXML ? 'application/xml;charset=utf-8' : 'text/plain;charset=utf-8',
		endings: 'native',
	});
	const descriptorName = `${result.fileBaseName}.${isXML ? 'xml' : 'fnt'}`;
	saveFile(descriptorBlob, descriptorName);

	/*
		The descriptor is written in pixels and has no field for a distance
		range, so an MSDF atlas is unusable without this. It is written for
		bitmap atlases too, since em-relative metrics are useful either way.
	*/
	const metadataBlob = new Blob([JSON.stringify(result.metadata, null, '\t')], {
		type: 'application/json;charset=utf-8',
	});
	saveFile(metadataBlob, `${result.fileBaseName}.json`);

	if (extras.withInstructions) {
		const instructions = makeImportInstructions({
			presetId: extras.presetId,
			options: options,
			result: result,
		});
		saveFile(new Blob([instructions], { type: 'text/markdown;charset=utf-8' }), `${result.fileBaseName}_import.md`);
	}

	// Canvas encoding is asynchronous, so the pages arrive after the descriptor.
	// Their names are already written into it, so order does not matter to the
	// importer.
	result.pages.forEach((canvas, index) => {
		canvas.toBlob((blob) => {
			if (blob) saveFile(blob, result.pageFiles[index]);
		}, 'image/png');
	});

	closeEveryTypeOfDialog();
	showToast(
		`Exported ${result.stats.glyphCount} glyphs<br>${descriptorName} + .json${
			extras.withInstructions ? ' + instructions' : ''
		} + ${result.stats.pageCount} PNG`
	);
}

// --------------------------------------------------------------
// Subsetting from the game's own text
// --------------------------------------------------------------

/**
 * The paste-your-strings panel.
 *
 * Shipping an atlas of every glyph in the font is the usual waste in a game
 * build: a texture page mostly full of characters the game never draws. This
 * turns the game's own text into the character set, and - more useful - names
 * the characters the text needs that the font does not have yet.
 *
 * @param {Function} onSubset - called with the subset string once scanned
 * @returns {Object} - {wrapper}
 */
function makeSubsetPanel(onSubset) {
	const wrapper = makeElement({ className: 'atlas-export__subset' });

	const textInput = makeElement({
		tag: 'textarea',
		className: 'atlas-export__characters',
		attributes: {
			rows: '3',
			spellcheck: 'false',
			placeholder: 'Paste dialogue, UI strings, or the contents of a JSON / CSV localisation file',
		},
	});

	const fileInput = makeElement({
		tag: 'input',
		attributes: { type: 'file', accept: '.txt,.json,.csv,.tsv,.po,.properties,.md,.yaml,.yml', hidden: 'hidden' },
	});

	const loadButton = makeElement({
		tag: 'button',
		className: 'hub-button',
		attributes: { type: 'button' },
		content: 'Load a file…',
		onClick: () => fileInput.click(),
	});

	const scanButton = makeElement({
		tag: 'button',
		className: 'hub-button hub-button--primary',
		attributes: { type: 'button' },
		content: 'Use these characters',
	});

	const report = makeElement({ className: 'atlas-export__subset-report' });

	fileInput.addEventListener('change', () => {
		// @ts-expect-error - file inputs have files
		const file = fileInput.files && fileInput.files[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = () => {
			// @ts-expect-error - textareas have a value
			textInput.value = String(reader.result || '');
			scan();
		};
		reader.readAsText(file);
	});

	/**
	 * Turns whatever was pasted into a character set and a coverage report.
	 */
	function scan() {
		// @ts-expect-error - textareas have a value
		const raw = String(textInput.value || '');
		if (!raw.trim()) {
			report.innerHTML = '';
			return;
		}

		/*
			'auto' tries JSON first and falls back to treating the whole thing
			as text, which is what you want for CSV, .po and .properties files -
			their punctuation and keys are characters the game may well draw.
		*/
		const source = textFromSource(raw, 'auto');
		const usage = extractCharacters(source.text);
		const coverage = analyzeCoverage(getCurrentProject(), usage);

		if (!coverage.totalCharacters) {
			report.innerHTML = `<span class="atlas-export__warning">No characters found in that.</span>`;
			return;
		}

		onSubset(coverage.subsetString);
		report.innerHTML = describeCoverage(coverage, source.format);
	}

	scanButton.addEventListener('click', scan);

	const buttons = makeElement({ className: 'atlas-export__subset-actions' });
	addAsChildren(buttons, [loadButton, scanButton]);
	addAsChildren(wrapper, [textInput, fileInput, buttons, report]);

	return { wrapper: wrapper };
}

/**
 * Renders the coverage result.
 *
 * The interesting half is what is missing, so that is what gets the space -
 * grouped by Unicode block, because missing characters cluster (a whole
 * accented range, a set of arrows) and the grouping tells you which one.
 *
 * @param {Object} coverage - output of analyzeCoverage
 * @param {String} sourceFormat - how the input was read, 'json' or 'text'
 * @returns {String} - HTML
 */
function describeCoverage(coverage, sourceFormat) {
	const covered = coverage.covered.length;
	const missing = coverage.missing.length;

	/*
		Saying which way the input was read matters: a localisation JSON has
		its keys skipped, so a smaller count than expected is the answer
		working rather than a bug.
	*/
	let html =
		sourceFormat === 'json'
			? `Read as JSON — values only, keys skipped. `
			: '';

	html += `<b>${coverage.totalCharacters}</b> distinct character${
		coverage.totalCharacters === 1 ? '' : 's'
	} in that text &middot; <b>${covered}</b> already in this font`;

	if (!missing) {
		html += ` &middot; <span class="atlas-export__ok">nothing missing</span>`;
		return html;
	}

	html += ` &middot; <span class="atlas-export__warning"><b>${missing}</b> missing</span>`;

	// groupByBlock hands back the busiest block first, which is the one worth
	// acting on, so the order is used as it comes.
	html += '<ul class="atlas-export__blocks">';
	groupByBlock(coverage.missing).forEach((group) => {
		const sample = group.characters
			.map(
				(entry) =>
					`<span class="atlas-export__missing-char" title="${escapeAttribute(
						entry.name
					)}">${escapeHTML(entry.char)}</span>`
			)
			.join('');
		html += `<li><span class="atlas-export__block-name">${escapeHTML(group.block)}</span>${sample}</li>`;
	});
	html += '</ul>';
	html += `<div class="atlas-export__hint">
		The characters above are not in this font, so they are not in the atlas either — text using them
		will draw a gap. Add them as glyphs first, then export again.
	</div>`;

	return html;
}

/**
 * @param {String} value - untrusted text
 * @returns {String}
 */
function escapeHTML(value) {
	return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * @param {String} value - untrusted text
 * @returns {String}
 */
function escapeAttribute(value) {
	return escapeHTML(value).replace(/"/g, '&quot;');
}

// --------------------------------------------------------------
// Small form helpers
// --------------------------------------------------------------

/**
 * A labelled number input.
 * @param {String} label - accessible name
 * @param {Number} initial - starting value
 * @param {Number} min - minimum
 * @param {Number} max - maximum
 * @returns {Object}
 */
function makeNumberField(label, initial, min, max) {
	const input = makeElement({
		tag: 'input',
		className: 'atlas-export__number',
		attributes: {
			type: 'number',
			value: String(initial),
			min: String(min),
			max: String(max),
			'aria-label': label,
		},
	});

	return {
		wrapper: input,
		input: input,
		value: () => {
			// @ts-expect-error - input elements have a value
			const parsed = Number(input.value);
			if (!isFinite(parsed)) return initial;
			return Math.max(min, Math.min(max, Math.round(parsed)));
		},
		set: (next) => {
			// @ts-expect-error - input elements have a value
			input.value = String(Math.max(min, Math.min(max, Math.round(Number(next)))));
		},
	};
}

/**
 * A labelled checkbox.
 * @param {String} label - visible text
 * @param {Boolean} initial - starting state
 * @returns {Object}
 */
function makeCheckboxField(label, initial) {
	const input = makeElement({
		tag: 'input',
		attributes: { type: 'checkbox' },
	});
	// @ts-expect-error - checkboxes have a checked property
	input.checked = initial;

	const wrapper = makeElement({ tag: 'label', className: 'atlas-export__checkbox' });
	wrapper.appendChild(input);
	wrapper.appendChild(makeElement({ tag: 'span', content: label }));

	return {
		wrapper: wrapper,
		input: input,
		// @ts-expect-error - checkboxes have a checked property
		checked: () => !!input.checked,
		set: (next) => {
			// @ts-expect-error - checkboxes have a checked property
			input.checked = !!next;
		},
	};
}

/**
 * A select built from {value, label} entries.
 * @param {Array} entries - the options
 * @returns {Element}
 */
function makeSelectField(entries) {
	const select = makeElement({ tag: 'select', className: 'atlas-export__select' });
	entries.forEach((entry) => {
		select.appendChild(
			makeElement({ tag: 'option', content: entry.label, attributes: { value: entry.value } })
		);
	});
	return select;
}

/**
 * One row of the settings form.
 * @param {String} label - row label
 * @param {Element} control - the control
 * @param {String} hint - optional explanation
 * @returns {Element}
 */
function makeFieldRow(label, control, hint) {
	const row = makeElement({ className: 'atlas-export__row' });
	row.appendChild(makeElement({ className: 'atlas-export__label', content: label }));

	const controlWrapper = makeElement({ className: 'atlas-export__control' });
	controlWrapper.appendChild(control);
	if (hint) controlWrapper.appendChild(makeElement({ className: 'atlas-export__hint', content: hint }));

	row.appendChild(controlWrapper);
	return row;
}

/**
 * Stacks controls vertically inside one row.
 * @param {Array} children - elements to stack
 * @returns {Element}
 */
function makeStack(children) {
	const stack = makeElement({ className: 'atlas-export__stack' });
	addAsChildren(stack, children);
	return stack;
}
