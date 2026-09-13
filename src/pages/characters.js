import { getCurrentProjectEditor } from '../app/main.js';
import { addAsChildren, makeElement } from '../common/dom.js';
import { closeAllInfoBubbles } from '../controls/dialogs/dialogs.js';
import { EditCanvas } from '../edit_canvas/edit_canvas.js';
import { removeStopCreatingNewPathButton } from '../edit_canvas/tools/new_path.js';
import { makeEditToolsButtons, makeViewToolsButtons } from '../edit_canvas/tools/tools.js';
import { makePanel, refreshPanel } from '../panels/panels.js';
import { ProjectEditor } from '../project_editor/project_editor.js';

/**
 * Page > Characters
 * The main edit surface for Glyphr Studio, comprised of Panels of tools, and the Edit Canvas.
 * @returns {Element} - page content
 */
export function makePage_Characters() {
	// log(`makePage_Characters`, 'start');
	/** @type {ProjectEditor} */
	const editor = getCurrentProjectEditor();
	// log('current ProjectEditor');
	// log(editor);
	// log(editor.nav);
	// log(`editor.selectedGlyphID: ${editor.selectedGlyphID}`);
	// log(`editor.selectedItemID: ${editor.selectedItemID}`);
	// log(`editor.nav.panel: ${editor.nav.panel}`);

	const content = makeElement({
		tag: 'div',
		id: 'app__page',
		innerHTML: `
		<div class="editor__page">
			<div class="editor-page__left-area">
				<div id="editor-page__panel"></div>
			</div>
			<div class="editor-page__tools-area"></div>
			<div class="editor-page__edit-canvas-wrapper">
				<edit-canvas id="editor-page__edit-canvas" editing-item-id="${
					editor.selectedGlyphID
				}"></edit-canvas>
			</div>
			<div class="editor-page__zoom-area"></div>
		</div>
	`,
	});

	if (editor.showPageTransitions) content.classList.add('app__page-animation');

	/*
		Page and item choosers live in the app top bar breadcrumb now - see
		makeBreadcrumb in project_editor/navigator.js. They are rebuilt with
		the top bar on every navigate, so nothing is wired up here.
	*/

	/*
		The PANEL selector is gone: every panel is mounted at once in the
		sidebars now, so there is nothing to choose between.
	*/

	// Panel
	const panel = content.querySelector('#editor-page__panel');

	panel.appendChild(makePanel());
	panel.addEventListener('scroll', closeAllInfoBubbles);
	editor.subscribe({
		topic: ['whichGlyphIsSelected', 'whichShapeIsSelected'],
		subscriberID: 'nav.panelChooserButton',
		callback: () => {
			refreshPanel();
		},
	});

	// Tools
	if (editor.selectedTool === 'kern') editor.selectedTool = 'resize';
	let toolsArea = content.querySelector('.editor-page__tools-area');
	toolsArea.innerHTML = '';
	let toolsButtons = makeEditToolsButtons();
	if (toolsButtons) addAsChildren(toolsArea, toolsButtons);

	let zoomArea = content.querySelector('.editor-page__zoom-area');
	zoomArea.innerHTML = '';
	let viewButtons = makeViewToolsButtons();
	if (viewButtons) addAsChildren(zoomArea, viewButtons);

	// Canvas
	editor.subscribe({
		topic: 'whichGlyphIsSelected',
		subscriberID: 'editCanvas.selectedGlyph',
		callback: (newGlyphID) => {
			// log(`Main Canvas subscriber callback`, 'start');
			removeStopCreatingNewPathButton();
			// log(`new id ${newGlyphID} on the main canvas`);
			content
				.querySelector('#editor-page__edit-canvas')
				.setAttribute('editing-item-id', newGlyphID);
			// log(`Main Canvas subscriber callback`, 'end');
		},
	});

	const simpleRedraws = ['whichShapeIsSelected', 'whichPathPointIsSelected', 'qualityChecks'];

	simpleRedraws.forEach((topic) => {
		editor.subscribe({
			topic: topic,
			subscriberID: `editCanvas.${topic}`,
			callback: () => {
				/** @type {EditCanvas} */
				const canvas = editor.editCanvas;
				if (canvas.redraw) canvas.redraw('subscription:simpleRedraws');
			},
		});
	});

	// log(`makePage_Characters`, 'end');
	return content;
}

/**
 *
 * @param {String | false} itemID - ID of the item
 * @returns {String} - name of the item
 */
export function getItemNameWithFallback(itemID) {
	// log(`getItemNameWithFallback`, 'start');
	// log(`itemID: ${itemID}`);
	if(!itemID) return '[no id]';
	const editor = getCurrentProjectEditor();
	let charName = editor.project.getItemName(itemID, true);

	// log(`charName: ${charName}`);
	// log(`getItemNameWithFallback`, 'end');
	return charName;
}
