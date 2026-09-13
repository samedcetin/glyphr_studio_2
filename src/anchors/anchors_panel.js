import { getCurrentProjectEditor } from '../app/main.js';
import { makeElement } from '../common/dom.js';
import { makeActionButton } from '../panels/action_buttons.js';
import { refreshPanel } from '../panels/panels.js';
import { showComposeDialog } from './compose_dialog.js';

/**
	ANCHORS PANEL
	-------------
	Where anchors are added, named and nudged.

	The quick-add buttons matter more than they look. An anchor put in roughly
	the right place is most of the work: `top` belongs at the middle of the
	letter's ink, level with the top of it, and a mark's `_top` belongs at the
	middle of its own foot. Placing those by hand for every glyph is the thing
	that stops people using anchors at all.
 */

/**
 * Sensible starting positions, by anchor name.
 *
 * @param {String} name - the anchor's name
 * @param {Object} maxes - the glyph's bounds
 * @returns {Object} - {x, y}
 */
export function suggestAnchorPosition(name, maxes) {
	const centerX = Math.round((maxes.xMin + maxes.xMax) / 2);

	switch (name) {
		case 'top':
			return { x: centerX, y: Math.round(maxes.yMax) };
		case 'bottom':
			return { x: centerX, y: Math.round(maxes.yMin) };
		// A mark's own attachment point is the part of it that touches the
		// letter - the foot of an accent above, the head of one below.
		case '_top':
			return { x: centerX, y: Math.round(maxes.yMin) };
		case '_bottom':
			return { x: centerX, y: Math.round(maxes.yMax) };
		default:
			return { x: centerX, y: Math.round((maxes.yMin + maxes.yMax) / 2) };
	}
}

/**
 * The Anchors section of the sidebar.
 * @returns {Element}
 */
export function makePanel_Anchors() {
	const editor = getCurrentProjectEditor();
	const item = editor.selectedItem;
	const card = makeElement({ className: 'panel__card anchors-card' });

	if (!item) {
		card.appendChild(makeElement({ className: 'anchors__empty', content: 'Nothing selected.' }));
		return card;
	}

	card.appendChild(
		makeElement({
			className: 'anchors__intro',
			innerHTML: `Anchors join letters to marks. A letter carries <code>top</code>; an accent carries <code>_top</code>. Composing moves the accent until the two meet.`,
		})
	);

	const list = makeElement({ className: 'anchors__list' });

	item.anchors.forEach((anchor) => {
		const row = makeElement({ className: 'anchors__row' });

		const nameInput = makeElement({
			tag: 'input',
			className: 'anchors__name',
			attributes: { type: 'text', value: anchor.name, spellcheck: 'false' },
		});

		nameInput.addEventListener('change', (event) => {
			// @ts-expect-error - inputs have a value
			const wanted = event.target.value;
			/*
				Renaming onto a name that is already here would leave the glyph
				with two anchors the composer cannot tell apart, so the rename
				is refused and the field put back.
			*/
			const clash = item.anchors.find(
				(other) => other !== anchor && other.name === String(wanted).replace(/[^a-zA-Z0-9._]/g, '')
			);

			if (clash) {
				// @ts-expect-error - inputs have a value
				event.target.value = anchor.name;
				return;
			}

			anchor.name = wanted;
			finishChange(`Renamed anchor: ${anchor.name}`);
		});

		row.appendChild(nameInput);
		row.appendChild(makeNumberInput(anchor, 'x', finishChange));
		row.appendChild(makeNumberInput(anchor, 'y', finishChange));

		const deleteButton = makeActionButton({
			iconName: 'delete',
			title: `Delete anchor: ${anchor.name}`,
			onClick: () => {
				item.removeAnchor(anchor.name);
				finishChange(`Deleted anchor: ${anchor.name}`);
			},
		});
		/*
			makeActionButton leaves sizing to whatever contains it, and its
			icon is drawn at 100% of the button - so without a size of its own
			it grows to fill the row.
		*/
		deleteButton.classList.add('anchors__delete');
		row.appendChild(deleteButton);

		list.appendChild(row);
	});

	if (!item.anchors.length) {
		list.appendChild(
			makeElement({ className: 'anchors__empty', content: 'No anchors on this glyph yet.' })
		);
	}

	card.appendChild(list);

	// ---- Quick add ----
	const addRow = makeElement({ className: 'anchors__add' });
	['top', 'bottom', '_top', '_bottom'].forEach((name) => {
		const button = makeElement({
			tag: 'button',
			className: 'anchors__add-button',
			attributes: { type: 'button' },
			content: name,
			title:
				name.startsWith('_')
					? `Add ${name} — this glyph is a mark, and attaches by this point`
					: `Add ${name} — marks attach to this glyph here`,
			onClick: () => {
				const position = suggestAnchorPosition(name, item.maxes);
				item.setAnchor(name, position.x, position.y);
				finishChange(`Added anchor: ${name}`);
			},
		});

		if (item.getAnchor(name)) button.setAttribute('disabled', 'disabled');
		addRow.appendChild(button);
	});

	card.appendChild(makeElement({ tag: 'h4', content: 'Add an anchor' }));
	card.appendChild(addRow);

	const composeButton = makeElement({
		tag: 'button',
		className: 'anchors__compose',
		attributes: { type: 'button' },
		content: 'Compose accented characters…',
		onClick: showComposeDialog,
	});

	card.appendChild(composeButton);

	return card;
}

/**
 * A number input bound straight to one of the anchor's coordinates.
 * @param {Object} anchor - the anchor
 * @param {String} axis - 'x' or 'y'
 * @param {Function} onChange - called after a change
 * @returns {Element}
 */
function makeNumberInput(anchor, axis, onChange) {
	const input = makeElement({
		tag: 'input',
		className: 'anchors__number',
		attributes: { type: 'number', value: String(anchor[axis]), 'aria-label': axis },
	});

	input.addEventListener('change', (event) => {
		// @ts-expect-error - inputs have a value
		anchor[axis] = Number(event.target.value);
		onChange(`Moved anchor: ${anchor.name}`);
	});

	return input;
}

/**
 * Records the change and redraws everything that shows anchors.
 * @param {String} title - history entry title
 */
function finishChange(title) {
	const editor = getCurrentProjectEditor();
	editor.selectedItem.changed();
	editor.history.addState(title);
	editor.publish('currentItem', editor.selectedItem);
	refreshPanel();
}
