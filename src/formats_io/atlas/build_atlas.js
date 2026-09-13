import { drawShape } from '../../display_canvas/draw_paths.js';
import { collectIconMap } from '../../icon_font/name_map.js';
import { makeBMFontDescriptor, makeBMFontXML } from './bmfont.js';
import { generateGlyphMSDF } from './msdf/generate.js';
import { nextPowerOfTwo, packRects } from './pack_rects.js';

/**
	ATLAS BUILDER
	-------------
	Turns a Glyphr Studio project into a bitmap font: one or more PNG texture
	pages plus a BMFont `.fnt` descriptor.

	This is what game engines need. They do not load an OTF and rasterize it at
	runtime the way a browser does - they sample a pre-rendered texture. Which
	is why "export OTF" alone has never been enough for anyone shipping a game.

	Coordinate note: font space runs upwards from the baseline and texture
	space runs downwards from the top-left, so every vertical figure here is
	flipped exactly once, at the point where a glyph is drawn.
 */

/** Padding is never zero: see the note in measureGlyph. */
const MIN_PADDING = 1;

/**
 * @typedef {Object} AtlasOptions
 * @property {Number=} pixelSize - em size in pixels
 * @property {Number=} padding - transparent border baked around each glyph
 * @property {Number=} spacing - gap left between glyphs on the page
 * @property {Number=} pageSize - texture width and height in pixels
 * @property {Boolean=} powerOfTwo - round the page up to a power of two
 * @property {String=} characters - which characters to include
 * @property {Boolean=} includeKerning - write the kerning block
 * @property {String=} fieldType - 'bitmap' for plain coverage, 'msdf' for a
 *                                 multi-channel signed distance field
 * @property {String=} descriptorFormat - 'text' for the classic .fnt, 'xml'
 *                                        for the flavour Phaser and PixiJS read
 * @property {Number=} pxRange - MSDF only: how far the field spreads, in pixels
 */

/**
 * Default options, tuned for a typical UI font in a 2D engine.
 * @returns {AtlasOptions}
 */
export function makeDefaultAtlasOptions() {
	return {
		pixelSize: 32,
		padding: 1,
		spacing: 1,
		pageSize: 512,
		powerOfTwo: true,
		characters: '',
		includeKerning: true,
		fieldType: 'bitmap',
		/*
			The text `.fnt` is AngelCode's original. The XML flavour carries
			exactly the same fields and is what Phaser 3's and PixiJS's
			bitmap-font loaders expect.
		*/
		descriptorFormat: 'text',
		/*
			4px is the msdf-atlas-gen default and what Unity TextMeshPro and
			Godot 4 assume unless told otherwise. It is the distance, in output
			pixels, that the field covers either side of the outline - which is
			also how much room effects like outline and glow have to work with.
		*/
		pxRange: 4,
	};
}

/**
 * Works out a glyph's bitmap size and placement offsets.
 *
 * @param {Object} glyph - a Glyph
 * @param {Number} scale - em units to pixels
 * @param {Number} padding - transparent border
 * @returns {Object} - measurements, or a zero-size box for blank glyphs
 */
function measureGlyph(glyph, scale, padding) {
	const advance = Math.round((glyph.advanceWidth || 0) * scale);

	if (!glyph?.visibleShapes?.length) {
		return { isBlank: true, width: 0, height: 0, advance: advance };
	}

	const maxes = glyph.maxes;
	const inkWidth = (maxes.xMax - maxes.xMin) * scale;
	const inkHeight = (maxes.yMax - maxes.yMin) * scale;

	if (!isFinite(inkWidth) || !isFinite(inkHeight) || inkWidth <= 0 || inkHeight <= 0) {
		return { isBlank: true, width: 0, height: 0, advance: advance };
	}

	/*
		Padding has a floor of 1 rather than 0. Two reasons, and they point the
		same way: a glyph drawn hard against the bitmap edge bleeds into its
		neighbour once the GPU filters the texture, and drawing at exactly zero
		used to trip a falsy-zero guard in the canvas coordinate helpers.
	*/
	const pad = Math.max(MIN_PADDING, padding);

	return {
		isBlank: false,
		width: Math.ceil(inkWidth) + pad * 2,
		height: Math.ceil(inkHeight) + pad * 2,
		advance: advance,
		pad: pad,
		// Where the glyph origin sits inside its own bitmap.
		originX: pad - maxes.xMin * scale,
		originY: pad + maxes.yMax * scale,
		// Where the bitmap sits relative to the pen, in the engine's terms.
		xoffset: Math.round(maxes.xMin * scale) - pad,
		topFromBaseline: maxes.yMax * scale,
	};
}

/**
 * Draws one glyph into its own canvas at the given scale.
 * @param {Object} glyph - a Glyph
 * @param {Object} measurement - output of measureGlyph
 * @param {Document=} doc - document to create the canvas in
 * @returns {HTMLCanvasElement | false}
 */
function rasterizeGlyph(glyph, measurement, doc = document) {
	if (measurement.isBlank) return false;

	const canvas = doc.createElement('canvas');
	canvas.width = measurement.width;
	canvas.height = measurement.height;

	const ctx = canvas.getContext('2d');
	if (!ctx) return false;

	// White on transparent: engines tint at draw time, so the atlas carries
	// coverage rather than color.
	ctx.fillStyle = '#FFFFFF';
	ctx.beginPath();

	const view = { dx: measurement.originX, dy: measurement.originY, dz: measurement.scale };
	glyph.visibleShapes.forEach((shape) => drawShape(shape, ctx, view));

	ctx.closePath();
	ctx.fill('nonzero');

	return canvas;
}

/**
 * Renders one glyph as a multi-channel signed distance field.
 *
 * Same placement as the plain rasteriser - the glyph sits at the same offsets
 * inside the same box - but the pixels carry distances rather than coverage,
 * so the result stays sharp when the engine scales it up.
 *
 * @param {Object} glyph - a Glyph
 * @param {Object} measurement - output of measureGlyph
 * @param {Number} pxRange - field spread in output pixels
 * @param {Number} seed - varies channel assignment between glyphs
 * @param {Document=} doc - document to create the canvas in
 * @returns {HTMLCanvasElement | false}
 */
function rasterizeGlyphMSDF(glyph, measurement, pxRange, seed, doc = document) {
	if (measurement.isBlank) return false;

	const field = generateGlyphMSDF(glyph, {
		width: measurement.width,
		height: measurement.height,
		scale: measurement.scale,
		// generateGlyphMSDF translates in em units before scaling, while
		// measureGlyph works in output pixels, so the origin converts back.
		translateX: measurement.originX / measurement.scale,
		translateY: (measurement.height - measurement.originY) / measurement.scale,
		range: pxRange / measurement.scale,
		seed: seed,
	});

	if (!field) return false;

	const canvas = doc.createElement('canvas');
	canvas.width = measurement.width;
	canvas.height = measurement.height;

	const ctx = canvas.getContext('2d');
	if (!ctx) return false;

	const image = ctx.createImageData(measurement.width, measurement.height);
	image.data.set(field.data);
	ctx.putImageData(image, 0, 0);

	return canvas;
}

/**
 * Expands the project's kern groups into individual character pairs.
 *
 * Kerning is stored class-based - a group of left characters against a group
 * of right ones - but BMFont only understands explicit pairs, so the groups
 * are multiplied out here.
 *
 * @param {Object} project - the project
 * @param {Set} includedCodePoints - only pairs where both sides are in the atlas
 * @param {Number} scale - em units to pixels
 * @returns {Array} - [{first, second, amount}]
 */
function expandKerningPairs(project, includedCodePoints, scale) {
	const pairs = [];
	const kerning = project.kerning || {};

	Object.keys(kerning).forEach((groupID) => {
		const group = kerning[groupID];
		if (!group?.leftGroup?.length || !group?.rightGroup?.length) return;
		const amount = Math.round((group.value || 0) * scale);
		if (!amount) return;

		group.leftGroup.forEach((leftChar) => {
			// KernGroup stores Unicode as hex strings, e.g. '0x41', not literal characters.
			const first = Number(leftChar);
			if (!Number.isInteger(first) || !includedCodePoints.has(first)) return;

			group.rightGroup.forEach((rightChar) => {
				const second = Number(rightChar);
				if (!Number.isInteger(second) || !includedCodePoints.has(second)) return;
				pairs.push({ first: first, second: second, amount: amount });
			});
		});
	});

	return pairs;
}

/**
 * Collects the glyphs to include, as {codePoint, glyph} entries.
 *
 * With no character list, every existing glyph is included, including blank
 * glyphs that carry spacing. With one, only those characters - which is how you ship a subset
 * sized to the strings your game actually draws.
 *
 * @param {Object} project - the project
 * @param {String} characters - characters to include, or '' for everything
 * @returns {Array}
 */
export function collectAtlasGlyphs(project, characters = '') {
	const entries = [];
	const seen = new Set();

	const addByCodePoint = (codePoint) => {
		if (seen.has(codePoint)) return;
		const id = `glyph-0x${codePoint.toString(16).toUpperCase()}`;
		const glyph = project.getItem(id);
		if (!glyph) return;
		seen.add(codePoint);
		entries.push({ codePoint: codePoint, glyph: glyph });
	};

	if (characters) {
		// Array.from rather than split(''), so characters outside the basic
		// plane survive as one code point instead of two surrogate halves.
		Array.from(characters).forEach((char) => {
			const codePoint = char.codePointAt(0);
			if (codePoint !== undefined) addByCodePoint(codePoint);
		});
		return entries;
	}

	Object.keys(project.glyphs || {}).forEach((id) => {
		const glyph = project.glyphs[id];
		if (!glyph) return;
		const hex = id.replace('glyph-', '');
		const codePoint = Number(hex);
		if (!isFinite(codePoint)) return;
		if (seen.has(codePoint)) return;
		seen.add(codePoint);
		entries.push({ codePoint: codePoint, glyph: glyph });
	});

	return entries.sort((a, b) => a.codePoint - b.codePoint);
}

/**
 * Builds a complete bitmap font atlas.
 *
 * @param {Object} project - a GlyphrStudioProject
 * @param {AtlasOptions} options - export options
 * @param {Document=} doc - document to create canvases in
 * @returns {Object} - { pages, descriptor, stats, tooLarge }
 */
export function buildAtlas(project, options, doc = document) {
	const settings = project.settings.font;
	const upm = Number(settings.upm) || 1000;
	const ascent = Number(settings.ascent) || 0;
	const descent = Math.abs(Number(settings.descent) || 0);
	const lineGap = Number(settings.lineGap) || 0;

	// pixelSize is the em size, so the scale is simply px per em unit.
	const scale = options.pixelSize / upm;
	const isMSDF = options.fieldType === 'msdf';
	const pxRange = Math.max(1, Number(options.pxRange) || 4);

	/*
		A distance field has to carry values beyond the outline, or the engine
		has nothing to interpolate across when it scales the glyph up - the
		field would be clipped exactly where it matters. So an MSDF glyph gets
		at least pxRange of padding regardless of what the user asked for.
	*/
	const pad = isMSDF
		? Math.max(MIN_PADDING, options.padding, Math.ceil(pxRange))
		: Math.max(MIN_PADDING, options.padding);

	const pageSize = options.powerOfTwo ? nextPowerOfTwo(options.pageSize) : options.pageSize;
	const base = Math.round(ascent * scale);
	const lineHeight = Math.round((ascent + descent + lineGap) * scale);

	// ---- Measure ----
	const entries = collectAtlasGlyphs(project, options.characters);
	const measured = entries.map((entry) => {
		const measurement = measureGlyph(entry.glyph, scale, pad);
		measurement.scale = scale;
		return { ...entry, measurement: measurement };
	});

	// ---- Pack the ones that have pixels ----
	const drawable = measured.filter((entry) => !entry.measurement.isBlank);
	const { pages, placed, tooLarge } = packRects(
		drawable.map((entry) => ({
			id: String(entry.codePoint),
			width: entry.measurement.width,
			height: entry.measurement.height,
		})),
		{ pageWidth: pageSize, pageHeight: pageSize, spacing: options.spacing }
	);

	const placementByCodePoint = new Map();
	placed.forEach((rect) => placementByCodePoint.set(Number(rect.id), rect));

	// ---- Draw the pages ----
	const pageCanvases = [];
	for (let i = 0; i < pages; i++) {
		const canvas = doc.createElement('canvas');
		canvas.width = pageSize;
		canvas.height = pageSize;
		pageCanvases.push(canvas);
	}

	drawable.forEach((entry, index) => {
		const rect = placementByCodePoint.get(entry.codePoint);
		if (!rect) return;

		// The seed varies channel assignment per glyph, so neighbouring
		// letters on the same page do not all lean on the same channel.
		const glyphCanvas = isMSDF
			? rasterizeGlyphMSDF(entry.glyph, entry.measurement, pxRange, index, doc)
			: rasterizeGlyph(entry.glyph, entry.measurement, doc);

		if (!glyphCanvas) return;
		const ctx = pageCanvases[rect.page].getContext('2d');
		if (ctx) ctx.drawImage(glyphCanvas, rect.x, rect.y);
	});

	// ---- Describe ----
	const fileBaseName = makeAtlasFileBaseName(project);
	const pageFiles = pageCanvases.map((_canvas, index) => `${fileBaseName}_${index}.png`);
	const includedCodePoints = new Set(measured.map((entry) => entry.codePoint));

	const chars = measured.map((entry) => {
		const measurement = entry.measurement;
		const rect = placementByCodePoint.get(entry.codePoint);

		// Blank glyphs - space and friends - carry an advance and nothing else.
		if (measurement.isBlank || !rect) {
			return {
				id: entry.codePoint,
				x: 0,
				y: 0,
				width: 0,
				height: 0,
				xoffset: 0,
				yoffset: 0,
				xadvance: measurement.advance,
				page: 0,
			};
		}

		return {
			id: entry.codePoint,
			x: rect.x,
			y: rect.y,
			width: rect.width,
			height: rect.height,
			xoffset: measurement.xoffset,
			// Distance from the top of the line down to the top of this bitmap.
			yoffset: Math.round(base - measurement.topFromBaseline) - measurement.pad,
			xadvance: measurement.advance,
			page: rect.page,
		};
	});

	const kernings = options.includeKerning
		? expandKerningPairs(project, includedCodePoints, scale)
		: [];

	const descriptorData = {
		face: settings.family || 'Untitled',
		size: options.pixelSize,
		bold: String(settings.style || '').toLowerCase().includes('bold'),
		italic: String(settings.style || '').toLowerCase().includes('italic'),
		lineHeight: lineHeight,
		base: base,
		scaleW: pageSize,
		scaleH: pageSize,
		pageFiles: pageFiles,
		padding: pad,
		spacing: options.spacing,
		chars: chars,
		kernings: kernings,
	};

	/*
		Both flavours are built every time. They are string assembly over the
		same object, so the cost is nothing next to rasterising the pages, and
		it means the dialog can switch format without a rebuild.
	*/
	return {
		pages: pageCanvases,
		pageFiles: pageFiles,
		descriptor: makeBMFontDescriptor(descriptorData),
		descriptorXML: makeBMFontXML(descriptorData),
		fileBaseName: fileBaseName,
		metadata: makeAtlasMetadata({
			project: project,
			options: options,
			isMSDF: isMSDF,
			pxRange: pxRange,
			pageSize: pageSize,
			pageFiles: pageFiles,
			base: base,
			lineHeight: lineHeight,
			scale: scale,
			chars: chars,
			kernings: kernings,
		}),
		stats: {
			glyphCount: chars.length,
			drawnCount: placed.length,
			pageCount: pageCanvases.length,
			pageSize: pageSize,
			kerningCount: kernings.length,
			coverage: measureCoverage(placed, pageSize, pageCanvases.length),
			fieldType: isMSDF ? 'msdf' : 'bitmap',
			pxRange: isMSDF ? pxRange : 0,
		},
		tooLarge: tooLarge.map((rect) => Number(rect.id)),
	};
}

/**
 * Builds the JSON sidecar that describes the atlas in em units.
 *
 * The `.fnt` descriptor is written in pixels and has no field for a distance
 * range, so an MSDF atlas needs this alongside it. The shape is the one
 * msdf-atlas-gen emits, which is what the Unity TextMeshPro importers and the
 * Godot tooling in this ecosystem already know how to read.
 *
 * It is written for plain bitmap atlases too - the numbers are just as useful
 * to an engine that wants em-relative metrics rather than pixels.
 *
 * @param {Object} args - everything the sidecar needs
 * @returns {Object} - a JSON-serialisable object
 */
function makeAtlasMetadata({
	project,
	options,
	isMSDF,
	pxRange,
	pageSize,
	pageFiles,
	base,
	lineHeight,
	chars,
	kernings,
}) {
	const font = project.settings.font;
	const upm = Number(font.upm) || 1000;
	const pixelsPerEm = options.pixelSize;

	/**
	 * Pixels to em units.
	 * @param {Number} value - a pixel measurement
	 * @returns {Number}
	 */
	const toEm = (value) => value / pixelsPerEm;

	const glyphs = chars.map((character) => {
		const entry = {
			unicode: character.id,
			advance: toEm(character.xadvance),
		};

		// A blank glyph has no quad at all - only an advance.
		if (character.width > 0 && character.height > 0) {
			entry.planeBounds = {
				left: toEm(character.xoffset),
				bottom: toEm(base - character.yoffset - character.height),
				right: toEm(character.xoffset + character.width),
				top: toEm(base - character.yoffset),
			};
			entry.atlasBounds = {
				left: character.x,
				top: character.y,
				right: character.x + character.width,
				bottom: character.y + character.height,
			};
			entry.page = character.page;
		}

		return entry;
	});

	const metadata = {
		atlas: {
			type: isMSDF ? 'msdf' : 'hardmask',
			distanceRange: isMSDF ? pxRange : 0,
			size: options.pixelSize,
			width: pageSize,
			height: pageSize,
			// Our pages are drawn top-down, which is what atlasBounds above
			// describes, so this must say so.
			yOrigin: 'top',
			pages: pageFiles.slice(),
		},
		metrics: {
			emSize: 1,
			lineHeight: toEm(lineHeight),
			ascender: Number(font.ascent) / upm,
			descender: -Math.abs(Number(font.descent) || 0) / upm,
			underlineY: -0.1,
			underlineThickness: 0.05,
		},
		glyphs: glyphs,
		kerning: kernings.map((kern) => ({
			unicode1: kern.first,
			unicode2: kern.second,
			advance: toEm(kern.amount),
		})),
	};

	/*
		Icon names, when the atlas contains any. A game reading this file then
		has everything it needs in one place - it can look up 'heart' rather
		than carrying U+E000 around in its source. Only icons that are actually
		in this atlas are listed, so a subsetted export does not promise
		characters it left out.
	*/
	const included = new Set(chars.map((character) => character.id));
	const icons = collectIconMap(project).filter((icon) => included.has(icon.codePoint));
	if (icons.length) {
		metadata.icons = icons.map((icon) => ({
			name: icon.name,
			codePoint: icon.codePoint,
			unicode: icon.unicode,
			escape: icon.escape,
		}));
	}

	return metadata;
}

/**
 * How much of the texture area the glyphs actually occupy.
 * @param {Array} placed - packed rectangles
 * @param {Number} pageSize - page dimension
 * @param {Number} pageCount - number of pages
 * @returns {Number} - 0 to 1
 */
function measureCoverage(placed, pageSize, pageCount) {
	const used = placed.reduce((total, rect) => total + rect.width * rect.height, 0);
	const available = pageSize * pageSize * Math.max(1, pageCount);
	return available ? used / available : 0;
}

/**
 * A file-safe base name derived from the font family and style.
 * @param {Object} project - the project
 * @returns {String}
 */
export function makeAtlasFileBaseName(project) {
	const settings = project.settings.font;
	const raw = `${settings.family || 'font'}-${settings.style || 'regular'}`;
	return raw.replace(/[^a-zA-Z0-9._-]+/g, '') || 'font';
}
