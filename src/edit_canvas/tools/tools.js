import { getCurrentProject, getCurrentProjectEditor } from '../../app/main.js';
import { addAsChildren, makeElement } from '../../common/dom.js';
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

	// Make all the new buttons
	let toolButtonElements = {};

	Object.keys(toolButtonData).forEach((buttonName) => {
		// log(`buttonName: ${buttonName}`);

		let isSelected = editor.selectedTool === buttonName;

		const toolTitle = toolButtonData[buttonName].shortcut
			? `${toolButtonData[buttonName].title}  (${toolButtonData[buttonName].shortcut})`
			: toolButtonData[buttonName].title;

		let newToolButton = makeElement({
			tag: 'button',
			title: toolTitle,
			className: 'editor-page__tool',
			innerHTML: makeToolButtonSVG({
				name: buttonName,
				selected: isSelected,
				disabled: toolButtonData[buttonName].disabled,
			}),
		});

		newToolButton.addEventListener('click', () => selectTool(buttonName));

		if (isSelected) newToolButton.classList.add('editor-page__tool-selected');

		editor.subscribe({
			topic: 'whichToolIsSelected',
			subscriberID: `tools.${buttonName}`,
			callback: (newSelectedTool) => {
				let isSelected = newSelectedTool === buttonName;
				newToolButton.classList.toggle('editor-page__tool-selected', isSelected);
				newToolButton.innerHTML = makeToolButtonSVG({ name: buttonName, selected: isSelected });
			},
		});

		toolButtonElements[buttonName] = newToolButton;
	});

	// Put it all together
	let content = [];

	const onGlyphEditPage = editor.nav.page === 'Characters';
	const onComponentPage = editor.nav.page === 'Components';
	const onLigaturesPage = editor.nav.page === 'Ligatures';
	const selectedItem = editor.selectedItem;

	if (onGlyphEditPage || onLigaturesPage) {
		if (pixelMode) content.push(toolButtonElements.pixelPen);
		content.push(toolButtonElements.newRectangle);
		content.push(toolButtonElements.newOval);
		content.push(toolButtonElements.newPath);
	}

	if (onComponentPage && selectedItem && !selectedItem.pathPoints) {
		if (pixelMode) content.push(toolButtonElements.pixelPen);
		content.push(toolButtonElements.newRectangle);
		content.push(toolButtonElements.newOval);
		content.push(toolButtonElements.newPath);
	}

	if (onGlyphEditPage || onComponentPage || onLigaturesPage) {
		content.push(toolButtonElements.pathAddPoint);
		content.push(makeElement({ tag: 'div', style: 'height: 20px;' }));
		content.push(toolButtonElements.pathEdit);
		content.push(toolButtonElements.resize);
	}

	if (content.length) content.push(makePanelToggleButton());

	// log('makeEditToolsButtons', 'end');
	return content;
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

	const buttons = makeEditToolsButtons();
	toolsArea.innerHTML = '';
	if (buttons) addAsChildren(toolsArea, buttons);
	return true;
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
		button.setAttribute('title', label);
		button.setAttribute('aria-label', label);
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

	// Button data
	let viewButtonTitles = {
		displayMode: 'Toggle fill / outline display mode',
		pan: 'Pan the edit canvas',
		zoom1to1: 'Zoom so 1 pixel = 1 em',
		zoomEm: 'Zoom to fit a full Em',
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

	let zoomReadout = makeElement({
		tag: 'input',
		className: 'editor-page__zoom-readout',
		title: 'Zoom level',
		innerHTML: `${zoomReadoutNumber}%`,
	});
	zoomReadout.setAttribute('value', zoomReadoutNumber);
	zoomReadout.setAttribute('disabled', '');
	zoomReadout.addEventListener('change', () => {
		getCurrentProjectEditor().setViewZoom(this.value);
		this.innerHTML = `${this.value}%`;
		this.value = `${zoomReadoutNumber}%`;
	});

	editor.subscribe({
		topic: 'editCanvasView',
		subscriberID: 'tools.zoomReadout',
		callback: (newView) => {
			let zoomReadoutNumber = round(newView.dz * 100, 2);
			zoomReadout.setAttribute('value', '' + zoomReadoutNumber);
			zoomReadout.innerHTML = `${zoomReadoutNumber}%`;
			// @ts-expect-error 'property does exist'
			zoomReadout.value = `${zoomReadoutNumber}%`;
		},
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

	// Put it all together
	let responsiveGroup = makeElement({ className: 'editor-page__responsive-group' });

	addAsChildren(responsiveGroup, [
		makeElement({ tag: 'div', content: '&emsp;' }),
		viewButtonElements.zoomOut,
		zoomReadout,
		viewButtonElements.zoomIn,
		makeElement({ tag: 'div', content: '&emsp;' }),
		viewButtonElements.displayMode,
		viewButtonElements.zoom1to1,
	]);

	// log(`makeViewToolsButtons`, 'end');
	return [viewButtonElements.pan, responsiveGroup, viewButtonElements.zoomEm, livePreviewPopOut];
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

let icons = {};

/**
 * Makes a SVG icon based on options
 * @param {Object} oa - options
 * @returns {String} - SVG code
 */
export function makeToolButtonSVG(oa) {
	// log(`makeToolButtonSVG`, 'start');
	// log(`oa.name: ${oa.name}`);
	/*
		Icons draw in currentColor rather than baked-in hex values, so a single
		CSS `color` on the button drives resting, hover, selected and disabled
		states - and they follow the theme instead of being fixed at import time.

		The two-tone look is kept by drawing the fill layer at reduced opacity
		rather than in a second hard-coded color.
	*/
	let icon = icons[oa.name];
	let fillOpacity = oa.selected ? 0.4 : 0.26;
	if (oa.disabled) fillOpacity = 0.18;

	let innerHTML = '';
	if (icon.fill) {
		innerHTML += `
			<g pointer-events="none" fill="currentColor" fill-opacity="${fillOpacity}">
			${icon.fill}
			</g>
		`;
	}

	innerHTML += `
		<g pointer-events="none" fill="currentColor">
		${icon.outline}
		</g>
	`;

	let content = `
		<svg
			version="1.1"
			xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
			x="0px" y="0px" width="20px" height="20px" viewBox="0 0 20 20"
		>
			${innerHTML}
		</svg>
	`;

	// log(`makeToolButtonSVG`, 'end');
	return content;
}

// Arrow
icons.resize = {
	fill: `
		<rect x="11" y="14" width="1" height="4"></rect>
		<rect x="12" y="16" width="1" height="2"></rect>
		<rect x="9" y="12" width="1" height="2"></rect>
		<rect x="5" y="3" width="2" height="1"></rect>
		<rect x="10" y="7" width="1" height="9"></rect>
		<rect x="5" y="6" width="5" height="6"></rect>
		<rect x="12" y="9" width="1" height="3"></rect>
		<rect x="11" y="8" width="1" height="4"></rect>
		<rect x="14" y="11" width="1" height="1"></rect>
		<rect x="13" y="10" width="1" height="2"></rect>
		<rect x="5" y="15" width="1" height="1"></rect>
		<rect x="5" y="2" width="1" height="1"></rect>
		<rect x="5" y="14" width="2" height="1"></rect>
		<rect x="5" y="13" width="3" height="1"></rect>
		<rect x="5" y="4" width="3" height="1"></rect>
		<rect x="5" y="12" width="4" height="1"></rect>
		<rect x="5" y="5" width="4" height="1"></rect>
	`,
	outline: `
		<rect x="4" width="1" height="17"></rect>
		<rect x="5" y="1" width="1" height="1"></rect>
		<rect x="7" y="3" width="1" height="1"></rect>
		<rect x="6" y="2" width="1" height="1"></rect>
		<rect x="9" y="5" width="1" height="1"></rect>
		<rect x="8" y="4" width="1" height="1"></rect>
		<rect x="11" y="7" width="1" height="1"></rect>
		<rect x="10" y="6" width="1" height="1"></rect>
		<rect x="11" y="12" width="5" height="1"></rect>
		<rect x="12" y="8" width="1" height="1"></rect>
		<rect x="13" y="9" width="1" height="1"></rect>
		<rect x="14" y="10" width="1" height="1"></rect>
		<rect x="15" y="11" width="1" height="1"></rect>
		<rect x="11" y="18" width="2" height="1"></rect>
		<rect x="5" y="16" width="1" height="1"></rect>
		<rect x="6" y="15" width="1" height="1"></rect>
		<rect x="7" y="14" width="1" height="1"></rect>
		<rect x="8" y="13" width="1" height="1"></rect>
		<rect x="9" y="14" width="1" height="2"></rect>
		<rect x="10" y="16" width="1" height="2"></rect>
		<rect x="11" y="12" width="1" height="2"></rect>
		<rect x="12" y="14" width="1" height="2"></rect>
		<rect x="13" y="16" width="1" height="2"></rect>
	`,
};

// Pen Plus
icons.pathAddPoint = {
	fill: `
		<rect x="5" y="4" width="5" height="14"></rect>
		<rect x="10" y="8" width="2" height="6"></rect>
		<rect x="3" y="8" width="2" height="6"></rect>
	`,
	outline: `
		<rect id="MINUS_SHAPE" x="14" y="16" width="5" height="1"></rect>
		<rect id="PLUS_SHAPE" x="16" y="14" width="1" height="5"></rect>
		<rect x="4" y="16" width="1" height="3"></rect>
		<rect x="10" y="16" width="1" height="3"></rect>
		<rect x="7" y="1" width="1" height="12"></rect>
		<rect x="4" y="18" width="7" height="1"></rect>
		<rect x="4" y="16" width="7" height="1"></rect>
		<rect x="8" y="2" width="1" height="2"></rect>
		<rect x="9" y="4" width="1" height="2"></rect>
		<rect x="10" y="6" width="1" height="2"></rect>
		<rect x="3" y="8" width="1" height="2"></rect>
		<rect x="2" y="10" width="1" height="2"></rect>
		<rect x="12" y="10" width="1" height="2"></rect>
		<rect x="6" y="10" width="3" height="2"></rect>
		<rect x="3" y="12" width="1" height="2"></rect>
		<rect x="4" y="14" width="1" height="2"></rect>
		<rect x="6" y="2" width="1" height="2"></rect>
		<rect x="5" y="4" width="1" height="2"></rect>
		<rect x="4" y="6" width="1" height="2"></rect>
		<rect x="11" y="8" width="1" height="2"></rect>
		<rect x="11" y="12" width="1" height="2"></rect>
		<rect x="10" y="14" width="1" height="2"></rect>
	`,
};

// Pen Minus
icons.pathRemovePoint = {
	fill: `
		<rect x="5" y="4" width="5" height="14"></rect>
		<rect x="10" y="8" width="2" height="6"></rect>
		<rect x="3" y="8" width="2" height="6"></rect>
	`,
	outline: `
		<rect id="MINUS_SHAPE" x="14" y="16" width="5" height="1"></rect>
		<rect x="4" y="16" width="1" height="3"></rect>
		<rect x="10" y="16" width="1" height="3"></rect>
		<rect x="7" y="1" width="1" height="12"></rect>
		<rect x="4" y="18" width="7" height="1"></rect>
		<rect x="4" y="16" width="7" height="1"></rect>
		<rect x="8" y="2" width="1" height="2"></rect>
		<rect x="9" y="4" width="1" height="2"></rect>
		<rect x="10" y="6" width="1" height="2"></rect>
		<rect x="3" y="8" width="1" height="2"></rect>
		<rect x="2" y="10" width="1" height="2"></rect>
		<rect x="12" y="10" width="1" height="2"></rect>
		<rect x="6" y="10" width="3" height="2"></rect>
		<rect x="3" y="12" width="1" height="2"></rect>
		<rect x="4" y="14" width="1" height="2"></rect>
		<rect x="6" y="2" width="1" height="2"></rect>
		<rect x="5" y="4" width="1" height="2"></rect>
		<rect x="4" y="6" width="1" height="2"></rect>
		<rect x="11" y="8" width="1" height="2"></rect>
		<rect x="11" y="12" width="1" height="2"></rect>
		<rect x="10" y="14" width="1" height="2"></rect>
	`,
};

// Pen
icons.pathEdit = {
	fill: `
		<rect x="7" y="4" width="5" height="14"></rect>
		<rect x="12" y="8" width="2" height="6"></rect>
		<rect x="5" y="8" width="2" height="6"></rect>
	`,
	outline: `
		<rect x="6" y="16" width="1" height="3"></rect>
		<rect x="12" y="16" width="1" height="3"></rect>
		<rect x="9" y="1" width="1" height="12"></rect>
		<rect x="6" y="18" width="7" height="1"></rect>
		<rect x="6" y="16" width="7" height="1"></rect>
		<rect x="10" y="2" width="1" height="2"></rect>
		<rect x="11" y="4" width="1" height="2"></rect>
		<rect x="12" y="6" width="1" height="2"></rect>
		<rect x="5" y="8" width="1" height="2"></rect>
		<rect x="4" y="10" width="1" height="2"></rect>
		<rect x="14" y="10" width="1" height="2"></rect>
		<rect x="8" y="10" width="3" height="2"></rect>
		<rect x="5" y="12" width="1" height="2"></rect>
		<rect x="6" y="14" width="1" height="2"></rect>
		<rect x="8" y="2" width="1" height="2"></rect>
		<rect x="7" y="4" width="1" height="2"></rect>
		<rect x="6" y="6" width="1" height="2"></rect>
		<rect x="13" y="8" width="1" height="2"></rect>
		<rect x="13" y="12" width="1" height="2"></rect>
		<rect x="12" y="14" width="1" height="2"></rect>
	`,
};

// Square with handles
icons.pathResize = {
	fill: `
		<rect x="1" y="1" display="inline" width="4" height="4"></rect>
		<rect x="8" y="8" display="inline" width="4" height="4"></rect>
		<rect x="15" y="15" display="inline" width="4" height="4"></rect>
		<rect x="15" y="1" display="inline" width="4" height="4"></rect>
		<rect x="1" y="15" display="inline" width="4" height="4"></rect>
	`,
	outline: `
		<rect x="16" y="5" width="1" height="10"></rect>
		<rect x="5" y="16" width="10" height="1"></rect>
		<rect x="5" y="3" width="10" height="1"></rect>
		<rect x="3" y="5" width="1" height="10"></rect>
		<rect x="1" y="1" width="4" height="1"></rect>
		<rect x="1" y="4" width="4" height="1"></rect>
		<rect x="1" y="1" width="1" height="4"></rect>
		<rect x="4" y="1" width="1" height="4"></rect>
		<rect x="15" y="1" width="4" height="1"></rect>
		<rect x="15" y="4" width="4" height="1"></rect>
		<rect x="15" y="1" width="1" height="4"></rect>
		<rect x="18" y="1" width="1" height="4"></rect>
		<rect x="15" y="15" width="4" height="1"></rect>
		<rect x="15" y="18" width="4" height="1"></rect>
		<rect x="15" y="15" width="1" height="4"></rect>
		<rect x="18" y="15" width="1" height="4"></rect>
		<rect x="1" y="15" width="4" height="1"></rect>
		<rect x="1" y="18" width="4" height="1"></rect>
		<rect x="1" y="15" width="1" height="4"></rect>
		<rect x="4" y="15" width="1" height="4"></rect>
		<rect x="8" y="8" width="4" height="1"></rect>
		<rect x="8" y="11" width="4" height="1"></rect>
		<rect x="8" y="8" width="1" height="4"></rect>
		<rect x="11" y="8" width="1" height="4"></rect>
	`,
};

icons.newRectangle = {
	fill: `<rect x="2" y="2" width="12" height="12"></rect>
`,
	outline: `
		<rect x="1" y="1" width="13" height="1"></rect>
		<rect x="1" y="13" width="13" height="1"></rect>
		<rect x="14" y="16" width="5" height="1"></rect>
		<rect x="1" y="2" width="1" height="12"></rect>
		<rect x="13" y="2" width="1" height="12"></rect>
		<rect x="16" y="14" width="1" height="5"></rect>
	`,
};

icons.newOval = {
	fill: `
		<rect x="6" y="2" width="4" height="1"></rect>
		<rect x="6" y="12" width="4" height="1"></rect>
		<rect x="5" y="10.1" width="4" height="1"></rect>
		<rect x="2" y="6" width="1" height="3"></rect>
		<rect x="13" y="6" width="1" height="3"></rect>
		<rect x="11" y="5.1" width="1" height="3"></rect>
		<rect x="3" y="3" width="10" height="9"></rect>
	`,
	outline: `
		<rect x="6" y="1" width="4" height="1"></rect>
		<rect x="4" y="2" width="2" height="1"></rect>
		<rect x="6" y="13" width="4" height="1"></rect>
		<rect x="1" y="6" width="1" height="3"></rect>
		<rect x="2" y="4" width="1" height="2"></rect>
		<rect x="10" y="2" width="2" height="1"></rect>
		<rect x="13" y="4" width="1" height="2"></rect>
		<rect x="4" y="12" width="2" height="1"></rect>
		<rect x="2" y="9" width="1" height="2"></rect>
		<rect x="10" y="12" width="2" height="1"></rect>
		<rect x="13" y="9" width="1" height="2"></rect>
		<rect x="14" y="6" width="1" height="3"></rect>
		<rect x="14" y="16" width="5" height="1"></rect>
		<rect x="16" y="14" width="1" height="5"></rect>
		<rect x="12" y="3" width="1" height="1"></rect>
		<rect x="12" y="11" width="1" height="1"></rect>
		<rect x="3" y="11" width="1" height="1"></rect>
		<rect x="3" y="3" width="1" height="1"></rect>
	`,
};

icons.newPath = {
	fill: `
		<rect x="5" y="2" width="5" height="13"></rect>
		<rect x="10" y="4" width="2" height="11"></rect>
		<rect x="3" y="9" width="2" height="6"></rect>
		<rect x="6" y="15" width="3" height="1"></rect>
		<rect x="12" y="6" width="2" height="7"></rect>
		<rect x="2" y="2" width="3" height="1"></rect>
		<rect x="4" y="3" width="3" height="1"></rect>
	`,
	outline: `
		<rect x="14" y="16" width="5" height="1"></rect>
		<rect x="16" y="14" width="1" height="5"></rect>
		<rect x="8" y="2" width="2" height="1"></rect>
		<rect x="2" y="1" width="6" height="1"></rect>
		<rect x="6" y="16" width="3" height="1"></rect>
		<rect x="10" y="3" width="1" height="1"></rect>
		<rect x="11" y="4" width="1" height="1"></rect>
		<rect x="12" y="5" width="1" height="1"></rect>
		<rect x="1" y="1" width="1" height="2"></rect>
		<rect x="2" y="3" width="2" height="1"></rect>
		<rect x="4" y="4" width="1" height="1"></rect>
		<rect x="2" y="10" width="1" height="4"></rect>
		<rect x="3" y="9" width="1" height="1"></rect>
		<rect x="3" y="14" width="1" height="1"></rect>
		<rect x="5" y="5" width="1" height="3"></rect>
		<rect x="4" y="8" width="1" height="1"></rect>
		<rect x="12" y="13" width="1" height="1"></rect>
		<rect x="11" y="14" width="1" height="1"></rect>
		<rect x="9" y="15" width="2" height="1"></rect>
		<rect x="4" y="15" width="2" height="1"></rect>
		<rect x="13" y="11" width="1" height="2"></rect>
		<rect x="13" y="6" width="1" height="2"></rect>
		<rect x="14" y="8" width="1" height="3"></rect>
	`,
};

// View and Zoom

icons.zoomEm = {
	outline: `
		<polygon points="15,3 11,3 11,5 13,5 13,6 12,6 12,7 11,7 11,8 10,8 9,8 9,7 8,7 8,6 7,6 7,5 9,5 9,3 5,3 3,3 3,5 3,9 5,9 5,7 6,7 6,8 7,8 7,9 8,9 8,10 8,11 7,11 7,12 6,12 6,13 5,13 5,11 3,11 3,15 3,17 5,17 9,17 9,15 7,15 7,14 8,14 8,13 9,13 9,12 10,12 11,12 11,13 12,13 12,14 13,14 13,15 11,15 11,17 15,17 17,17 17,15 17,11 15,11 15,13 14,13 14,12 13,12 13,11 12,11 12,10 12,9 13,9 13,8 14,8 14,7 15,7 15,9 17,9 17,5 17,3"/>
		<rect x="18" y="1" width="1" height="18"></rect>
		<rect x="1" y="18" width="18" height="1"></rect>
		<rect x="1" y="1" width="18" height="1"></rect>
		<rect x="1" y="1" width="1" height="18"></rect>
	`,
};

icons.displayModeFilled = {
	outline: `
		<path d="M18,4v-1h-1v-1h-1v-1h-5v1h-1v1h-4v1h-1v1h-1v1h-1v1h-1v1h-1v6h1v1h1v1h1v1h1v1h0s1,0,1,0v1h6v-1h1v-1h1v-1h1v-1h1v-1h1v-4h1v-1h1v-5h-1ZM16,11h-5v-1h-1v-1h0s-1-0-1-0v-5h4v1h1v1h1v1h1v4Z"/>
	`,
};

icons.displayModeOutlined = {
	outline: `
		<rect x="1" y="8" width="1" height="6"/>
		<rect x="2" y="7" width="1" height="1"/>
		<rect x="5" y="4" width="1" height="1"/>
		<rect x="12" y="4" width="1" height="1"/>
		<rect x="15" y="7" width="1" height="1"/>
		<polygon points="17 8 16 8 16 11 11 11 11 12 16 12 16 14 17 14 17 10 18 10 18 9 17 9 17 8"/>
		<rect x="15" y="14" width="1" height="1"/>
		<rect x="12" y="17" width="1" height="1"/>
		<rect x="6" y="18" width="6" height="1"/>
		<rect x="5" y="17" width="1" height="1"/>
		<rect x="2" y="14" width="1" height="1"/>
		<rect x="11" y="1" width="5" height="1"/>
		<rect x="16" y="2" width="1" height="1"/>
		<rect x="17" y="3" width="1" height="1"/>
		<rect x="18" y="4" width="1" height="5"/>
		<rect x="10" y="10" width="1" height="1"/>
		<rect x="9" y="9" width="1" height="1"/>
		<polygon points="8 9 9 9 9 4 12 4 12 3 11 3 11 2 10 2 10 3 6 3 6 4 8 4 8 9"/>
		<rect x="14" y="15" width="1" height="1"/>
		<rect x="13" y="16" width="1" height="1"/>
		<rect x="3" y="15" width="1" height="1"/>
		<rect x="4" y="16" width="1" height="1"/>
		<rect x="3" y="6" width="1" height="1"/>
		<rect x="4" y="5" width="1" height="1"/>
		<rect x="14" y="6" width="1" height="1"/>
		<rect x="13" y="5" width="1" height="1"/>
	`,
};

icons.zoom1to1 = {
	outline: `
		<rect x="5" y="4" width="2" height="12"></rect>
		<rect x="14" y="4" width="2" height="12"></rect>
		<rect x="18" y="1" width="1" height="18"></rect>
		<rect x="1" y="1" width="1" height="18"></rect>
		<rect x="13" y="5" width="1" height="1"></rect>
		<rect x="4" y="5" width="1" height="1"></rect>
		<rect x="9" y="11" width="2" height="2"></rect>
		<rect x="9" y="7" width="2" height="2"></rect>
		<rect x="1" y="1" width="18" height="1"></rect>
		<rect x="1" y="18" width="18" height="1"></rect>
	`,
};

icons.zoomIn = {
	outline: `
		<rect x="9" y="3" width="2" height="14"></rect>
		<rect x="3" y="9" width="14" height="2"></rect>
	`,
};

icons.zoomOut = {
	outline: `<rect x="3" y="9" width="14" height="2"></rect>`,
};

icons.pan = {
	fill: `
		<rect x="9" y="1" width="2" height="18"></rect>
		<rect x="1" y="9" width="18" height="2"></rect>
		<rect x="2" y="7" width="2" height="6"></rect>
		<rect x="7" y="16" width="6" height="2"></rect>
		<rect x="16" y="7" width="2" height="6"></rect>
		<rect x="7" y="2" width="6" height="2"></rect>
	`,
	outline: `
		<rect x="8" y="4" width="1" height="5"></rect>
		<rect x="8" y="11" width="1" height="5"></rect>
		<rect x="11" y="4" width="1" height="5"></rect>
		<rect x="11" y="11" width="1" height="5"></rect>
		<rect x="4" y="8" width="4" height="1"></rect>
		<rect x="11" y="8" width="5" height="1"></rect>
		<rect x="4" y="11" width="4" height="1"></rect>
		<rect x="4" y="12" width="1" height="2"></rect>
		<rect x="4" y="6" width="1" height="2"></rect>
		<rect x="2" y="12" width="1" height="1"></rect>
		<rect x="1" y="11" width="1" height="1"></rect>
		<rect x="0" y="9" width="1" height="2"></rect>
		<rect x="1" y="8" width="1" height="1"></rect>
		<rect x="3" y="6" width="1" height="1"></rect>
		<rect x="2" y="7" width="1" height="1"></rect>
		<rect x="3" y="13" width="1" height="1"></rect>
		<rect x="11" y="11" width="5" height="1"></rect>
		<rect x="12" y="15" width="2" height="1"></rect>
		<rect x="6" y="15" width="2" height="1"></rect>
		<rect x="12" y="17" width="1" height="1"></rect>
		<rect x="13" y="16" width="1" height="1"></rect>
		<rect x="11" y="18" width="1" height="1"></rect>
		<rect x="9" y="19" width="2" height="1"></rect>
		<rect x="8" y="18" width="1" height="1"></rect>
		<rect x="7" y="17" width="1" height="1"></rect>
		<rect x="6" y="16" width="1" height="1"></rect>
		<rect x="15" y="6" width="1" height="2"></rect>
		<rect x="15" y="12" width="1" height="2"></rect>
		<rect x="17" y="7" width="1" height="1"></rect>
		<rect x="16" y="6" width="1" height="1"></rect>
		<rect x="18" y="8" width="1" height="1"></rect>
		<rect x="19" y="9" width="1" height="2"></rect>
		<rect x="18" y="11" width="1" height="1"></rect>
		<rect x="17" y="12" width="1" height="1"></rect>
		<rect x="16" y="13" width="1" height="1"></rect>
		<rect x="6" y="4" width="2" height="1"></rect>
		<rect x="12" y="4" width="2" height="1"></rect>
		<rect x="7" y="2" width="1" height="1"></rect>
		<rect x="6" y="3" width="1" height="1"></rect>
		<rect x="8" y="1" width="1" height="1"></rect>
		<rect x="9" y="0" width="2" height="1"></rect>
		<rect x="11" y="1" width="1" height="1"></rect>
		<rect x="12" y="2" width="1" height="1"></rect>
		<rect x="13" y="3" width="1" height="1"></rect>
	`,
};

icons.livePreview = {
	outline: `
		<polygon points="8 12 7 12 7 13 5 13 5 9 6 9 6 8 3 8 3 9 4 9 4 13 3 13 3 14 8 14 8 12"/>
		<rect x="8" y="10" width="1" height="1"/>
		<rect x="10" y="10" width="2" height="1"/>
		<rect x="12" y="11" width="1" height="2"/>
		<polygon points="12 13 10 13 10 11 9 11 9 15 8 15 8 16 10 16 10 14 12 14 12 13"/>
		<rect x="1" y="6" width="1" height="12"/>
		<rect x="14" y="8" width="1" height="10"/>
		<rect x="2" y="5" width="10" height="1"/>
		<polygon points="14 1 14 2 18 2 18 6 19 6 19 1 14 1"/>
		<rect x="15" y="4" width="1" height="1"/>
		<rect x="16" y="3" width="1" height="1"/>
		<rect x="14" y="5" width="1" height="1"/>
		<rect x="13" y="6" width="1" height="1"/>
		<rect x="17" y="2" width="1" height="1"/>
		<rect x="2" y="18" width="12" height="1"/>
	`,
};

icons.openLivePreview = {
	fill: `
	<rect data-name="Background" x="2" y="6" width="12" height="12"/>
	`,
	outline: `
		<g data-name="Lp">
			<polygon points="8 12 7 12 7 13 5 13 5 9 6 9 6 8 3 8 3 9 4 9 4 13 3 13 3 14 8 14 8 12"/>
			<rect x="8" y="10" width="1" height="1"/>
			<rect x="10" y="10" width="2" height="1"/>
			<rect x="12" y="11" width="1" height="2"/>
			<polygon points="12 13 10 13 10 11 9 11 9 15 8 15 8 16 10 16 10 14 12 14 12 13"/>
			<rect x="1" y="6" width="1" height="12"/>
			<rect x="14" y="8" width="1" height="10"/>
			<rect x="2" y="5" width="10" height="1"/>
			<rect x="2" y="18" width="12" height="1"/>
		</g>
		<g data-name="Launch">
			<polygon points="14 1 14 2 18 2 18 6 19 6 19 1 14 1"/>
			<rect x="15" y="4" width="1" height="1"/>
			<rect x="16" y="3" width="1" height="1"/>
			<rect x="14" y="5" width="1" height="1"/>
			<rect x="13" y="6" width="1" height="1"/>
			<rect x="17" y="2" width="1" height="1"/>
		</g>
	`,
};

icons.closeLivePreview = {
	fill: `
	<rect data-name="Background" x="2" y="6" width="12" height="12"/>
	`,
	outline: `
		<g data-name="Lp">
			<polygon points="8 12 7 12 7 13 5 13 5 9 6 9 6 8 3 8 3 9 4 9 4 13 3 13 3 14 8 14 8 12"/>
			<rect x="8" y="10" width="1" height="1"/>
			<rect x="10" y="10" width="2" height="1"/>
			<rect x="12" y="11" width="1" height="2"/>
			<polygon points="12 13 10 13 10 11 9 11 9 15 8 15 8 16 10 16 10 14 12 14 12 13"/>
			<rect x="1" y="6" width="1" height="12"/>
			<rect x="14" y="8" width="1" height="10"/>
			<rect x="2" y="5" width="10" height="1"/>
			<rect x="2" y="18" width="12" height="1"/>
		</g>
		<g data-name="Close">
			<rect x="15" y="4" width="1" height="1"/>
			<rect x="16" y="3" width="1" height="1"/>
			<rect x="14" y="5" width="1" height="1"/>
			<rect x="13" y="6" width="1" height="1"/>
			<rect x="13" y="0" width="1" height="1"/>
			<rect x="19" y="0" width="1" height="1"/>
			<rect x="19" y="6" width="1" height="1"/>
			<rect x="17" y="2" width="1" height="1"/>
			<rect x="18" y="1" width="1" height="1"/>
			<rect x="15" y="2" width="1" height="1"/>
			<rect x="14" y="1" width="1" height="1"/>
			<rect x="18" y="5" width="1" height="1"/>
			<rect x="17" y="4" width="1" height="1"/>
		</g>
	`,
};

icons.kern = {
	fill: `
		<rect x="1" y="9" width="18" height="2"></rect>
		<rect x="2" y="7" width="2" height="6"></rect>
		<rect x="16" y="7" width="2" height="6"></rect>
	`,
	outline: `
		<rect x="4" y="8" width="12" height="1"></rect>
		<rect x="4" y="11" width="12" height="1"></rect>
		<rect x="4" y="12" width="1" height="2"></rect>
		<rect x="4" y="6" width="1" height="2"></rect>
		<rect x="2" y="12" width="1" height="1"></rect>
		<rect x="1" y="11" width="1" height="1"></rect>
		<rect y="9" width="1" height="2"></rect>
		<rect x="1" y="8" width="1" height="1"></rect>
		<rect x="3" y="6" width="1" height="1"></rect>
		<rect x="2" y="7" width="1" height="1"></rect>
		<rect x="3" y="13" width="1" height="1"></rect>
		<rect x="15" y="6" width="1" height="2"></rect>
		<rect x="15" y="12" width="1" height="2"></rect>
		<rect x="17" y="7" width="1" height="1"></rect>
		<rect x="16" y="6" width="1" height="1"></rect>
		<rect x="18" y="8" width="1" height="1"></rect>
		<rect x="19" y="9" width="1" height="2"></rect>
		<rect x="18" y="11" width="1" height="1"></rect>
		<rect x="17" y="12" width="1" height="1"></rect>
		<rect x="16" y="13" width="1" height="1"></rect>
		<rect x="9" y="2" width="2" height="16"></rect>
	`,
};

// Pixel pen - a nib over a grid
icons.pixelPen = {
	fill: `
		<rect x="2" y="12" width="2" height="2"></rect>
		<rect x="4" y="10" width="2" height="2"></rect>
		<rect x="6" y="8" width="2" height="2"></rect>
		<rect x="8" y="6" width="2" height="2"></rect>
		<rect x="10" y="4" width="2" height="2"></rect>
		<rect x="12" y="2" width="2" height="2"></rect>
	`,
	outline: `
		<rect x="2" y="14" width="2" height="2"></rect>
		<rect x="4" y="14" width="2" height="2"></rect>
		<rect x="2" y="16" width="2" height="2"></rect>
		<rect x="6" y="12" width="2" height="2"></rect>
		<rect x="8" y="10" width="2" height="2"></rect>
		<rect x="10" y="8" width="2" height="2"></rect>
		<rect x="12" y="6" width="2" height="2"></rect>
		<rect x="14" y="4" width="2" height="2"></rect>
		<rect x="14" y="2" width="2" height="2"></rect>
		<rect x="16" y="2" width="2" height="2"></rect>
	`,
};
