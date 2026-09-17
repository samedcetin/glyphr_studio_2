/**
	SPECIMEN SHEET — READING THE IMAGE

	The one part of this pipeline that touches the DOM. Everything downstream
	takes a plain pixel buffer, which is what keeps it testable: jsdom has no
	real canvas, so anything that needed one would be untestable in this
	project's suite.

	This deliberately does NOT go through validate_file_input.js. That module
	keeps its validation result and its callback in module-level variables, so
	it is a singleton - and an image decode is slow enough that one racing an
	in-flight font validation would overwrite it.
*/

/** What a specimen sheet can arrive as. */
export const ACCEPTED_TYPES = 'image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp';

/** Refuse anything past this before decoding, rather than after. */
const MAX_BYTES = 40 * 1024 * 1024;

/** Above this the layout pass works on a reduced copy. */
const MAX_PIXELS = 40_000_000;

/**
 * @param {File|Blob} file
 * @returns {Boolean}
 */
export function looksLikeImage(file) {
	if (!file) return false;
	if (file.type && file.type.startsWith('image/')) return true;
	return /\.(png|jpe?g|webp)$/i.test(file.name || '');
}

/**
 * Decodes an image file into raw pixels.
 *
 * `colorSpaceConversion: 'none'` matters more than it looks: the default
 * applies whatever ICC profile is embedded, which shifts the whole luminance
 * ramp and does it differently per browser. The threshold is going to be
 * measured off these values, so what is wanted is the stored numbers and the
 * same answer everywhere, not colorimetric correctness.
 *
 * @param {File|Blob} file
 * @returns {Promise<Object>} { rgba, width, height }
 */
export async function readSheetImage(file) {
	if (!looksLikeImage(file)) {
		throw new Error('That does not look like an image. A specimen sheet can be PNG, JPEG or WebP.');
	}
	if (file.size > MAX_BYTES) {
		throw new Error(
			`That image is ${(file.size / 1024 / 1024).toFixed(0)}MB. The largest a sheet can be is ${MAX_BYTES / 1024 / 1024}MB.`
		);
	}

	const bitmap = await decode(file);
	if (bitmap.width * bitmap.height > MAX_PIXELS) {
		throw new Error(
			`That image is ${(bitmap.width * bitmap.height / 1e6).toFixed(0)} megapixels, which is more than can be held in one browser tab.`
		);
	}

	const canvas = document.createElement('canvas');
	canvas.width = bitmap.width;
	canvas.height = bitmap.height;
	const context = canvas.getContext('2d', { willReadFrequently: true, alpha: true });
	if (!context) throw new Error('This browser would not give us a canvas to read the image with.');
	context.drawImage(bitmap, 0, 0);
	const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);

	if (typeof bitmap.close === 'function') bitmap.close();

	return { rgba: data, width: canvas.width, height: canvas.height };
}

/**
 * @param {File|Blob} file
 * @returns {Promise<Object>} an ImageBitmap, or an <img> where that is absent
 */
async function decode(file) {
	if (typeof createImageBitmap === 'function') {
		try {
			return await createImageBitmap(file, {
				colorSpaceConversion: 'none',
				premultiplyAlpha: 'none',
			});
		} catch (error) {
			// Safari below 16.4 rejects the options rather than ignoring them.
			try {
				return await createImageBitmap(file);
			} catch (ignored) {
				// Fall through to the <img> path.
			}
		}
	}

	const url = URL.createObjectURL(file);
	try {
		const image = new Image();
		image.src = url;
		await image.decode();
		return image;
	} finally {
		URL.revokeObjectURL(url);
	}
}

/**
 * The first image on a drag-and-drop or paste event.
 * @param {DataTransfer} transfer - from a drop or paste event
 * @returns {File|null}
 */
export function imageFromTransfer(transfer) {
	if (!transfer) return null;
	for (const item of transfer.items ?? []) {
		if (item.kind !== 'file') continue;
		const file = item.getAsFile();
		if (looksLikeImage(file)) return file;
	}
	for (const file of transfer.files ?? []) {
		if (looksLikeImage(file)) return file;
	}
	return null;
}
