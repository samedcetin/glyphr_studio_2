/**
	RECTANGLE PACKING
	-----------------
	Skyline bottom-left packing, used to lay glyph bitmaps out on a texture
	page with as little wasted space as possible.

	Skyline rather than MaxRects: it is a fraction of the code, runs in a
	single pass, and for glyphs - which are all roughly the same height and
	arrive sorted tallest-first - it packs within a few percent of optimal.

	Pure data in, pure data out. Nothing here touches the DOM, so the same
	code can run in a build script.
 */

/**
 * @typedef {Object} PackInput
 * @property {String} id - caller's identifier, returned untouched
 * @property {Number} width - rectangle width in pixels
 * @property {Number} height - rectangle height in pixels
 */

/**
 * @typedef {Object} PackedRect
 * @property {String} id - the input id
 * @property {Number} x - left edge on the page
 * @property {Number} y - top edge on the page
 * @property {Number} width - as given
 * @property {Number} height - as given
 * @property {Number} page - which page this landed on
 */

/**
 * Rounds up to the next power of two.
 * @param {Number} value - any positive number
 * @returns {Number}
 */
export function nextPowerOfTwo(value) {
	let result = 1;
	while (result < value) result *= 2;
	return result;
}

/**
 * Packs rectangles onto one or more fixed-size pages.
 *
 * Rectangles are sorted tallest-first before packing, which is what makes
 * skyline behave: tall items placed early leave a flat surface for the rest.
 * The caller's original order is irrelevant to the result and is not preserved.
 *
 * @param {Array<PackInput>} rects - rectangles to place
 * @param {Object} options - packing options
 * @param {Number} options.pageWidth - page width in pixels
 * @param {Number} options.pageHeight - page height in pixels
 * @param {Number=} options.spacing - gap left between rectangles
 * @returns {Object} - { pages: Number, placed: Array<PackedRect>, tooLarge: Array }
 */
export function packRects(rects, { pageWidth, pageHeight, spacing = 1 }) {
	/** @type {Array<PackedRect>} */
	const placed = [];
	/** @type {Array} */
	const tooLarge = [];

	// Anything bigger than a whole page can never be placed. Report it rather
	// than looping forever opening new pages for it.
	const packable = [];
	rects.forEach((rect) => {
		if (rect.width > pageWidth || rect.height > pageHeight) tooLarge.push(rect);
		else if (rect.width > 0 && rect.height > 0) packable.push(rect);
	});

	const queue = packable.slice().sort((a, b) => b.height - a.height || b.width - a.width);

	let pageIndex = 0;
	let remaining = queue;

	while (remaining.length) {
		const { fitted, leftovers } = packOnePage(remaining, pageWidth, pageHeight, spacing);

		// A page that fits nothing means the loop would never end.
		if (!fitted.length) {
			leftovers.forEach((rect) => tooLarge.push(rect));
			break;
		}

		fitted.forEach((rect) => placed.push({ ...rect, page: pageIndex }));
		remaining = leftovers;
		pageIndex += 1;
	}

	return { pages: Math.max(1, pageIndex), placed: placed, tooLarge: tooLarge };
}

/**
 * Fills a single page, returning what fit and what did not.
 * @param {Array<PackInput>} rects - candidates, already sorted
 * @param {Number} pageWidth - page width
 * @param {Number} pageHeight - page height
 * @param {Number} spacing - gap between rectangles
 * @returns {Object} - { fitted, leftovers }
 */
function packOnePage(rects, pageWidth, pageHeight, spacing) {
	// The skyline: a list of horizontal segments describing the current
	// upper surface, left to right.
	let skyline = [{ x: 0, y: 0, width: pageWidth }];

	const fitted = [];
	const leftovers = [];

	rects.forEach((rect) => {
		const slotWidth = rect.width + spacing;
		const slotHeight = rect.height + spacing;
		const position = findLowestSlot(skyline, slotWidth, slotHeight, pageWidth, pageHeight);

		if (!position) {
			leftovers.push(rect);
			return;
		}

		fitted.push({ id: rect.id, x: position.x, y: position.y, width: rect.width, height: rect.height });
		skyline = raiseSkyline(skyline, position.x, position.y + slotHeight, slotWidth, pageWidth);
	});

	return { fitted: fitted, leftovers: leftovers };
}

/**
 * Finds the lowest position where a rectangle fits, leftmost on ties.
 * @param {Array} skyline - current skyline segments
 * @param {Number} width - slot width including spacing
 * @param {Number} height - slot height including spacing
 * @param {Number} pageWidth - page width
 * @param {Number} pageHeight - page height
 * @returns {Object | false} - {x, y} or false when it does not fit
 */
function findLowestSlot(skyline, width, height, pageWidth, pageHeight) {
	/** @type {{x: Number, y: Number} | false} - the lowest slot found so far */
	let best = false;

	for (let i = 0; i < skyline.length; i++) {
		const x = skyline[i].x;
		if (x + width > pageWidth) break;

		// The rectangle rests on the highest segment it spans.
		let y = 0;
		let spanned = 0;
		for (let j = i; j < skyline.length && spanned < width; j++) {
			y = Math.max(y, skyline[j].y);
			spanned += skyline[j].width;
		}
		if (spanned < width) break;

		if (y + height > pageHeight) continue;

		if (!best || y < best.y || (y === best.y && x < best.x)) {
			best = { x: x, y: y };
		}
	}

	return best;
}

/**
 * Raises the skyline to account for a newly placed rectangle, then merges
 * neighbouring segments that ended up at the same height.
 * @param {Array} skyline - current segments
 * @param {Number} x - left edge of the placed slot
 * @param {Number} top - new surface height
 * @param {Number} width - slot width
 * @param {Number} pageWidth - page width
 * @returns {Array} - the new skyline
 */
function raiseSkyline(skyline, x, top, width, pageWidth) {
	const right = Math.min(x + width, pageWidth);
	/** @type {Array} */
	const next = [];

	skyline.forEach((segment) => {
		const segmentRight = segment.x + segment.width;

		// Entirely outside the placed span - keep as is.
		if (segmentRight <= x || segment.x >= right) {
			next.push({ ...segment });
			return;
		}

		// Keep whatever sticks out to the left.
		if (segment.x < x) next.push({ x: segment.x, y: segment.y, width: x - segment.x });
		// Keep whatever sticks out to the right.
		if (segmentRight > right) next.push({ x: right, y: segment.y, width: segmentRight - right });
	});

	next.push({ x: x, y: top, width: right - x });
	next.sort((a, b) => a.x - b.x);

	// Merge equal-height neighbours so the skyline does not fragment.
	const merged = [];
	next.forEach((segment) => {
		const last = merged[merged.length - 1];
		if (last && last.y === segment.y && last.x + last.width === segment.x) {
			last.width += segment.width;
		} else {
			merged.push(segment);
		}
	});

	return merged;
}
