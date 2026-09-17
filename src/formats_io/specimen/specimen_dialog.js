/**
	SPECIMEN SHEET — THE DIALOG

	Upload a sheet, say what is on it, look at what was found, import it.

	The review step is not a formality. Reading order is exact when the sheet
	holds what the layout says it holds, and wrong for every character after
	the first discrepancy when it does not - so the one thing this screen has
	to do well is show which rows are certain and which are not, before
	anything is written.

	Escape is handled here rather than left alone. The app's global key handler
	closes every dialog on Escape before it checks what has focus, and the
	modal closes on a backdrop click, so four minutes of corrections would go
	with one stray keypress. Both routes now ask first.
*/

import { addAsChildren, makeElement } from '../../common/dom.js';
import { closeEveryTypeOfDialog, showModalDialog, showToast } from '../../controls/dialogs/dialogs.js';
import { getCurrentProject, getCurrentProjectEditor } from '../../app/main.js';
import { makeInkMask } from './binarize.js';
import { segmentSheet } from './segment_sheet.js';
import { LAYOUT_TEMPLATES, layoutToText, parseLayout } from './layout_templates.js';
import { ROW_CHECK, ROW_COUNT_MISMATCH, ROW_OK, assignGlyphs } from './assign_glyphs.js';
import { measureBaselineWander, measureSheet } from './sheet_metrics.js';
import { describePlan, importSheet, planImport } from './import_sheet.js';
import { ACCEPTED_TYPES, imageFromTransfer, readSheetImage } from './read_image.js';

/** Everything this dialog knows, in one place so the redraws stay honest. */
let state = null;

/**
 * Opens the specimen sheet importer.
 */
export function showSpecimenSheetDialog() {
	state = {
		file: null,
		sheet: null,
		segmentation: null,
		layout: parseLayout(LAYOUT_TEMPLATES[0].rows.join('\n')),
		templateId: LAYOUT_TEMPLATES[0].id,
		assignment: null,
		metrics: null,
		plan: null,
		level: true,
		fit: true,
		skipped: new Set(),
		busy: false,
		error: '',
	};

	const content = makeElement({ className: 'dialog-layout dialog-form specimen' });

	const dropZone = makeDropZone();
	const layoutBlock = makeLayoutBlock();
	const options = makeOptions();
	const results = makeElement({ className: 'specimen__results' });
	const info = makeInfoBlock();

	const cancelButton = makeElement({
		tag: 'fancy-button',
		attributes: { secondary: '' },
		content: 'Cancel',
		onClick: () => tryClose(),
	});
	const importButton = makeElement({
		tag: 'fancy-button',
		content: 'Import characters',
		attributes: { disabled: '' },
		onClick: doImport,
	});

	addAsChildren(content, [dropZone, layoutBlock, options, results, info]);

	state.nodes = { content, results, importButton, dropZone };
	redraw();

	showModalDialog(content, 900, {
		title: 'Import a specimen sheet',
		subtitle: 'Trace a picture of a character set into this project.',
		actions: [cancelButton, importButton],
	});

	guardAgainstLosingWork();
}

/* --------------------------------------------------------
	Guarding the work
-------------------------------------------------------- */

/**
 * Stops Escape and a backdrop click from throwing away a reviewed sheet.
 *
 * The global handler is registered on `document` in the bubble phase and runs
 * before it checks whether an input has focus, so the only place to get in
 * front of it is a capturing listener on `document` - which fires first
 * whatever has focus at the time.
 */
function guardAgainstLosingWork() {
	const onKeyDown = (event) => {
		if (event.key !== 'Escape') return;
		if (!document.getElementById('modal-dialog')) {
			document.removeEventListener('keydown', onKeyDown, true);
			return;
		}
		if (!hasWorkToLose()) return;
		event.stopPropagation();
		event.preventDefault();
		askBeforeClosing();
	};
	document.addEventListener('keydown', onKeyDown, true);

	const modal = document.getElementById('modal-dialog');
	modal?.addEventListener(
		'click',
		(event) => {
			if (event.target !== modal) return;
			if (!hasWorkToLose()) return;
			event.stopPropagation();
			askBeforeClosing();
		},
		true
	);
}

/**
 * @returns {Boolean} true when closing now would cost the user something
 */
function hasWorkToLose() {
	return Boolean(state?.plan?.entries?.length);
}

/**
 * @param {Boolean =} force - skip the question
 */
function tryClose(force = false) {
	if (!force && hasWorkToLose()) {
		askBeforeClosing();
		return;
	}
	state = null;
	closeEveryTypeOfDialog();
}

function askBeforeClosing() {
	const results = state?.nodes?.results;
	if (!results) {
		tryClose(true);
		return;
	}

	const existing = results.querySelector('.specimen__confirm');
	if (existing) return;

	const confirm = makeElement({ className: 'specimen__confirm' });
	confirm.appendChild(
		makeElement({
			tag: 'span',
			className: 'specimen__confirm-text',
			content: 'Close without importing? The traced characters will be discarded.',
		})
	);
	const keep = makeElement({
		tag: 'button',
		attributes: { type: 'button' },
		className: 'specimen__confirm-button',
		content: 'Keep working',
		onClick: () => confirm.remove(),
	});
	const discard = makeElement({
		tag: 'button',
		attributes: { type: 'button' },
		className: 'specimen__confirm-button specimen__confirm-button--discard',
		content: 'Discard',
		onClick: () => tryClose(true),
	});
	addAsChildren(confirm, [keep, discard]);
	results.prepend(confirm);
	keep.focus();
}

/* --------------------------------------------------------
	Picking the sheet
-------------------------------------------------------- */

/**
 * @returns {Element}
 */
function makeDropZone() {
	const zone = makeElement({ className: 'specimen__drop' });

	const label = makeElement({
		tag: 'span',
		className: 'specimen__drop-label',
		content: 'Drop a specimen sheet here, or paste one',
	});

	const fileInput = makeElement({
		tag: 'input',
		attributes: { type: 'file', accept: ACCEPTED_TYPES, style: 'display: none;' },
	});
	fileInput.addEventListener('change', () => {
		const file = fileInput.files?.[0];
		// Cleared so picking the same path twice fires the event twice.
		fileInput.value = '';
		if (file) loadSheet(file);
	});

	const chooseButton = makeElement({
		tag: 'fancy-button',
		attributes: { secondary: '' },
		content: 'Choose an image…',
		onClick: () => fileInput.click(),
	});

	zone.addEventListener('dragover', (event) => {
		event.preventDefault();
		zone.setAttribute('dragging', '');
	});
	zone.addEventListener('dragleave', () => zone.removeAttribute('dragging'));
	zone.addEventListener('drop', (event) => {
		event.preventDefault();
		zone.removeAttribute('dragging');
		const file = imageFromTransfer(event.dataTransfer);
		if (file) loadSheet(file);
		else setError('That drop did not carry an image.');
	});

	document.addEventListener('paste', onPaste);

	addAsChildren(zone, [label, chooseButton, fileInput]);
	return zone;
}

/**
 * @param {ClipboardEvent} event
 */
function onPaste(event) {
	if (!state) {
		document.removeEventListener('paste', onPaste);
		return;
	}
	const file = imageFromTransfer(event.clipboardData);
	if (file) {
		event.preventDefault();
		loadSheet(file);
	}
}

/**
 * Reads, thresholds and segments a sheet, then analyses it.
 * @param {File} file
 */
async function loadSheet(file) {
	setError('');
	state.busy = true;
	state.file = file;
	redraw();

	try {
		// One frame, so the busy state is on screen before the work starts.
		await new Promise((resolve) => requestAnimationFrame(() => resolve(true)));
		const { rgba, width, height } = await readSheetImage(file);
		const mask = makeInkMask(rgba);
		state.sheet = {
			grey: mask.grey,
			width,
			height,
			threshold: mask.threshold,
			inverted: mask.inverted,
		};
		state.segmentation = segmentSheet(mask.ink, width, height);
		analyse();
	} catch (error) {
		state.sheet = null;
		state.segmentation = null;
		state.plan = null;
		setError(error?.message || 'That image could not be read.');
	} finally {
		state.busy = false;
		redraw();
	}
}

/* --------------------------------------------------------
	Saying what is on it
-------------------------------------------------------- */

/**
 * @returns {Element}
 */
function makeLayoutBlock() {
	const block = makeElement({ className: 'specimen__layout' });

	const head = makeElement({ className: 'specimen__layout-head' });
	head.appendChild(
		makeElement({ tag: 'span', className: 'specimen__label', content: 'What is on the sheet' })
	);

	const chooser = makeElement({
		tag: 'option-chooser',
		className: 'dialog-select',
		attributes: { 'selected-name': LAYOUT_TEMPLATES[0].name },
	});
	LAYOUT_TEMPLATES.forEach((template) => {
		chooser.appendChild(
			makeElement({
				tag: 'option',
				innerHTML: template.name,
				attributes: { note: template.note || '' },
				onClick: () => {
					state.templateId = template.id;
					state.layout = parseLayout(template.rows.join('\n'));
					textarea.value = layoutToText(state.layout);
					analyse();
					redraw();
				},
			})
		);
	});

	const textarea = makeElement({
		tag: 'textarea',
		className: 'dialog-textarea specimen__rows',
		attributes: { rows: '6', spellcheck: 'false' },
	});
	textarea.value = layoutToText(state.layout);
	textarea.addEventListener('input', () => {
		state.layout = parseLayout(textarea.value);
		state.templateId = 'custom';
		analyse();
		redraw();
	});

	addAsChildren(head, [chooser]);
	addAsChildren(block, [
		head,
		textarea,
		makeElement({
			tag: 'span',
			className: 'specimen__hint',
			content: 'One row of the sheet per line, in reading order. Spacing is ignored.',
		}),
	]);
	return block;
}

/**
 * @returns {Element}
 */
function makeOptions() {
	const block = makeElement({ className: 'specimen__options' });

	const toggle = (label, hint, key) => {
		const wrapper = makeElement({ tag: 'label', className: 'specimen__toggle' });
		const box = makeElement({
			tag: 'input',
			attributes: { type: 'checkbox', ...(state[key] ? { checked: '' } : {}) },
		});
		box.addEventListener('change', () => {
			state[key] = box.checked;
			analyse();
			redraw();
		});
		const text = makeElement({ className: 'specimen__toggle-text' });
		addAsChildren(text, [
			makeElement({ tag: 'span', className: 'specimen__toggle-title', content: label }),
			makeElement({ tag: 'span', className: 'specimen__toggle-hint', content: hint }),
		]);
		addAsChildren(wrapper, [box, text]);
		return wrapper;
	};

	addAsChildren(block, [
		toggle(
			'Level the baseline',
			'Put each character on the line it belongs on, keeping the overshoot round letters are drawn with.',
			'level'
		),
		toggle(
			'Even out the sizes',
			'Bring each character to the height it should stand, scaling it evenly so the strokes stay in proportion.',
			'fit'
		),
	]);
	return block;
}

/* --------------------------------------------------------
	Working it out
-------------------------------------------------------- */

function analyse() {
	if (!state.sheet || !state.segmentation) {
		state.assignment = null;
		state.metrics = null;
		state.plan = null;
		return;
	}

	const project = getCurrentProject();
	const targets = {
		upm: project.settings.font.upm,
		capHeight: project.settings.font.capHeight,
		xHeight: project.settings.font.xHeight,
		ascent: project.settings.font.ascent,
		descent: project.settings.font.descent,
	};

	state.assignment = assignGlyphs(state.segmentation.rows, state.layout);
	state.metrics = measureSheet(state.assignment, targets);
	state.wander = measureBaselineWander(state.assignment, state.metrics);
	state.plan = planImport(
		{ sheet: state.sheet, assignment: state.assignment, metrics: state.metrics },
		{ project, level: state.level, fit: state.fit, includeReviewed: true }
	);
}

/* --------------------------------------------------------
	Drawing it
-------------------------------------------------------- */

function redraw() {
	const { results, importButton } = state.nodes;
	results.textContent = '';

	if (state.error) {
		results.appendChild(
			makeElement({ tag: 'span', className: 'specimen__error', content: state.error })
		);
	}

	if (state.busy) {
		results.appendChild(
			makeElement({ tag: 'span', className: 'specimen__status', content: 'Reading the sheet…' })
		);
	}

	if (!state.plan || !state.assignment) {
		importButton.setAttribute('disabled', '');
		if (!state.busy && !state.error && !state.sheet) {
			results.appendChild(
				makeElement({
					tag: 'span',
					className: 'specimen__status',
					content: 'No sheet yet. Drop one above to see what is on it.',
				})
			);
		}
		return;
	}

	results.appendChild(makeSummary());
	state.assignment.rows.forEach((row) => results.appendChild(makeRow(row)));

	const chosen = chosenCharacters();
	if (chosen.length) importButton.removeAttribute('disabled');
	else importButton.setAttribute('disabled', '');
	importButton.innerHTML = `Import ${chosen.length} character${chosen.length === 1 ? '' : 's'}`;
}

/**
 * @returns {Element}
 */
function makeSummary() {
	const summary = makeElement({ className: 'specimen__summary' });
	const lines = [describePlan(state.plan)];

	if (state.metrics.source === 'guessed') {
		lines.push('The size is a guess — no baseline or cap height could be found.');
	}
	if (state.wander?.spread > state.metrics.derived.capHeight * 0.02) {
		const percent = ((state.wander.spread / state.metrics.derived.capHeight) * 100).toFixed(0);
		lines.push(
			`The sheet's own baseline wanders by about ${percent}% of the cap height. ` +
				(state.level ? 'Levelling will take that out.' : 'Turn on levelling to take that out.')
		);
	}
	for (const warning of state.metrics.warnings) lines.push(warning);

	lines.forEach((line, index) => {
		summary.appendChild(
			makeElement({
				tag: 'span',
				className: index ? 'specimen__summary-note' : 'specimen__summary-lead',
				content: line,
			})
		);
	});
	return summary;
}

/**
 * @param {Object} row - from assignGlyphs
 * @returns {Element}
 */
function makeRow(row) {
	const block = makeElement({ className: 'specimen__row' });
	block.setAttribute('status', row.status);

	const head = makeElement({ className: 'specimen__row-head' });
	head.appendChild(
		makeElement({ tag: 'span', className: 'specimen__row-name', content: `Row ${row.index + 1}` })
	);
	head.appendChild(
		makeElement({
			tag: 'span',
			className: 'specimen__row-count',
			content:
				row.status === ROW_COUNT_MISMATCH
					? `${row.found} shapes found, ${row.expected} characters declared`
					: `${row.found} character${row.found === 1 ? '' : 's'}`,
		})
	);
	block.appendChild(head);

	if (row.status === ROW_COUNT_MISMATCH) {
		block.appendChild(
			makeElement({
				tag: 'span',
				className: 'specimen__row-warning',
				content:
					'The counts do not match, so every character after the first difference may be in the wrong slot. ' +
					'Check this row against the sheet and correct the line above before importing it.',
			})
		);
	}

	const strip = makeElement({ className: 'specimen__strip' });
	row.cells.forEach((entry) => strip.appendChild(makeCell(entry)));
	block.appendChild(strip);
	return block;
}

/**
 * @param {Object} entry - one assigned cell
 * @returns {Element}
 */
function makeCell(entry) {
	const cell = makeElement({ className: 'specimen__cell' });
	cell.setAttribute('status', entry.status);

	const planned = entry.character
		? state.plan.entries.find((candidate) => candidate.character === entry.character)
		: null;

	const skipped = entry.character ? state.skipped.has(entry.character) : true;
	if (skipped) cell.setAttribute('skipped', '');

	cell.appendChild(makeThumbnail(planned));
	cell.appendChild(
		makeElement({
			tag: 'span',
			className: 'specimen__cell-char',
			content: entry.character ?? '—',
		})
	);

	if (planned?.replaces) {
		cell.appendChild(
			makeElement({ tag: 'span', className: 'specimen__cell-flag', content: 'replaces' })
		);
	} else if (entry.note) {
		cell.appendChild(
			makeElement({ tag: 'span', className: 'specimen__cell-flag', content: entry.note })
		);
	}

	if (entry.character) {
		cell.setAttribute('tabindex', '0');
		cell.setAttribute('role', 'checkbox');
		cell.setAttribute('aria-checked', skipped ? 'false' : 'true');
		cell.title = skipped ? `Include ${entry.character}` : `Skip ${entry.character}`;
		const flip = () => {
			if (state.skipped.has(entry.character)) state.skipped.delete(entry.character);
			else state.skipped.add(entry.character);
			redraw();
		};
		cell.addEventListener('click', flip);
		cell.addEventListener('keydown', (event) => {
			if (event.key !== 'Enter' && event.key !== ' ') return;
			event.preventDefault();
			flip();
		});
	}

	return cell;
}

/**
 * The traced outline itself, so the cell shows what would land.
 * @param {Object|null} planned - an entry from the plan
 * @returns {Element}
 */
function makeThumbnail(planned) {
	const box = makeElement({ className: 'specimen__thumb' });
	if (!planned) return box;

	const face = state.metrics.derived;
	const top = face.ascent;
	const bottom = face.descent;
	const width = planned.advanceWidth || face.upm;

	const path = planned.bezierData
		.map((contour) =>
			contour
				.map((bezier, index) => {
					const c1 = bezier[1] || bezier[0];
					const c2 = bezier[2] || bezier[3];
					const move = index === 0 ? `M${round(bezier[0].x)},${round(-bezier[0].y)}` : '';
					return `${move}C${round(c1.x)},${round(-c1.y)} ${round(c2.x)},${round(-c2.y)} ${round(bezier[3].x)},${round(-bezier[3].y)}`;
				})
				.join('') + 'Z'
		)
		.join(' ');

	box.innerHTML =
		`<svg viewBox="0 ${-top} ${width} ${top - bottom}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">` +
		`<path d="${path}" fill="currentColor" fill-rule="nonzero"/></svg>`;
	return box;
}

const round = (value) => Math.round(value);

/* --------------------------------------------------------
	Importing
-------------------------------------------------------- */

/**
 * @returns {Array} the characters the user has left in
 */
function chosenCharacters() {
	if (!state.plan) return [];
	return state.plan.entries
		.map((entry) => entry.character)
		.filter((character) => !state.skipped.has(character));
}

function doImport() {
	const only = chosenCharacters();
	if (!only.length) return;

	const editor = getCurrentProjectEditor();
	const result = importSheet(state.plan, {
		project: getCurrentProject(),
		history: editor?.history,
		face: state.metrics.derived,
		only,
	});

	state = null;
	closeEveryTypeOfDialog();
	editor?.navigate();

	const parts = [];
	if (result.written) parts.push(`${result.written} added`);
	if (result.replaced) parts.push(`${result.replaced} replaced`);
	if (result.skipped) parts.push(`${result.skipped} could not be read`);
	showToast(parts.join(', ') || 'Nothing was imported');
}

/* --------------------------------------------------------
	Explaining it
-------------------------------------------------------- */

/**
 * @param {String} message
 */
function setError(message) {
	if (state) state.error = message;
}

/**
 * @returns {Element}
 */
function makeInfoBlock() {
	const info = makeElement({ className: 'dialog-info' });
	info.appendChild(
		makeElement({
			tag: 'span',
			className: 'dialog-info__title',
			content: 'What a sheet can and cannot carry',
		})
	);
	info.appendChild(
		makeElement({
			tag: 'span',
			className: 'dialog-info__body',
			content:
				'Outlines are traced from the image at sub-pixel accuracy, so a bigger sheet is a better ' +
				'sheet — error shrinks in proportion to resolution. Spacing cannot be traced: the gaps on a ' +
				'sheet are how the picture was laid out, not the font’s sidebearings, so even sidebearings ' +
				'are generated and you will want to space the font yourself afterwards. Characters that are ' +
				'not on the sheet cannot be invented.',
		})
	);
	return info;
}
