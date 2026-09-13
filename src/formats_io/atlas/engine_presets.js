/**
	ENGINE PRESETS
	--------------
	An atlas is only useful if the engine on the other end can read it, and
	every engine wants a slightly different shape: XML rather than text, a
	power-of-two texture rather than a tight one, a distance field rather than
	coverage.

	A preset is just a set of the export options we already have, chosen for one
	engine, plus the import steps written out. Nothing here invents a file
	format - what an engine cannot read from a BMFont atlas, it says so.

	Deliberately absent: Unity `.asset` and Godot `.tres` files. Both embed
	in-engine GUIDs and version-specific serialisation, so hand-writing them
	produces something that looks right and imports broken. The instructions
	below use each engine's own importer instead.
 */

/**
 * @typedef {Object} EnginePreset
 * @property {String} label - name shown in the dialog
 * @property {String} note - one line on why these settings
 * @property {Object} settings - partial atlas options
 * @property {Function} steps - (files) => Array<String> of import steps
 * @property {String=} caveat - anything the reader will otherwise hit blind
 */

/** The default file naming used in the instructions. */
function describeFiles(fileBaseName, descriptorFormat) {
	const descriptor =
		descriptorFormat === 'xml' ? `${fileBaseName}.xml` : `${fileBaseName}.fnt`;
	return {
		base: fileBaseName,
		descriptor: descriptor,
		json: `${fileBaseName}.json`,
		page: `${fileBaseName}_0.png`,
	};
}

/**
 * Every preset, in the order they are offered.
 * @type {Object<String, EnginePreset>}
 */
export const enginePresets = {
	generic: {
		label: 'Generic BMFont',
		note: 'The plain AngelCode output. Start here if your engine is not listed.',
		settings: {
			fieldType: 'bitmap',
			descriptorFormat: 'text',
			powerOfTwo: true,
			includeKerning: true,
		},
		steps: (files) => [
			`Copy \`${files.descriptor}\` and every \`${files.base}_*.png\` into your project, side by side.`,
			`The descriptor refers to the pages by file name, so keep them in the same folder and do not rename them.`,
			`\`${files.json}\` is optional for a bitmap atlas — it carries the same metrics in em units, which is handy for tooling.`,
		],
	},

	phaser3: {
		label: 'Phaser 3',
		note: 'XML descriptor — that is what Phaser’s bitmap font loader parses.',
		settings: {
			fieldType: 'bitmap',
			descriptorFormat: 'xml',
			powerOfTwo: true,
			includeKerning: true,
		},
		steps: (files) => [
			`Put \`${files.descriptor}\` and \`${files.page}\` in your assets folder.`,
			'In `preload()`:',
			'```js\nthis.load.bitmapFont(\'myFont\', \'assets/' +
				files.page +
				'\', \'assets/' +
				files.descriptor +
				'\');\n```',
			'In `create()`:',
			"```js\nthis.add.bitmapText(16, 16, 'myFont', 'Hello', 32);\n```",
			'The size passed to `bitmapText` is in pixels. Passing the same pixel size this atlas was exported at gives you 1:1 texels and the sharpest result.',
		],
		caveat:
			'Phaser scales bitmap fonts by stretching the texture. If your text changes size a lot, export at the largest size you use, or switch to MSDF and render it with a custom pipeline.',
	},

	pixijs: {
		label: 'PixiJS',
		note: 'XML descriptor, which Pixi’s BitmapFont parser reads directly.',
		settings: {
			fieldType: 'bitmap',
			descriptorFormat: 'xml',
			powerOfTwo: true,
			includeKerning: true,
		},
		steps: (files) => [
			`Add \`${files.descriptor}\` and \`${files.page}\` to your asset bundle.`,
			'```js\nconst font = await Assets.load(\'assets/' + files.descriptor + "');\nconst text = new BitmapText({ text: 'Hello', style: { fontFamily: font.font, fontSize: 32 } });\n```",
			'Pixi resolves the page PNG relative to the descriptor, so both files must sit in the same folder.',
		],
	},

	godot4: {
		label: 'Godot 4',
		note: 'Bitmap + text `.fnt`. Godot imports this natively as a FontFile.',
		settings: {
			fieldType: 'bitmap',
			descriptorFormat: 'text',
			powerOfTwo: false,
			includeKerning: true,
		},
		steps: (files) => [
			`Drop \`${files.descriptor}\` and the \`${files.base}_*.png\` pages into your \`res://\` project folder together.`,
			'Godot picks up the `.fnt` as a **FontFile** resource automatically — no import settings to change.',
			'Assign it to a Label or RichTextLabel through **Theme Overrides → Fonts → Font**.',
			'Set the control’s font size to the pixel size this atlas was exported at. Anything else resamples the texture.',
			'For pixel-perfect text, set the FontFile’s **Rendering → Subpixel Positioning** to *Disabled* and turn *Antialiasing* off in the import dock.',
		],
		caveat:
			'Godot 4 can render MSDF, but only from a dynamic font it converts itself — it has no importer for a pre-made MSDF atlas. So this preset stays on bitmap. If you need MSDF in Godot, feed it the OTF export instead and tick “Multichannel Signed Distance Field” in the font’s import settings.',
	},

	unity_tmp: {
		label: 'Unity (TextMeshPro)',
		note: 'MSDF at a 4px range, the layout TextMeshPro’s shaders expect.',
		settings: {
			fieldType: 'msdf',
			descriptorFormat: 'text',
			pxRange: 4,
			pixelSize: 64,
			pageSize: 1024,
			powerOfTwo: true,
			includeKerning: true,
		},
		steps: (files) => [
			`Import \`${files.page}\` into Unity. In the texture inspector set **Texture Type: Default**, **sRGB (Color Texture): off**, **Alpha Source: None**, **Compression: None** and **Filter Mode: Bilinear**.`,
			'sRGB must be off. A distance field stores distances, not colour — gamma correction bends them and the edges come out soft or wobbly.',
			`\`${files.json}\` is written in the msdf-atlas-gen schema: \`atlas.distanceRange\`, per-glyph \`planeBounds\` and \`atlasBounds\`, metrics normalised to the em.`,
			'Build the TMP_FontAsset from those two files with an importer that reads that schema, then set the material shader to **TextMeshPro/Distance Field**.',
			'On the material, the gradient scale must match the distance range: set it so `_GradientScale` equals `atlas.distanceRange` from the JSON.',
		],
		caveat:
			'Unity has no built-in importer for an external MSDF atlas — the Font Asset Creator only generates its own from a TTF/OTF. You need a small editor script or a community importer that reads the msdf-atlas-gen JSON. That is why the JSON is written in exactly that schema rather than one of our own.',
	},

	love2d: {
		label: 'LÖVE (Love2D)',
		note: 'Bitmap + text `.fnt`, read by `love.graphics.newFont`.',
		settings: {
			fieldType: 'bitmap',
			descriptorFormat: 'text',
			powerOfTwo: false,
			includeKerning: true,
		},
		steps: (files) => [
			`Place \`${files.descriptor}\` and \`${files.page}\` in your game folder.`,
			"```lua\nlocal font = love.graphics.newFont('" + files.descriptor + "')\nlove.graphics.setFont(font)\n```",
			'LÖVE reads the page file name out of the descriptor, relative to the descriptor itself.',
			'For crisp pixel text call `font:setFilter(\'nearest\', \'nearest\')` and draw at whole-pixel positions.',
		],
	},

	defold: {
		label: 'Defold',
		note: 'Bitmap + text `.fnt`, imported as a Font resource.',
		settings: {
			fieldType: 'bitmap',
			descriptorFormat: 'text',
			powerOfTwo: true,
			includeKerning: true,
		},
		steps: (files) => [
			`Drag \`${files.descriptor}\` and \`${files.page}\` into your Defold project.`,
			`Create a **Font** resource, point its *Font* field at \`${files.descriptor}\`, and set *Output Format* to **Type Bitmap**.`,
			'Set the font’s material to `/builtins/fonts/font.material`.',
			'Reference the font from your GUI scene or label component.',
		],
	},

	libgdx: {
		label: 'libGDX',
		note: 'Bitmap + text `.fnt` — the format `BitmapFont` was written for.',
		settings: {
			fieldType: 'bitmap',
			descriptorFormat: 'text',
			powerOfTwo: true,
			includeKerning: true,
		},
		steps: (files) => [
			`Copy \`${files.descriptor}\` and the pages into \`assets/\`.`,
			'```java\nBitmapFont font = new BitmapFont(Gdx.files.internal("' + files.descriptor + '"));\n```',
			'Or load it through an `AssetManager` with a `BitmapFontLoader` if you are managing assets centrally.',
			'`font.getData().setScale(...)` scales the bitmap and will blur it. Export at the size you draw at instead.',
		],
	},
};

/**
 * Looks up one preset.
 * @param {String} id - preset key
 * @returns {EnginePreset | false}
 */
export function getEnginePreset(id) {
	return enginePresets[id] || false;
}

/**
 * Merges a preset's settings over a set of options.
 *
 * A preset only names the settings it actually cares about, so anything it is
 * silent about - the pixel size for a bitmap engine, say - keeps whatever the
 * user had chosen.
 *
 * @param {Object} options - current atlas options
 * @param {String} id - preset key
 * @returns {Object} - a new options object
 */
export function applyEnginePreset(options, id) {
	const preset = getEnginePreset(id);
	if (!preset) return { ...options };
	return { ...options, ...preset.settings };
}

/**
 * Writes the import instructions that ship alongside the atlas.
 *
 * Everything in here is either a setting that was actually used or a step that
 * can be followed in the named engine. Where an engine cannot do the thing
 * people expect, the caveat says so rather than staying quiet.
 *
 * @param {Object} args - what was exported
 * @param {String} args.presetId - which preset was used
 * @param {Object} args.options - the atlas options used
 * @param {Object} args.result - the buildAtlas result
 * @returns {String} - markdown
 */
export function makeImportInstructions({ presetId, options, result }) {
	const preset = getEnginePreset(presetId) || enginePresets.generic;
	const files = describeFiles(result.fileBaseName, options.descriptorFormat);
	const stats = result.stats;

	const lines = [];

	lines.push(`# ${result.fileBaseName} — ${preset.label}`);
	lines.push('');
	lines.push(preset.note);
	lines.push('');

	lines.push('## Files');
	lines.push('');
	lines.push(`| File | What it is |`);
	lines.push(`| --- | --- |`);
	lines.push(
		`| \`${files.descriptor}\` | BMFont descriptor (${
			options.descriptorFormat === 'xml' ? 'XML' : 'text'
		}) — where every glyph sits and how far the pen moves |`
	);
	result.pageFiles.forEach((pageFile) => {
		lines.push(`| \`${pageFile}\` | Texture page, ${stats.pageSize}×${stats.pageSize} px |`);
	});
	lines.push(
		`| \`${files.json}\` | Metrics in em units${
			stats.fieldType === 'msdf' ? ' — **required for MSDF**, it carries the distance range' : ' (optional)'
		} |`
	);
	lines.push('');

	lines.push('## Settings used');
	lines.push('');
	lines.push(`- Field type: **${stats.fieldType === 'msdf' ? 'MSDF' : 'Bitmap'}**`);
	if (stats.fieldType === 'msdf') lines.push(`- Distance range: **${stats.pxRange} px**`);
	lines.push(`- Em size: **${options.pixelSize} px**`);
	lines.push(`- Texture: **${stats.pageCount} × ${stats.pageSize}px**, ${Math.round(stats.coverage * 100)}% used`);
	lines.push(`- Glyphs: **${stats.glyphCount}**`);
	lines.push(`- Kerning pairs: **${stats.kerningCount}**`);
	lines.push('');

	lines.push('## Import');
	lines.push('');
	let stepNumber = 0;
	preset.steps(files).forEach((step) => {
		/*
			Fenced code belongs to the step above it, so it is indented into
			that list item rather than being numbered as a step of its own -
			otherwise the numbering skips.
		*/
		if (step.startsWith('```')) {
			lines.push('');
			step.split('\n').forEach((codeLine) => lines.push(`   ${codeLine}`));
			lines.push('');
		} else {
			stepNumber++;
			lines.push(`${stepNumber}. ${step}`);
		}
	});
	lines.push('');

	if (preset.caveat) {
		lines.push('## Worth knowing');
		lines.push('');
		lines.push(preset.caveat);
		lines.push('');
	}

	return lines.join('\n');
}
