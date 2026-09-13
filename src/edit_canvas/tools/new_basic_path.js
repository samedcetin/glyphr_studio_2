import { getCurrentProject, getCurrentProjectEditor } from '../../app/main.js';
import { isVal, round } from '../../common/functions.js';
import { showToast } from '../../controls/dialogs/dialogs.js';
import { ControlPoint } from '../../project_data/control_point.js';
import { Maxes, isMaxes } from '../../project_data/maxes.js';
import { Path } from '../../project_data/path.js';
import { PathPoint } from '../../project_data/path_point.js';
import { canvasUIPointSize } from '../draw_edit_affordances.js';
import { getPixelMode, getUnitsPerPixel, snapValue } from '../../pixel_font/pixel_grid.js';
import { cXsX, cYsY } from '../edit_canvas.js';
import { eventHandlerData } from '../events.js';
import { addPathToCurrentItem, switchToolTo } from './tools.js';

/**
	// ----------------------------------------------------------------
	// New Basic Path - adds many points to a new path
	// ----------------------------------------------------------------
 */
export class Tool_NewBasicPath {
	constructor() {
		this.dragging = false;
	}
	mousedown() {
		// log(`Tool_NewBasicPath.mousedown`, 'start');
		const editor = getCurrentProjectEditor();
		const ehd = eventHandlerData;
		const startX = snapToPixelGrid(cXsX(ehd.mousePosition.x));
		const startY = snapToPixelGrid(cYsY(ehd.mousePosition.y));
		ehd.newBasicPathMaxes = {
			xMax: startX,
			xMin: startX,
			yMax: startY,
			yMin: startY,
		};

		// This is the fake path that shows up in the layers panel
		// while dragging is happening
		if (editor.selectedTool === 'newOval') {
			// log(`making Oval path`);
			ehd.newBasicPath = ovalPathFromMaxes(ehd.newBasicPathMaxes, `New oval`);
		} else {
			// log(`making Rectangle path`);
			ehd.newBasicPath = rectPathFromMaxes(ehd.newBasicPathMaxes, `New rectangle`);
		}

		this.dragging = true;
		ehd.firstX = startX;
		ehd.firstY = startY;
		// log(`ehd.firstX: ${ehd.firstX}`);
		// log(`ehd.firstY: ${ehd.firstY}`);

		editor.multiSelect.shapes.clear();

		editor.editCanvas.redraw('newBasicPath:mousedown');

		// log(`Tool_NewBasicPath.mousedown`, 'end');
	}

	mousemove() {
		// log(`Tool_NewBasicPath.mousemove`, 'start');
		const editor = getCurrentProjectEditor();
		const ehd = eventHandlerData;
		// log(`EHFirst: x ${(ehd.firstX)}, y ${(ehd.firstY)}`);
		// log(`Mouse:   x ${cXsX(ehd.mousePosition.x)}, y ${cYsY(ehd.mousePosition.y)}`);
		// log(`ehd.newBasicPathMaxes before ${JSON.stringify(ehd.newBasicPathMaxes)}`);
		if (isMaxes(ehd.newBasicPathMaxes)) {
			const currentX = snapToPixelGrid(cXsX(ehd.mousePosition.x));
			const currentY = snapToPixelGrid(cYsY(ehd.mousePosition.y));
			ehd.newBasicPathMaxes.xMax = Math.max(ehd.firstX, currentX);
			ehd.newBasicPathMaxes.xMin = Math.min(ehd.firstX, currentX);
			ehd.newBasicPathMaxes.yMax = Math.max(ehd.firstY, currentY);
			ehd.newBasicPathMaxes.yMin = Math.min(ehd.firstY, currentY);
			// log(`ehd.newBasicPathMaxes afters ${JSON.stringify(ehd.newBasicPathMaxes)}`);

			if (editor.selectedTool === 'newOval') {
				// log(`making Oval path`);
				ehd.newBasicPath = ovalPathFromMaxes(ehd.newBasicPathMaxes, `New oval`);
			} else {
				// log(`making Rectangle path`);
				ehd.newBasicPath = rectPathFromMaxes(ehd.newBasicPathMaxes, `New rectangle`);
			}

			ehd.undoQueueHasChanged = true;
			editor.publish('currentPath', ehd.newBasicPath);
			editor.editCanvas.redraw('newBasicPath:mousemove');
		}
		// log(`Tool_NewBasicPath.mousemove`, 'end');
	}

	mouseup() {
		// log(`Tool_NewBasicPath.mouseup`, 'start');
		const editor = getCurrentProjectEditor();
		const ehd = eventHandlerData;

		// Only make the new path if it's not really small
		let xSize = Math.abs(ehd.newBasicPathMaxes.xMax - ehd.newBasicPathMaxes.xMin);
		let ySize = Math.abs(ehd.newBasicPathMaxes.yMax - ehd.newBasicPathMaxes.yMin);
		// log(`xSize: ${xSize}`);
		// log(`ySize: ${ySize}`);

		let path;
		if (xSize > canvasUIPointSize && ySize > canvasUIPointSize) {
			// log(`New path is large enough`);
			let count = editor.selectedItem.shapes.length;

			if (editor.nav.page === 'components') {
				count = Object.keys(editor.project.components).length;
			}

			// Update the fake ... path with new data
			if (editor.selectedTool === 'newOval') {
				// log(`making Oval path`);
				path = ovalPathFromMaxes(ehd.newBasicPathMaxes, `Oval ${count}`);
			} else {
				// log(`making Rectangle path`);
				path = rectPathFromMaxes(ehd.newBasicPathMaxes, `Rectangle ${count}`);
			}

			ehd.newBasicPathMaxes = false;
			ehd.newBasicPath = false;
			path = addPathToCurrentItem(path);
			// log(`\n⮟Added path⮟`);
			// log(path);
			editor.multiSelect.shapes.select(path);
			switchToolTo('resize');
		} else {
			// log(`New path too small`);
			ehd.newBasicPathMaxes = false;
			ehd.newBasicPath = false;
			ehd.undoQueueHasChanged = false;
			showToast('New shape was too small.');
		}

		this.dragging = false;
		ehd.firstX = -100;
		ehd.firstY = -100;

		if (ehd.undoQueueHasChanged) {
			editor.history.addState(`Added path: ${path.name}`);
			ehd.undoQueueHasChanged = false;
		}

		// selectTool('pathEdit');
		editor.editCanvas.redraw('newBasicPath:mouseup');
		// log(`Tool_NewBasicPath.mouseup`, 'end');
	}
}

/**
 * Snaps a coordinate to the pixel grid, when there is one.
 *
 * In pixel font mode a rectangle drawn a few units off the grid is the start
 * of a font that never quite lines up, and the error is invisible until it is
 * rasterised. Snapping while drawing is cheaper than finding it later.
 *
 * @param {Number} value - em units
 * @returns {Number}
 */
function snapToPixelGrid(value) {
	const project = getCurrentProject();
	const settings = getPixelMode(project);
	if (!settings.enabled || !settings.snapToGrid) return value;
	return snapValue(value, getUnitsPerPixel(project));
}

/**
 * Makes a rectangular path from a Maxes object
 * @param {Maxes | Object} maxes - bound object to make the rectangle from
 * @param {String} name
 * @returns {Path}
 */
export function rectPathFromMaxes(maxes = {}, name = 'Rectangle') {
	// log(`rectPathFromMaxes`, 'start');
	// log(JSON.stringify(maxes));
	let fontSettings = getCurrentProject().settings.font;

	//Default Path size
	let lx = isVal(maxes.xMin) ? maxes.xMin : 0;
	let ty = isVal(maxes.yMax) ? maxes.yMax : fontSettings.ascent;
	let rx = isVal(maxes.xMax) ? maxes.xMax : 100;
	let by = isVal(maxes.yMin) ? maxes.yMin : 0;

	// log(`lx: ${lx}, ty: ${ty}, rx: ${rx}, by: ${by}`);

	// First Point
	let Pul = new ControlPoint({ coord: { x: lx, y: ty } });
	// log(Pul);

	// Second Point
	let Pur = new ControlPoint({ coord: { x: rx, y: ty } });
	// log(Pur);

	// Third Point
	let Plr = new ControlPoint({ coord: { x: rx, y: by } });
	// log(Plr);

	// Fourth Point
	let Pll = new ControlPoint({ coord: { x: lx, y: by } });
	// log(Pll);

	let newPoints = [];
	newPoints[0] = new PathPoint({ p: Pul });
	newPoints[1] = new PathPoint({ p: Pur });
	newPoints[2] = new PathPoint({ p: Plr });
	newPoints[3] = new PathPoint({ p: Pll });
	// log(newPoints);

	let newPath = new Path({ name: name, pathPoints: newPoints });
	// log(newPath);
	// log(`rectPathFromMaxes`, 'end');

	return newPath;
}

/**
 * Makes an oval path from a Maxes object
 * @param {Maxes | Object} maxes - bound object to make the rectangle from
 * @param {String} name
 * @returns {Path}
 */
export function ovalPathFromMaxes(maxes, name = 'Oval') {
	let fontSettings = getCurrentProject().settings.font;

	//Default Circle size
	let lx = isVal(maxes.xMin) ? maxes.xMin : 0;
	let ty = isVal(maxes.yMax) ? maxes.yMax : fontSettings.xHeight || 500;
	let rx = isVal(maxes.xMax) ? maxes.xMax : fontSettings.xHeight || 500;
	let by = isVal(maxes.yMin) ? maxes.yMin : 0;

	let hw = round((rx - lx) / 2);
	let hh = round((ty - by) / 2);
	let hwd = round(hw * 0.448);
	let hhd = round(hh * 0.448);

	// First Point - Top
	let Pt = new ControlPoint({ coord: { x: lx + hw, y: ty } });
	let H1t = new ControlPoint({ coord: { x: lx + hwd, y: ty } });
	let H2t = new ControlPoint({ coord: { x: rx - hwd, y: ty } });

	// Second Point - Right
	let Pr = new ControlPoint({ coord: { x: rx, y: by + hh } });
	let H1r = new ControlPoint({ coord: { x: rx, y: ty - hhd } });
	let H2r = new ControlPoint({ coord: { x: rx, y: by + hhd } });

	// Third Point - Bottom
	let Pb = new ControlPoint({ coord: { x: lx + hw, y: by } });
	let H1b = new ControlPoint({ coord: { x: rx - hwd, y: by } });
	let H2b = new ControlPoint({ coord: { x: lx + hwd, y: by } });

	// Fourth Point - Left
	let Pl = new ControlPoint({ coord: { x: lx, y: by + hh } });
	let H1l = new ControlPoint({ coord: { x: lx, y: by + hhd } });
	let H2l = new ControlPoint({ coord: { x: lx, y: ty - hhd } });

	let newPoints = [];
	newPoints[0] = new PathPoint({ p: Pt, h1: H1t, h2: H2t, type: 'symmetric' });
	newPoints[1] = new PathPoint({ p: Pr, h1: H1r, h2: H2r, type: 'symmetric' });
	newPoints[2] = new PathPoint({ p: Pb, h1: H1b, h2: H2b, type: 'symmetric' });
	newPoints[3] = new PathPoint({ p: Pl, h1: H1l, h2: H2l, type: 'symmetric' });

	return new Path({ name: name, pathPoints: newPoints });
}
