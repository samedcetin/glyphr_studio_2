import { getCurrentProject, getCurrentProjectEditor } from '../app/main.js';
import { addAsChildren, makeElement } from '../common/dom.js';
import { makeIcon } from '../common/graphics.js';
import { makeMetricKeyRow } from '../metrics/metric_keys_row.js';
import {
	makeInputs_position,
	makeInputs_size,
	makeLinkReferenceRow,
	makeSingleInput,
	makeSingleLabel,
	rowPad,
} from './cards.js';

// --------------------------------------------------------------
// Glyph Attributes Card
// --------------------------------------------------------------

export function makeCard_glyphAttributes(glyph) {
	// log(`makeCard_glyphAttributes`, 'start');
	// log(`glyph.id: ${glyph.id}`);

	// `ident` is a unique ID per object for debugging
	let glyphCard = makeElement({
		tag: 'div',
		className: 'panel__card',
		innerHTML: `<h3>${glyph.displayType} ${glyph.ident || ''}</h3>`,
	});

	/*
		The mark is inside the field, so there is no row of label above it -
		see the affix note in input-number.
	*/
	let halfSizeAdvanceWidthInput = makeElement({
		tag: 'div',
		className: 'doubleInput doubleInput--full',
	});
	let advanceWidthInput = makeSingleInput(glyph, 'advanceWidth', 'currentItem', 'input-number');
	advanceWidthInput.setAttribute('prefix', 'advanceWidth');
	advanceWidthInput.setAttribute('title', 'Advance width');
	let autoFitAdvanceWidth = makeElement({
		tag: 'button',
		className: 'panel-card__action-button',
		title:
			'Auto-fit advance width\nThe advance width will be set to the x-max of the paths in this glyph.',
		innerHTML: makeIcon({ name: 'command_autoFit' }),
		onClick: () => {
			let editor = getCurrentProjectEditor();
			editor.selectedItem.advanceWidth = editor.selectedItem.maxes.xMax;
			editor.publish('currentItem', editor.selectedItem);
		},
	});
	addAsChildren(halfSizeAdvanceWidthInput, [advanceWidthInput, makeElement(), autoFitAdvanceWidth]);

	// Side bearings
	let bearingLabel = makeElement({
		tag: 'label',
		className: 'info',
		innerHTML: `
			<span>bearings</span>
			<info-bubble>
				<h1>Side Bearings</h1>
				Side bearings are the blank space to the left and right
				of shapes in a glyph. The open space between
				characters is very important for legibility.
				<br><br>
				These are calculated values based on shape positions and the
				Advance Width. They are not properties that are saved with the
				glyph, but it's helpful to think about them as if they were.
				<br>
				<h2>Left side bearing</h2>
				Distance from x=0 to the leftmost side of shapes in the glyph.
				Editing this will move all the shapes in the glyph, and update
				the Advance Width.
				<br>
				<h2>Right side bearing</h2>
				Distance from the rightmost side of shapes in the glyph to the
				Advance Width.
			</info-bubble>
		`,
	});
	let doubleBearingInput = makeElement({
		tag: 'div',
		className: 'doubleInput doubleInput--pair',
	});
	let lsbInput = makeSingleInput(glyph, 'leftSideBearing', 'currentItem', 'input-number');
	let rsbInput = makeSingleInput(glyph, 'rightSideBearing', 'currentItem', 'input-number');
	lsbInput.setAttribute('prefix', 'L');
	lsbInput.setAttribute('title', 'Left side bearing');
	rsbInput.setAttribute('prefix', 'R');
	rsbInput.setAttribute('title', 'Right side bearing');
	doubleBearingInput.appendChild(lsbInput);
	doubleBearingInput.appendChild(rsbInput);

	// Put it all together
	if (glyph.displayType !== 'Component') {
		addAsChildren(glyphCard, halfSizeAdvanceWidthInput);
		if (glyph?.shapes?.length) {
			addAsChildren(glyphCard, [bearingLabel, doubleBearingInput]);
			// Directly under the numbers they drive.
			addAsChildren(glyphCard, makeMetricKeyRow(glyph));
		}
	} else {
		addAsChildren(glyphCard, [
			makeSingleLabel('name'),
			makeSingleInput(glyph, 'name', 'currentItem', 'input'),
		]);
	}
	if (glyph?.shapes?.length) {
		const showAsDisabled = !!getCurrentProjectEditor().multiSelect.shapes.length;
		addAsChildren(glyphCard, rowPad());
		addAsChildren(
			glyphCard,
			makeElement({ tag: 'h4', content: showAsDisabled ? 'Overall paths' : 'Bulk-edit paths' })
		);
		addAsChildren(glyphCard, makeInputs_position(glyph, '', [], showAsDisabled));
		addAsChildren(glyphCard, makeInputs_size(glyph, showAsDisabled));
	}
	/*
		The action grid moved to the toolbar - see edit_canvas/quick_actions.js.
		Thirty-one icon buttons at the foot of a 260px column was a lot of the
		panel spent on things reached for occasionally, in a panel for properties.
	*/
	// log(`returning:`);
	// log(glyphCard);
	// log(`makeCard_glyphAttributes`, 'end');
	return glyphCard;
}

export function makeCard_glyphLinks(item) {
	// log(`makeCard_glyphLinks`, 'start');
	// log(`item.id: ${item.id}`);

	// log(item.usedIn);
	if (!item?.usedIn?.length) {
		// log(`makeCard_glyphLinks`, 'end');
		return '';
	}
	let linksCard = makeElement({
		tag: 'div',
		className: 'panel__card full-width item-links__rows-area',
		innerHTML: `
		<h3>Links</h3>
		This ${item.displayType} is linked to the following items.
		It is used as a component root and will show up in these items as a component instance.
		`,
	});

	item.usedIn.forEach((itemID) => {
		// log(`appending card for ${itemID}`);
		linksCard.appendChild(makeLinkReferenceRow(itemID));
	});

	getCurrentProjectEditor().subscribe({
		topic: 'currentItem',
		subscriberID: 'ItemLinkRow',
		callback: () => {
			// log(`ItemLinkRow SUBSCRIBER CALLBACK`, 'start');
			const editor = getCurrentProjectEditor();
			const project = getCurrentProject();
			const thumbs = document.querySelectorAll('.item-link__thumbnail');
			thumbs.forEach((thumb) => {
				const targetID = thumb.getAttribute('target-item-id');
				// log(`targetID: ${targetID}`);
				const targetItem = editor.project.getItem(targetID);
				thumb.innerHTML = project.makeItemThumbnail(targetItem);
			});
			// log(`ItemLinkRow SUBSCRIBER CALLBACK`, 'end');
		},
	});

	// log(`makeCard_glyphLinks`, 'end');
	return linksCard;
}

/*
	makeCard_itemNavigation lived here: a pair of wide buttons with a thumbnail
	of the adjacent glyph, appended to the bottom of three different panels -
	so Properties and Character info both carried the same two controls in the
	same column. Stepping to the next character is not an attribute of this
	character; it is in the breadcrumb now, on either side of the name it
	changes. See makeStepButton in project_editor/navigator.js.
*/

export function getAdjacentItem(item, delta) {
	const project = getCurrentProject();
	const thisID = item.id;

	let collection = {};
	if (item?.id?.startsWith('glyph-')) collection = project.glyphs;
	else if (item?.id?.startsWith('liga-')) collection = project.ligatures;
	else if (item?.id?.startsWith('comp-')) collection = project.components;
	else if (item?.id?.startsWith('kern-')) collection = project.kerning;

	let allIDs = Object.keys(collection);
	allIDs.sort();
	if (item?.id?.startsWith('glyph-')) allIDs = allIDs.filter(isInEnabledRange);
	// log(`\n⮟allIDs⮟`);
	// log(allIDs);

	const thisIndex = allIDs.indexOf(thisID);
	const newID = allIDs.at((thisIndex + delta) % allIDs.length);

	return project.getItem(newID);
}

export function isInEnabledRange(itemID) {
	// log(`isInEnabledRange`, 'start');
	const project = getCurrentProject();
	let result = false;
	let enabledRanges = project.settings.project.characterRanges.filter((range) => range.enabled);

	for (let r = 0; r < enabledRanges.length; r++) {
		let range = enabledRanges[r];
		if (range.getMemberIDs().indexOf(itemID.substring(6)) > -1) {
			result = true;
			break;
		}
	}

	// log(`isInEnabledRange: ${itemID} : ${result}`);
	// log(`isInEnabledRange`, 'end');
	return result;
}
