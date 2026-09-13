import { getCurrentProject, getCurrentProjectEditor } from '../app/main.js';
import { makeElement, textToNode } from '../common/dom.js';
import { refreshEditToolsArea } from '../edit_canvas/tools/tools.js';
import { makeDirectCheckbox } from '../panels/cards.js';
import { getPixelMode, getUnitsPerPixel } from './pixel_grid.js';

/**
	PIXEL FONT SETTINGS
	-------------------
	The Font settings tab's pixel font section.

	It sits with the em square and the vertical metrics rather than with the
	app preferences, because the grid is part of the design: an 8-pixel font is
	an 8-pixel font whichever machine it is opened on.
 */

/**
 * One row shaped like the ones `makeOneSettingsRow` produces.
 *
 * That function reads `settings[group][property]`, two levels only, and these
 * settings are a level deeper - so the row is assembled here instead. The four
 * elements go straight into the settings table's grid, in the same order.
 *
 * @param {String} label - row label
 * @param {String} description - info bubble text
 * @param {Element} input - the control
 * @param {String} typeName - value type shown on the right
 * @returns {Array<Element>}
 */
function makeRow(label, description, input, typeName) {
	return [
		makeElement({
			tag: 'label',
			className: 'settings__label',
			innerHTML: `${label.replaceAll(' ', '&nbsp;')}:&emsp;`,
		}),
		makeElement({ tag: 'info-bubble', innerHTML: description }),
		input,
		typeName
			? makeElement({
					tag: 'pre',
					innerHTML: typeName,
					title: 'Expected value type',
					className: 'value-type',
			  })
			: textToNode('<span></span>'),
	];
}

/**
 * Redraws everything that depends on the grid.
 *
 * The toolbar has to be rebuilt as well as the canvas, because the pixel pen
 * button only exists while the mode is on.
 */
function refreshAfterChange() {
	const editor = getCurrentProjectEditor();
	// The pixel pen only exists while the mode is on, so the toolbar has to be
	// made again rather than just re-styled.
	refreshEditToolsArea();
	editor.publish('whichToolIsSelected', editor.selectedTool);
	editor.publish('currentItem', editor.selectedItem);
	if (editor.editCanvas) editor.editCanvas.redraw('pixelMode:settingsChanged');
}

/**
 * The Pixel font block for the Font settings tab.
 * @returns {Array<Element>}
 */
export function makePixelFontSettings() {
	const project = getCurrentProject();

	// Make sure the block exists before anything is wired to it - an older
	// project file will not have one.
	project.settings.app.pixelMode = getPixelMode(project);
	const settings = project.settings.app.pixelMode;

	const summary = makeElement({ className: 'settings__pixel-summary' });

	/** Restates the grid in the units the rest of this page is written in. */
	function updateSummary() {
		const unitsPerPixel = getUnitsPerPixel(project);
		const upm = Number(project.settings.font.upm) || 0;
		const whole = Number.isInteger(unitsPerPixel);

		summary.innerHTML = `One pixel is <b>${
			whole ? unitsPerPixel : unitsPerPixel.toFixed(2)
		}</b> em units, at an em square of ${upm}.${
			whole
				? ''
				: ` An em square that divides evenly by ${settings.pixelsPerEm} — ${
						settings.pixelsPerEm * Math.round(upm / settings.pixelsPerEm)
				  }, say — keeps every coordinate a whole number.`
		}`;
	}

	const enabledCheckbox = makeDirectCheckbox(settings, 'enabled', () => {
		refreshAfterChange();
	});

	const pixelsPerEmInput = makeElement({
		tag: 'input-number',
		attributes: { value: String(settings.pixelsPerEm) },
	});

	pixelsPerEmInput.addEventListener('change', (event) => {
		// @ts-expect-error - the control has a value
		const value = parseInt(event.target.value);
		// One pixel per em is not a font, and past a few hundred the grid is
		// finer than the outlines it is supposed to be constraining.
		settings.pixelsPerEm = Math.max(2, Math.min(512, isNaN(value) ? 16 : value));
		updateSummary();
		refreshAfterChange();
	});

	const showGridCheckbox = makeDirectCheckbox(settings, 'showGrid', refreshAfterChange);
	const snapCheckbox = makeDirectCheckbox(settings, 'snapToGrid', refreshAfterChange);

	updateSummary();

	return [
		textToNode('<h2>Pixel font</h2>'),
		...makeRow(
			'Pixel font mode',
			`Turns this project into a pixel font. The edit canvas gets a grid, the Pixel pen tool appears in the toolbar, and new rectangles snap to whole pixels.<br><br>Nothing about the font data changes when this is switched on — it is the drawing tools that change.`,
			enabledCheckbox,
			''
		),
		...makeRow(
			'Pixels per em',
			`How many pixels tall the em square is. This is the size the font is meant to be drawn at: an 8 means an 8-pixel font, and drawing it at any other size will resample it.<br><br>It also decides the grid: one pixel is the em square divided by this number.`,
			pixelsPerEmInput,
			'Number'
		),
		...makeRow(
			'Show the pixel grid',
			`Draws the grid on the edit canvas, underneath the outlines. It disappears on its own when you zoom out far enough that the lines would run together.`,
			showGridCheckbox,
			''
		),
		...makeRow(
			'Snap new shapes to the grid',
			`Rectangles and ovals drawn on the canvas land on whole pixels. Existing shapes are left alone — use <b>Snap glyph to the pixel grid</b> in the actions panel for those.`,
			snapCheckbox,
			''
		),
		// Spans the whole table, like a heading, rather than being squeezed
		// into the narrow label column.
		summary,
	];
}
