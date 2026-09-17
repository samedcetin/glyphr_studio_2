/**
	SPECIMEN SHEET — BINARIZATION

	Turning an uploaded character sheet into a clean ink mask.

	Every function here is (typed array in, typed array out) with no DOM. That
	is deliberate: jsdom has no real canvas, so anything that touches one is
	untestable in this project's suite. Keeping the pixel maths pure means the
	whole stage is testable against synthetic bitmaps, and it costs nothing -
	the caller does the one `getImageData` and hands the buffer over.
*/

/**
 * Converts RGBA pixels to a single grey plane.
 *
 * The luma weights are Rec.709 applied in GAMMA space, not linear light, and
 * that is not an oversight. Anti-aliasing in every browser and every design
 * tool is composited in sRGB, so a pixel with half ink coverage lands at about
 * 128. Linearize first and the 0.5 coverage point moves to about 186, which
 * displaces every contour outward by roughly 0.15-0.2px and fattens every
 * stem on the sheet. Threshold in the space the anti-aliasing was made in.
 *
 * @param {Uint8ClampedArray} rgba - pixel data, 4 bytes per pixel
 * @param {Object =} options
 * @param {Boolean =} options.alphaIsInk - treat the alpha channel as coverage,
 *   for a sheet exported on a transparent background
 * @returns {Uint8Array} one byte per pixel, 0 = black
 */
export function rgbaToGrey(rgba, { alphaIsInk = false } = {}) {
	const count = rgba.length / 4;
	const grey = new Uint8Array(count);

	if (alphaIsInk) {
		// Transparent ground, opaque glyphs: coverage IS the alpha channel, and
		// the colour channels are undefined where alpha is 0.
		for (let i = 0; i < count; i++) grey[i] = 255 - rgba[i * 4 + 3];
		return grey;
	}

	for (let i = 0; i < count; i++) {
		const o = i * 4;
		grey[i] = (54 * rgba[o] + 183 * rgba[o + 1] + 19 * rgba[o + 2]) >> 8;
	}
	return grey;
}

/**
 * Decides whether the alpha channel is carrying the artwork.
 *
 * A sheet exported from Figma, Illustrator or Affinity with no background is
 * the common case, and its colour channels are often pure black everywhere -
 * so reading luma would return a solid black plane and Otsu would have nothing
 * to split.
 *
 * @param {Uint8ClampedArray} rgba - pixel data
 * @returns {Boolean}
 */
export function detectAlphaIsInk(rgba) {
	const count = rgba.length / 4;
	let transparent = 0;
	for (let i = 0; i < count; i++) {
		if (rgba[i * 4 + 3] < 250) transparent++;
	}
	return transparent > count * 0.005;
}

/**
 * Otsu's threshold: the grey level that best splits the histogram in two.
 *
 * One threshold for the WHOLE sheet, never one per glyph. A global threshold
 * that is slightly off reads as "a touch bolder than the specimen" because the
 * error is uniform; a per-glyph threshold makes stem weights disagree glyph to
 * glyph, which is the one inconsistency a reader actually notices.
 *
 * The plateau detail matters on synthetic art. A rendered sheet has an almost
 * empty valley between its two peaks, so several thresholds tie for maximum
 * between-class variance. Taking the first of them biases toward ink and thins
 * every stroke by roughly 0.3px, so take the middle of the tie instead.
 *
 * @param {Uint8Array} grey - one byte per pixel
 * @returns {Number} threshold, 0-255; pixels at or below it are ink
 */
export function otsuThreshold(grey) {
	const histogram = new Float64Array(256);
	for (let i = 0; i < grey.length; i++) histogram[grey[i]]++;

	const total = grey.length;
	let sum = 0;
	for (let t = 0; t < 256; t++) sum += t * histogram[t];

	let sumBackground = 0;
	let weightBackground = 0;
	let best = 0;
	let plateauStart = 0;
	let plateauEnd = 0;

	for (let t = 0; t < 256; t++) {
		weightBackground += histogram[t];
		if (weightBackground === 0) continue;
		const weightForeground = total - weightBackground;
		if (weightForeground === 0) break;

		sumBackground += t * histogram[t];
		const meanBackground = sumBackground / weightBackground;
		const meanForeground = (sum - sumBackground) / weightForeground;
		const delta = meanBackground - meanForeground;
		const variance = weightBackground * weightForeground * delta * delta;

		if (variance > best) {
			best = variance;
			plateauStart = t;
			plateauEnd = t;
		} else if (variance === best) {
			plateauEnd = t;
		}
	}

	return Math.round((plateauStart + plateauEnd) / 2);
}

/**
 * Works out which side of the threshold the glyphs are on.
 *
 * A specimen can arrive as light glyphs on a dark ground. Sheets are mostly
 * background by area, so whichever class is smaller is the ink.
 *
 * @param {Uint8Array} grey - one byte per pixel
 * @param {Number} threshold - from otsuThreshold
 * @returns {Boolean} true when the LIGHT side is the ink
 */
export function detectInverted(grey, threshold) {
	let dark = 0;
	for (let i = 0; i < grey.length; i++) {
		if (grey[i] <= threshold) dark++;
	}
	return dark > grey.length / 2;
}

/**
 * Builds the ink mask.
 *
 * @param {Uint8Array} grey - one byte per pixel
 * @param {Number} threshold - from otsuThreshold
 * @param {Boolean =} inverted - true when the light side is the ink
 * @returns {Uint8Array} one byte per pixel, 1 = ink
 */
export function binarize(grey, threshold, inverted = false) {
	const ink = new Uint8Array(grey.length);
	if (inverted) {
		for (let i = 0; i < grey.length; i++) ink[i] = grey[i] > threshold ? 1 : 0;
	} else {
		for (let i = 0; i < grey.length; i++) ink[i] = grey[i] <= threshold ? 1 : 0;
	}
	return ink;
}

/**
 * The whole binarization stage, as one call.
 *
 * @param {Uint8ClampedArray} rgba - pixel data, 4 bytes per pixel
 * @returns {Object} { grey, ink, threshold, inverted, alphaIsInk }
 */
export function makeInkMask(rgba) {
	const alphaIsInk = detectAlphaIsInk(rgba);
	const grey = rgbaToGrey(rgba, { alphaIsInk });
	const threshold = otsuThreshold(grey);
	const inverted = alphaIsInk ? false : detectInverted(grey, threshold);
	const ink = binarize(grey, threshold, inverted);
	return { grey, ink, threshold, inverted, alphaIsInk };
}
