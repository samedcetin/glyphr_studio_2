import { getCurrentProject, getCurrentProjectEditor } from '../app/main.js';
import { makeElement } from '../common/dom.js';
import { makeIconToggle } from '../controls/icon-toggle/icon_toggle.js';
import { round, transformOrigins } from '../common/functions.js';
import { makeTransformOriginIcon } from '../common/graphics.js';
import { makeLineIcon } from '../common/icons.js';
import { syncTransformOriginChoosers, transformOriginName } from './transform_origin.js';

// --------------------------------------------------------------
// Common attributes card stuff
// --------------------------------------------------------------

export function makeInputs_position(
	item,
	labelPrefix = '',
	additionalTopics = [],
	disabled = false
) {
	// log(`makeInputs_position`, 'start');
	// log(`x: ${round(x, 3)}`);
	// log(`y: ${round(y, 3)}`);
	let thisTopic = `current${item.objType}`;
	if (thisTopic === 'currentControlPoint') {
		thisTopic = `currentPathPoint.${item.type}`;
	}
	let topics = [thisTopic].concat(additionalTopics);

	/*
		X and Y are on the fields themselves now, the way every drawing tool
		writes them. The label that used to say "x / y" above the pair said no
		more than the two marks do, and cost a row of the panel to say it.

		A labelPrefix still gets a label, because "point" or "h1" names which
		point these are - something no mark inside the field can say.
	*/
	let doubleInput = makeElement({
		tag: 'div',
		className: `doubleInput doubleInput--pair${labelPrefix ? '' : ' doubleInput--full'}`,
	});
	let xInput = makeSingleInput(item, 'x', topics, 'input-number');
	let yInput = makeSingleInput(item, 'y', topics, 'input-number');
	xInput.setAttribute('prefix', 'X');
	yInput.setAttribute('prefix', 'Y');

	if (disabled) {
		xInput.setAttribute('disabled', '');
		yInput.setAttribute('disabled', '');
	}

	doubleInput.appendChild(xInput);
	doubleInput.appendChild(yInput);

	// log(`makeInputs_position`, 'end');
	return labelPrefix ? [makeSingleLabel(labelPrefix), doubleInput] : [doubleInput];
}

export function makeInputs_size(item, disabled = false) {
	// log(`makeInputs_size`, 'start');
	let returnControls = [];
	let thisTopic = `current${item.objType}`;

	// Width and Height
	let dimensionInputs = makeElement({
		tag: 'div',
		/*
			With no lock to hold, this is an ordinary pair and takes the ordinary
			seam. It used to keep the lock’s 28px slot open so the disabled row
			would line up with the live one - but they sit in different cards with
			a rule between them, so nothing was gained, and a 36px hole between two
			fields reads as a control that failed to render.
		*/
		className: `doubleInput doubleInput--full${disabled ? ' doubleInput--pair' : ''}`,
	});
	let wInput = makeSingleInput(item, 'width', thisTopic, 'input-number');
	let hInput = makeSingleInput(item, 'height', thisTopic, 'input-number');
	wInput.setAttribute('prefix', 'W');
	hInput.setAttribute('prefix', 'H');
	if (disabled) {
		wInput.setAttribute('disabled', '');
		hInput.setAttribute('disabled', '');
	}
	/*
		The aspect-ratio lock sits in the seam it governs.

		It used to be a checkbox with the caption "lock aspect ratio" two rows
		further down, under the transform origin - which is a long way from the
		two fields it ties together, and needed four lines of help text to say
		what a chain says by being drawn between them. Every drawing tool puts
		it here, in the gap between width and height, and it takes the slot the
		slash was already using.
	*/
	dimensionInputs.appendChild(wInput);
	if (!disabled) dimensionInputs.appendChild(makeRatioLockToggle(item, thisTopic));
	dimensionInputs.appendChild(hInput);

	returnControls.push(dimensionInputs);

	// Only show this stuff if not disabled.
	if (!disabled) {
		// Transform origin
		let displayOrigins = [
			'top-left',
			'baseline-left',
			'bottom-left',
			'top-right',
			'baseline-right',
			'bottom-right',
			'middle-center',
		];
		displayOrigins = transformOrigins;
		let transformLabel = makeSingleLabel(
			'transform origin',
			`With increases or decreases to width or height,
		the transform origin is the point that stays fixed.
		<br><br>
		Every transform holds it still: rotation pivots about it, skew leans
		away from it, and resizing grows from it. The Transform panel carries
		the same setting.`
		);
		let transformInput = makeElement({
			tag: 'option-chooser',
			className: 'transform-origin-chooser',
			attributes: {
				'selected-id': item.transformOrigin,
				'selected-name': transformOriginName(item.transformOrigin),
			},
		});
		displayOrigins.forEach((origin) => {
			let option = makeElement({
				tag: 'option',
				attributes: { 'selection-id': origin },
				innerHTML: `${makeTransformOriginIcon(origin)}${transformOriginName(origin)}`,
			});
			option.addEventListener('click', () => {
				item.transformOrigin = origin;
				syncTransformOriginChoosers(origin);
				getCurrentProjectEditor().publish('editCanvasView', item);
			});
			transformInput.appendChild(option);
		});

		returnControls.push(transformLabel);
		returnControls.push(transformInput);
	}
	// log(`makeInputs_size`, 'end');
	return returnControls;
}

export function makeSingleInput(item, property, thisTopic, tagName, additionalListeners = []) {
	// log(`makeSingleInput`, 'start');
	// log(`item.objType: ${item.objType}`);
	// log(`property: ${property}`);
	// log(`thisTopic: ${thisTopic}`);
	// log(`tagName: ${tagName}`);

	let topics = Array.isArray(thisTopic) ? thisTopic : [thisTopic];

	let newInput = makeElement({
		tag: tagName,
		className: `singleInput-${property}`,
		attributes: { 'pubsub-topic': topics[0] },
	});

	let value = tagName === 'input' ? item[property] : round(item[property], 3);
	newInput.setAttribute('value', value);

	if (item.isLockable) {
		newInput.setAttribute('is-locked', item.isLocked(property));
		newInput.addEventListener('lock', (event) => {
			// log(`makeSingleInput LOCK event`, 'start');
			// log(event);
			// @ts-expect-error 'property does exist'
			if (event.detail.isLocked) {
				item.lock(property);
			} else {
				item.unlock(property);
			}
			const editor = getCurrentProjectEditor();
			topics.forEach((topic) => editor.publish(topic, item));
			// log(`makeSingleInput LOCK event`, 'end');
		});
	}

	function changeHappened(event) {
		// log(`makeSingleInput.changeHappened event`, 'start');
		// log(event);

		if (item.isLockable && item.isLocked(property)) return;
		// let newValue = event.target.getAttribute('value');
		let newValue = event.target.value;
		// log(`\n⮟item⮟`);
		// log(item);
		// log(`property: ${property}`);
		// log(`newValue: ${newValue}`);
		// log(`thisTopic: ${thisTopic}`);

		const editor = getCurrentProjectEditor();
		// Update the view so that the glyph stays put
		// and the LSB moves to the left or right
		if (property === 'leftSideBearing') {
			let view = editor.view;
			editor.view.dx -= (newValue - item.leftSideBearing) * view.dz;
			editor.publish('editCanvasView', item);
		}

		// Special Case Glyph and Path: width and height properties
		if (
			(item.objType === 'Glyph' || item.objType === 'VirtualGlyph' || item.objType === 'Path') &&
			(property === 'width' || property === 'height')
		) {
			// log(`width or height, for constructor Glyph or Path`);
			let options = { width: false, height: false };
			options.ratioLock = item.ratioLock;
			options.transformOrigin = item.transformOrigin;
			if (property === 'width') options.width = newValue;
			if (property === 'height') options.height = newValue;

			// log(`\n⮟options⮟`);
			// log(options);
			if (item.objType === 'Path') item.setShapeSize(options);
			else item.setGlyphSize(options);
		} else {
			item[property] = newValue;
			// log(`MAKE SINGLE INPUT EVENT ${property} set to ${newValue}`);
			// log(`item[property]: ${item[property]}`);
		}

		// log(`topics: ${topics}`);
		if (item.objType === 'VirtualGlyph') {
			topics.forEach((topic) => editor.publish(topic, editor.selectedItem));
		} else if (item.objType === 'VirtualShape') {
			topics.forEach((topic) => editor.publish(topic, editor.selectedItem));
		} else {
			topics.forEach((topic) => editor.publish(topic, item));
		}
		// log(`makeSingleInput.changeHappened event`, 'end');
	}

	newInput.addEventListener('change', changeHappened);
	if (additionalListeners) {
		additionalListeners.forEach((listenerName) => {
			newInput.addEventListener(listenerName, changeHappened);
		});
	}

	getCurrentProjectEditor().subscribe({
		topic: topics,
		subscriberID: `attributesPanel.${topics[0]}.${property}`,
		callback: (changedItem) => {
			// log(`SINGLE INPUT SUBSCRIPTION CALLBACK`, 'start');
			// log(`property: ${property}`);
			// log(`topics[0]: ${topics[0]}`);
			// log(`attributesPanel.${topics[0]}.${property}`);
			// log(changedItem);
			if (changedItem) {
				// log(`changedItem.property: ${changedItem[property]}`);

				if (changedItem[property] || changedItem[property] === 0) {
					// log(`value OLD: ${newInput.value}`);
					let newValue;
					if (tagName === 'input') newValue = changedItem[property];
					else newValue = round(changedItem[property], 3);
					// log(`newValue: ${newValue}`);
					// @ts-expect-error 'property does exist'
					newInput.value = newValue;
					newInput.setAttribute('value', newValue);
					// log(`value NEW: ${newInput.value}`);
				}
			}
			// log(`SINGLE INPUT SUBSCRIPTION CALLBACK`, 'end');
		},
	});

	// log(`makeSingleInput`, 'end');
	return newInput;
}

/**
 * Centralized way to add a listener attribute
 * @param {HTMLElement} element - what to add the listener to
 * @param {Array | String} listenFor - collection of event names to listen for
 * @param {Function} callback - what to do
 */
export function addAttributeListener(element, listenFor = [], callback) {
	listenFor = typeof listenFor === 'string' ? [listenFor] : listenFor;

	const mutationCallback = function () {
		if (callback) callback(element);
	};
	const observer = new MutationObserver(mutationCallback);
	// observer.node = element;
	observer.observe(element, { attributeFilter: listenFor });
	// observer.observe(element, { attributes: true, subtree: true });
}

/**
 * A boolean property of the selected item, as a toggle rather than a tick.
 *
 * It replaces makeSingleCheckbox, which produced a browser checkbox: the
 * largest control on any panel that had one, at a size the app never picks
 * itself, in a shape nothing else here has. A checkbox is right for a list
 * of things you tick; these are states of the thing you are editing, and a
 * switch is what says that.
 *
 * Every row here has its label beside it, so the icon supports the label
 * rather than carrying it: it is the picture of what turning this on does
 * where the set has one - a flip, a link - and a plain tick where it does
 * not. The control is the same either way, which is the part that matters.
 *
 * @param {Object} item - the object holding the property
 * @param {String} property - the boolean to read and write
 * @param {String} thisTopic - what to publish, and what to listen to
 * @param {Object} args - { icon, name, body }
 * @returns {HTMLElement}
 */
export function makePropertyToggle(item, property, thisTopic, args = {}) {
	const icon = args.icon || 'check';
	const name = args.name || property;

	const toggle = makeIconToggle({
		icon: icon,
		name: name,
		body: args.body || '',
		pressed: !!item[property],
		onToggle: (on) => {
			item[property] = on;
			if (thisTopic) getCurrentProjectEditor().publish(thisTopic, item);
		},
	});

	if (thisTopic) {
		getCurrentProjectEditor().subscribe({
			topic: thisTopic,
			subscriberID: `attributesPanel.${thisTopic}.${property}`,
			callback: (changedItem) => {
				toggle.setAttribute('aria-pressed', `${!!changedItem[property]}`);
			},
		});
	}

	return toggle;
}

/**
 * Creates a label, with options
 * @param {String} text - text to show
 * @param {String | false} infoContent - if a string, show an info bubble with the text
 * @param {String | false} forID - 'for' attribute value
 * @param {String | false} className - 'class' attribute value
 * @returns {HTMLElement}
 */
export function makeSingleLabel(text, infoContent = false, forID = false, className = false) {
	/*
		The text goes on the <label> itself. It used to be wrapped in a <span>,
		and because resets.css sets font-size on the universal selector, that
		span took --fs-md directly and beat the --fs-sm the sidebar sets on the
		label it inherits from. Every panel label was one step too large, and no
		stylesheet targeted `label span` to say so.
	*/
	let newLabel = makeElement({
		tag: 'label',
		content: text,
	});
	if (forID) newLabel.setAttribute('for', forID);
	if (infoContent) {
		let newInfo = makeElement({
			tag: 'info-bubble',
			content: infoContent,
		});
		newLabel.appendChild(newInfo);
		newLabel.classList.add('info');
	}
	/* add, not setAttribute: setting `class` wiped the `info` class above. */
	if (className) newLabel.classList.add(...className.split(' '));
	return newLabel;
}

export function rowPad() {
	return makeElement({ tag: 'div', className: 'rowPad' });
}

export function dimSplit() {
	return `<span class="dimSplit">&#x2044;</span>`;
}

/**
 * The chain between a width field and a height one.
 *
 * A two-state icon button rather than a checkbox with a caption: the two
 * things it links are on either side of it, so being drawn between them is
 * the whole explanation. It still says what it does on hover, for anyone who
 * arrives by keyboard or by tooltip.
 *
 * @param {Object} item - the thing being sized
 * @param {String} thisTopic - what to publish on when it changes
 * @returns {Element}
 */
export function makeRatioLockToggle(item, thisTopic) {
	const button = makeElement({
		tag: 'button',
		className: 'ratio-lock',
		attributes: { type: 'button', role: 'switch' },
	});

	const render = () => {
		const locked = !!item.ratioLock;
		button.innerHTML = makeLineIcon(locked ? 'linked' : 'unlinked', 16);
		button.setAttribute('aria-checked', locked ? 'true' : 'false');
		button.toggleAttribute('selected', locked);
		button.setAttribute(
			'title',
			locked
				? 'Width and height are linked\nChanging one changes the other'
				: 'Width and height are independent\nClick to keep them proportional'
		);
	};

	render();

	button.addEventListener('click', () => {
		item.ratioLock = !item.ratioLock;
		render();
		if (thisTopic) getCurrentProjectEditor().publish(thisTopic, item);
	});

	return button;
}

export function dimSplitElement() {
	return makeElement({
		className: 'dimSplit',
		innerHTML: '&#x2044;',
	});
}

// --------------------------------------------------------------
// 'direct' controls that don't use pub/sub
// --------------------------------------------------------------

export function makeDirectCheckbox(item, property, callback, id = false) {
	let newCheckbox = makeElement({
		tag: 'input',
		attributes: { type: 'checkbox' },
	});
	// @ts-expect-error 'property does exist'
	if (item[property]) newCheckbox.checked = true;
	if (typeof id === 'string') newCheckbox.setAttribute('id', id);

	newCheckbox.addEventListener('change', (event) => {
		// @ts-expect-error 'property does exist'
		let newValue = event.target.checked;
		item[property] = !!newValue;
		if (callback) callback(newValue);
	});

	return newCheckbox;
}

export function makeLinkReferenceRow(itemID) {
	// log(`makeLinkReferenceRow`, 'start');
	// log(`itemID: ${itemID}`);

	const editor = getCurrentProjectEditor();
	const project = getCurrentProject();
	const targetItem = editor.project.getItem(itemID);
	// log(targetItem);

	let row = makeElement({ className: 'item-link__row', attributes: { 'target-item-id': itemID } });
	row.addEventListener('click', () => {
		if (targetItem.displayType === 'Glyph') editor.nav.page = 'Characters';
		if (targetItem.displayType === 'Component') editor.nav.page = 'Components';
		if (targetItem.displayType === 'Ligature') editor.nav.page = 'Ligatures';
		editor.selectedItemID = itemID;
		editor.navigate();
	});

	row.appendChild(
		makeElement({
			className: 'item-link__thumbnail',
			attributes: { 'target-item-id': itemID },
			innerHTML: project.makeItemThumbnail(targetItem),
		})
	);

	row.appendChild(
		makeElement({
			className: 'item-link__title',
			innerHTML: `${targetItem?.name || 'ERROR'}`,
		})
	);

	row.appendChild(
		makeElement({
			className: 'item-link__subtitle',
			innerHTML: `${targetItem?.displayType || 'ERROR'}&ensp;|&ensp;${itemID}`,
		})
	);

	// log(`makeLinkReferenceRow`, 'end');
	return row;
}
