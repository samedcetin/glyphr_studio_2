import { getCurrentProjectEditor } from '../app/main';
import colorStyle from '../common/colors.css?inline';
import { addAsChildren, makeElement } from '../common/dom';
import logo from '../common/graphics/logo-icon.svg?raw';
import resetStyle from '../common/resets.css?inline';
import tokenStyle from '../common/tokens.css?inline';
import { closeEveryTypeOfDialog, makeModalDialog, showToast } from '../controls/dialogs/dialogs';
import dialogStyle from '../controls/dialogs/dialogs.css?inline';
import { FontPreview } from '../controls/font-preview/font_preview';
import { attachTooltip } from '../controls/tooltip/tooltip';
import { DisplayCanvas } from '../display_canvas/display_canvas';
import { TextBlockOptions } from '../display_canvas/text_block_options';
import { makeToolButtonSVG } from '../edit_canvas/tools/tools';
import { makePanel_LivePreview } from '../panels/live_preview';
import panelStyle from '../panels/panels.css?inline';
import popOutWindowStyle from './pop-out-window.css?inline';

export function openPopOutWindow() {
	// log(`openPopOutWindow`, 'start');
	const editor = getCurrentProjectEditor();
	const popOut = window.open('', 'glyphr-studio-pop-out-live-preview');

	/*
		A blocked popup returns null, not a window. Without this guard the next
		line threw on `null.customElements`, and worse, popOutWindow was left
		holding null - which is not `false`, so the toolbar button then thought
		a window was open and would only ever try to close it. The button became
		permanently dead until reload.
	*/
	if (!popOut) {
		editor.popOutWindow = false;
		showToast(
			`The live preview window was blocked.<br>Allow pop-ups for this site and try again.`
		);
		return;
	}

	// @ts-expect-error 'property does exist'
	editor.popOutWindow = popOut;

	// Define custom elements for the Pop Out Window
	// @ts-expect-error 'property does exist'
	editor.popOutWindow.customElements.define('display-canvas', DisplayCanvas);
	// @ts-expect-error 'property does exist'
	editor.popOutWindow.customElements.define('font-preview', FontPreview);

	// Init window properties
	// @ts-expect-error 'property does exist'
	let popDoc = editor.popOutWindow.document;

	popDoc.head.appendChild(makeElement({ tag: 'title', content: 'Live Preview - Blue Rain Type' }));

	/*
		tokens.css comes first, and the theme attribute comes with it. Every sheet
		below this line reads the token layer - resets.css, panels.css and
		dialogs.css all do - and without it each var() resolves to nothing and the
		declaration holding it is dropped. That is why this window used to render
		in browser-default type and always in the light palette.
	*/
	popDoc.documentElement.setAttribute(
		'data-theme',
		document.documentElement.getAttribute('data-theme') || 'light'
	);
	const tokens = makeElement({ tag: 'style', innerHTML: tokenStyle });
	popDoc.head.appendChild(tokens);
	const resets = makeElement({ tag: 'style', innerHTML: resetStyle });
	popDoc.head.appendChild(resets);
	const colors = makeElement({ tag: 'style', innerHTML: colorStyle });
	popDoc.head.appendChild(colors);
	const popWindow = makeElement({ tag: 'style', innerHTML: popOutWindowStyle });
	popDoc.head.appendChild(popWindow);
	const dialogs = makeElement({ tag: 'style', innerHTML: dialogStyle });
	popDoc.head.appendChild(dialogs);
	const panels = makeElement({ tag: 'style', innerHTML: panelStyle });
	popDoc.head.appendChild(panels);

	popDoc.body.appendChild(
		makeElement({
			tag: 'div',
			id: 'pop-out__wrapper',
		})
	);

	// @ts-expect-error 'property does exist'
	editor.popOutWindow.addEventListener('beforeunload', closePopOutWindow);
	window.addEventListener('beforeunload', closePopOutWindow);
	// @ts-expect-error 'property does exist'
	editor.popOutWindow.addEventListener('resize', livePreviewPopOutWindowResize);

	editor.subscribe({
		topic: '*',
		subscriberID: 'livePreviewPopOutWindow',
		callback: redrawPopOutWindow,
	});

	let favIcon = makeElement({
		tag: 'link',
		attributes: { rel: 'shortcut icon', href: `data:image/svg+xml,${encodeURI(logo)}` },
	});

	popDoc.head.appendChild(favIcon);

	updatePopOutWindowContent();
	// log(`openPopOutWindow`, 'end');
}

export function updatePopOutWindowContent() {
	// log(`updatePopOutWindowContent`, 'start');
	const editor = getCurrentProjectEditor();
	// @ts-expect-error 'property does exist'
	let popDoc = editor.popOutWindow.document;
	const popWrapper = popDoc.querySelector('#pop-out__wrapper');
	popWrapper.innerHTML = '';

	editor.livePreviews.forEach((options, index) => {
		// index 0 is for the Live Previews Page
		// the rest are for the Pop Out Window
		if (index !== 0) {
			// log(`appending new live preview renderer`);
			// log(options);
			options.widthAdjustment = -20;
			popWrapper.appendChild(makeLivePreviewRenderer(options));
		}
	});

	// Preview controls
	const footer = makeElement({ tag: 'div', className: 'pop-out__footer' });
	const editPreviewsButton = makeElement({
		tag: 'fancy-button',
		content: 'Edit live previews',
		attributes: { minimal: '' },
	});
	editPreviewsButton.addEventListener('click', showEditLivePreviewDialog);

	const addPreviewButton = makeElement({
		tag: 'fancy-button',
		content: 'Add a live preview',
		attributes: { minimal: '' },
	});
	addPreviewButton.addEventListener('click', () => {
		// log(`addPreviewButton ONCLICK`, 'start');
		let newPreview = new TextBlockOptions({ text: 'new live preview' });
		// log(`\n⮟newPreview⮟`);
		// log(newPreview);
		const editor = getCurrentProjectEditor();
		editor.livePreviews.push(newPreview);
		selectedLivePreview = editor.livePreviews.length - 1;
		updatePopOutWindowContent();
		showEditLivePreviewDialog();
		// log(`addPreviewButton ONCLICK`, 'end');
	});

	// addAsChildren(footer, [editPreviewsButton, addPreviewButton]);
	if (editor.livePreviews.length > 1) footer.appendChild(editPreviewsButton);
	footer.appendChild(addPreviewButton);
	popWrapper.appendChild(footer);

	// Update buttons
	const popButton = document.querySelector('#editor-page__tool__open-live-preview-pop-out');
	if (popButton) {
		popButton.innerHTML = makeToolButtonSVG({
			name: 'closeLivePreview',
			selected: false,
		});
	}

	// editor.popOutWindow.setTimeout(refreshPopOutWindow, 10);
	// log(`updatePopOutWindowContent`, 'end');
}

/**
 * Builds the live preview renderer for a single pop-out preview based on its
 * selected render flavor. 'gs' (Glyphr Studio) uses the canvas-drawn
 * display-canvas control; 'otf' / 'ttf' use the font-preview control, which
 * renders editable native text backed by an on-the-fly generated font binary.
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

export function closePopOutWindow(event) {
	// log(`closePopOutWindow`, 'start');

	if (event) event.preventDefault();
	const editor = getCurrentProjectEditor();

	try {
		// @ts-expect-error 'property does exist'
		editor.popOutWindow.close();
	} catch {
		console.warn('Could not close pop-out window');
	}

	editor.popOutWindow = false;
	editor.unsubscribe({ idToRemove: 'livePreviewPopOutWindow' });
	window.removeEventListener('beforeunload', closePopOutWindow);

	// Update buttons
	const popButton = document.querySelector('#editor-page__tool__open-live-preview-pop-out');
	if (popButton) {
		popButton.innerHTML = makeToolButtonSVG({
			name: 'openLivePreview',
			selected: false,
		});
	}

	// log(`closePopOutWindow`, 'end');
	return undefined;
}

function redrawPopOutWindow() {
	// log(`redrawPopOutWindow`, 'start');
	const editor = getCurrentProjectEditor();
	// @ts-expect-error 'property does exist'
	const popDoc = editor.popOutWindow.document;

	// display-canvas (Glyphr Studio flavor) rebuilds its text block then redraws.
	popDoc.body.querySelectorAll('display-canvas').forEach((can) => {
		can.updateTextBlock();
		can.redraw();
	});

	// font-preview (OTF / TTF flavors) regenerates its font binary and redraws.
	popDoc.body.querySelectorAll('font-preview').forEach((preview) => {
		preview.rebuildAndRedraw();
	});
	// log(`redrawPopOutWindow`, 'end');
}

/**
 * The way out to a full-screen preview: one button.
 *
 * It was a heading, two lines of prose and a button - 146px of a panel, on
 * every glyph, to say what the button already says. The sentence is the
 * button's tooltip now, where it costs nothing until it is wanted.
 *
 * @returns {HTMLElement}
 */
export function makeLivePreviewPopOutCard() {

	const button = makeElement({
		tag: 'fancy-button',
		attributes: { secondary: '' },
		content: 'Pop out live preview',
	});
	button.addEventListener('click', openPopOutWindow);
	attachTooltip(button, {
		name: 'Pop out live preview',
		body: 'A full-screen preview in a new window, for sentence and paragraph scale.',
	});

	return button;
}

export function livePreviewPopOutWindowResize() {
	// log(`livePreviewPopOutWindowResize`, 'start');
	const editor = getCurrentProjectEditor();
	// @ts-expect-error 'property does exist'
	let popDoc = editor.popOutWindow.document;
	const allDisplayCanvases = popDoc.querySelectorAll('display-canvas');
	// log(allDisplayCanvases);
	allDisplayCanvases.forEach((displayCanvas) => {
		// log(`\n⮟displayCanvas #${index}⮟`);
		// log(displayCanvas);
		// log(`displayCanvas.constructor.name: ${displayCanvas.constructor.name}`);
		displayCanvas.resizeAndRedraw(-50);
	});

	// font-preview renderers reflow natively; just rebuild and redraw them.
	popDoc.querySelectorAll('font-preview').forEach((preview) => {
		preview.resizeAndRedraw();
	});
	// log(`livePreviewPopOutWindowResize`, 'end');
}

// --------------------------------------------------------------
// Pop out window options dialog
// --------------------------------------------------------------

let selectedLivePreview = 1;
function showEditLivePreviewDialog() {
	// log(`showEditLivePreviewDialog`, 'start');
	const editor = getCurrentProjectEditor();
	// @ts-expect-error 'property does exist'
	const popDoc = editor.popOutWindow.document;
	let panelArea = makeElement({ tag: 'div', id: 'content-page__panel' });
	let header = makeElement({ tag: 'h1', content: 'Live Preview options' });
	// log(`selectedLivePreview: ${selectedLivePreview}`);
	// log(`\n⮟editor.livePreviews⮟`);
	// log(editor.livePreviews);
	let selected = editor.livePreviews[selectedLivePreview];
	// log(`\n⮟selected⮟`);
	// log(selected);
	let previewChooser = makeElement({
		tag: 'option-chooser',
		attributes: {
			'selected-name': `${selectedLivePreview}: ${selected.displayName}`,
			'selected-id': `${selectedLivePreview}: ${selected.displayName} ${selected.fontSize}px`,
		},
	});

	for (let i = 1; i < editor.livePreviews.length; i++) {
		let preview = editor.livePreviews[i];
		let option = makeElement({
			tag: 'option',
			innerHTML: `${i}: ${preview.displayName}`,
			attributes: { note: `${preview.fontSize}px` },
		});

		option.addEventListener('click', () => {
			selectedLivePreview = i;
			closeEveryTypeOfDialog();
			showEditLivePreviewDialog();
		});

		previewChooser.appendChild(option);
	}

	let saveButton = makeElement({ tag: 'fancy-button', content: 'Save' });
	saveButton.addEventListener('click', closeEveryTypeOfDialog);

	let deleteButton = makeElement({
		tag: 'fancy-button',
		content: 'Delete',
		attributes: { danger: '' },
	});
	deleteButton.addEventListener('click', () => {
		const previews = getCurrentProjectEditor().livePreviews;
		let name = previews[selectedLivePreview].displayName;
		previews.splice(selectedLivePreview, 1);
		if (selectedLivePreview >= previews.length) selectedLivePreview = previews.length - 1;
		closeEveryTypeOfDialog();
		updatePopOutWindowContent();
		if (previews.length > 1) showEditLivePreviewDialog();
		showToast(`Deleted live preview<br>${name}`);
	});

	let commitButtons = makeElement();
	addAsChildren(commitButtons, [saveButton, deleteButton]);

	let previewSelectorCard = makeElement({
		tag: 'div',
		className: 'panel__card no-card',
		innerHTML: `<h3>Edit live preview:</h3>`,
	});
	addAsChildren(previewSelectorCard, [previewChooser, commitButtons]);

	addAsChildren(panelArea, [
		header,
		previewSelectorCard,
		makePanel_LivePreview(editor.livePreviews[selectedLivePreview], false),
	]);

	let diag = makeModalDialog(panelArea, 500);
	popDoc.body.appendChild(diag);
	// log(`showEditLivePreviewDialog`, 'end');
}
