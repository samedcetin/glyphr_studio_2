import { getCurrentProject } from '../../app/main.js';
import { addAsChildren, makeElement } from '../../common/dom.js';
import { decToHex } from '../../common/character_ids.js';
import {
	closeEveryTypeOfDialog,
	showModalDialog,
	showToast,
} from '../../controls/dialogs/dialogs.js';
import { hideTooltip, showTooltip } from '../../controls/tooltip/tooltip.js';
import { getUnicodeName } from '../../lib/unicode/unicode_names.js';
import { saveFile } from '../../project_editor/file_io.js';
import { buildAtlas, makeAtlasFileBaseName, makeDefaultAtlasOptions } from './build_atlas.js';
import {
	applyEnginePreset,
	enginePresets,
	getEnginePreset,
	makeImportInstructions,
} from './engine_presets.js';
import { getPixelMode, isPixelModeOn, isPixelPerfectSize } from '../../pixel_font/pixel_grid.js';
import { analyzeCoverage, extractCharacters, groupByBlock, textFromSource } from './subset.js';

/**
	ATLAS EXPORT
	------------
	The dialog for exporting a bitmap font, and the file saving that follows.

	Everything the export actually does lives in build_atlas.js, which knows
	nothing about the DOM beyond needing somewhere to make a canvas. This file
	is the part that talks to the user.

	WHAT THIS DIALOG WAS. Six lines of format prose above the first control, on
	every open. Its own scroll box and its own padding inside the frame's, so
	the title scrolled away and the Export button sat at the bottom of the
	scroll rather than in the footer. Its own button family, borrowed from the
	project hub at a height on no scale. And a preview built by rasterising
	every glyph in the project, synchronously, before the browser had painted
	the dialog it was in.

	Underneath that, a set of faults that all shared one shape: the dialog knew
	something and did not say it. Padding could not be zero and the field
	offered zero. Numbers were clamped on read and left wrong on screen. The
	engine preset carried Unity's texture size into every preset chosen after
	it. A glyph too big to pack was counted and not named, though it is written
	into the descriptor as an invisible gap. And the one validation it had -
	pressing Export with nothing to export - ran showError, which closes every
	dialog, so the single check in the file was the thing that threw the form
	away.
 */

/** Character set presets, from smallest payload to largest. */
const characterPresets = {
	'Everything in this project': '',
	'ASCII printable': makeRange(0x20, 0x7e),
	'Letters and digits': 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
	'Digits and punctuation': '0123456789.,:;!?%+-/()[]{}<>=*#@&$',
};

/** What the preset select says once the character list is no longer a preset. */
const CUSTOM_PRESET_LABEL = 'Custom';

/**
 * How long the form waits before rebuilding.
 *
 * Building is rasterising every glyph in the project, and in MSDF mode it is
 * that times a distance-field pass per channel. Bound straight to `change` it
 * ran once per field the moment you left it, including while tabbing through
 * the form; a quarter of a second of quiet is enough to make one build out of
 * a run of keystrokes without ever feeling like a wait.
 */
const REBUILD_DELAY = 250;

/** How many too-large or missing characters the dialog names before it counts. */
const NAMED_CHARACTER_LIMIT = 40;

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
	const project = getCurrentProject();
	const defaults = makeDefaultAtlasOptions();
	const pixelMode = getPixelMode(project);

	/*
		A pixel font has exactly one right answer for most of these, so it
		starts on it: its own size, the least padding the packer allows, and
		coverage rather than a distance field - a distance field of a pixel
		font throws away the only thing that made it a pixel font.
	*/
	if (pixelMode.enabled) {
		defaults.pixelSize = pixelMode.pixelsPerEm;
		defaults.padding = 1;
		defaults.spacing = 1;
		defaults.fieldType = 'bitmap';
	}

	const content = makeElement({ className: 'dialog-layout dialog-form atlas-export' });

	// --------------------------------------------------------------
	// Controls
	// --------------------------------------------------------------

	const engineSelect = makeSelect(
		'atlas-export__engine',
		Object.keys(enginePresets).map((id) => ({ value: id, label: enginePresets[id].label })),
		() => applyPreset()
	);
	const engineNote = makeElement({ className: 'dialog-field__hint' });
	/*
		The caveat, on screen. Three of the eight presets carry one, and those
		three are exactly the cases where the engine cannot do what you expect
		- Phaser's loader, Godot's importer, TextMeshPro's shader. It used to
		be written only into the instructions file, which is a file you read
		after you have already exported.
	*/
	const engineCaveat = makeElement({ className: 'dialog-note' });
	engineCaveat.hidden = true;

	const fieldSelect = makeSelect(
		'atlas-export__field-type',
		[
			{ value: 'bitmap', label: 'Bitmap — plain coverage' },
			{ value: 'msdf', label: 'MSDF — scalable distance field' },
		],
		() => {
			updateFieldTypeVisibility();
			scheduleRebuild();
		}
	);

	const formatSelect = makeSelect(
		'atlas-export__descriptor',
		[
			{ value: 'text', label: 'Text — classic .fnt' },
			{ value: 'xml', label: 'XML — .xml, for Phaser and PixiJS' },
		],
		() => redrawFilePlan()
	);

	const sizeInput = makeNumberField('atlas-export__pixel-size', defaults.pixelSize, 4, 512);
	const pageInput = makeNumberField('atlas-export__texture-size', defaults.pageSize, 64, 4096);
	/*
		One, not zero. build_atlas floors padding at MIN_PADDING = 1 whatever
		is asked for - a glyph drawn hard against its own edge bleeds into its
		neighbour when the texture is sampled - so a field offering 0 was
		offering a number the export could not honour, and the pixel-font hint
		promised "no padding" for an export that always carries one pixel.
	*/
	const paddingInput = makeNumberField('atlas-export__padding', defaults.padding, 1, 16);
	const spacingInput = makeNumberField('atlas-export__spacing', defaults.spacing, 0, 16);
	const rangeInput = makeNumberField('atlas-export__px-range', defaults.pxRange, 1, 32);

	const potToggle = makeOptionRow(
		'atlas-export__power-of-two',
		'Round the texture up to a power of two',
		'Older GPUs and some engines will not sample a texture whose sides are not powers of two.',
		defaults.powerOfTwo
	);
	const kerningToggle = makeOptionRow(
		'atlas-export__kerning',
		'Include kerning pairs',
		'Writes this font’s kerning into the descriptor. Engines that ignore it are no worse off.',
		defaults.includeKerning
	);
	const instructionsToggle = makeOptionRow(
		'atlas-export__instructions',
		'Write import instructions alongside the files',
		'A short Markdown file naming every file and the steps to load them in the engine you picked.',
		true
	);

	// --- Characters -------------------------------------------------
	const presetSelect = makeSelect(
		'atlas-export__character-preset',
		Object.keys(characterPresets).map((label) => ({ value: label, label: label })),
		(chosen) => {
			if (chosen === CUSTOM_PRESET_LABEL) return;
			/** @type {HTMLTextAreaElement} */ (charactersInput).value = characterPresets[chosen] || '';
			syncPresetSelect();
			scheduleRebuild();
		}
	);
	/*
		A slot for "none of the above". Two other things write into the
		character list - the preset select and the subset panel - and nothing
		reset this one, so it went on reading `ASCII printable` over a list
		that was no longer ASCII printable.
	*/
	const customPresetOption = makeElement({ tag: 'option', innerHTML: CUSTOM_PRESET_LABEL });
	customPresetOption.setAttribute('selection-id', CUSTOM_PRESET_LABEL);

	const charactersInput = makeElement({
		tag: 'textarea',
		id: 'atlas-export__characters',
		className: 'dialog-textarea',
		attributes: { rows: '3', spellcheck: 'false', placeholder: 'Every glyph in the project' },
	});

	/** Puts the preset select back in step with whatever the textarea holds. */
	function syncPresetSelect() {
		const value = `${/** @type {HTMLTextAreaElement} */ (charactersInput).value}`;
		const match = Object.keys(characterPresets).find((label) => characterPresets[label] === value);
		if (match) {
			customPresetOption.remove();
			presetSelect.set(match);
		} else {
			/* The slot only exists while it is the answer, so the list never
				offers "Custom" as something you can pick. */
			if (!customPresetOption.parentElement) presetSelect.element.appendChild(customPresetOption);
			presetSelect.element.setAttribute('selected-name', CUSTOM_PRESET_LABEL);
			presetSelect.element.setAttribute('selected-id', CUSTOM_PRESET_LABEL);
		}
	}

	charactersInput.addEventListener('change', () => {
		syncPresetSelect();
		scheduleRebuild();
	});

	// --- Subsetting from the game's own text -------------------------
	const subsetPanel = makeSubsetPanel((subsetString) => {
		/** @type {HTMLTextAreaElement} */ (charactersInput).value = subsetString;
		syncPresetSelect();
		scheduleRebuild();
	});

	// --------------------------------------------------------------
	// What the export will produce
	// --------------------------------------------------------------

	const preview = makeElement({ className: 'atlas-export__preview' });
	const previewPages = makeElement({ className: 'atlas-export__pages' });
	/*
		The numbers and the warnings announce; the texture pages beside them do
		not. A live region wrapped round a pair of canvases reads the whole
		preview out again on every change to any field.
	*/
	const previewStats = makeElement({
		className: 'atlas-export__stats',
		attributes: { role: 'status', 'aria-live': 'polite' },
	});
	const previewWarnings = makeElement({
		className: 'atlas-export__warnings',
		attributes: { role: 'status', 'aria-live': 'polite' },
	});
	const previewFiles = makeElement({ className: 'atlas-export__files' });
	addAsChildren(preview, [previewPages, previewStats, previewWarnings, previewFiles]);

	// --------------------------------------------------------------
	// Actions
	// --------------------------------------------------------------

	const exportButton = makeElement({
		tag: 'fancy-button',
		content: 'Export atlas',
		attributes: { disabled: '' },
	});

	const cancelButton = makeElement({
		tag: 'fancy-button',
		attributes: { secondary: '' },
		content: 'Cancel',
		onClick: closeEveryTypeOfDialog,
	});

	// --------------------------------------------------------------
	// Reading, building, saying
	// --------------------------------------------------------------

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
			fieldType: fieldSelect.get(),
			descriptorFormat: formatSelect.get(),
			pxRange: rangeInput.value(),
			characters: `${/** @type {HTMLTextAreaElement} */ (charactersInput).value}`,
		};
	}

	/** @type {Object | false} - the most recent successful build */
	let lastResult = false;
	/** @type {Object} - the options that produced it */
	let lastOptions = readOptions();
	/** @type {Number} */
	let rebuildTimer = 0;

	/**
	 * Asks for a rebuild, without doing one yet.
	 *
	 * Every control that changes what gets built comes through here. The
	 * descriptor format does not: build_atlas assembles both flavours on every
	 * call precisely so that switching between them costs nothing.
	 */
	function scheduleRebuild() {
		window.clearTimeout(rebuildTimer);
		preview.setAttribute('building', '');
		rebuildTimer = window.setTimeout(build, REBUILD_DELAY);
	}

	/**
	 * Rebuilds the atlas and redraws the preview.
	 *
	 * Building is the same work as exporting, so what you see is exactly what
	 * gets written - there is no separate preview path to drift out of sync.
	 */
	function build() {
		window.clearTimeout(rebuildTimer);
		lastOptions = readOptions();

		previewPages.innerHTML = '';
		previewWarnings.innerHTML = '';
		previewFiles.innerHTML = '';

		try {
			lastResult = buildAtlas(project, lastOptions);
		} catch (error) {
			console.error('Atlas build failed:', error);
			lastResult = false;
			/*
				The pages are cleared above, before the build rather than after
				it. They used to be cleared on the far side of the catch's early
				return, so a failed rebuild left the last good atlas on screen
				under a line saying it could not be built - and the promise
				above, that the preview is the export, was false in the one case
				where it mattered.
			*/
			previewStats.textContent = '';
			addWarning(previewWarnings, `This atlas could not be built. ${describeError(error)}`);
			refreshExportButton();
			preview.removeAttribute('building');
			return;
		}

		drawPreview();
		refreshExportButton();
		preview.removeAttribute('building');
	}

	/** Puts the built atlas, its numbers and its warnings on screen. */
	function drawPreview() {
		const stats = lastResult.stats;

		lastResult.pages.forEach((canvas, index) => {
			const figure = makeElement({ className: 'atlas-export__page' });
			canvas.classList.add('atlas-export__page-canvas');
			figure.appendChild(canvas);
			/*
				Numbered from zero, because that is what every file the export
				writes says: the PNG names, the descriptor's `page id`, each
				char's `page`, and the JSON sidecar. The preview counted from
				one, so a two page atlas showed Page 1 and Page 2 beside files
				called _0.png and _1.png.
			*/
			figure.appendChild(
				makeElement({ className: 'atlas-export__page-label', content: `Page ${index}` })
			);
			previewPages.appendChild(figure);
		});

		const coverage = Math.round(stats.coverage * 100);
		const parts = [
			stats.fieldType === 'msdf' ? 'MSDF' : 'Bitmap',
			`${stats.glyphCount} glyph${stats.glyphCount === 1 ? '' : 's'}`,
			`${stats.pageCount} × ${stats.pageSize}px page${stats.pageCount === 1 ? '' : 's'}`,
			`${coverage}% used`,
		];
		if (stats.fieldType === 'msdf') parts.push(`range ${stats.pxRange}px`);
		if (stats.kerningCount) parts.push(`${stats.kerningCount} kerning pairs`);
		previewStats.textContent = parts.join(' · ');

		describeWarnings();
		/* No file plan for an export that cannot happen. */
		if (stats.glyphCount) describeFiles();
	}

	/** Everything about this build worth interrupting for. */
	function describeWarnings() {
		/*
			Nothing to export is not a result, it is a dead end - and it used to
			read as an ordinary one: a valid atlas of zero glyphs, an enabled
			Export button, and three files written that no engine can use.
		*/
		if (!lastResult.stats.glyphCount) {
			addWarning(
				previewWarnings,
				'None of these characters exist in this project yet, so there is nothing to put in the atlas.'
			);
			return;
		}

		if (isPixelModeOn(project)) {
			const perEm = getPixelMode(project).pixelsPerEm;
			if (!isPixelPerfectSize(project, lastOptions.pixelSize)) {
				addWarning(
					previewWarnings,
					`This is a ${perEm}px pixel font being exported at ${
						lastOptions.pixelSize
					}px, so its pixels do not line up with the texture’s. Use ${perEm}, ${perEm * 2} or ${
						perEm * 3
					} for hard edges.`
				);
			}
			/*
				The hazard this file's own header calls out and nothing checked
				for: a distance field of a pixel font is a blurred pixel font.
				Picking the Unity preset is enough to do it by accident.
			*/
			if (lastOptions.fieldType === 'msdf') {
				addWarning(
					previewWarnings,
					'A distance field smooths every edge, which is the one thing a pixel font must not have. Bitmap is the field type for this font.'
				);
			}
		}

		if (lastResult.tooLarge.length) {
			const warning = addWarning(
				previewWarnings,
				`${lastResult.tooLarge.length} glyph${
					lastResult.tooLarge.length === 1 ? ' is' : 's are'
				} bigger than one texture, so ${
					lastResult.tooLarge.length === 1 ? 'it is' : 'they are'
				} written into the descriptor as blanks that still take up their own width. Raise the texture size or lower the pixel size.`
			);
			warning.appendChild(makeCharacterList(lastResult.tooLarge));
		}

		/*
			Characters asked for that the project has no glyph for. buildAtlas
			drops them without a word, which is right for it - but the dialog is
			where you find out that half of what you pasted is not in the font.
		*/
		const missing = findMissingCharacters(lastOptions.characters);
		if (missing.length) {
			const warning = addWarning(
				previewWarnings,
				`${missing.length} of the characters you asked for ${
					missing.length === 1 ? 'is' : 'are'
				} not in this font, so ${
					missing.length === 1 ? 'it is' : 'they are'
				} not in the atlas. Text using ${missing.length === 1 ? 'it' : 'them'} will draw a gap.`
			);
			warning.appendChild(makeCharacterList(missing));
		}
	}

	/**
	 * The files this export will write, by name, before it writes them.
	 *
	 * The base name, the page count and the descriptor extension were all
	 * known here and none of them were shown - so "Export" was a button whose
	 * result was some number of downloads with names you found out afterwards.
	 */
	function describeFiles() {
		const baseName = makeAtlasFileBaseName(project);
		const isXML = lastOptions.descriptorFormat === 'xml';
		const files = [`${baseName}.${isXML ? 'xml' : 'fnt'}`, `${baseName}.json`];
		if (instructionsToggle.checked()) files.push(`${baseName}_import.md`);
		lastResult.pageFiles.forEach((name) => files.push(name));

		previewFiles.appendChild(
			makeElement({
				tag: 'span',
				className: 'atlas-export__files-label',
				content: `${files.length} file${files.length === 1 ? '' : 's'} will be saved`,
			})
		);
		const list = makeElement({ className: 'atlas-export__file-names' });
		files.forEach((name) => {
			const item = makeElement({ tag: 'span', className: 'atlas-export__file-name' });
			item.textContent = name;
			list.appendChild(item);
		});
		previewFiles.appendChild(list);
	}

	/** Export can only be pressed when there is something to export. */
	function refreshExportButton() {
		const ready = !!lastResult && lastResult.stats.glyphCount > 0;
		if (ready) exportButton.removeAttribute('disabled');
		else exportButton.setAttribute('disabled', '');
	}

	/**
	 * Pushes a preset's settings into the form.
	 *
	 * From the defaults, not from whatever is on screen. applyEnginePreset
	 * merges `{...options, ...preset.settings}`, and only one of the eight
	 * presets names pixelSize and pageSize - so picking Unity and then Phaser
	 * left Phaser holding Unity's 64px em and 1024px texture, with nothing in
	 * the dialog saying where they came from.
	 */
	function applyPreset() {
		const id = engineSelect.get();
		const base = { ...defaults, characters: readOptions().characters };
		const applied = applyEnginePreset(base, id);

		sizeInput.set(applied.pixelSize);
		pageInput.set(applied.pageSize);
		paddingInput.set(applied.padding);
		spacingInput.set(applied.spacing);
		potToggle.set(applied.powerOfTwo);
		kerningToggle.set(applied.includeKerning);
		fieldSelect.set(applied.fieldType);
		formatSelect.set(applied.descriptorFormat);
		rangeInput.set(applied.pxRange);

		const preset = getEnginePreset(id);
		engineNote.textContent = preset ? preset.note : '';
		engineCaveat.textContent = preset && preset.caveat ? preset.caveat : '';
		engineCaveat.hidden = !engineCaveat.textContent;

		updateFieldTypeVisibility();
		scheduleRebuild();
	}

	/**
	 * The distance range only means anything for MSDF, so it is hidden rather
	 * than left on screen doing nothing.
	 */
	function updateFieldTypeVisibility() {
		rangeField.hidden = fieldSelect.get() !== 'msdf';
	}

	// --------------------------------------------------------------
	// Wiring
	// --------------------------------------------------------------

	[sizeInput, pageInput, paddingInput, spacingInput, rangeInput].forEach((field) => {
		field.input.addEventListener('change', () => {
			field.commit();
			scheduleRebuild();
		});
	});
	[potToggle, kerningToggle].forEach((field) => {
		field.input.addEventListener('change', scheduleRebuild);
	});

	/*
		Two that change nothing about the build. The descriptor format picks
		between two strings build_atlas has already written on every call; the
		instructions checkbox only adds a file. Both still redraw the file list.
	*/
	instructionsToggle.input.addEventListener('change', redrawFilePlan);

	/** The file list, without rebuilding the atlas it describes. */
	function redrawFilePlan() {
		if (!lastResult || !lastResult.stats.glyphCount) return;
		lastOptions = readOptions();
		previewFiles.innerHTML = '';
		describeFiles();
	}

	exportButton.addEventListener('click', () => {
		/* No showError here. It closes every dialog, so the one validation this
			dialog had was also the thing that threw the form away - and the
			button is disabled whenever there is nothing to export. */
		if (exportButton.hasAttribute('disabled') || !lastResult) return;
		saveAtlasFiles(lastResult, lastOptions, {
			presetId: engineSelect.get(),
			withInstructions: instructionsToggle.checked(),
		});
	});

	// --------------------------------------------------------------
	// Assembly
	// --------------------------------------------------------------

	if (pixelMode.enabled) {
		content.appendChild(
			makeElement({
				className: 'dialog-note',
				content: `This project is a <b>${pixelMode.pixelsPerEm}px pixel font</b>, so the settings below start where they should: one texel per pixel, the least padding the packer allows, and plain coverage.`,
			})
		);
	}

	const engineField = makeField('Target engine', engineSelect.element, '');
	engineField.appendChild(engineNote);
	engineField.appendChild(engineCaveat);

	const rangeField = makeField(
		'Distance range',
		rangeInput.input,
		'MSDF only. How far the field spreads either side of the outline, in pixels — also how much room an outline or glow effect has.'
	);

	addAsChildren(content, [
		engineField,
		makeField(
			'Field type',
			fieldSelect.element,
			'Bitmap for classic 2D engines, MSDF when the text is scaled or needs effects.'
		),
		makeField(
			'Descriptor',
			formatSelect.element,
			'Identical data either way. Phaser 3 and PixiJS parse the XML form; almost everything else reads the text form.'
		),
		makeField('Pixel size', sizeInput.input, 'The em square, in pixels.'),
		rangeField,
		makeField('Texture size', pageInput.input, 'More pages are added if glyphs do not fit.'),
		makeField(
			'Padding',
			paddingInput.input,
			'Transparent border baked around each glyph. One pixel is the least the packer allows: a glyph drawn hard against its own edge bleeds into its neighbour when the texture is sampled.'
		),
		makeField('Spacing', spacingInput.input, 'Gap left between glyphs on the texture.'),
		makeElement({ className: 'dialog-field__label', content: 'Options' }),
		potToggle.wrapper,
		kerningToggle.wrapper,
		instructionsToggle.wrapper,
		makeField(
			'Characters',
			makeStack([presetSelect.element, charactersInput]),
			'Leave empty for everything. Paste your game’s strings to ship only what you draw.',
			charactersInput
		),
		makeField(
			'From your game',
			subsetPanel.wrapper,
			'Drop in your dialogue, UI strings or a localisation file. Every character in it is counted, and anything this font is missing is listed.'
		),
		preview,
		makeInfoBlock(),
	]);

	showModalDialog(content, 820, {
		title: 'Export font atlas',
		subtitle: 'A texture, a descriptor, and the numbers your engine needs to read them.',
		actions: [cancelButton, exportButton],
	});

	/*
		The first build happens after the dialog has painted, not before it.
		applyPreset used to run in the same task as showModalDialog, so opening
		this dialog rasterised every glyph in the project - and in MSDF, ran a
		distance-field pass over each of them - while the screen still showed
		the page you clicked Export from.
	*/
	syncPresetSelect();
	applyPreset();
	/** @type {HTMLElement} */ (engineSelect.element).focus();
}

/**
 * A short account of why a build failed.
 * @param {*} error - whatever was thrown
 * @returns {String}
 */
function describeError(error) {
	const message = error && error.message ? `${error.message}` : '';
	return message ? `The build reported: ${message}` : 'No reason was reported.';
}

/**
 * @param {Element} parent - where to put it
 * @param {String} text - what it says
 * @returns {Element} - the warning, for anything that wants to add to it
 */
function addWarning(parent, text) {
	const warning = makeElement({ className: 'atlas-export__warning' });
	warning.appendChild(makeElement({ tag: 'span', content: text }));
	parent.appendChild(warning);
	return warning;
}

/**
 * The characters themselves, named on hover.
 *
 * buildAtlas hands back the code points of everything it could not pack, and
 * the dialog printed the length of that array - so "3 glyph(s) are bigger than
 * one texture" could not tell you which three.
 *
 * @param {Array} codePoints - the characters to name
 * @returns {Element}
 */
function makeCharacterList(codePoints) {
	const list = makeElement({ className: 'atlas-export__character-list' });
	const shown = codePoints.slice(0, NAMED_CHARACTER_LIMIT);

	shown.forEach((code) => {
		const hexString = `${decToHex(code)}`;
		const chip = makeElement({ className: 'atlas-export__character' });
		chip.textContent = String.fromCodePoint(code);
		const name = getUnicodeName(hexString);
		chip.setAttribute('data-tip-name', hexString);
		chip.setAttribute('data-tip-body', name);
		chip.setAttribute('aria-label', `${hexString} ${name}`);
		list.appendChild(chip);
	});

	if (codePoints.length > shown.length) {
		list.appendChild(
			makeElement({
				tag: 'span',
				className: 'atlas-export__character-more',
				content: `and ${codePoints.length - shown.length} more`,
			})
		);
	}

	list.addEventListener('mouseover', (event) => {
		const chip = /** @type {HTMLElement} */ (event.target)?.closest?.('.atlas-export__character');
		if (!(chip instanceof HTMLElement)) return;
		showTooltip(
			chip,
			chip.getAttribute('data-tip-name') || '',
			chip.getAttribute('data-tip-body') || ''
		);
	});
	list.addEventListener('mouseleave', hideTooltip);

	return list;
}

/**
 * Which of the characters asked for have no glyph in this project.
 * @param {String} characters - the character list, empty for everything
 * @returns {Array} - code points
 */
function findMissingCharacters(characters) {
	if (!characters) return [];
	const project = getCurrentProject();
	const seen = new Set();
	const missing = [];

	Array.from(characters).forEach((character) => {
		const code = character.codePointAt(0);
		if (code === undefined || seen.has(code)) return;
		seen.add(code);
		if (!project.getItem(`glyph-${decToHex(code)}`)) missing.push(code);
	});

	return missing;
}

/**
 * What a bitmap font is and which flavour to pick.
 *
 * Last, not first. It was six lines above the first control on every open,
 * which is a paragraph you read once and then scroll past forever.
 *
 * @returns {Element}
 */
function makeInfoBlock() {
	const info = makeElement({ className: 'dialog-info' });
	info.appendChild(
		makeElement({ tag: 'span', className: 'dialog-info__title', content: 'Bitmap or MSDF' })
	);
	info.appendChild(
		makeElement({
			className: 'dialog-info__body',
			content: `An atlas is a PNG of every glyph plus an AngelCode <code>.fnt</code> descriptor saying where each one sits, and a <code>.json</code> sidecar carrying the same metrics in em units. <b>Bitmap</b> is the classic format read by Phaser, LÖVE, Godot, Defold, libGDX, MonoGame and PixiJS — one size, drawn exactly as you see it. <b>MSDF</b> stores distances instead of coverage, so one texture stays sharp at any size and gives a shader room for outline and glow — that is what Unity TextMeshPro and Godot 4 want.`,
		})
	);
	return info;
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
		saveFile(
			new Blob([instructions], { type: 'text/markdown;charset=utf-8' }),
			`${result.fileBaseName}_import.md`
		);
	}

	closeEveryTypeOfDialog();

	/*
		Canvas encoding is asynchronous, so the pages arrive after the
		descriptor. Their names are already written into it, so order does not
		matter to the importer - but a page that fails to encode does matter,
		because the descriptor names a file that will not be there. It used to
		be dropped in silence under a toast reporting the number of pages
		built.
	*/
	let saved = 0;
	let failed = 0;
	if (!result.pages.length) {
		announceSave(result, descriptorName, extras.withInstructions, 0, 0);
		return;
	}
	result.pages.forEach((canvas, index) => {
		canvas.toBlob((blob) => {
			if (blob) {
				saveFile(blob, result.pageFiles[index]);
				saved++;
			} else {
				failed++;
			}
			if (saved + failed < result.pages.length) return;
			announceSave(result, descriptorName, extras.withInstructions, saved, failed);
		}, 'image/png');
	});
}

/**
 * @param {Object} result - the build
 * @param {String} descriptorName - the descriptor file's name
 * @param {Boolean} withInstructions - whether an instructions file went too
 * @param {Number} saved - pages written
 * @param {Number} failed - pages that could not be encoded
 */
function announceSave(result, descriptorName, withInstructions, saved, failed) {
	let message = `Exported ${result.stats.glyphCount} glyphs<br>${descriptorName} + .json${
		withInstructions ? ' + instructions' : ''
	} + ${saved} PNG`;
	if (failed) {
		message += `<br><b>${failed} texture page${
			failed === 1 ? '' : 's'
		} could not be written.</b> The descriptor names ${
			failed === 1 ? 'it' : 'them'
		}, so the font will not load until you export again.`;
	}
	showToast(message, failed ? 8000 : 3000);
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
		id: 'atlas-export__subset-text',
		className: 'dialog-textarea',
		attributes: {
			rows: '3',
			spellcheck: 'false',
			'aria-label': 'Text to take the character set from',
			placeholder: 'Paste dialogue, UI strings, or the contents of a JSON / CSV localisation file',
		},
	});

	const fileInput = makeElement({
		tag: 'input',
		attributes: {
			type: 'file',
			accept: '.txt,.json,.csv,.tsv,.po,.properties,.md,.yaml,.yml',
			hidden: 'hidden',
		},
	});

	const loadButton = makeElement({
		tag: 'fancy-button',
		attributes: { secondary: '' },
		content: 'Load a file…',
		onClick: () => fileInput.click(),
	});

	const scanButton = makeElement({
		tag: 'fancy-button',
		attributes: { secondary: '' },
		content: 'Use these characters',
	});

	const report = makeElement({
		className: 'atlas-export__subset-report',
		attributes: { role: 'status', 'aria-live': 'polite' },
	});

	fileInput.addEventListener('change', () => {
		const file = /** @type {HTMLInputElement} */ (fileInput).files?.[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = () => {
			/** @type {HTMLTextAreaElement} */ (textInput).value = String(reader.result || '');
			/*
				Cleared, so re-picking the same path fires change again. Edit
				your strings file, come back, pick it a second time and nothing
				happened at all - the input still held the old path, so the
				browser saw no change.
			*/
			/** @type {HTMLInputElement} */ (fileInput).value = '';
			/*
				And after a paint. A localisation file is walked character by
				character and then measured against the project; doing it inside
				onload froze the dialog between choosing the file and seeing
				anything happen.
			*/
			report.textContent = 'Reading…';
			window.requestAnimationFrame(() => scan());
		};
		reader.readAsText(file);
	});

	/**
	 * Turns whatever was pasted into a character set and a coverage report.
	 */
	function scan() {
		const raw = String(/** @type {HTMLTextAreaElement} */ (textInput).value || '');
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
			report.innerHTML = `<span class="atlas-export__warning-text">No characters found in that.</span>`;
			return;
		}

		/*
			An empty subset string means "everything" to buildAtlas, so handing
			one over when the font covers none of the text asked for the exact
			opposite of what the panel is for.
		*/
		if (!coverage.covered.length) {
			report.innerHTML = `<span class="atlas-export__warning-text">This font has none of the characters in that text, so there is no subset to take.</span>`;
			report.appendChild(makeElement({ innerHTML: describeCoverage(coverage, source.format) }));
			return;
		}

		onSubset(coverage.subsetString);
		report.innerHTML = describeCoverage(coverage, source.format);
	}

	scanButton.addEventListener('click', () => {
		report.textContent = 'Reading…';
		window.requestAnimationFrame(() => scan());
	});

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
	let html = sourceFormat === 'json' ? `Read as JSON — values only, keys skipped. ` : '';

	html += `<b>${coverage.totalCharacters}</b> distinct character${
		coverage.totalCharacters === 1 ? '' : 's'
	} in that text &middot; <b>${covered}</b> already in this font`;

	if (!missing) {
		html += ` &middot; <span class="atlas-export__ok-text">nothing missing</span>`;
		return html;
	}

	html += ` &middot; <span class="atlas-export__warning-text"><b>${missing}</b> missing</span>`;

	// groupByBlock hands back the busiest block first, which is the one worth
	// acting on, so the order is used as it comes.
	html += '<ul class="atlas-export__blocks">';
	groupByBlock(coverage.missing).forEach((group) => {
		const sample = group.characters
			.map(
				(entry) =>
					`<span class="atlas-export__character" aria-label="${escapeAttribute(
						entry.name
					)}">${escapeHTML(entry.char)}</span>`
			)
			.join('');
		html += `<li><span class="atlas-export__block-name">${escapeHTML(
			group.block
		)}</span>${sample}</li>`;
	});
	html += '</ul>';
	html += `<div class="dialog-field__hint">
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
 * A number input that says what it will actually be used as.
 *
 * value() used to clamp on read and never write the clamped number back, so a
 * texture size of 5000 stayed on screen while the export quietly used 4096,
 * and an emptied box read as blank while the build used the field's minimum.
 *
 * @param {String} id - for the label to point at
 * @param {Number} initial - starting value
 * @param {Number} min - minimum
 * @param {Number} max - maximum
 * @returns {Object}
 */
function makeNumberField(id, initial, min, max) {
	const input = makeElement({
		tag: 'input',
		id: id,
		className: 'atlas-export__number',
		attributes: {
			type: 'number',
			value: String(initial),
			min: String(min),
			max: String(max),
		},
	});

	const clamp = (raw) => {
		const parsed = Number(raw);
		if (!isFinite(parsed)) return initial;
		return Math.max(min, Math.min(max, Math.round(parsed)));
	};

	return {
		input: input,
		value: () => clamp(/** @type {HTMLInputElement} */ (input).value),
		set: (next) => {
			/** @type {HTMLInputElement} */ (input).value = String(clamp(next));
		},
		/** Writes back what the export will use, so the two never disagree. */
		commit: () => {
			/** @type {HTMLInputElement} */ (input).value = String(
				clamp(/** @type {HTMLInputElement} */ (input).value)
			);
		},
	};
}

/**
 * A boolean setting as the app's option row: a title, and a sentence saying
 * what turning it on does.
 *
 * @param {String} id - checkbox id
 * @param {String} title - what it is called
 * @param {String} hint - what it does
 * @param {Boolean} initial - starting state
 * @returns {Object}
 */
function makeOptionRow(id, title, hint, initial) {
	const wrapper = makeElement({ tag: 'label', className: 'dialog-option' });

	const input = makeElement({
		tag: 'input',
		id: id,
		attributes: { type: 'checkbox' },
	});
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
		set: (next) => {
			/** @type {HTMLInputElement} */ (input).checked = !!next;
		},
	};
}

/**
 * A select built from {value, label} entries.
 * @param {String} id - for the label to point at
 * @param {Array} entries - the options
 * @returns {Element}
 */
function makeSelect(id, entries, onChange) {
	const chooser = makeElement({
		tag: 'option-chooser',
		id: id,
		className: 'dialog-select',
	});

	let current = entries[0] ? entries[0].value : '';

	entries.forEach((entry) => {
		const option = makeElement({ tag: 'option', innerHTML: entry.label });
		/*
			The value, not the label. showOptions builds each row's id out of
			the option's own text unless the option names one - and these
			labels are sentences, "Bitmap — plain coverage", while the value
			the build reads is "bitmap".
		*/
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
 * One field: a label that points at its control, the control, and a sentence.
 *
 * The label used to be a bare span with no `for`, so none of the four selects
 * or two textareas in this dialog had an accessible name at all.
 *
 * @param {String} label - row label
 * @param {Element} control - the control
 * @param {String} hint - optional explanation
 * @returns {Element}
 */
function makeField(label, control, hint, labelFor = undefined) {
	const field = makeElement({ className: 'dialog-field' });

	const labelElement = makeElement({
		tag: 'label',
		className: 'dialog-field__label',
		content: label,
	});
	const target = labelFor || (control.id ? control : control.querySelector('[id]'));
	if (target && target.id) {
		/*
			A chooser cannot be pointed at with `for`. Its tab stop is the
			wrapper inside its shadow root, so the host is not a labelable
			element and the browser drops the association - which would leave
			the control with no accessible name at all, where these four
			started.
		*/
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

/**
 * Stacks controls vertically inside one field.
 * @param {Array} children - elements to stack
 * @returns {Element}
 */
function makeStack(children) {
	const stack = makeElement({ className: 'atlas-export__stack' });
	addAsChildren(stack, children);
	return stack;
}
