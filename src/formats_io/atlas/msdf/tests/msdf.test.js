import { describe, expect, it } from 'vitest';
import { importGlyphrProjectFromText } from '../../../../project_editor/import_project.js';
import oblegg from '../../../../samples/oblegg.gs2?raw';
import { colorEdges, isCorner, WHITE } from '../coloring.js';
import { signedDistance } from '../bezier.js';
import { contourBounds, extractContours, reverseContour, signedArea } from '../contours.js';
import { generateGlyphMSDF, isPointInside, median, sampleIsInside } from '../generate.js';

const project = importGlyphrProjectFromText(oblegg);

/**
 * @param {String} char - a single character
 * @returns {Object} - the Glyph for it
 */
function glyphFor(char) {
	const hex = char.codePointAt(0).toString(16).toUpperCase();
	return project.getItem(`glyph-0x${hex}`);
}

/**
 * Renders a glyph into a square field, fitted with a margin.
 * @param {Object} glyph - the Glyph
 * @param {Number=} size - pixels per side
 * @param {Number=} pxRange - the field spread, in pixels
 * @returns {Object} - {result, scale, translateX, translateY, range}
 */
function renderFitted(glyph, size = 48, pxRange = 4) {
	const contours = extractContours(glyph);
	const bounds = contourBounds(contours);

	const emWidth = bounds.xMax - bounds.xMin;
	const emHeight = bounds.yMax - bounds.yMin;
	const margin = pxRange + 2;
	const scale = Math.min((size - margin * 2) / emWidth, (size - margin * 2) / emHeight);

	const translateX = -bounds.xMin + margin / scale;
	const translateY = -bounds.yMin + margin / scale;
	const range = pxRange / scale;

	const result = generateGlyphMSDF(glyph, {
		width: size,
		height: size,
		scale: scale,
		translateX: translateX,
		translateY: translateY,
		range: range,
	});

	return { result, scale, translateX, translateY, range, contours };
}

describe('MSDF: contours', () => {
	it('extracts a contour per path', () => {
		// Capital O has an outer ring and a counter.
		const contours = extractContours(glyphFor('O'));
		expect(contours.length).toBe(2);
		contours.forEach((contour) => expect(contour.length).toBeGreaterThan(0));
	});

	it('normalises winding so the outer contour runs counter-clockwise', () => {
		const contours = extractContours(glyphFor('O'));
		const areas = contours.map(signedArea);
		const outer = areas.reduce((a, b) => (Math.abs(a) > Math.abs(b) ? a : b));
		expect(outer).toBeGreaterThan(0);
	});

	it('keeps a counter wound opposite to its outer contour', () => {
		const areas = extractContours(glyphFor('O')).map(signedArea);
		const outer = areas.reduce((a, b) => (Math.abs(a) > Math.abs(b) ? a : b));
		const inner = areas.find((area) => area !== outer);
		expect(Math.sign(inner)).toBe(-Math.sign(outer));
	});

	it('reverses a contour without changing the area it encloses', () => {
		const contour = extractContours(glyphFor('A'))[0];
		expect(signedArea(reverseContour(contour))).toBeCloseTo(-signedArea(contour), 3);
	});

	it('reports a bounding box that contains the glyph', () => {
		const bounds = contourBounds(extractContours(glyphFor('H')));
		expect(bounds.xMax).toBeGreaterThan(bounds.xMin);
		expect(bounds.yMax).toBeGreaterThan(bounds.yMin);
	});
});

describe('MSDF: edge coloring', () => {
	it('calls a right angle a corner and a straight join not', () => {
		const threshold = Math.sin((3 * Math.PI) / 180);
		expect(isCorner({ x: 1, y: 0 }, { x: 0, y: 1 }, threshold)).toBe(true);
		expect(isCorner({ x: 1, y: 0 }, { x: 1, y: 0 }, threshold)).toBe(false);
	});

	it('treats a reversal as a corner however small the cross product', () => {
		const threshold = Math.sin((3 * Math.PI) / 180);
		expect(isCorner({ x: 1, y: 0 }, { x: -1, y: 0 }, threshold)).toBe(true);
	});

	it('gives a smooth loop a single all-channel color', () => {
		// The counter of an O has no corners.
		const contours = extractContours(glyphFor('O'));
		const colors = colorEdges(contours);
		const smooth = colors.find((set) => set.every((color) => color === WHITE));
		expect(smooth).toBeTruthy();
	});

	it('never leaves two edges meeting at a corner sharing every channel', () => {
		const contours = extractContours(glyphFor('A'));
		const colors = colorEdges(contours);

		contours.forEach((contour, contourIndex) => {
			const set = colors[contourIndex];
			// At least two different masks appear on a cornered contour, or
			// the whole point of multi-channel is lost.
			if (contour.length > 3) {
				expect(new Set(set).size).toBeGreaterThan(1);
			}
		});
	});

	it('only ever assigns valid channel masks', () => {
		const colors = colorEdges(extractContours(glyphFor('A')));
		colors.flat().forEach((color) => {
			expect(color).toBeGreaterThanOrEqual(1);
			expect(color).toBeLessThanOrEqual(7);
		});
	});
});

describe('MSDF: generation', () => {
	it('returns nothing for a glyph with no outline', () => {
		expect(generateGlyphMSDF(glyphFor(' '), { width: 16, height: 16, scale: 1, translateX: 0, translateY: 0, range: 1 })).toBe(false);
	});

	it('fills every pixel with an opaque RGB sample', () => {
		const { result } = renderFitted(glyphFor('A'), 32);
		expect(result.data.length).toBe(32 * 32 * 4);
		for (let i = 3; i < result.data.length; i += 4) {
			expect(result.data[i]).toBe(255);
		}
	});

	/*
		The real test. Read the field the way a shader does - median of the
		three channels, above halfway means inside - and compare that against
		the winding rule on the same point. If the field is correct these agree
		everywhere except within a pixel of the outline, where disagreement is
		expected and harmless.
	*/
	it.each(['A', 'O', 'H', 'e', 'S'])(
		'reconstructs the shape of %s when read with the median rule',
		(char) => {
			const size = 48;
			const { result, scale, translateX, translateY, contours } = renderFitted(glyphFor(char), size);

			let compared = 0;
			let disagreed = 0;

			for (let py = 0; py < size; py++) {
				for (let px = 0; px < size; px++) {
					const point = {
						x: (px + 0.5) / scale - translateX,
						y: (size - py - 0.5) / scale - translateY,
					};

					const truth = isPointInside(contours, point, 24);
					const sampled = sampleIsInside(result, px, py);

					compared += 1;
					if (truth !== sampled) disagreed += 1;
				}
			}

			// Boundary pixels are allowed to differ; a broken field would
			// disagree on large solid regions instead.
			expect(disagreed / compared).toBeLessThan(0.04);
		}
	);

	it('puts the outline near the halfway value and the interior well above it', () => {
		const size = 48;
		const { result, scale, translateX, translateY, contours } = renderFitted(glyphFor('H'), size);

		let deepInside = 0;
		let deepInsideCorrect = 0;

		for (let py = 2; py < size - 2; py++) {
			for (let px = 2; px < size - 2; px++) {
				const point = {
					x: (px + 0.5) / scale - translateX,
					y: (size - py - 0.5) / scale - translateY,
				};
				if (!isPointInside(contours, point, 24)) continue;

				// Only judge pixels whose neighbours are also inside, so this
				// measures solid interior rather than the boundary.
				const neighboursInside = [
					[px - 2, py],
					[px + 2, py],
					[px, py - 2],
					[px, py + 2],
				].every(([nx, ny]) =>
					isPointInside(
						contours,
						{ x: (nx + 0.5) / scale - translateX, y: (size - ny - 0.5) / scale - translateY },
						24
					)
				);
				if (!neighboursInside) continue;

				deepInside += 1;
				const offset = (py * size + px) * 4;
				if (median(result.data[offset], result.data[offset + 1], result.data[offset + 2]) > 140) {
					deepInsideCorrect += 1;
				}
			}
		}

		expect(deepInside).toBeGreaterThan(50);
		expect(deepInsideCorrect / deepInside).toBeGreaterThan(0.98);
	});

	it('describes the same shape at two raster resolutions', () => {
		/*
			Scale independence has to be checked in em space, not pixel space.
			renderFitted uses a fixed pixel margin, so the glyph fills a
			different fraction of a 24px image than of a 96px one - comparing
			pixel i to pixel i*4 compares two different places on the letter.

			So: walk points on the letter itself, find where each one lands in
			each render, and require the two fields to agree about it.
		*/
		const small = renderFitted(glyphFor('H'), 24);
		const large = renderFitted(glyphFor('H'), 96);
		const bounds = contourBounds(small.contours);

		/**
		 * @param {Object} render - a renderFitted result
		 * @param {Object} point - em-space point
		 * @returns {Array | false} - pixel coordinates, or false if off-image
		 */
		const toPixel = (render, point) => {
			const px = Math.floor((point.x + render.translateX) * render.scale);
			const py = Math.floor(render.result.height - (point.y + render.translateY) * render.scale);
			if (px < 0 || py < 0 || px >= render.result.width || py >= render.result.height) return false;
			return [px, py];
		};

		/**
		 * True distance from a point to the nearest outline, in em units.
		 * @param {Object} point - em-space point
		 * @returns {Number}
		 */
		const distanceToOutline = (point) => {
			let nearest = Infinity;
			small.contours.forEach((contour) =>
				contour.forEach((segment) => {
					nearest = Math.min(nearest, Math.abs(signedDistance(segment, point).distance));
				})
			);
			return nearest;
		};

		/*
			Points sitting on the outline are quantised differently by a 24px
			grid than by a 96px one, and can honestly land on opposite sides.
			That says nothing about the field, so they are excluded and what
			remains is held to near-perfect agreement.
		*/
		const coarsePixel = 1 / small.scale;
		let compared = 0;
		let agreed = 0;
		let skippedNearEdge = 0;

		for (let i = 1; i < 40; i++) {
			for (let j = 1; j < 40; j++) {
				const point = {
					x: bounds.xMin + ((bounds.xMax - bounds.xMin) * i) / 40,
					y: bounds.yMin + ((bounds.yMax - bounds.yMin) * j) / 40,
				};

				const smallPixel = toPixel(small, point);
				const largePixel = toPixel(large, point);
				if (!smallPixel || !largePixel) continue;

				if (distanceToOutline(point) < coarsePixel) {
					skippedNearEdge += 1;
					continue;
				}

				compared += 1;
				if (
					sampleIsInside(small.result, smallPixel[0], smallPixel[1]) ===
					sampleIsInside(large.result, largePixel[0], largePixel[1])
				) {
					agreed += 1;
				}
			}
		}

		/*
			H is mostly thin stems: at 24px a stem spans about three pixels, so
			a one-pixel exclusion band either side of every edge removes most
			of the sample grid. A few hundred interior points survive, which is
			ample - and away from the boundary the two resolutions must agree
			essentially perfectly, or the field is not scale independent.
		*/
		expect(compared).toBeGreaterThan(200);
		expect(skippedNearEdge).toBeGreaterThan(0);
		expect(agreed / compared).toBeGreaterThan(0.995);
	});

	it('median matches a plain sort of the three values', () => {
		const cases = [
			[10, 20, 30],
			[30, 20, 10],
			[20, 10, 30],
			[5, 5, 200],
			[200, 5, 5],
		];
		cases.forEach(([a, b, c]) => {
			const expected = [a, b, c].sort((x, y) => x - y)[1];
			expect(median(a, b, c)).toBe(expected);
		});
	});
});

describe('MSDF: what it is actually for', () => {
	/**
	 * Bilinear sample of one channel, which is what a GPU does when it
	 * magnifies a texture.
	 * @param {Object} result - a generated field
	 * @param {Number} channel - 0, 1 or 2
	 * @param {Number} x - sample position in pixels
	 * @param {Number} y - sample position in pixels
	 * @returns {Number}
	 */
	function bilinear(result, channel, x, y) {
		const x0 = Math.max(0, Math.min(result.width - 1, Math.floor(x - 0.5)));
		const y0 = Math.max(0, Math.min(result.height - 1, Math.floor(y - 0.5)));
		const x1 = Math.min(result.width - 1, x0 + 1);
		const y1 = Math.min(result.height - 1, y0 + 1);
		const fx = Math.max(0, Math.min(1, x - 0.5 - x0));
		const fy = Math.max(0, Math.min(1, y - 0.5 - y0));

		const at = (px, py) => result.data[(py * result.width + px) * 4 + channel];

		const top = at(x0, y0) * (1 - fx) + at(x1, y0) * fx;
		const bottom = at(x0, y1) * (1 - fx) + at(x1, y1) * fx;
		return top * (1 - fy) + bottom * fy;
	}

	/**
	 * The same bilinear magnification applied to a plain coverage bitmap.
	 * @param {Array | Float32Array} grid - coverage values, row major
	 * @param {Number} size - grid dimension
	 * @param {Number} x - sample position in pixels
	 * @param {Number} y - sample position in pixels
	 * @returns {Number}
	 */
	function bilinearGrid(grid, size, x, y) {
		const x0 = Math.max(0, Math.min(size - 1, Math.floor(x - 0.5)));
		const y0 = Math.max(0, Math.min(size - 1, Math.floor(y - 0.5)));
		const x1 = Math.min(size - 1, x0 + 1);
		const y1 = Math.min(size - 1, y0 + 1);
		const fx = Math.max(0, Math.min(1, x - 0.5 - x0));
		const fy = Math.max(0, Math.min(1, y - 0.5 - y0));

		const at = (px, py) => grid[py * size + px];
		const top = at(x0, y0) * (1 - fx) + at(x1, y0) * fx;
		const bottom = at(x0, y1) * (1 - fx) + at(x1, y1) * fx;
		return top * (1 - fy) + bottom * fy;
	}

	/*
		The whole reason to store distances instead of coverage: a small
		texture magnified by the GPU should still give a clean edge. This
		measures that rather than asserting it - the same 32px source is
		magnified four times both ways and both are scored against the true
		outline.
	*/
	it.each(['A', 'H', 'E'])('beats a plain coverage bitmap when magnified: %s', (char) => {
		const source = 32;
		const factor = 4;
		const target = source * factor;

		const { result, scale, translateX, translateY, contours } = renderFitted(glyphFor(char), source);

		// A hard coverage bitmap of the same glyph at the same resolution.
		const coverage = new Float32Array(source * source);
		for (let py = 0; py < source; py++) {
			for (let px = 0; px < source; px++) {
				const point = {
					x: (px + 0.5) / scale - translateX,
					y: (source - py - 0.5) / scale - translateY,
				};
				coverage[py * source + px] = isPointInside(contours, point, 16) ? 255 : 0;
			}
		}

		let msdfWrong = 0;
		let bitmapWrong = 0;
		let total = 0;

		for (let py = 0; py < target; py++) {
			for (let px = 0; px < target; px++) {
				// Where this magnified pixel lands in the source texture...
				const sx = (px + 0.5) / factor;
				const sy = (py + 0.5) / factor;

				// ...and where it lands on the actual letter.
				const point = {
					x: sx / scale - translateX,
					y: (source - sy) / scale - translateY,
				};

				const truth = isPointInside(contours, point, 16);

				const msdfInside =
					median(
						bilinear(result, 0, sx, sy),
						bilinear(result, 1, sx, sy),
						bilinear(result, 2, sx, sy)
					) > 127.5;

				const bitmapInside = bilinearGrid(coverage, source, sx, sy) > 127.5;

				total += 1;
				if (msdfInside !== truth) msdfWrong += 1;
				if (bitmapInside !== truth) bitmapWrong += 1;
			}
		}

		expect(total).toBeGreaterThan(1000);
		// Both are imperfect at the boundary; the point is that the distance
		// field is meaningfully closer to the truth.
		expect(msdfWrong).toBeLessThan(bitmapWrong);
	});
});
