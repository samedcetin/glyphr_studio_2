import { getCurrentProjectEditor } from '../app/main.js';
import { accentColors } from '../common/colors.js';
import { addAsChildren, makeElement } from '../common/dom.js';
import { makeIconToggle } from '../controls/icon-toggle/icon_toggle.js';
import { makeInputs_position, makeSingleLabel, rowPad } from './cards.js';

// --------------------------------------------------------------
// Path Point Attributes Card
// --------------------------------------------------------------

export function makeCard_pathPointAttributes(selectedPoint) {
	// log(`makeCard_pathPointAttributes`, 'start');
	const editor = getCurrentProjectEditor();

	// `ident` is a unique ID per object for debugging
	let pathPointCard = makeElement({
		tag: 'div',
		className: 'panel__card',
		innerHTML: `<h3></h3>`,
	});
	const pathPointHeading = pathPointCard.querySelector('h3');
	if (pathPointHeading)
		pathPointHeading.textContent = `Path point ${selectedPoint.pointNumber + 1} ${
			selectedPoint.ident || ''
		}`;

	// -- Point -- //
	// Point x/y
	let pointPosition = makeInputs_position(selectedPoint.p, 'point');
	let pointTypeLabel = makeSingleLabel('point type');
	let pointTypeWrapper = makeElement();

	addAsChildren(pointTypeWrapper, [
		makePointTypeButton('symmetric', selectedPoint.type === 'symmetric', () => {
			selectedPoint.type = 'symmetric';
			selectedPoint.makeSymmetric();
			editor.publish('currentPathPoint', selectedPoint);
		}),
		makePointTypeButton('flat', selectedPoint.type === 'flat', () => {
			selectedPoint.type = 'flat';
			selectedPoint.makeFlat();
			editor.publish('currentPathPoint', selectedPoint);
		}),
		makePointTypeButton('corner', selectedPoint.type === 'corner', () => {
			selectedPoint.type = 'corner';
			editor.publish('currentPathPoint', selectedPoint);
		}),
	]);

	editor.subscribe({
		topic: 'currentPathPoint',
		subscriberID: 'pointTypeButtons',
		callback: (changedPathPoint) => {
			// log(`pointTypeButton CALLBACK`, 'start');
			// log(`\n⮟changedPathPoint⮟`);
			// log(changedPathPoint);

			// Update Point Type
			if (document.getElementById(`pointTypeButton-${changedPathPoint.type}`)) {
				document.getElementById(`pointTypeButton-symmetric`).removeAttribute('selected');
				document.getElementById(`pointTypeButton-flat`).removeAttribute('selected');
				document.getElementById(`pointTypeButton-corner`).removeAttribute('selected');
				document
					.getElementById(`pointTypeButton-${changedPathPoint.type}`)
					.setAttribute('selected', '');
			}

			updateHandleGroup('h1', changedPathPoint);
			updateHandleGroup('h2', changedPathPoint);

			// log(`pointTypeButton CALLBACK`, 'end');
		},
	});

	/*
		.handle-group, not .span-all-columns. The latter only spans; it does not
		stretch, and the card is justify-items: left - so the group with its
		coordinates hidden shrank to the width of its own heading and took the
		toggle on that heading with it, two hundred pixels short of the edge the
		other one ended on.
	*/
	let h1Group = makeElement({ id: `h1Group`, className: 'handle-group' });
	addAsChildren(h1Group, makeHandleGroup('h1', selectedPoint));
	let h2Group = makeElement({ id: `h2Group`, className: 'handle-group' });
	addAsChildren(h2Group, makeHandleGroup('h2', selectedPoint));

	// Put it all together
	addAsChildren(pathPointCard, pointPosition);
	addAsChildren(pathPointCard, [pointTypeLabel, pointTypeWrapper]);
	addAsChildren(pathPointCard, [h1Group, h2Group]);
	addAsChildren(pathPointCard, rowPad());
	/*
		The action grid moved to the toolbar - see edit_canvas/quick_actions.js.
		Thirty-one icon buttons at the foot of a 260px column was a lot of the
		panel spent on things reached for occasionally, in a panel for properties.
	*/

	// log(`makeCard_pathPointAttributes`, 'end');
	return pathPointCard;
}

/**
 * One handle: a heading with its switch, and the coordinates under it.
 *
 * The switch was a browser checkbox with a caption beside it - the largest
 * control in the panel, in a shape nothing else here has, and the wrong
 * idea besides: this is a state of the point, not an item you tick in a
 * list. It is an icon toggle now, the same control the Layers panel uses
 * for a layer and the Quality checks panel for its overlay.
 *
 * It sits on the heading row rather than on one of its own, which is where
 * the panel already puts a control that belongs to a whole group - see the
 * Quality checks verdict. That also buys back the row the caption's own
 * line was spending on saying what the heading already says.
 *
 * @param {String} h - 'h1' or 'h2'
 * @param {Object} selectedPoint - the PathPoint being edited
 * @returns {Array<HTMLElement>}
 */
function makeHandleGroup(h = 'h1', selectedPoint) {
	const head = makeElement({ className: 'handle-group__head' });
	head.appendChild(makeElement({ tag: `h4`, content: `Handle ${h.charAt(1)}` }));

	const useToggle = makeIconToggle({
		icon: 'handle',
		name: `Use handle ${h.charAt(1)}`,
		body: 'Off, the curve leaves this side of the point straight.',
		pressed: !!selectedPoint[h].use,
		/* Only a corner point owns its handles: the other two types have
			theirs reconciled for them, so the switch is not yours to throw. */
		disabled: selectedPoint.type !== 'corner',
		className: 'handle-group__toggle',
		onToggle: (on) => {
			selectedPoint[h].use = on;
			selectedPoint.reconcileHandle(h);
			getCurrentProjectEditor().publish(`currentPathPoint.${h}`, selectedPoint[h]);
		},
	});
	head.appendChild(useToggle);

	// Inputs
	let handleInputGroup = makeElement({
		id: `${h}InputGroup`,
		style: `display: ${selectedPoint[h].use ? 'grid' : 'none'}`,
	});
	let hPosition = makeInputs_position(selectedPoint[h], h);
	addAsChildren(handleInputGroup, hPosition);

	getCurrentProjectEditor().subscribe({
		topic: `currentPathPoint`,
		subscriberID: `controlPointInputGroup.${h}`,
		callback: (changedPathPoint) => {
			// log(`controlPointInputGroup ${h} CALLBACK`, 'start');
			// log(`\n⮟changedPathPoint⮟`);
			// log(changedPathPoint);
			if (changedPathPoint.type === 'symmetric') changedPathPoint.makeSymmetric(h);
			if (changedPathPoint.type === 'flat') changedPathPoint.makeFlat(h);
			updateHandleGroup('h1', changedPathPoint);
			updateHandleGroup('h2', changedPathPoint);
			// log(`controlPointInputGroup ${h} CALLBACK`, 'end');
		},
	});

	// Put it all together
	return [head, handleInputGroup];
}

function updateHandleGroup(h = 'h1', changedItem) {
	// log(`updateHandleGroup`, 'start');
	// log(`h: ${h}`);
	// log(`\n⮟changedItem⮟`);
	// log(changedItem);
	let changedPathPoint = changedItem;
	if (changedItem.objType === 'ControlPoint') {
		changedPathPoint = changedItem.parent;
	}

	let handleGroup = document.getElementById(`${h}Group`);
	if (handleGroup) {
		const handleUse = changedPathPoint[h].use;
		const toggle = handleGroup.querySelector('.handle-group__toggle');
		toggle.setAttribute('aria-pressed', `${!!handleUse}`);
		/*
			Disabled follows the point type, not the handle. The old code only
			ever disabled it inside the `if (handleUse)` branch, so a symmetric
			point with the handle already off offered a switch that could not
			do anything.
		*/
		if (changedPathPoint.type === 'corner') toggle.removeAttribute('disabled');
		else toggle.setAttribute('disabled', 'disabled');

		if (handleUse) {
			let handleInputGroup = document.getElementById(`${h}InputGroup`);
			handleInputGroup.style.display = 'grid';
			let handleInputGroupX = handleInputGroup.querySelectorAll('input-number')[0];
			handleInputGroupX.setAttribute('value', changedPathPoint[h].x);
			let handleInputGroupY = handleInputGroup.querySelectorAll('input-number')[1];
			handleInputGroupY.setAttribute('value', changedPathPoint[h].y);
		} else {
			const group = document.getElementById(`${h}InputGroup`);
			if (group) group.style.display = 'none';
		}
	}
	// log(`updateHandleGroup`, 'end');
}
export function makeCard_multiSelectPathPointAttributes(virtualShape) {
	// log(`makeCard_multiSelectPathPointAttributes`, 'start');
	// log(virtualShape);
	let multiPathPointCard = makeElement({
		tag: 'div',
		className: 'panel__card',
		innerHTML: `<h3>${virtualShape.pathPoints.length} selected path points</h3>`,
	});


	// log(`makeCard_multiSelectPathPointAttributes`, 'end');
	return multiPathPointCard;
}

// --------------------------------------------------------------
// Drawing stuff
// --------------------------------------------------------------

export function makePointTypeButton(type, selected, clickHandler) {
	let color = accentColors.gray.l40;

	let button = makeElement({
		tag: 'button',
		className: 'pointTypeButton',
		id: `pointTypeButton-${type}`,
		attributes: {
			title: `point type: ${type}`,
		},
	});

	button.addEventListener('click', clickHandler);

	if (selected) {
		button.setAttribute('selected', '');
	}

	let svg = `
	<svg version="1.1"
		xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
		x="0" y="0" width="20" height="20" viewBox="0 0 20 20" enable-background="new 0 0 20 20">
		<g fill="${color}">
		<rect x="8" y="8" width="1" height="4"/>
		<rect x="11" y="8" width="1" height="4"/>
		<rect x="8" y="8" width="4" height="1"/>
		<rect x="8" y="11" width="4" height="1"/>
		<rect x="4" y="4" width="1" height="1"/>
		<rect x="5" y="5" width="1" height="1"/>
		<rect x="6" y="6" width="1" height="1"/>
		<rect x="7" y="7" width="1" height="1"/>
		<circle cx="3" cy="3" r="1.5"/>
	`;

	switch (type) {
		case 'corner':
			svg += `
			<rect x="7" y="12" width="1" height="1"/>
			<rect x="6" y="13" width="1" height="1"/>
			<rect x="5" y="14" width="1" height="1"/>
			<rect x="4" y="15" width="1" height="1"/>
			<circle cx="3" cy="17" r="1.5"/>
			`;
			break;

		case 'symmetric':
			svg += `
			<rect x="12" y="12" width="1" height="1"/>
			<rect x="13" y="13" width="1" height="1"/>
			<rect x="14" y="14" width="1" height="1"/>
			<rect x="15" y="15" width="1" height="1"/>
			<circle cx="17" cy="17" r="1.5"/>
			`;
			break;

		case 'flat':
			svg += `
			<rect x="12" y="12" width="1" height="1"/>
			<rect x="13" y="13" width="1" height="1"/>
			<circle cx="15" cy="15" r="1.5"/>
			`;
			break;
	}

	svg += `</g></svg>`;

	button.innerHTML = svg;

	return button;
}
