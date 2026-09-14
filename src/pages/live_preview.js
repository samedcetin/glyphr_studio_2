import { getCurrentProject, getCurrentProjectEditor } from '../app/main.js';
import { makeElement } from '../common/dom.js';
import { makeLineIcon } from '../common/icons.js';
import { FontPreview } from '../controls/font-preview/font_preview.js';
import { makeFancySlider } from '../controls/fancy-slider/fancy_slider.js';
import { DisplayCanvas } from '../display_canvas/display_canvas.js';
import { makeDirectToggle } from '../panels/cards.js';
import { SAMPLE_TEXTS, PANGRAMS, redrawAllLivePreviews } from '../panels/live_preview.js';
import { openPopOutWindow } from '../project_editor/pop_out_window.js';

/**
	PAGE > LIVE PREVIEW
	-------------------
	The font set in running text, and the controls that drive it.

	WHAT THIS PAGE WAS. The content-page shell: a 450px column on the left
	holding five stacked cards - a dropdown repeating the page you were
	already on, Options, Show, Pangrams, Glyph sets - beside the preview. The
	settings were spread across three of those cards with no order between
	them, and the sample texts were thirty rows of raw text you picked by
	reading, including two that are six hundred and seventy-six letter pairs
	rendered as a button label.

	It is the same shape as the Overview now: the thing on the left, the
	controls on the right, both on the shared page shell - see .studio-page
	and .studio-card in content-pages.css.
 */

/** Sizes the preview offers. The slider covers everything between. */
const PREVIEW_SIZES = [16, 24, 32, 48, 64, 96, 128];

/**
 * Page > Live preview
 * @returns {Element} - page content
 */
export function makePage_LivePreview() {
	const editor = getCurrentProjectEditor();
	const options = editor.livePreviewPageOptions;

	const content = makeElement({ tag: 'div', id: 'app__page' });
	const page = makeElement({ className: 'studio-page live-preview' });
	content.appendChild(page);

	page.appendChild(makeHead());

	const columns = makeElement({ className: 'live-preview__columns' });
	columns.appendChild(makeStageCard(options));
	columns.appendChild(makeSettingsCard(options));
	page.appendChild(columns);

	window.addEventListener('resize', livePreviewPageWindowResize);

	return content;
}

// --------------------------------------------------------------
// Head
// --------------------------------------------------------------

/**
 * @returns {Element}
 */
function makeHead() {
	const editor = getCurrentProjectEditor();
	const project = getCurrentProject();
	const head = makeElement({ className: 'studio-page__head' });

	const titles = makeElement({ className: 'studio-page__titles' });
	titles.appendChild(
		makeElement({ tag: 'h1', className: 'studio-page__title', content: 'Live preview' })
	);
	titles.appendChild(
		makeElement({
			className: 'studio-page__subtitle',
			content: 'See your typeface in context.',
		})
	);
	head.appendChild(titles);

	const context = makeElement({ className: 'studio-page__context' });
	context.appendChild(
		makeElement({
			tag: 'span',
			content: editor.selectedCharacterRange?.name || 'Characters',
		})
	);
	context.appendChild(makeElement({ tag: 'span', className: 'studio-page__dot' }));
	context.appendChild(
		makeElement({ tag: 'span', content: project.settings.font.style || 'Regular' })
	);

	/*
		The pop-out, as a button at the end of that line rather than a card in
		the settings. It opens the same preview in a window of its own, which
		is a thing you do to the page rather than a setting on it.
	*/
	const popOut = makeElement({
		tag: 'button',
		className: 'live-preview__pop-out',
		attributes: { type: 'button', 'aria-label': 'Pop out live preview' },
		innerHTML: makeLineIcon('openLivePreview', 18),
	});
	popOut.addEventListener('click', () => openPopOutWindow());
	context.appendChild(popOut);

	head.appendChild(context);
	return head;
}

// --------------------------------------------------------------
// The preview itself
// --------------------------------------------------------------

/**
 * The font, set.
 *
 * @param {Object} options - the page's TextBlockOptions
 * @returns {Element}
 */
function makeStageCard(options) {
	const project = getCurrentProject();
	const card = makeElement({ className: 'studio-card live-preview__stage' });

	card.appendChild(makeElement({ className: 'studio-eyebrow', content: 'Typeface preview' }));

	// The font's own name, and the way to change it.
	const identity = makeElement({ className: 'live-preview__identity' });
	identity.appendChild(
		makeElement({
			tag: 'span',
			className: 'live-preview__family',
			content: `${project.settings.font.family} ${project.settings.font.style}`.trim(),
		})
	);
	const edit = makeElement({
		tag: 'button',
		className: 'studio-link',
		attributes: { type: 'button' },
		innerHTML: `${makeLineIcon('edit', 14)} Edit`,
	});
	edit.addEventListener('click', () => {
		const editor = getCurrentProjectEditor();
		editor.nav.page = 'Settings';
		editor.navigate();
	});
	identity.appendChild(edit);
	card.appendChild(identity);

	// The renderer, in a box that owns the scrolling.
	const stage = makeElement({ className: 'live-preview__canvas-wrapper' });
	stage.appendChild(makeLivePreviewRenderer(options));
	card.appendChild(stage);

	card.appendChild(makeElement({ className: 'studio-rule' }));

	/*
		A fixed second specimen, under the one you are typing into. The sample
		text answers "how does this read"; this answers "what does the set look
		like", which is the other thing you come to a preview for and which you
		would otherwise have to type over your own text to see.
	*/
	card.appendChild(makeElement({ className: 'studio-eyebrow', content: 'Character sample' }));
	const sample = makeElement({ className: 'live-preview__sample' });
	sample.appendChild(
		makeElement({
			tag: 'display-canvas',
			attributes: {
				text: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ\nabcdefghijklmnopqrstuvwxyz\n0123456789 & @ ! ?',
				'font-size': '28',
				'line-gap': '8',
				'page-width': 'auto',
				'show-placeholder-message': 'false',
			},
		})
	);
	card.appendChild(sample);

	// What this is, and what it is set at.
	const footer = makeElement({ className: 'live-preview__stage-footer' });
	const state = makeElement({ className: 'live-preview__state' });
	state.appendChild(makeElement({ tag: 'span', className: 'live-preview__state-dot' }));
	state.appendChild(makeElement({ tag: 'span', content: 'Live preview' }));
	footer.appendChild(state);
	footer.appendChild(
		makeElement({
			className: 'live-preview__size-readout',
			content: `${options.fontSize} px`,
		})
	);
	card.appendChild(footer);

	return card;
}

// --------------------------------------------------------------
// Settings
// --------------------------------------------------------------

/**
 * Everything that drives the preview, in the order you reach for it: what it
 * says, how big, how far apart, what is drawn over it, and where to get more
 * to say.
 *
 * @param {Object} options - the page's TextBlockOptions
 * @returns {Element}
 */
function makeSettingsCard(options) {
	const card = makeElement({ className: 'studio-card live-preview__settings' });
	card.appendChild(
		makeElement({ tag: 'h2', className: 'studio-card__title', content: 'Preview settings' })
	);

	const textArea = makeElement({
		tag: 'textarea',
		className: 'studio-field live-preview__text',
		attributes: { spellcheck: 'false', rows: '3' },
	});
	// @ts-expect-error 'property does exist'
	textArea.value = options.text;
	textArea.addEventListener('input', (event) => {
		// @ts-expect-error 'property does exist'
		options.text = event.target.value;
		redrawAllLivePreviews();
	});

	// --- What it says --------------------------------------------
	const pangramSelect = makeElement({ tag: 'select', className: 'studio-select' });
	/* A slot for text that is not one of the presets - which is the state the
		moment anyone types, and the presets cannot describe. */
	const customOption = makeElement({ tag: 'option', content: 'Custom text' });
	customOption.setAttribute('value', 'custom');
	pangramSelect.appendChild(customOption);
	PANGRAMS.forEach((entry, index) => {
		const option = makeElement({ tag: 'option', content: entry.name });
		option.setAttribute('value', `${index}`);
		pangramSelect.appendChild(option);
	});

	const matchPreset = () => {
		const found = PANGRAMS.findIndex((entry) => entry.text === options.text);
		// @ts-expect-error 'property does exist'
		pangramSelect.value = found === -1 ? 'custom' : `${found}`;
	};
	matchPreset();

	pangramSelect.addEventListener('change', (event) => {
		// @ts-expect-error 'property does exist'
		const value = event.target.value;
		if (value === 'custom') return;
		options.text = PANGRAMS[parseInt(value)].text;
		// @ts-expect-error 'property does exist'
		textArea.value = options.text;
		redrawAllLivePreviews();
	});
	textArea.addEventListener('input', matchPreset);

	card.appendChild(makeSettingRow('Sample text', pangramSelect));
	card.appendChild(textArea);

	// --- How big, how far apart ----------------------------------
	card.appendChild(makeSizeRow(options));
	card.appendChild(makeLineGapRow(options));

	// --- What is drawn over it -----------------------------------
	card.appendChild(makeElement({ className: 'studio-rule' }));
	card.appendChild(
		makeElement({ tag: 'h3', className: 'live-preview__section-title', content: 'Display' })
	);

	/*
		Only the canvas renderer draws these. The native OTF and TTF flavors
		render real text with a real font, and there is no layer over that to
		put a baseline on - so the block says so rather than offering three
		switches that do nothing.
	*/
	const display = makeElement({ className: 'live-preview__display' });
	[
		['Baselines', 'showLineExtras', 'command_horizontalBar'],
		['Glyph bounds', 'showCharacterExtras', 'command_icons'],
		['Page outline', 'showPageExtras', 'command_newTab'],
	].forEach(([label, property, icon]) => {
		const row = makeElement({ className: 'live-preview__display-row' });
		row.appendChild(makeElement({ tag: 'span', content: label }));
		row.appendChild(
			makeDirectToggle(options, property, () => redrawAllLivePreviews(), {
				icon: icon,
				name: label,
				body: `Draw ${label.toLowerCase()} over the preview.`,
			})
		);
		display.appendChild(row);
	});
	card.appendChild(display);

	// --- The renderer --------------------------------------------
	card.appendChild(makeElement({ className: 'studio-rule' }));
	card.appendChild(makeRendererRow(options, display));

	// --- More to say ---------------------------------------------
	card.appendChild(makeElement({ className: 'studio-rule' }));
	card.appendChild(
		makeElement({ tag: 'h3', className: 'live-preview__section-title', content: 'More samples' })
	);

	const samples = makeElement({ className: 'live-preview__samples' });
	SAMPLE_TEXTS.forEach((entry) => {
		const row = makeElement({
			tag: 'button',
			className: 'live-preview__sample-row',
			attributes: { type: 'button' },
			innerHTML: `<span>${entry.name}</span><span class="live-preview__chevron">&rsaquo;</span>`,
		});
		row.addEventListener('click', () => {
			options.text = typeof entry.text === 'function' ? entry.text() : entry.text;
			// @ts-expect-error 'property does exist'
			textArea.value = options.text;
			matchPreset();
			redrawAllLivePreviews();
		});
		samples.appendChild(row);
	});
	card.appendChild(samples);

	// --- The one thing this page promises ------------------------
	const note = makeElement({ className: 'live-preview__note' });
	note.appendChild(
		makeElement({ className: 'live-preview__note-icon', innerHTML: makeLineIcon('sparkle', 14) })
	);
	note.appendChild(makeElement({ tag: 'span', content: 'Updates as you edit your font.' }));
	card.appendChild(note);

	return card;
}

/**
 * A label on the left, one control on the right.
 * @param {String} label
 * @param {Element} control
 * @returns {Element}
 */
function makeSettingRow(label, control) {
	const row = makeElement({ className: 'live-preview__row' });
	row.appendChild(makeElement({ tag: 'label', content: label }));
	row.appendChild(control);
	return row;
}

/**
 * Size, as a preset and a slider over the same value - the presets are the
 * sizes anyone specifies, the slider is everything between.
 *
 * @param {Object} options - the page's TextBlockOptions
 * @returns {Element}
 */
function makeSizeRow(options) {
	const select = makeElement({ tag: 'select', className: 'studio-select' });
	PREVIEW_SIZES.forEach((size) => {
		const option = makeElement({ tag: 'option', content: `${size} px` });
		option.setAttribute('value', `${size}`);
		select.appendChild(option);
	});

	/* A slot for whatever the slider lands on between two presets, so the
		field never states a size the preview is not set at. */
	const customOption = makeElement({ tag: 'option', content: '' });
	customOption.setAttribute('value', 'custom');
	customOption.hidden = true;

	const slider = makeFancySlider(options.fontSize, (value) => apply(value), 8, 160, 1);
	slider.classList.add('live-preview__size-slider');
	const sliderInput = slider.querySelector('input[type="range"]');

	/**
	 * @param {Number} size
	 */
	function apply(size) {
		options.fontSize = size;
		if (sliderInput instanceof HTMLInputElement) sliderInput.value = `${size}`;
		if (select instanceof HTMLSelectElement) {
			if (PREVIEW_SIZES.includes(size)) {
				customOption.remove();
				select.value = `${size}`;
			} else {
				customOption.textContent = `${size} px`;
				if (!customOption.parentElement) select.appendChild(customOption);
				select.value = 'custom';
			}
		}
		const readout = document.querySelector('.live-preview__size-readout');
		if (readout) readout.textContent = `${size} px`;
		redrawAllLivePreviews();
	}

	select.addEventListener('change', (event) => {
		// @ts-expect-error 'property does exist'
		if (event.target.value !== 'custom') apply(parseInt(event.target.value));
	});
	apply(parseInt(options.fontSize));

	const row = makeElement({ className: 'live-preview__row live-preview__row--size' });
	row.appendChild(makeElement({ tag: 'label', content: 'Size' }));
	row.appendChild(select);
	row.appendChild(slider);
	return row;
}

/**
 * @param {Object} options - the page's TextBlockOptions
 * @returns {Element}
 */
function makeLineGapRow(options) {
	const input = makeElement({
		tag: 'input-number',
		className: 'live-preview__line-gap',
		attributes: { value: `${options.lineGap}`, suffix: 'px', min: '0' },
	});
	input.addEventListener('change', (event) => {
		// @ts-expect-error 'property does exist'
		options.lineGap = Math.max(parseInt(event.target.value) || 0, 0);
		redrawAllLivePreviews();
	});
	return makeSettingRow('Line gap', input);
}

/**
 * Which renderer draws the preview.
 *
 * Kept from the old panel, where it was the first thing in the Options card
 * with four paragraphs of help behind an info bubble. It is a real choice -
 * the canvas draws the outlines you have designed, the other two build a real
 * font binary and set live text with it - so it stays, as one row.
 *
 * @param {Object} options - the page's TextBlockOptions
 * @param {Element} displayBlock - the switches only the canvas renderer uses
 * @returns {Element}
 */
function makeRendererRow(options, displayBlock) {
	const select = makeElement({ tag: 'select', className: 'studio-select' });
	[
		['gs', 'Outlines'],
		['otf', 'OTF font'],
		['ttf', 'TTF font'],
	].forEach(([value, label]) => {
		const option = makeElement({ tag: 'option', content: label });
		option.setAttribute('value', value);
		select.appendChild(option);
	});
	// @ts-expect-error 'property does exist'
	select.value = options.previewFlavor || 'gs';

	const applyFlavor = () => {
		const isNative = options.previewFlavor === 'otf' || options.previewFlavor === 'ttf';
		if (displayBlock instanceof HTMLElement) displayBlock.hidden = isNative;
		const title = displayBlock?.previousElementSibling;
		if (title instanceof HTMLElement) title.hidden = isNative;
	};

	select.addEventListener('change', (event) => {
		// @ts-expect-error 'property does exist'
		options.previewFlavor = event.target.value;
		applyFlavor();
		redrawLivePreviewPageDisplayCanvas();
	});
	applyFlavor();

	return makeSettingRow('Rendered as', select);
}

// --------------------------------------------------------------
// The renderer
// --------------------------------------------------------------

/**
 * Event handler for when the page gets resized.
 */
export function livePreviewPageWindowResize() {
	const wrapper = document.querySelector('.live-preview__canvas-wrapper');
	const renderer = wrapper?.firstElementChild;
	// @ts-expect-error resizeAndRedraw exists on the renderer web components
	if (renderer && typeof renderer.resizeAndRedraw === 'function') renderer.resizeAndRedraw();
}

/**
 * Redraws the Live Preview
 */
export function redrawLivePreviewPageDisplayCanvas() {
	const editor = getCurrentProjectEditor();
	if (editor.nav.page !== 'Live preview') return;
	const canvasWrapper = document.querySelector('.live-preview__canvas-wrapper');
	if (!canvasWrapper) return;
	canvasWrapper.innerHTML = '';
	canvasWrapper.appendChild(makeLivePreviewRenderer(editor.livePreviewPageOptions));
}

/**
 * Builds the live preview renderer for the page based on the selected render
 * flavor. 'gs' (Glyphr Studio) uses the canvas-drawn display-canvas control;
 * 'otf' / 'ttf' use the font-preview control, which renders editable native
 * text backed by an on-the-fly generated font binary.
 * @param {Object} livePreviewOptions - TextBlockOptions for the preview
 * @returns {Element} - the renderer web component
 */
function makeLivePreviewRenderer(livePreviewOptions) {
	const flavor = livePreviewOptions.previewFlavor || 'gs';

	if (flavor === 'otf' || flavor === 'ttf') {
		const fontPreview = new FontPreview(livePreviewOptions);
		// The font-preview control is the live text input for native flavors,
		// so keep the shared options text in sync as the user types.
		fontPreview.addEventListener('text-change', (event) => {
			// @ts-expect-error CustomEvent detail
			livePreviewOptions.text = event.detail.text;
		});
		return fontPreview;
	}

	return new DisplayCanvas(livePreviewOptions);
}
