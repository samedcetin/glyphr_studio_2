import { makeElement } from '../common/dom.js';
import { makeLineIcon } from '../common/icons.js';
import { attachTooltip } from '../controls/tooltip/tooltip.js';

// --------------------------------------------------------------
// Action Buttons
// --------------------------------------------------------------

export function makeActionButton({
	iconName = 'default',
	iconOptions = false,
	title = '',
	disabled = false,
	onClick = () => {},
	id = false,
} = {}) {
	// log(`makeActionButton`, 'start');
	// log(`iconName: ${iconName}`);
	// log(`iconOptions: ${iconOptions}`);
	// log(`disabled: ${disabled}`);
	// log(`${makeActionButtonIcon[iconName](iconOptions)}`);
	let newButton = makeElement({
		tag: 'button',
		innerHTML: makeActionButtonIcon[iconName](iconOptions),
		attributes: {
			title: title,
		},
	});

	if (onClick) newButton.addEventListener('click', onClick);
	if (disabled) newButton.setAttribute('disabled', 'disabled');

	/*
		The app’s hover label rather than the browser’s. These are icon-only
		buttons in grids of nine and ten, and every title here is already
		written as a name on the first line and an explanation under it - which
		is the shape the tooltip reads. A native title took a second to appear
		and arrived unstyled, which is a poor way to learn thirty icons.
	*/
	attachTooltip(newButton);
	if (typeof id === 'string') newButton.setAttribute('id', id);

	// log(`makeActionButton`, 'end');
	return newButton;
}

// --------------------------------------------------------------
// Action button icons
// --------------------------------------------------------------

/**
	Action button icons.

	Every entry is a function because the call sites pass options, and because
	three of them switch drawing on what is selected. The bodies used to build
	multi-coloured SVG by hand, with `accentColors.royal.l50` and friends baked
	into the markup string - which is why an action button looked the same in
	dark theme as in light, and why a disabled one had to be drawn a second time
	at a different opacity. They are single-colour line icons now and the
	button's CSS `color` carries every state.

	@type {Object<string, Function>}
 */
export let makeActionButtonIcon = {};

/** Most icons ignore their options entirely. */
const plain = (name) => () => makeLineIcon(name, 20);

[
	'copy',
	'paste',
	'clearClipboard',
	'pastePathsFromAnotherGlyph',
	'pastePathsFromAnotherProject',
	'undo',
	'redo',
	'linkToGlyph',
	'round',
	'flipHorizontal',
	'flipVertical',
	'rotateClockwise',
	'transforms',
	'exportGlyphSVG',
	'importGlyphSVG',
	'deleteGlyph',
	'switchPathComponent',
	'combine_unite',
	'combine_divide',
	'combine_subtract',
	'combine_exclude',
	'combine_intersect',
	'edit',
	'delete',
	'createNewKernGroup',
	'deleteSingleLetterPair',
	'findSingleLetterPair',
	'moveLayerDown',
	'moveLayerUp',
	'moveLayerTop',
	'moveLayerBottom',
	'resetPathPoint',
	'deletePathPoint',
	'insertPathPoint',
	'mergePathPoints',
	'selectNextPathPoint',
	'selectPreviousPathPoint',
	'default',
	'test',
	'pixelPen',
	'metricKeys',
].forEach((name) => {
	makeActionButtonIcon[name] = plain(name);
});

/*
	A component instance is the same outline used somewhere else, so it draws as
	two shapes rather than one. The old pair differed only in colour - green for
	a component, grey for a path - which a colour-blind user could not read at
	all, and which disappeared entirely in dark theme.
*/
makeActionButtonIcon.addShape = (isComponentInstance = false) =>
	makeLineIcon(isComponentInstance ? 'addComponentInstance' : 'addShape', 20);

makeActionButtonIcon.deleteShape = () => makeLineIcon('deleteShape', 20);

/*
	Alignment takes the edge as its option. One set of six serves both shapes
	and points: the operation differs, the picture does not, and two near
	identical sets of six would be six chances to draw the pair inconsistently.
*/
const ALIGN_EDGES = ['top', 'middle', 'bottom', 'left', 'center', 'right'];

/* Falls back rather than rendering nothing, so a bad edge shows a button. */
const alignIcon = (edge) =>
	makeLineIcon(ALIGN_EDGES.includes(edge) ? `align_${edge}` : 'default', 20);

makeActionButtonIcon.align_shapes = alignIcon;
makeActionButtonIcon.align_points = alignIcon;
