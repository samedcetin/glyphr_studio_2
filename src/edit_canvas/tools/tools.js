import { attachTooltip } from '../../controls/tooltip/tooltip.js';
import { makeQuickActionsButton } from '../quick_actions.js';
import { getCurrentProject, getCurrentProjectEditor } from '../../app/main.js';
import { addAsChildren, makeElement } from '../../common/dom.js';
import { makeLineIcon } from '../../common/icons.js';
import { makeMenuButton } from '../../controls/menu-button/menu_button.js';
import { arePanelsHidden, setPanelsHidden } from '../../panels/sidebar.js';
import { round, valuesAreClose } from '../../common/functions.js';
import { drawShape } from '../../display_canvas/draw_paths.js';
import { ComponentInstance } from '../../project_data/component_instance.js';
import { Glyph } from '../../project_data/glyph.js';
import { Path } from '../../project_data/path.js';
import { closePopOutWindow, openPopOutWindow } from '../../project_editor/pop_out_window.js';
import { isPixelModeOn } from '../../pixel_font/pixel_grid.js';
import { updateCursor } from '../cursors.js';
import { cXsX, cYsY } from '../edit_canvas.js';
import { stopCreatingNewPath } from './new_path.js';

// --------------------------------------------------------------
// Making tool buttons
// --------------------------------------------------------------
/**
 * Makes the tools buttons
 * @returns {Array}
 */
export function makeEditToolsButtons() {
	// log('makeEditToolsButtons', 'start');
	const editor = getCurrentProjectEditor();

	if (!editor.nav.isOnEditCanvasPage) {
		// log('returning, !isOnEditCanvasPage');
		// log('makeEditToolsButtons', 'end');
		return [];
	}

	if (!editor.selectedItemID) {
		// log('returning, !selectedItemID');
		// log('makeEditToolsButtons', 'end');
		return [];
	}

	// All the various permutations of states
	// log(`editor.selectedTool: ${editor.selectedTool}`);

	/*
		Button data. `shortcut` is shown in the tooltip - the keys themselves are
		bound in events_keyboard.js and the two must be kept in sync by hand until
		there is a single shortcut registry (see the keyboard map work).

		Each tool also answers to a second key for muscle memory from other apps:
		resize a, pathEdit b, newRectangle m, newOval q, newPath h, pathAddPoint u.
	*/
	let toolButtonData = {
		newRectangle: { title: 'Rectangle', shortcut: 'R', disabled: false },
		newOval: { title: 'Oval', shortcut: 'O', disabled: false },
		newPath: { title: 'Pen', shortcut: 'W', disabled: false },
		pathAddPoint: { title: 'Add point', shortcut: 'E', disabled: false },
		pathEdit: { title: 'Edit path', shortcut: 'P', disabled: false },
		resize: { title: 'Select and transform', shortcut: 'V', disabled: false },
	};

	/*
		The pixel pen only appears when pixel font mode is on. Off, it would be
		a button that quietly destroys curves - on, it is the only tool anyone
		drawing a pixel font wants.
	*/
	const pixelMode = isPixelModeOn(editor.project);
	if (pixelMode) {
		toolButtonData.pixelPen = { title: 'Pixel pen', shortcut: 'X', disabled: false };
	}

	// Disable pen and add path point buttons for certain conditions
	const hasComponentInstance = editor.multiSelect.shapes.contains('ComponentInstance');

	if (editor.selectedTool !== 'pathEdit' && hasComponentInstance) {
		toolButtonData.pathEdit.disabled = true;
	}

	if (editor.selectedTool !== 'pathAddPoint' && hasComponentInstance) {
		toolButtonData.pathAddPoint.disabled = true;
	}

	if (editor.multiSelect.shapes.count > 1) {
		toolButtonData.pathAddPoint.disabled = true;
	}

	// Put it all together
	let content = [];

	const onGlyphEditPage = editor.nav.page === 'Characters';
	const onComponentPage = editor.nav.page === 'Components';
	const onLigaturesPage = editor.nav.page === 'Ligatures';
	const selectedItem = editor.selectedItem;
	const canDrawNewShapes =
		onGlyphEditPage || onLigaturesPage || (onComponentPage && selectedItem && !selectedItem.pathPoints);

	/*
		Tools are grouped by what they are for rather than listed flat: one slot
		per family, showing whichever member was used last, with the rest a
		chevron away. Eight buttons in a row asked the user to remember which of
		three arrow-ish icons did what; three slots ask them to remember three
		families, and the menu names every member and its key.

		The group only appears if at least one of its members is available on
		this page, and a group of one renders as a plain button - a chevron over
		a menu with a single row is a control that lies about having a choice.
	*/
	const toolGroups = [
		{
			id: 'select',
			name: 'Select',
			members: ['resize', 'pathEdit', 'pan'],
			available: onGlyphEditPage || onComponentPage || onLigaturesPage,
		},
		{
			id: 'shape',
			name: 'Shape',
			members: ['newRectangle', 'newOval'],
			available: canDrawNewShapes,
		},
		{
			id: 'draw',
			name: 'Draw',
			members: pixelMode
				? ['newPath', 'pathAddPoint', 'pixelPen']
				: ['newPath', 'pathAddPoint'],
			available: canDrawNewShapes || onGlyphEditPage || onComponentPage || onLigaturesPage,
		},
	];

	toolGroups.forEach((group) => {
		if (!group.available) return;
		const members = group.members.filter((name) => toolButtonData[name] || name === 'pan');
		if (!members.length) return;
		content.push(makeToolGroup(group, members, toolButtonData));
	});

	// log('makeEditToolsButtons', 'end');
	return content;
}

/**
	The Pan tool sits in the Select group but is built by makeViewToolsButtons,
	so its label lives here rather than in toolButtonData. Space-drag pans from
	any tool (events_keyboard.js), which is what the hint reports - there is no
	letter bound to pan, and inventing one would collide with Pen, which already
	answers to both W and H.
*/
const panToolData = { title: 'Pan', shortcut: 'Space' };

/**
 * Builds one tool family as a split button: the face runs the member used last,
 * the chevron lists the family.
 *
 * @param {Object} group - { id, name }
 * @param {Array} members - tool names in this group, in menu order
 * @param {Object} toolButtonData - titles, shortcuts and disabled state
 * @returns {Element}
 */
function makeToolGroup(group, members, toolButtonData) {
	const editor = getCurrentProjectEditor();

	const items = members.map((name) => {
		const data = name === 'pan' ? panToolData : toolButtonData[name];
		return {
			id: name,
			name: data?.title || name,
			shortcut: data?.shortcut || '',
			disabled: !!data?.disabled,
			icon: makeToolButtonSVG({ name: name, selected: false, disabled: !!data?.disabled }),
		};
	});

	/* Open on whichever member is live, so the strip reflects the canvas. */
	const selected = members.includes(editor.selectedTool) ? editor.selectedTool : members[0];

	const menuButton = makeMenuButton({
		items: items,
		activeID: selected,
		groupName: group.name,
		className: `editor-page__tool-group editor-page__tool-group--${group.id}`,
		/* The bar sits at the bottom of the canvas, so every menu opens upward. */
		openUp: true,
		isFacePressed: () => members.includes(getCurrentProjectEditor().selectedTool),
		onSelect: (toolName) => selectTool(toolName),
	});

	/*
		A shortcut key selects a tool without going through this control, so the
		group follows the editor rather than the other way round.
	*/
	editor.subscribe({
		topic: 'whichToolIsSelected',
		subscriberID: `tools.group.${group.id}`,
		callback: (newSelectedTool) => {
			if (members.includes(newSelectedTool)) menuButton.setActiveID(newSelectedTool);
			else menuButton.refresh();
		},
	});

	return menuButton.element;
}

/**
 * Fills the editor's single toolbar: drawing tools on the left, then the view
 * controls, in one strip centred at the bottom of the canvas.
 *
 * There used to be two floating strips - tools centred at the top, zoom pinned
 * to the bottom right corner - which put the two halves of one job at opposite
 * ends of the window, and made the zoom strip's position depend on how wide the
 * right panel had been dragged.
 *
 * @param {Element} content - the page, holding .editor-page__tools-area
 * @param {Array} toolButtons - page-specific tools; kerning supplies its own
 * @returns {Boolean} - whether the bar was found and filled
 */
export function fillEditorToolBar(content, toolButtons = []) {
	const bar = content.querySelector('.editor-page__tools-area');
	if (!bar) return false;

	bar.innerHTML = '';
	/* Kerning hands over a single element rather than an array. */
	const tools = [].concat(toolButtons || []).filter(Boolean);

	let children = [];
	if (tools.length) {
		children = children.concat(tools);
		children.push(makeElement({ className: 'editor-page__strip-divider' }));
	}
	children = children.concat(makeViewToolsButtons());

	/*
		The action grids that used to sit under the Properties fields. Last in
		the bar because it acts on the selection, where everything before it
		changes how the canvas is read.
	*/
	children.push(makeElement({ className: 'editor-page__strip-divider' }));
	children.push(makeQuickActionsButton().element);

	addAsChildren(bar, children);

	/*
		The app’s hover label for the whole bar, in one sweep rather than in
		each builder - so a button added here later gets it without anyone
		having to remember. attachTooltip reads the title and removes it;
		buttons whose label changes have already set theirs and are skipped,
		because they carry no title to read.
	*/
	bar.querySelectorAll('button[title]').forEach((button) => attachTooltip(button));

	return true;
}

/**
 * Rebuilds the toolbar in place.
 *
 * The buttons are made once when the page is built, and after that only their
 * icons update - which is fine while the set of tools is fixed. Pixel font
 * mode adds and removes a tool, so the list itself has to be made again.
 *
 * Subscriptions are keyed by subscriber id, so the new buttons replace the old
 * ones' callbacks rather than piling up beside them.
 *
 * @returns {Boolean} - whether a toolbar was found to rebuild
 */
export function refreshEditToolsArea() {
	const toolsArea = document.querySelector('.editor-page__tools-area');
	if (!toolsArea) return false;

	/*
		The whole bar, not just the tool half: the view controls share it now, and
		rebuilding only the tools would drop them.
	*/
	return fillEditorToolBar(toolsArea.parentElement || document, makeEditToolsButtons());
}

const panelIcons = {
	shown: `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h11A1.5 1.5 0 0 1 17 4.5v11a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 15.5v-11ZM4.5 4a.5.5 0 0 0-.5.5v11a.5.5 0 0 0 .5.5H7V4H4.5ZM13 4v12h2.5a.5.5 0 0 0 .5-.5v-11a.5.5 0 0 0-.5-.5H13Z"/></svg>`,
	hidden: `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h11A1.5 1.5 0 0 1 17 4.5v11a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 15.5v-11ZM4.5 4a.5.5 0 0 0-.5.5v11a.5.5 0 0 0 .5.5h11a.5.5 0 0 0 .5-.5v-11a.5.5 0 0 0-.5-.5h-11Z"/></svg>`,
};

/**
 * The button that hides and shows the floating panels.
 *
 * It lives at the end of the toolbar behind a divider, because it controls
 * the workspace rather than being a drawing tool. A shortcut alone would not
 * teach itself.
 *
 * @returns {Element}
 */
function makePanelToggleButton() {
	const button = makeElement({
		tag: 'button',
		className: 'editor-page__panel-toggle',
		attributes: { type: 'button' },
	});

	const render = () => {
		const hidden = arePanelsHidden();
		const label = hidden ? 'Show panels  (Ctrl \\)' : 'Hide panels  (Ctrl \\)';
		button.innerHTML = hidden ? panelIcons.hidden : panelIcons.shown;
		button.setAttribute('aria-label', label);
		/*
			Not a title: this label changes with the state. attachTooltip binds
			once and updates the text on every later call, so calling it from
			render is how the tip follows the button.
		*/
		attachTooltip(button, {
			name: hidden ? 'Show panels' : 'Hide panels',
			body: `Shortcut Ctrl ${String.fromCharCode(92)}`,
		});
		button.setAttribute('aria-pressed', String(hidden));
	};

	button.addEventListener('click', () => {
		setPanelsHidden();
		render();
	});

	render();
	return button;
}

/**
 * Makes the view control buttons
 * @returns {Array} - an array of Elements
 */
export function makeViewToolsButtons() {
	// log(`makeViewToolsButtons`, 'start');

	/*
		Only the buttons that still stand on their own in the strip. Pan moved
		into the Select group at the top, and the two zoom presets moved into the
		zoom menu below - each of them made a button here and a subscription, and
		a button that is never added to the DOM keeps its subscription alive for
		the life of the page.
	*/
	let viewButtonTitles = {
		displayMode: 'Toggle fill / outline display mode',
		zoomIn: 'Zoom in 10%',
		zoomOut: 'Zoom out 10%',
	};

	let viewButtonElements = {};
	const editor = getCurrentProjectEditor();
	const displayMode = getCurrentProject().settings.app.canvasDisplayModeFilled;

	Object.keys(viewButtonTitles).forEach((buttonName) => {
		// log(`buttonName: ${buttonName}`);

		let isSelected = editor.selectedTool === buttonName;
		let buttonNameSVG = buttonName;
		if (buttonName === 'displayMode') {
			if (displayMode) buttonNameSVG = 'displayModeFilled';
			else buttonNameSVG = 'displayModeOutlined';
		}
		let newToolButton = makeElement({
			tag: 'button',
			className: 'editor-page__tool',
			title: viewButtonTitles[buttonName],
			innerHTML: makeToolButtonSVG({
				name: buttonNameSVG,
				selected: isSelected,
			}),
		});
		newToolButton.addEventListener('click', () => selectTool(buttonName));

		if (isSelected) newToolButton.classList.add('editor-page__tool-selected');

		if (buttonName === 'pan') {
			editor.subscribe({
				topic: 'whichToolIsSelected',
				subscriberID: `tools.${buttonName}`,
				callback: (newSelectedTool) => {
					let isSelected = newSelectedTool === buttonName;
					newToolButton.classList.toggle('editor-page__tool-selected', isSelected);
					newToolButton.innerHTML = makeToolButtonSVG({ name: buttonName, selected: isSelected });
				},
			});
		}

		if (buttonName === 'displayMode') {
			editor.subscribe({
				topic: 'editCanvasView',
				subscriberID: `tools.displayMode`,
				callback: () => {
					let buttonSVG = 'displayModeOutlined';
					const displayMode = getCurrentProject().settings.app.canvasDisplayModeFilled;
					if (displayMode) buttonSVG = 'displayModeFilled';
					newToolButton.innerHTML = makeToolButtonSVG({ name: buttonSVG, selected: false });
				},
			});
		}

		viewButtonElements[buttonName] = newToolButton;
	});

	// text zoom control
	let zoomReadoutNumber = '--';
	let view = editor.view;
	if (view) zoomReadoutNumber = '' + round(editor.view.dz * 100, 2);

	/*
		The readout is an editable field, not a label. It used to carry the
		disabled attribute, so the change handler below it could never fire and
		typing a zoom level was impossible - the only ways to a specific zoom
		were the 10% buttons and the two presets.

		`this` in that handler was the module, not the input, so it would have
		read undefined even had it run.
	*/
	let zoomReadout = makeElement({
		tag: 'input',
		className: 'editor-page__zoom-readout',
		attributes: {
			type: 'text',
			inputmode: 'decimal',
			'aria-label': 'Zoom level, percent',
			title: 'Zoom level',
		},
	});
	zoomReadout.setAttribute('value', `${zoomReadoutNumber}%`);

	/** Reads the field, and puts the view back on screen if it is nonsense. */
	function commitZoomReadout() {
		const input = /** @type {HTMLInputElement} */ (zoomReadout);
		const typed = parseFloat(input.value.replace('%', '').trim());
		const liveEditor = getCurrentProjectEditor();
		if (isFinite(typed) && typed > 0) liveEditor.setViewZoom(typed);
		else input.value = `${round(liveEditor.view.dz * 100, 2)}%`;
	}

	zoomReadout.addEventListener('change', commitZoomReadout);
	zoomReadout.addEventListener('keydown', (event) => {
		const keyEvent = /** @type {KeyboardEvent} */ (event);
		if (keyEvent.key === 'Enter') {
			event.preventDefault();
			commitZoomReadout();
			/** @type {HTMLInputElement} */ (zoomReadout).blur();
		}
		if (keyEvent.key === 'Escape') {
			/** @type {HTMLInputElement} */ (zoomReadout).value = `${round(
				getCurrentProjectEditor().view.dz * 100,
				2
			)}%`;
			/** @type {HTMLInputElement} */ (zoomReadout).blur();
		}
	});
	/* Select the whole value on focus, so typing replaces rather than appends. */
	zoomReadout.addEventListener('focus', () =>
		/** @type {HTMLInputElement} */ (zoomReadout).select()
	);

	editor.subscribe({
		topic: 'editCanvasView',
		subscriberID: 'tools.zoomReadout',
		callback: (newView) => {
			/* Not while the user is typing in it. */
			if (document.activeElement === zoomReadout) return;
			// @ts-expect-error 'property does exist'
			zoomReadout.value = `${round(newView.dz * 100, 2)}%`;
		},
	});

	/*
		The zoom presets. Figma puts these behind the percentage itself; here they
		are behind a chevron beside it, because the percentage is a field the user
		can type into and a field that also opens a menu is two controls wearing
		one coat.

		sticky is off: these are actions, not modes, so running one must not
		change what the chevron would offer next time.
	*/
	const zoomMenu = makeMenuButton({
		items: [
			{
				id: 'zoomEm',
				name: 'Zoom to fit',
				icon: makeToolButtonSVG({ name: 'zoomEm', selected: false }),
			},
			{
				id: 'zoom1to1',
				name: 'Actual size, 1 em = 1 pixel',
				icon: makeToolButtonSVG({ name: 'zoom1to1', selected: false }),
			},
			{
				id: 'zoomIn',
				name: 'Zoom in',
				shortcut: '+',
				icon: makeToolButtonSVG({ name: 'zoomIn', selected: false }),
			},
			{
				id: 'zoomOut',
				name: 'Zoom out',
				shortcut: '-',
				icon: makeToolButtonSVG({ name: 'zoomOut', selected: false }),
			},
		],
		activeID: 'zoomEm',
		groupName: 'Zoom',
		className: 'editor-page__zoom-menu',
		sticky: false,
		openUp: true,
		onSelect: (id) => selectTool(id),
	});

	// Live Preview pop-out
	let isPoppedOut = editor.popOutWindow !== false;
	let livePreviewPopOut = makeElement({
		tag: 'button',
		className: 'editor-page__tool',
		id: 'editor-page__tool__open-live-preview-pop-out',
		title: 'Pop out a Live Preview window',
		innerHTML: makeToolButtonSVG({
			name: isPoppedOut ? 'closeLivePreview' : 'openLivePreview',
			selected: false,
		}),
	});
	livePreviewPopOut.addEventListener('click', () => {
		// log(`Live Preview Pop Out CLICK HANDLER`, 'start');
		// log(`editor.popOutWindow: ${editor.popOutWindow}`);
		if (editor.popOutWindow === false) openPopOutWindow();
		else closePopOutWindow();
		// log(`Live Preview Pop Out CLICK HANDLER`, 'end');
	});

	/*
		Put it all together: the zoom stepper and its field, then the zoom menu,
		then the two view toggles - grouped, in that order, because the first
		group changes how much you see and the second changes what you see.

		The dividers were two &emsp; text nodes, which is a space character doing
		a border's job; they are elements with a rule now, as in the top strip.
	*/
	let responsiveGroup = makeElement({ className: 'editor-page__responsive-group' });
	addAsChildren(responsiveGroup, [
		viewButtonElements.zoomOut,
		zoomReadout,
		viewButtonElements.zoomIn,
	]);

	/*
		Two groups, one divider: everything about zoom, then everything about what
		the workspace shows. The panel toggle ends the bar because it is the one
		control that changes the window rather than the drawing - it used to sit
		among the drawing tools, which put a workspace switch where a hand reaching
		for the pen would land.
	*/
	// log(`makeViewToolsButtons`, 'end');
	return [
		responsiveGroup,
		zoomMenu.element,
		makeElement({ className: 'editor-page__strip-divider' }),
		viewButtonElements.displayMode,
		livePreviewPopOut,
		makePanelToggleButton(),
	];
}

/**
 * Event handler for clicking a tool button
 * @param {String} tool - which tool was clicked
 */
export function selectTool(tool) {
	// log('selectTool', 'start');
	const editor = getCurrentProjectEditor();
	let viewTools = ['zoom1to1', 'zoomEm', 'zoomIn', 'zoomOut', 'displayMode'];

	if (viewTools.includes(tool)) {
		if (tool === 'zoom1to1') editor.view = { dz: 1 };
		if (tool === 'zoomEm') editor.autoFitView();
		if (tool === 'zoomIn') editor.view = { dz: (editor.view.dz *= 1.1) };
		if (tool === 'zoomOut') editor.view = { dz: (editor.view.dz *= 0.9) };
		if (tool === 'displayMode') {
			const appSettings = getCurrentProject().settings.app;
			appSettings.canvasDisplayModeFilled = !appSettings.canvasDisplayModeFilled;
			// log(`canvasDisplayModeFilled: ${appSettings.canvasDisplayModeFilled}`);
		}
		editor.publish('editCanvasView', editor.view);
	} else {
		switchToolTo(tool);
		updateCursor();
	}

	if (tool === 'resize') editor.multiSelect.points.clear();

	if (tool === 'newPath') {
		editor.multiSelect.points.clear();
		editor.multiSelect.shapes.clear();
	} else {
		stopCreatingNewPath();
	}

	// log('selectTool', 'end');
}

/**
 * Handle switching the tool on the current Editor
 * @param {String} newTool - which tool to switch to
 */
export function switchToolTo(newTool) {
	// log(`switchToolTo`, 'start');
	// log(`newTool: ${newTool}`);

	const editor = getCurrentProjectEditor();
	editor.selectedTool = newTool;
	editor.publish('whichToolIsSelected', newTool);
	// log(`switchToolTo`, 'end');
}

/**
 * Makes the Kern Tool button
 * @returns {Element}
 */
export function makeKernToolButton() {
	// Kern
	const editor = getCurrentProjectEditor();
	const kernToolButton = makeElement({
		tag: 'button',
		className: 'editor-page__tool editor-page__tool-selected',
		title: 'Adjust kern value',
		innerHTML: makeToolButtonSVG({
			name: 'kern',
			selected: true,
		}),
	});

	kernToolButton.addEventListener('click', () => selectTool('kern'));

	editor.subscribe({
		topic: 'whichToolIsSelected',
		subscriberID: `tools.kern`,
		callback: (newSelectedTool) => {
			let isSelected = newSelectedTool === 'kern';
			kernToolButton.classList.toggle('editor-page__tool-selected', isSelected);
			kernToolButton.innerHTML = makeToolButtonSVG({ name: 'kern', selected: isSelected });
		},
	});
	return kernToolButton;
}

// --------------------------------------------------------------
// Button helper functions
// --------------------------------------------------------------

/**
 * Adds a given path to the current work item
 * @param {Path} newPath - Path to add
 * @returns {Path} - Path that was added, with updated properties
 */
export function addPathToCurrentItem(newPath) {
	// log(`addPathToCurrentItem`, 'start');
	// log(`name: ${ewPath.name}`);
	// log(`objType: ${ewPath?.objType}`);

	const editor = getCurrentProjectEditor();
	if (newPath) {
		if (newPath?.objType === 'ComponentInstance') {
			// log(`is a Component instance`);
			editor.selectedTool = 'pathEdit';
		} else if (newPath && editor.selectedTool === 'pathEdit') {
			// log(`triggered as true: newPath && editor.selectedTool == pathEdit \n\t NOT calling calcmaxes, okay?`);
		}
	} else {
		// log(`passed null, creating new path.`);
		newPath = new Path({});
		newPath.name = 'Rectangle ' + (editor.selectedItem.shapes.length * 1 + 1);
	}

	const result = editor.selectedItem.addOneShape(newPath);

	checkForFirstShapeAutoRSB();

	// log(`returns: ${result.name}`);
	// log(`addPathToCurrentItem`, 'end');
	return result;
}

/**
 * For projects that have 'autoRightBearingOnFirstShape' set,
 * check if the current item has one shape, and if so, set the
 * right side bearing to that value.
 */
export function checkForFirstShapeAutoRSB() {
	const editor = getCurrentProjectEditor();
	const selectedItem = editor.selectedItem;
	if (selectedItem?.objType === 'Glyph' || selectedItem?.objType === 'Ligature') {
		const autoRSB = editor.project.settings.app.autoRightBearingOnFirstShape;
		if (selectedItem.shapes.length === 1 && selectedItem.advanceWidth === 0 && autoRSB > -1) {
			selectedItem.rightSideBearing = autoRSB;
		}
	}
}

/**
 * Looks through the selected Item's shapes and returns
 * a shape (or false) at the coordinate location
 * @param {Number} cx - x coordinate in canvas units
 * @param {Number} cy - y coordinate in canvas units
 * @returns {Object | Boolean}
 */
export function getShapeAtLocation(cx, cy) {
	// log(`getShapeAtLocation`, 'start');
	// log('checking cx:' + cx + ' cy:' + cy);

	let shape;
	const editor = getCurrentProjectEditor();
	let sws = editor.selectedItem?.shapes;
	if (!sws) return false;
	// log(sws);
	for (let j = sws.length - 1; j >= 0; j--) {
		shape = sws[j];
		// A hidden shape is not on screen to be clicked, and a locked one is
		// deliberately click-through - that is what the lock is for.
		if (shape.isVisible === false || shape.isLayerLocked) continue;
		// log('Checking shape ' + j);
		if (isShapeHere(shape, cx, cy)) {
			// log(`getShapeAtLocation`, 'end');
			return shape;
		}
	}

	// clickEmptySpace();
	// log(`getShapeAtLocation`, 'end');
	return false;
}

/**
 * Returns a true if a clicked x/y is on a shape
 * @param {Path | ComponentInstance} shape - shape to check
 * @param {Number} cx - clicked x value
 * @param {Number} cy - clicked y value
 * @returns {Boolean}
 */
export function isShapeHere(shape, cx, cy) {
	// log(`isShapeHere`, 'start');
	// log(`cx: ${cx} / cy: ${cy}`);
	let sx = cXsX(cx);
	let sy = cYsY(cy);
	// log(`sx: ${sx} / sy: ${sy}`);

	if (!shape.maxes.isPointInside(sx, sy)) {
		// log(`Outside maxes for this shape`);
		// log(`isShapeHere`, 'end');
		return false;
	}

	let g1 = 100;
	let g2 = 200;
	let ghc = document.createElement('canvas');
	ghc.width = shape.maxes.width + g2;
	ghc.height = shape.maxes.height + g2;
	let ctx = ghc.getContext('2d', {
		alpha: false,
		willReadFrequently: true,
	});
	let view = { dx: shape.maxes.xMin * -1 + g1, dy: shape.maxes.yMax + g1, dz: 1 };

	ctx.fillStyle = 'rgb(255, 255, 255)';
	ctx.fillRect(0, 0, shape.maxes.width + g2, shape.maxes.height + g2);

	ctx.beginPath();
	drawShape(shape, ctx, view);
	ctx.closePath();

	ctx.fillStyle = 'rgb(0,0,0)';
	ctx.fill();

	let xTest = sx + view.dx;
	let yTest = view.dy - sy;
	let imageData = ctx.getImageData(xTest, yTest, 1, 1);

	// Visually debug
	// ctx.strokeStyle = 'lime';
	// ctx.strokeAlign = 'outside';
	// ctx.lineWidth = 4;
	// ctx.strokeRect(xTest - 10, yTest - 10, 20, 20);

	// log('red = ' + imageData.data[0] + '  returning: ' + (imageData.data[0] < 255));
	// log(`isShapeHere`, 'end');
	return imageData.data[0] < 255;
}

/**
 * Returns a true if an x/y point is near the edge of a shape
 * @param {Path | ComponentInstance} shape - shape to check
 * @param {Number} cx - clicked x value
 * @param {Number} cy - clicked y value
 * @param {Number} thickness - how close to the edge returns true
 * @returns {Boolean}
 */
export function isPointNearShapeEdge(shape, cx, cy, thickness = 10) {
	// log(`isPointNearShapeEdge`, 'start');
	// log(`cx: ${cx} / cy: ${cy}`);
	let sx = cXsX(cx);
	let sy = cYsY(cy);
	let sThickness = thickness / getCurrentProjectEditor().view.dz;
	// log(`sx: ${sx} / sy: ${sy}`);

	if (!shape.maxes.isPointInside(sx, sy, sThickness)) {
		// log(`Outside maxes for this shape`);
		// log(`isPointNearShapeEdge`, 'end');
		return false;
	}

	let g1 = 100;
	let g2 = 200;
	let ghc = document.createElement('canvas');
	ghc.width = shape.maxes.width + g2;
	ghc.height = shape.maxes.height + g2;
	let ctx = ghc.getContext('2d', {
		alpha: false,
		willReadFrequently: true,
	});
	let view = { dx: shape.maxes.xMin * -1 + g1, dy: shape.maxes.yMax + g1, dz: 1 };

	ctx.fillStyle = 'rgb(255, 255, 255)';
	ctx.fillRect(0, 0, shape.maxes.width + g2, shape.maxes.height + g2);

	ctx.beginPath();
	drawShape(shape, ctx, view);
	ctx.closePath();

	ctx.strokeStyle = 'rgb(0,0,0)';
	ctx.lineWidth = sThickness;
	ctx.fill();
	ctx.stroke();

	let xTest = sx + view.dx;
	let yTest = view.dy - sy;
	let imageData = ctx.getImageData(xTest, yTest, 1, 1);

	// log(`isPointNearShapeEdge`, 'end');
	return imageData.data[0] < 255;
}

/**
 * Detects if the mosue is over a side bearing
 * @param {Number} cx - canvas X value
 * @param {Number} cy - canvas Y value
 * @param {Glyph | Object} item - thing to get the side bearing from
 * @returns	{String | false} - 'lsb' or 'rsb'
 */
export function isSideBearingHere(cx, cy, item) {
	// log(`isSideBearingHere`, 'start');
	let sx = cXsX(cx);
	// let sy = cYsY(cy);
	const target = 7;
	/** @type {String | false} */
	let result = false;

	if (Math.abs(sx) < target) result = 'lsb';
	if (item?.objType !== 'Component') {
		if (valuesAreClose(sx, item.advanceWidth, target)) result = 'rsb';
	}

	// log(`result: ${result}`);
	// log(`isSideBearingHere`, 'end');
	return result;
}

// --------------------------------------------------------------
// Tool button graphics
// --------------------------------------------------------------


/**
 * Makes a tool icon.
 *
 * The selected and disabled flags used to change the icon itself, by drawing
 * its fill layer at three different opacities. They do nothing here: the line
 * set is one stroke in currentColor, so the button's CSS colour carries every
 * state, which is what lets one rule cover resting, hover, selected, pressed
 * and disabled instead of the icon needing to know about any of them.
 *
 * @param {Object} oa - options: { name }
 * @returns {String} - SVG code
 */
export function makeToolButtonSVG(oa) {
	return makeLineIcon(oa.name, 20);
}

