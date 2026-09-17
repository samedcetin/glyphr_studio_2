import { getCurrentProject, getCurrentProjectEditor } from '../app/main.js';
import { addAsChildren, makeElement } from '../common/dom.js';
import { makeEditorEmptyState } from './editor_empty_state.js';
import { countItems } from '../common/functions.js';
import {
	closeAllInfoBubbles,
	closeEveryTypeOfDialog,
	showError,
	showModalDialog,
} from '../controls/dialogs/dialogs.js';
import { removeStopCreatingNewPathButton } from '../edit_canvas/tools/new_path.js';
import { fillEditorToolBar, makeEditToolsButtons } from '../edit_canvas/tools/tools.js';
import { makePanel, refreshPanel } from '../panels/panels.js';
import { Glyph } from '../project_data/glyph.js';

/**
 * Page > Components
 * Edit surface for Components, comprised of Panels of tools, and the Edit Canvas.
 * @returns {Element} - page content
 */
export function makePage_Components() {
	// log(`makePage_Components`, 'start');
	const editor = getCurrentProjectEditor();
	// log('current ProjectEditor');
	// log(editor);
	// log(editor.nav);
	// log(`editor.selectedComponentID: ${editor.selectedComponentID}`);
	// log(`editor.selectedItemID: ${editor.selectedItemID}`);
	// log(`editor.nav.panel: ${editor.nav.panel}`);

	const selectedComponentID = editor.selectedComponentID;

	const editingContent = `
		<div class="editor-page__tools-area"></div>
		<div class="editor-page__edit-canvas-wrapper"></div>
	`;

	/*
		No left area on an empty page: there is no item to inspect, so the
		panel would be a blank column sitting on top of the empty state. The
		modifier on .editor__page moves the breadcrumb to the edge to match.
	*/
	const firstRunContent = `<div class="editor-page__edit-canvas-wrapper"></div>`;

	const content = makeElement({
		tag: 'div',
		id: 'app__page',
		innerHTML: `
		<div class="editor__page${selectedComponentID ? '' : ' editor__page--empty'}">
			${selectedComponentID ? '<div class="editor-page__left-area"><div id="editor-page__panel"></div></div>' : ''}
			${selectedComponentID ? editingContent : firstRunContent}
		</div>
	`,
	});

	if (editor.showPageTransitions) content.classList.add('app__page-animation');


	const canvasArea = content.querySelector('.editor-page__edit-canvas-wrapper');

	if (!selectedComponentID) {
		// Early return for project with zero components
		addAsChildren(canvasArea, makeComponentsFirstRunContent());
		// log(`makePage_Components`, 'end');
		return content;
	}



	const editCanvas = makeElement({
		tag: 'edit-canvas',
		id: 'editor-page__edit-canvas',
		attributes: { 'editing-item-id': editor.selectedComponentID },
	});

	canvasArea.appendChild(editCanvas);

	/*
		The page and item choosers live in the app top bar breadcrumb now -
		see makeBreadcrumb in project_editor/navigator.js.
	*/
	editor.subscribe({
		topic: 'whichComponentIsSelected',
		subscriberID: 'nav.componentChooserButton',
		callback: () => {
			// The breadcrumb is rebuilt with the top bar on navigate.
		},
	});

	/*
		The PANEL selector is gone: every panel is mounted at once in the
		sidebars now, so there is nothing to choose between.
	*/

	// Panel
	const panel = content.querySelector('#editor-page__panel');
	panel.appendChild(makePanel());
	panel.addEventListener('scroll', closeAllInfoBubbles);
	editor.subscribe({
		topic: ['whichComponentIsSelected', 'whichShapeIsSelected'],
		subscriberID: 'nav.panelChooserButton',
		callback: () => {
			refreshPanel();
		},
	});

	// Tools
	if (editor.selectedTool === 'kern') editor.selectedTool = 'resize';
	fillEditorToolBar(content, makeEditToolsButtons());

	// Canvas
	editor.subscribe({
		topic: 'whichComponentIsSelected',
		subscriberID: 'editCanvas.selectedComponent',
		callback: (newComponentID) => {
			// log(`Main Canvas subscriber callback`, 'start');
			removeStopCreatingNewPathButton();
			// log(`new id ${newComponentID} on the main canvas`);
			content
				.querySelector('#editor-page__edit-canvas')
				.setAttribute('editing-item-id', newComponentID);
			// log(`Main Canvas subscriber callback`, 'end');
		},
	});

	editor.subscribe({
		topic: 'whichShapeIsSelected',
		subscriberID: 'editCanvas.selectedPath',
		callback: () => {
			removeStopCreatingNewPathButton();
			editor.editCanvas.redraw('subscription:whichShapeIsSelected');
		},
	});

	editor.subscribe({
		topic: 'whichPathPointIsSelected',
		subscriberID: 'editCanvas.selectedPathPoint',
		callback: () => {
			editor.editCanvas.redraw('subscription:whichPathPointIsSelected');
		},
	});

	editor.subscribe({
		topic: 'currentItem',
		subscriberID: 'ComponentsPage.l2Nav',
		callback: () => {
			// The breadcrumb is rebuilt with the top bar on navigate.
		},
	});

	// log(`makePage_Components`, 'end');
	return content;
}

/**
 * What the page shows when the project has no components.
 * @returns {Element}
 */
function makeComponentsFirstRunContent() {
	return makeEditorEmptyState({
		icon: 'page_components',
		title: 'No components yet',
		body:
			'A component is a drawing you reuse inside many glyphs — a prefab. Change the root and every instance of it follows.',
		actions: [{ label: 'Create a component…', onClick: showAddComponentDialog }],
	});
}

/**
 * Button handler for adding a new component
 * @param {Object} newComponent - new component to add
 * @returns {Glyph}
 */
export function addComponent(newComponent) {
	const project = getCurrentProject();
	let added = project.addItemByType(new Glyph(newComponent), 'Component');
	return added;
}

/**
 * Makes a new Component ID that doesn't collide with old ones.
 * @returns {String}
 */
export function makeComponentID(components = getCurrentProject().components) {
	// log(`makeComponentID`, 'start');

	/*
		Counted in the table the component is going into, which the caller
		names. Defaulting to the selected project was fine until two projects
		were open: the cross-project actions add components to the *other*
		project, and an id counted in the wrong one collided with what was
		already there - the new component silently replaced it.
	*/
	let counter = countItems(components);
	while (components[`comp-${counter}`]) counter++;
	// log(`makeComponentID`, 'end');
	return `comp-${counter}`;
}

/**
 * Makes and shows the Add Component dialog
 */
export function showAddComponentDialog() {
	const content = makeElement({
		innerHTML: `
			<div class="dialog-field">
				<label class="dialog-field__label" for="components__new-component-input">Name</label>
				<div class="dialog-field__control">
					<input id="components__new-component-input" type="text"
						aria-describedby="components__new-component-hint"
						autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
					/>
				</div>
				<div class="dialog-field__hint" id="components__new-component-hint">
					What you will call it in the Layers panel and the component list.
				</div>
			</div>
		`,
	});

	const cancelButton = makeElement({
		tag: 'fancy-button',
		attributes: { secondary: '' },
		innerHTML: 'Cancel',
		onClick: closeEveryTypeOfDialog,
	});

	const submitButton = makeElement({
		tag: 'fancy-button',
		attributes: { disabled: '' },
		innerHTML: 'Create component',
	});

	/** @type {HTMLInputElement} */
	const newComponentInput = content.querySelector('#components__new-component-input');

	newComponentInput.addEventListener('keyup', () => {
		if (newComponentInput.value.length < 1) {
			submitButton.setAttribute('disabled', '');
		} else {
			submitButton.removeAttribute('disabled');
		}
	});

	submitButton.addEventListener('click', () => {
		const result = addComponent(new Glyph({ name: newComponentInput.value }));
		if (typeof result === 'string') {
			showError(result);
		} else {
			const editor = getCurrentProjectEditor();
			editor.selectedComponentID = result.id;
			editor.navigate();
			editor.history.addWholeProjectChangePostState();
			result.hasChangedThisSession = false;
			result.wasCreatedThisSession = true;
			closeEveryTypeOfDialog();
		}
	});

	showModalDialog(content, 500, {
		title: 'Create a new component',
		subtitle: 'A shape you draw once and re-use in any number of characters.',
		actions: [cancelButton, submitButton],
	});
	newComponentInput.focus();
}
