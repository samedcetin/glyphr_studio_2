/**
	SPECIMEN SHEET — THE DIALOG

	Two steps. Choose a sheet, then check what was found on it.

	It used to be one screen that opened by asking the user to type out the
	character set. That was backwards: they arrived holding a picture of an
	alphabet and were met with a form. The layout is worked out from the sheet
	now - see detect_layout.js - so the second step shows a conclusion to agree
	with, and typing one is a detour off it rather than the way in.

	The sheet itself is shown back on that step, with the rows we found drawn
	over it. Confirming an interpretation against a list of characters is not
	something anyone can actually do; against their own picture it is.

	The review is not a formality. Reading order is exact when the sheet holds
	what the layout says it holds, and wrong for every character after the
	first discrepancy when it does not - so the one thing this screen has to do
	well is show which rows are certain and which are not, before anything is
	written.

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
import {
	ROW_CHECK,
	ROW_COUNT_MISMATCH,
	ROW_UNDECLARED,
	assignGlyphs,
} from './assign_glyphs.js';
import { measureBaselineWander, measureSheet } from './sheet_metrics.js';
import { canImportWithoutReview, describePlan, importSheet, planImport } from './import_sheet.js';
import { ACCEPTED_TYPES, imageFromTransfer, readSheetImage } from './read_image.js';
import { DETECTED, UNDETECTED, describeDetection, detectLayout } from './detect_layout.js';
import { announceArrival, cancelArrival } from './arrival.js';

/** Everything this dialog knows, in one place so the redraws stay honest. */
let state = null;

/** Pick a sheet. Nothing else is on screen. */
const STEP_SHEET = 'sheet';
/** Look at what was found and import it. */
const STEP_REVIEW = 'review';
/** Say what is on the sheet, when what was detected is wrong. */
const STEP_LAYOUT = 'layout';

/** What each step is called, and what it is for. */
const STEPS = {
	[STEP_SHEET]: { title: 'Choose a sheet', subtitle: 'A picture of a character set, traced into outlines.' },
	[STEP_REVIEW]: { title: 'Check the characters', subtitle: 'What we found on your sheet, before anything is written.' },
	[STEP_LAYOUT]: { title: 'What is on the sheet', subtitle: 'One row per line, in reading order.' },
};

/**
 * What to scale the trace against before there is a project to ask.
 *
 * Only the cap height anchors the size; every other line is measured off the
 * sheet itself and written back, so these are a starting point rather than a
 * shape imposed on the face.
 */
const DEFAULT_FONT_METRICS = {
	upm: 2048,
	capHeight: 1480,
	xHeight: 1100,
	ascent: 1550,
	descent: -440,
};

/**
 * Opens the specimen sheet importer.
 *
 * The caller says where the characters are to land, because neither of the two
 * obvious guesses is right from both places this is opened. `getCurrentProject`
 * is correct from inside the editor and wrong from the hub, where there may be
 * no project at all and reading it quietly mints a blank one. And
 * `getProjectEditorImportTarget` is correct from the hub and wrong from the
 * editor, because that target is sticky - once a second project has been opened
 * it keeps pointing at it, so an import from the editor would land in the other
 * font.
 *
 * @param {Object =} options
 * @param {Object =} options.editor - the project editor to import into; omit to
 *   use the one being edited
 * @param {Function =} options.createTarget - for a caller with no project yet,
 *   such as the hub: returns the editor to import into. It is called only when
 *   an import actually happens, so backing out of the review leaves no empty
 *   project behind.
 * @param {Function =} options.onImported - called after a successful import,
 *   with { editor, result }, for a caller that has to navigate somewhere
 */
export function showSpecimenSheetDialog(options = {}) {
	state = {
		target: {
			editor: options.editor ?? null,
			createTarget: options.createTarget ?? null,
			onImported: options.onImported ?? null,
		},
		/*
			Where in the wizard we are. Three, and the third is a detour rather
			than a stage: you only go to `layout` when what was detected is
			wrong, and you come straight back.
		*/
		step: STEP_SHEET,
		detection: null,
		previewURL: '',
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

	/*
		Every step's blocks are built once and shown by step, rather than the
		content being torn down and rebuilt on each move. The drop zone holds a
		file input and the layout box holds what the user has typed into it -
		both would be lost by a rebuild, and the typing is the thing they came
		to this step to do.
	*/
	const steps = makeElement({ className: 'specimen__steps' });
	const dropZone = makeDropZone();
	const sheetPreview = makeElement({ className: 'specimen__sheet-holder' });
	const detected = makeElement({ className: 'specimen__detected-holder' });
	const layoutBlock = makeLayoutBlock();
	const optionsBlock = makeOptions();
	const results = makeElement({ className: 'specimen__results' });
	const info = makeInfoBlock();

	const cancelButton = makeElement({
		tag: 'fancy-button',
		attributes: { secondary: '' },
		content: 'Cancel',
		onClick: () => tryClose(),
	});
	const primaryButton = makeElement({
		tag: 'fancy-button',
		content: 'Import characters',
		attributes: { disabled: '' },
		onClick: () => onPrimary(),
	});

	addAsChildren(content, [
		steps,
		dropZone,
		sheetPreview,
		detected,
		layoutBlock,
		optionsBlock,
		results,
		info,
	]);

	state.nodes = {
		content,
		steps,
		dropZone,
		sheetPreview,
		detected,
		layoutBlock,
		optionsBlock,
		results,
		info,
		primaryButton,
		layoutText: state.pendingLayoutText || null,
	};
	delete state.pendingLayoutText;
	redraw();

	showModalDialog(content, 900, {
		title: 'Import a specimen sheet',
		subtitle: STEPS[STEP_SHEET].subtitle,
		actions: [cancelButton, primaryButton],
	});

	redrawFrame();
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
	if (state?.previewURL) URL.revokeObjectURL(state.previewURL);
	cancelArrival();
	state = null;
	closeEveryTypeOfDialog();
}

/**
 * Asks before discarding a reviewed sheet.
 *
 * The bar is pinned to the bottom of the dialog body rather than put into the
 * flow, because the flow is a long scroll and the question can be triggered
 * from anywhere in it. Measured before this was fixed: with the review grid
 * scrolled down, Escape put the question 993px above the visible area - so the
 * dialog appeared to have ignored the key entirely, which is worse than just
 * closing. Pinned, it lands directly above the actions, which is where the
 * cursor already is if Cancel or the close control was what asked.
 */
function askBeforeClosing() {
	const content = state?.nodes?.content;
	if (!content) {
		tryClose(true);
		return;
	}

	const existing = content.querySelector('.specimen__confirm');
	if (existing) {
		existing.querySelector('.specimen__confirm-button')?.focus();
		return;
	}

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
	content.appendChild(confirm);
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

		/*
			Worked out rather than asked for. The number of shapes in each row
			is a fingerprint, and the pieces each shape is drawn in check it -
			so the common sheet needs no form at all, and the user is shown a
			conclusion to agree with instead of a question to answer.
		*/
		state.detection = detectLayout(state.segmentation);
		if (state.detection.status === DETECTED) state.layout = state.detection.layout;
		syncLayoutText();

		// The sheet itself, shown back on the next step.
		if (state.previewURL) URL.revokeObjectURL(state.previewURL);
		state.previewURL = URL.createObjectURL(file);

		analyse();
		state.step = STEP_REVIEW;

		/*
			And when there is nothing on that step to act on, do not show it.

			The review earns its place by catching a sheet that was read wrong.
			A layout identified with every cell agreeing, landing where nothing
			is overwritten, has no such catch in it - so the user goes straight
			to their font rather than being asked to approve an answer that has
			already been checked. canImportWithoutReview holds the rule,
			including the one case that is never skipped.
		*/
		if (canImportWithoutReview(state.detection, state.plan, state.assignment)) {
			doImport();
			return;
		}
	} catch (error) {
		state.sheet = null;
		state.segmentation = null;
		state.plan = null;
		state.detection = null;
		setError(error?.message || 'That image could not be read.');
	} finally {
		state.busy = false;
		redraw();
		redrawFrame();
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
	if (state.nodes) state.nodes.layoutText = textarea;
	else state.pendingLayoutText = textarea;
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

/**
 * Writes the current layout into the box on the layout step.
 *
 * Kept as a handle rather than rebuilt, because rebuilding the block would
 * throw away whatever the user had typed into it.
 */
function syncLayoutText() {
	if (state?.nodes?.layoutText) state.nodes.layoutText.value = layoutToText(state.layout);
}

/* --------------------------------------------------------
	Moving between steps
-------------------------------------------------------- */

/**
 * @param {String} step - one of STEP_SHEET, STEP_REVIEW, STEP_LAYOUT
 */
function goTo(step) {
	if (!state) return;
	state.step = step;
	redraw();
	redrawFrame();
	// The body scrolls per step; arriving half way down the previous one reads
	// as the dialog having ignored the move.
	document.querySelector('.modal-dialog__body')?.scrollTo({ top: 0 });
}

/**
 * The frame's own title and subtitle, which belong to the step rather than to
 * the dialog. showModalDialog sets them once, so they are written here after.
 */
function redrawFrame() {
	if (!state) return;
	const step = STEPS[state.step];
	const title = document.querySelector('.modal-dialog__title');
	const subtitle = document.querySelector('.modal-dialog__subtitle');
	if (title) title.textContent = step.title;
	if (subtitle) subtitle.textContent = step.subtitle;
}

/**
 * What the primary button does, which is not the same thing on every step.
 */
function onPrimary() {
	if (state?.step === STEP_LAYOUT) goTo(STEP_REVIEW);
	else doImport();
}

/**
 * The three dots, so the wizard says how long it is.
 * @returns {Element}
 */
function makeStepTrail() {
	const trail = makeElement({ className: 'specimen__trail' });
	/*
		Two, not three. `layout` is a detour off the review rather than a stage
		of the journey - counting it would tell everyone the wizard is three
		steps long when almost nobody will see it.
	*/
	[STEP_SHEET, STEP_REVIEW].forEach((step, index) => {
		const done = state.step === STEP_REVIEW && step === STEP_SHEET;
		const here = state.step === step || (state.step === STEP_LAYOUT && step === STEP_REVIEW);
		const dot = makeElement({
			tag: 'span',
			className: 'specimen__trail-step',
			content: `${index + 1}. ${STEPS[step].title}`,
		});
		if (here) dot.setAttribute('here', '');
		if (done) dot.setAttribute('done', '');
		trail.appendChild(dot);
	});
	return trail;
}

/* --------------------------------------------------------
	The sheet, and what we made of it
-------------------------------------------------------- */

/**
 * The uploaded picture, with the rows we found drawn over it.
 *
 * Showing the sheet back is half of why this step exists: the user is being
 * asked to confirm an interpretation, and they cannot do that against a list
 * of characters alone. The bands are the other half - they say WHERE we think
 * each row is, which is the thing that goes wrong on an unusual sheet, and
 * they say it without a word of explanation.
 *
 * @returns {Element}
 */
function makeSheetPreview() {
	const block = makeElement({ className: 'specimen__sheet' });
	if (!state.previewURL || !state.sheet) return block;

	const frame = makeElement({ className: 'specimen__sheet-frame' });
	frame.appendChild(
		makeElement({
			tag: 'img',
			className: 'specimen__sheet-image',
			attributes: { src: state.previewURL, alt: 'The specimen sheet you chose' },
		})
	);

	// Percentages, so the overlay follows the image at whatever size it is
	// drawn - the frame is fluid and the sheet can be any proportion.
	const rows = state.segmentation?.rows ?? [];
	rows.forEach((row, index) => {
		const top = (row.y0 / state.sheet.height) * 100;
		const height = ((row.y1 - row.y0 + 1) / state.sheet.height) * 100;
		const band = makeElement({
			className: 'specimen__sheet-band',
			style: `top: ${top.toFixed(2)}%; height: ${height.toFixed(2)}%;`,
		});
		band.appendChild(
			makeElement({
				tag: 'span',
				className: 'specimen__sheet-band-label',
				content: `${row.glyphs.length}`,
			})
		);
		frame.appendChild(band);
	});

	block.appendChild(frame);
	block.appendChild(
		makeElement({
			tag: 'span',
			className: 'specimen__sheet-caption',
			content: `${state.file?.name || 'Sheet'} — ${state.sheet.width} × ${state.sheet.height}, ${rows.length} row${rows.length === 1 ? '' : 's'}`,
		})
	);
	return block;
}

/**
 * What we worked out the sheet holds, and the way to disagree.
 * @returns {Element}
 */
function makeDetectedBlock() {
	const block = makeElement({ className: 'specimen__detected' });
	const detection = state.detection;

	const text = makeElement({ className: 'specimen__detected-text' });
	text.appendChild(
		makeElement({
			tag: 'span',
			className: 'specimen__detected-name',
			content: detection?.status === DETECTED ? detection.template.name : 'We could not name this layout',
		})
	);
	text.appendChild(
		makeElement({
			tag: 'span',
			className: 'specimen__detected-note',
			content: describeDetection(detection ?? { status: UNDETECTED }),
		})
	);
	block.appendChild(text);

	block.appendChild(
		makeElement({
			tag: 'button',
			className: 'specimen__detected-change',
			attributes: { type: 'button' },
			content: detection?.status === DETECTED ? 'Not this?' : 'Tell us',
			onClick: () => goTo(STEP_LAYOUT),
		})
	);

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

	// Only to check what would be replaced, and to read the metrics the trace is
	// scaled against. From the hub there is nothing to collide with yet.
	const project = state.target.createTarget ? null : targetProject();
	const font = project?.settings?.font ?? DEFAULT_FONT_METRICS;
	const targets = {
		upm: font.upm,
		capHeight: font.capHeight,
		xHeight: font.xHeight,
		ascent: font.ascent,
		descent: font.descent,
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
	const nodes = state.nodes;
	const { results, primaryButton } = nodes;
	const step = state.step;

	// --- what belongs on this step -------------------------------
	nodes.steps.textContent = '';
	nodes.steps.appendChild(makeStepTrail());

	const show = (element, visible) => element.toggleAttribute('hidden', !visible);
	show(nodes.dropZone, step === STEP_SHEET);
	show(nodes.info, step === STEP_SHEET);
	show(nodes.sheetPreview, step === STEP_REVIEW);
	show(nodes.detected, step === STEP_REVIEW);
	show(nodes.optionsBlock, step === STEP_REVIEW);
	show(nodes.results, step === STEP_REVIEW);
	show(nodes.layoutBlock, step === STEP_LAYOUT);

	// --- the layout detour ---------------------------------------
	if (step === STEP_LAYOUT) {
		primaryButton.removeAttribute('disabled');
		primaryButton.innerHTML = 'Use this layout';
		return;
	}

	// --- picking a sheet -----------------------------------------
	results.textContent = '';
	if (step === STEP_SHEET) {
		primaryButton.setAttribute('disabled', '');
		primaryButton.innerHTML = 'Import characters';
		if (state.error) nodes.dropZone.after(makeErrorNote());
		return;
	}

	// --- reviewing what was found --------------------------------
	nodes.sheetPreview.textContent = '';
	nodes.sheetPreview.appendChild(makeSheetPreview());
	nodes.detected.textContent = '';
	nodes.detected.appendChild(makeDetectedBlock());

	if (state.error) results.appendChild(makeErrorNote());

	if (!state.plan || !state.assignment) {
		primaryButton.setAttribute('disabled', '');
		primaryButton.innerHTML = 'Import characters';
		return;
	}

	results.appendChild(makeSummary());
	state.assignment.rows.forEach((row) => results.appendChild(makeRow(row)));

	const chosen = chosenCharacters();
	if (chosen.length) primaryButton.removeAttribute('disabled');
	else primaryButton.setAttribute('disabled', '');
	primaryButton.innerHTML = `Import ${chosen.length} character${chosen.length === 1 ? '' : 's'}`;
}

/**
 * @returns {Element}
 */
function makeErrorNote() {
	return makeElement({ tag: 'span', className: 'specimen__error', content: state.error });
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
	// A shape only becomes a character once the layout has named it, so an
	// undeclared row counts shapes.
	let count;
	if (row.status === ROW_COUNT_MISMATCH) {
		count = `${row.found} shapes found, ${row.expected} characters declared`;
	} else if (row.status === ROW_UNDECLARED) {
		count = `${row.found} shape${row.found === 1 ? '' : 's'}, none declared`;
	} else {
		count = `${row.found} character${row.found === 1 ? '' : 's'}`;
	}
	head.appendChild(makeElement({ tag: 'span', className: 'specimen__row-count', content: count }));
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

	// A row the layout says nothing about has nothing to show per shape - every
	// tile would be empty and carry the same sentence. Said once, it is
	// information; said twenty-six times it is a wall.
	if (row.status === ROW_UNDECLARED) {
		block.appendChild(
			makeElement({
				tag: 'span',
				className: 'specimen__row-warning',
				content:
					'Nothing is declared for this row, so these shapes will not be imported. ' +
					'Add a line above with the characters on it to bring them in.',
			})
		);
		return block;
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

	// Only a note about THIS character earns space on it. A row-level problem
	// is stated once on the row, not repeated onto each of its thirteen tiles.
	if (entry.status === ROW_CHECK && entry.note) {
		cell.appendChild(
			makeElement({ tag: 'span', className: 'specimen__cell-flag', content: entry.note })
		);
	} else if (planned?.replaces) {
		cell.appendChild(
			makeElement({ tag: 'span', className: 'specimen__cell-flag', content: 'replaces' })
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

/**
 * The editor being imported into.
 * @returns {Object}
 */
function targetEditor() {
	return state?.target?.editor ?? getCurrentProjectEditor();
}

/**
 * The project being imported into, or null when there is not one yet.
 * @returns {Object|null}
 */
function targetProject() {
	const editor = state?.target?.editor;
	return editor ? editor.project : getCurrentProject();
}

function doImport() {
	const only = chosenCharacters();
	if (!only.length) return;

	const { createTarget, onImported } = state.target;
	// The project is minted here rather than when the dialog opened, so backing
	// out of the review leaves nothing behind.
	const editor = createTarget ? createTarget({ fileName: state.file?.name }) : targetEditor();
	if (!editor?.project) return;

	/*
		Announced before the import, so the Overview the navigation builds has
		something to play. In reading order, which is the order the plan is in,
		because that is the order they were on the sheet.
	*/
	announceArrival(state.plan.entries.filter((entry) => only.includes(entry.character)).map((entry) => entry.id));

	const result = importSheet(state.plan, {
		project: editor.project,
		history: editor?.history,
		face: state.metrics.derived,
		only,
	});

	state = null;
	closeEveryTypeOfDialog();
	if (onImported) onImported({ editor, result });
	else editor?.navigate();

	const parts = [];
	if (result.written) parts.push(`${result.written} added`);
	if (result.replaced) parts.push(`${result.replaced} replaced`);
	if (result.skipped) parts.push(`${result.skipped} could not be read`);
	showToast(parts.join(', ') || 'Nothing was imported', 3000, false, 'bottom');
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
