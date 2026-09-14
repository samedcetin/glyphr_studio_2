import { getCurrentProject, getCurrentProjectEditor } from '../app/main.js';
import { addAsChildren, makeElement } from '../common/dom.js';
import { eventHandlerData } from '../edit_canvas/events.js';
import { addChildActions, getActionData } from './actions.js';
import { panelsEventHandlerData } from './panel_events.js';
import { refreshPanel } from './panels.js';
import { startRenamingInPlace } from './cards.js';

// --------------------------------------------------------------
// Layer panel
// --------------------------------------------------------------

const layerIcons = {
	visible: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.5c3 0 5.4 1.9 6.4 4.2a.8.8 0 0 1 0 .6C13.4 10.6 11 12.5 8 12.5S2.6 10.6 1.6 8.3a.8.8 0 0 1 0-.6C2.6 5.4 5 3.5 8 3.5Zm0 1C5.6 4.5 3.6 6 2.7 8c.9 2 2.9 3.5 5.3 3.5S12.4 10 13.3 8C12.4 6 10.4 4.5 8 4.5Zm0 1.6a1.9 1.9 0 1 1 0 3.8 1.9 1.9 0 0 1 0-3.8Z"/></svg>`,
	hidden: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.15 2.15a.5.5 0 0 1 .7 0l11 11a.5.5 0 0 1-.7.7l-2.06-2.05A7.3 7.3 0 0 1 8 12.5c-3 0-5.4-1.9-6.4-4.2a.8.8 0 0 1 0-.6 8 8 0 0 1 2.3-2.9L2.15 2.85a.5.5 0 0 1 0-.7ZM4.6 5.5A7 7 0 0 0 2.7 8c.9 2 2.9 3.5 5.3 3.5 .9 0 1.7-.2 2.4-.5L9.2 9.8A1.9 1.9 0 0 1 6.2 6.8L4.6 5.5Zm3.4-2A7.2 7.2 0 0 1 14.4 7.7a.8.8 0 0 1 0 .6 8.2 8.2 0 0 1-1.6 2.2l-.72-.72A7 7 0 0 0 13.3 8C12.4 6 10.4 4.5 8 4.5c-.32 0-.63.03-.93.08l-.83-.83A7.6 7.6 0 0 1 8 3.5Z"/></svg>`,
	unlocked: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5a3.2 3.2 0 0 1 3.2 3.2.5.5 0 0 1-1 0A2.2 2.2 0 0 0 5.8 4.7V7h5.7A1.5 1.5 0 0 1 13 8.5v4A1.5 1.5 0 0 1 11.5 14h-7A1.5 1.5 0 0 1 3 12.5v-4A1.5 1.5 0 0 1 4.5 7h.3V4.7A3.2 3.2 0 0 1 8 1.5ZM4.5 8a.5.5 0 0 0-.5.5v4a.5.5 0 0 0 .5.5h7a.5.5 0 0 0 .5-.5v-4a.5.5 0 0 0-.5-.5h-7Z"/></svg>`,
	locked: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5a3.2 3.2 0 0 1 3.2 3.2V7h.3A1.5 1.5 0 0 1 13 8.5v4A1.5 1.5 0 0 1 11.5 14h-7A1.5 1.5 0 0 1 3 12.5v-4A1.5 1.5 0 0 1 4.5 7h.3V4.7A3.2 3.2 0 0 1 8 1.5Zm0 1a2.2 2.2 0 0 0-2.2 2.2V7h4.4V4.7A2.2 2.2 0 0 0 8 2.5ZM4.5 8a.5.5 0 0 0-.5.5v4a.5.5 0 0 0 .5.5h7a.5.5 0 0 0 .5-.5v-4a.5.5 0 0 0-.5-.5h-7Z"/></svg>`,
};

/**
 * A small toggle button that lives on a layer row.
 * @param {Object} args - button options
 * @param {String} args.className - extra class for styling and hit-testing
 * @param {String} args.icon - SVG markup
 * @param {String} args.title - tooltip and accessible name
 * @param {Boolean} args.pressed - aria-pressed state
 * @param {Function} args.onClick - handler
 * @returns {Element}
 */
function makeLayerToggle({ className, icon, title, pressed, onClick }) {
	const button = makeElement({
		tag: 'button',
		className: `layer-row__toggle ${className}`,
		innerHTML: icon,
		attributes: { type: 'button', title: title, 'aria-label': title, 'aria-pressed': String(pressed) },
	});

	button.addEventListener('click', (event) => {
		// The row itself selects; the toggles must not also change selection.
		event.stopPropagation();
		onClick();
	});

	return button;
}

/**
 * Turns a layer's title into an editable field, in place.
 *
 * Renaming a path was previously only possible through the Properties panel's
 * "path name" field, which meant selecting the layer, looking away from the
 * list, and typing somewhere else. Double-click is where people try first.
 *
 * @param {Element} titleElement - the row's title span
 * @param {Object} shape - the Path or ComponentInstance being renamed
 */
function startRenamingLayer(titleElement, shape) {
	const editor = getCurrentProjectEditor();
	startRenamingInPlace(titleElement, {
		value: shape.name,
		className: 'layer-row__rename',
		onCommit: (newName) => {
			if (newName) {
				shape.name = newName;
				editor.history.addState(`Renamed layer to ${newName}`);
				editor.publish('currentItem', editor.selectedItem);
			}
			refreshPanel();
		},
	});
}

/**
 * Moves a shape within its glyph's stacking order.
 *
 * Layer order is the order of glyph.shapes, and the array is written back
 * through the setter so the glyph's caches are cleared.
 *
 * @param {Object} item - the glyph whose shapes are being reordered
 * @param {Number} fromIndex - index to move
 * @param {Number} toIndex - index to move to
 */
function moveShapeToIndex(item, fromIndex, toIndex) {
	const shapes = item.shapes.slice();
	if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= shapes.length) return;

	const [moved] = shapes.splice(fromIndex, 1);
	shapes.splice(Math.max(0, Math.min(shapes.length, toIndex)), 0, moved);

	const editor = getCurrentProjectEditor();
	item.shapes = shapes;
	editor.history.addState(`Reordered layers`);
	editor.publish('currentItem', item);
	refreshPanel();
}

export function makePanel_Layers() {
	// log(`makePanel_Layers`, 'start');
	let rowsArea = makeElement({ className: 'panel__card full-width item-links__rows-area' });
	const editor = getCurrentProjectEditor();
	const project = getCurrentProject();
	let selected = editor.selectedItem;
	let paths = selected.shapes;

	if (eventHandlerData?.newBasicPath?.objType) {
		// log(`Handling new basic path`);
		let path = eventHandlerData.newBasicPath;
		let row = makeElement();
		row.setAttribute('class', 'item-link__row layer-panel__new-path');
		row.classList.add('layer-panel__selected');
		row.appendChild(
			makeElement({
				className: 'item-link__thumbnail',
				innerHTML: project.makeItemThumbnail(path),
			})
		);

		row.appendChild(
			makeElement({
				className: 'item-link__title',
				innerHTML: path.name,
			})
		);

		rowsArea.appendChild(row);
	}

	if (paths.length > 0) {
		// Drawn top of stack first, which is how a layers list reads.
		for (let i = paths.length - 1; i >= 0; i--) {
			let item = paths[i];
			let row = makeElement({ attributes: { 'target-path-index': i, draggable: 'true' } });

			if (item.objType === 'ComponentInstance') {
				row.setAttribute('class', 'item-link__row layer-panel__component-row');
			} else {
				row.setAttribute('class', 'item-link__row layer-panel__path-row');
			}

			if (editor.multiSelect.shapes.isSelected(item)) {
				row.classList.add('layer-panel__selected');
			}
			if (item.isVisible === false) row.classList.add('layer-row--hidden');
			if (item.isLayerLocked) row.classList.add('layer-row--locked');

			editor.subscribe({
				topic: 'whichShapeIsSelected',
				subscriberID: `layersPanel.item-link-row-${i}`,
				callback: () => {
					let isSelected = editor.multiSelect.shapes.isSelected(item);
					row.classList.toggle('layer-panel__selected', isSelected);
				},
			});

			row.addEventListener('click', () => {
				// A locked layer can still be selected from the list - the lock
				// only protects it from being grabbed on the canvas.
				if (panelsEventHandlerData.isCtrlDown) {
					editor.multiSelect.shapes.toggle(item);
				} else {
					editor.multiSelect.shapes.select(item);
				}
				editor.publish('whichShapeIsSelected', item);
			});

			const thumbnail = makeElement({
				className: 'item-link__thumbnail',
				attributes: { 'target-path-index': i },
				innerHTML: project.makeItemThumbnail(item),
			});
			row.appendChild(thumbnail);

			const title = makeElement({
				className: 'item-link__title',
				innerHTML: `${item.name}`,
			});
			title.addEventListener('dblclick', (event) => {
				event.stopPropagation();
				startRenamingLayer(title, item);
			});
			row.appendChild(title);

			let subtitle = 'Path';
			if (item.link) subtitle = `Component instance&emsp;|&emsp;${project.getItem(item.link).name}`;
			row.appendChild(
				makeElement({
					className: 'item-link__subtitle',
					innerHTML: subtitle,
				})
			);

			const controls = makeElement({ className: 'layer-row__controls' });
			const isVisible = item.isVisible !== false;
			const isLocked = !!item.isLayerLocked;

			controls.appendChild(
				makeLayerToggle({
					className: 'layer-row__visibility',
					icon: isVisible ? layerIcons.visible : layerIcons.hidden,
					title: isVisible ? `Hide ${item.name}` : `Show ${item.name}`,
					pressed: !isVisible,
					onClick: () => {
						item.isVisible = !isVisible;
						// Hiding changes the outline, so the glyph's cached path
						// data and bounding box have to go.
						if (item.changed) item.changed();
						editor.history.addState(`${isVisible ? 'Hid' : 'Showed'} ${item.name}`);
						editor.publish('currentItem', editor.selectedItem);
						refreshPanel();
					},
				})
			);

			controls.appendChild(
				makeLayerToggle({
					className: 'layer-row__lock',
					icon: isLocked ? layerIcons.locked : layerIcons.unlocked,
					title: isLocked ? `Unlock ${item.name}` : `Lock ${item.name}`,
					pressed: isLocked,
					onClick: () => {
						item.isLayerLocked = !isLocked;
						// Locking changes nothing about the drawing, so the
						// selection is simply cleared if it held this shape.
						if (!isLocked) editor.multiSelect.shapes.remove(item);
						editor.history.addState(`${isLocked ? 'Unlocked' : 'Locked'} ${item.name}`);
						refreshPanel();
					},
				})
			);

			row.appendChild(controls);

			addLayerDragHandlers(row, i, selected);
			rowsArea.appendChild(row);
		}
	} else {
		rowsArea.appendChild(
			makeElement({
				content: `No paths exist yet.  You can create one with the New Path tools on the canvas, or by pressing "add new path" below.`,
			})
		);
	}

	// Overall, watch for changes:
	editor.subscribe({
		topic: ['currentPath', 'currentItem'],
		subscriberID: 'layersPanel',
		callback: () => {
			refreshPanel();
		},
	});

	// log(`makePanel_Layers`, 'end');
	return [rowsArea, makeActionArea_Layers()];
}

/**
 * Wires drag-and-drop reordering onto one layer row.
 *
 * The list is drawn top of stack first while glyph.shapes runs bottom first,
 * so every index that crosses that boundary is flipped exactly once - here.
 *
 * @param {Element} row - the row element
 * @param {Number} shapeIndex - this row's index into glyph.shapes
 * @param {Object} item - the glyph being edited
 */
function addLayerDragHandlers(row, shapeIndex, item) {
	row.addEventListener('dragstart', (/** @type {DragEvent} */ event) => {
		event.dataTransfer?.setData('text/plain', String(shapeIndex));
		if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
		row.classList.add('layer-row--dragging');
	});

	row.addEventListener('dragend', () => {
		row.classList.remove('layer-row--dragging');
		document
			.querySelectorAll('.layer-row--drop-above, .layer-row--drop-below')
			.forEach((other) => other.classList.remove('layer-row--drop-above', 'layer-row--drop-below'));
	});

	row.addEventListener('dragover', (/** @type {DragEvent} */ event) => {
		event.preventDefault();
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';

		// Which half of the row the pointer is over decides which side of it
		// the dragged layer lands on.
		const bounds = row.getBoundingClientRect();
		const isTopHalf = event.clientY < bounds.top + bounds.height / 2;
		row.classList.toggle('layer-row--drop-above', isTopHalf);
		row.classList.toggle('layer-row--drop-below', !isTopHalf);
	});

	row.addEventListener('dragleave', () => {
		row.classList.remove('layer-row--drop-above', 'layer-row--drop-below');
	});

	row.addEventListener('drop', (/** @type {DragEvent} */ event) => {
		event.preventDefault();
		const fromIndex = Number(event.dataTransfer?.getData('text/plain'));
		row.classList.remove('layer-row--drop-above', 'layer-row--drop-below');
		if (!isFinite(fromIndex) || fromIndex === shapeIndex) return;

		const bounds = row.getBoundingClientRect();
		const droppedOnTopHalf = event.clientY < bounds.top + bounds.height / 2;

		// Top half of a row means "above it in the list", and above in the
		// list means a higher index in glyph.shapes.
		let toIndex = droppedOnTopHalf ? shapeIndex + 1 : shapeIndex;
		if (fromIndex < toIndex) toIndex -= 1;

		moveShapeToIndex(item, fromIndex, toIndex);
	});
}

function makeActionArea_Layers() {
	const editor = getCurrentProjectEditor();

	let actionsCard = makeElement({
		className: 'panel__card full-width',
		content: '<h3>Actions</h3>',
	});

	let actionsArea = makeElement({
		tag: 'div',
		className: 'panel__actions-area',
	});
	addChildActions(actionsArea, getActionData('addShapeActions'));

	let selectedPaths = editor.multiSelect.shapes.members;
	let totalPaths = editor.selectedItem.shapes.length;
	if (totalPaths > 1 && selectedPaths.length) {
		addChildActions(actionsArea, getActionData('layerActions'));
	}

	addAsChildren(actionsCard, actionsArea);
	return actionsCard;
}
