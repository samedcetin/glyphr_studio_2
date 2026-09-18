/**
	SPECIMEN SHEET — THE PREVIEW PLANE

	The picture shown back on "Check the characters" is not the file the user
	chose. It is what we READ, painted in the app's own ink on the app's own
	paper.

	That is a correctness fix, not a flourish. A specimen sheet arrives in
	three shapes and only one of them survives being put in an `<img>`:

		black on white   - fine anywhere
		white on black   - a bright slab in the light theme, and the glyphs
		                   read as holes rather than as letters
		alpha on nothing - the common export from Figma, Illustrator and
		                   Affinity. The colour channels can be anything; the
		                   artwork lives in the alpha. White glyphs on a
		                   transparent ground put on a light surface are
		                   INVISIBLE, which is exactly what the light theme
		                   showed: six row bands over a blank page.

	binarize.js has already resolved all three into one grey plane where low
	means ink, so the preview reads that instead of the file. The user then
	sees the sheet the tracer saw - if a scan came in too faint, or the ground
	was picked as the ink, it is visible here rather than six steps later in
	the glyph grid.

	No DOM in this file. jsdom has no real canvas, so the pixel maths lives
	here where the suite can reach it, and the caller does the one putImageData.
*/

/**
 * Device pixels the preview is rendered at.
 *
 * Twice the CSS cap in specimen.css, so the sheet is crisp on a HiDPI screen
 * without carrying a 5760px plane around. Never upscaled past the source.
 */
const MAX_PREVIEW_WIDTH = 1400;
const MAX_PREVIEW_HEIGHT = 520;

/**
 * The size to render a sheet at: as large as the caps allow, aspect kept,
 * and never bigger than the sheet itself.
 *
 * @param {Number} width - the sheet, in pixels
 * @param {Number} height - the sheet, in pixels
 * @param {Object =} caps
 * @param {Number =} caps.maxWidth
 * @param {Number =} caps.maxHeight
 * @returns {Object} { width, height } in device pixels
 */
export function previewSize(width, height, caps = {}) {
	const maxWidth = caps.maxWidth ?? MAX_PREVIEW_WIDTH;
	const maxHeight = caps.maxHeight ?? MAX_PREVIEW_HEIGHT;
	if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 };

	const scale = Math.min(1, maxWidth / width, maxHeight / height);
	return {
		width: Math.max(1, Math.round(width * scale)),
		height: Math.max(1, Math.round(height * scale)),
	};
}

/**
 * Renders the grey plane as a coverage mask, ready for putImageData.
 *
 * The result is BLACK with a varying alpha rather than a finished picture,
 * because the caller has a canvas and the canvas can recolour it in one
 * fillRect - which keeps this function free of any need to parse the CSS
 * colour strings that getCanvasColors hands back.
 *
 * Downsampled by box filter - every source pixel inside a destination pixel
 * averaged - and not by dropping rows. At the ratios involved here, roughly
 * 5:1, sampling would drop entire hairlines out of the sheet and show the
 * user a lighter face than the one they uploaded.
 *
 * @param {Uint8Array} grey - the sheet's grey plane, low = ink
 * @param {Number} width - the sheet, in pixels
 * @param {Number} height - the sheet, in pixels
 * @param {Object} target - { width, height } from previewSize
 * @param {Object =} options
 * @param {Boolean =} options.inverted - true when the LIGHT side is the ink
 * @returns {Uint8ClampedArray} RGBA, 4 bytes per pixel, alpha = ink coverage
 */
export function renderSheetPreview(grey, width, height, target, { inverted = false } = {}) {
	const outWidth = Math.max(0, Math.round(target?.width ?? 0));
	const outHeight = Math.max(0, Math.round(target?.height ?? 0));
	const rgba = new Uint8ClampedArray(outWidth * outHeight * 4);
	if (!outWidth || !outHeight || !(width > 0) || !(height > 0)) return rgba;

	/*
		The column each source x falls in, worked out once. Inside the loop
		this is sixteen million multiplications and divisions on a 4K sheet,
		and a lookup instead is the difference between a preview that appears
		with the step and one the user waits for.
	*/
	const columnOf = new Uint32Array(width);
	for (let x = 0; x < width; x++) {
		columnOf[x] = Math.min(outWidth - 1, Math.floor((x * outWidth) / width));
	}

	const total = new Float64Array(outWidth * outHeight);
	const count = new Uint32Array(outWidth * outHeight);

	for (let y = 0; y < height; y++) {
		const row = Math.min(outHeight - 1, Math.floor((y * outHeight) / height)) * outWidth;
		const source = y * width;
		for (let x = 0; x < width; x++) {
			const cell = row + columnOf[x];
			total[cell] += grey[source + x];
			count[cell]++;
		}
	}

	for (let cell = 0; cell < total.length; cell++) {
		if (!count[cell]) continue;
		const level = total[cell] / count[cell];
		// Ink is the dark side unless the sheet said otherwise. RGB stays 0:
		// the caller paints the colour through this alpha.
		rgba[cell * 4 + 3] = inverted ? level : 255 - level;
	}

	return rgba;
}

/**
 * The whole preview, as one call: size it, then render it.
 *
 * @param {Object} sheet - { grey, width, height, inverted }
 * @param {Object =} caps - passed to previewSize
 * @returns {Object} { rgba, width, height }
 */
export function makePreviewPlane(sheet, caps = {}) {
	const size = previewSize(sheet?.width, sheet?.height, caps);
	return {
		rgba: renderSheetPreview(sheet?.grey, sheet?.width, sheet?.height, size, {
			inverted: sheet?.inverted,
		}),
		width: size.width,
		height: size.height,
	};
}

/**
 * How the sheet was read, in a few words, for the caption.
 *
 * Only worth saying when the preview and the file do not match - a plain
 * black-on-white sheet needs no explanation, but a user whose artwork was
 * white deserves to know why it is showing black rather than wondering
 * whether we inverted their font.
 *
 * @param {Object} sheet - { inverted, alphaIsInk }
 * @returns {String} empty when there is nothing worth saying
 */
export function describeReading(sheet) {
	if (sheet?.alphaIsInk) return 'read from transparency';
	if (sheet?.inverted) return 'read as light on dark';
	return '';
}
