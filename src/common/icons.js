/**
	LINE ICONS
	----------
	One icon system for the whole app, replacing three that disagreed with each
	other: filled polygons in common/graphics.js, two-tone fill-plus-outline
	shapes in edit_canvas/tools/tools.js, and multi-coloured markup in
	panels/action_buttons.js with accentColors baked into the SVG string.

	THE SPEC. Every icon in this file obeys it, and a new one must too.

		- 24 x 24 viewBox. Draw on the 24 grid whatever size it renders at.
		- Stroke, never fill. `fill="none"`, `stroke="currentColor"`.
		- stroke-width 2, stroke-linecap round, stroke-linejoin round. That is
		  what makes the set read as one hand: the corners and ends are the
		  family resemblance, more than the shapes are.
		- Keep 2 units of air inside the box, so the drawing lives in a 20 x 20
		  area and nothing touches the edge.
		- Align to whole units, and to half units only for a stroke centre.

		- MINIMAL. Two drawn elements, three at the absolute most. These render
		  at 20px and sit in rows of eight; a third and fourth element stops
		  being detail and becomes noise, and the icon reads as a smudge rather
		  than as a thing. When an icon needs more, the idea is too big for an
		  icon and belongs in the label.

		- ROUNDED. Corners are round, not square: `rx` of 2-3 on a rectangle, a
		  circle in place of a square wherever the meaning survives it, and no
		  sharp interior angle where a curve will do. A right angle reads as
		  older software, and it fights the round caps every stroke already has.

	COLOUR. currentColor, always - so one `color` in CSS drives resting, hover,
	selected and disabled, and the icon follows the theme. An icon that carries
	its own colour cannot do any of that, which is why the previous three sets
	each needed their own state handling and none of them themed.

	The rare exception is a shape that is genuinely filled in the design, like
	the half-disc that distinguishes fill mode from outline mode. Those carry
	`fill="currentColor" stroke="none"` on that one element and are noted below.
 */

/** The one place the family resemblance is defined. */
const ICON_ATTRS = `fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"`;

/** Every icon is stroke 2 unless it is listed here. See `iconStrokeWidth`. */
const DEFAULT_STROKE = 2;

/**
 * Per-icon stroke overrides.
 *
 * An icon with more elements than the spec allows needs a lighter stroke to
 * survive at 20px, because the gaps between its parts shrink with the drawing
 * while the stroke does not. Keep this map as short as it is: every entry is a
 * small break in the family resemblance, and is only worth it when the
 * alternative is an icon that fills in.
 */
const iconStrokeWidth = {};

/**
	CORNER SMOOTHING
	----------------
	An SVG `<rect rx>` corner is a quarter circle: it meets the straight edge at
	a point where the curvature jumps from zero to 1/r all at once, and the eye
	reads that discontinuity as a slight pinch. Apple's corners - and Figma's
	corner smoothing slider - instead spread the turn over a longer stretch of
	the edge and ease into it, so curvature is continuous the whole way round.

	This approximates that with one cubic per corner:

		- the corner occupies SPAN x r along each edge rather than r, so the
		  curve starts turning earlier and the flat run is shorter;
		- the control points sit at PULL x span from the corner point rather
		  than the 0.4477 a true circle needs, so the middle of the curve stays
		  tighter while the ends stay flatter.

	SPAN 1.35 and PULL 0.28 land close to the iOS squircle by eye at icon sizes.
	Exactness is not the point - continuity is.

	The chrome does this in CSS instead, with `corner-shape: squircle`, which
	only Chromium supports so far; there it degrades to a plain circular radius.
	Here the geometry is in the path, so every browser gets the same corner.
 */
const SPAN = 1.35;
const PULL = 0.28;

/**
 * A rounded rectangle with continuous, Apple-style corners.
 *
 * @param {Number} x - left
 * @param {Number} y - top
 * @param {Number} w - width
 * @param {Number} h - height
 * @param {Number} r - nominal corner radius
 * @returns {String} - the `d` of a closed path
 */
export function squircle(x, y, w, h, r) {
	/* A corner cannot eat more than half an edge, or opposite corners collide. */
	const a = Math.min(r * SPAN, w / 2, h / 2);
	const p = a * PULL;
	const [x2, y2] = [x + w, y + h];

	return [
		`M${x + a} ${y}`,
		`H${x2 - a}`,
		`C${x2 - p} ${y} ${x2} ${y + p} ${x2} ${y + a}`,
		`V${y2 - a}`,
		`C${x2} ${y2 - p} ${x2 - p} ${y2} ${x2 - a} ${y2}`,
		`H${x + a}`,
		`C${x + p} ${y2} ${x} ${y2 - p} ${x} ${y2 - a}`,
		`V${y + a}`,
		`C${x} ${y + p} ${x + p} ${y} ${x + a} ${y}`,
		`Z`,
	].join('');
}

/**
 * Shorthand: a squircle as a ready-to-use <path> element.
 * @returns {String}
 */
function squirclePath(x, y, w, h, r) {
	return `<path d="${squircle(x, y, w, h, r)}"/>`;
}

/**
 * A closed polygon whose corners are rounded in the geometry.
 *
 * `stroke-linejoin: round` only rounds a join by half the stroke width, which
 * at stroke 2 is a 1-unit cap - enough to stop a corner looking cut, nowhere
 * near enough to read as a radius. This cuts back along both edges and draws
 * the corner, so the roundness is a real, tunable dimension.
 *
 * The corner curve uses the same easing idea as `squircle`: control points at
 * PULL of the way to the vertex rather than the 2/3 a quadratic would use, so
 * the curve leaves each edge flat and does its turning in the middle.
 *
 * @param {Array<Array<Number>>} points - [[x, y], ...] in order
 * @param {Array<Number>|Number} radii - one radius, or one per point
 * @returns {String} - the `d` of a closed path
 */
export function roundedPolygon(points, radii) {
	const n = points.length;
	const r = (i) => (Array.isArray(radii) ? radii[i] : radii);
	const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
	const len = (v) => Math.hypot(v[0], v[1]);
	/** Point `d` units from `v` towards `to`. */
	const along = (v, to, d) => {
		const dir = sub(to, v);
		const l = len(dir) || 1;
		return [v[0] + (dir[0] / l) * d, v[1] + (dir[1] / l) * d];
	};
	/** Control point, PULL of the way from `p` back to the vertex. */
	const ctrl = (p, v) => [p[0] + (v[0] - p[0]) * (1 - PULL), p[1] + (v[1] - p[1]) * (1 - PULL)];
	const f = (num) => Math.round(num * 1000) / 1000;

	let d = '';
	for (let i = 0; i < n; i++) {
		const prev = points[(i - 1 + n) % n];
		const v = points[i];
		const next = points[(i + 1) % n];

		/* Never eat more than half an edge, or two corners meet and invert. */
		const cut = Math.min(r(i), len(sub(prev, v)) / 2, len(sub(next, v)) / 2);
		const a = along(v, prev, cut);
		const b = along(v, next, cut);
		const c1 = ctrl(a, v);
		const c2 = ctrl(b, v);

		d += i === 0 ? `M${f(a[0])} ${f(a[1])}` : `L${f(a[0])} ${f(a[1])}`;
		d += `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(b[0])} ${f(b[1])}`;
	}

	return d + 'Z';
}

/**
 * @type {Object<string, string>}
 * Path markup only - the wrapper supplies the box and the stroke family.
 */
export const lineIcons = {};

/**
 * Wraps icon markup in a sized SVG.
 *
 * @param {String} name - key in lineIcons
 * @param {Number} size - rendered px; the viewBox stays 24
 * @returns {String} - SVG markup, or an empty string for an unknown name
 */
export function makeLineIcon(name, size = 20) {
	const content = lineIcons[name];
	if (!content) {
		console.warn(`makeLineIcon: no icon named "${name}"`);
		return '';
	}

	const stroke = iconStrokeWidth[name] || DEFAULT_STROKE;

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" ${ICON_ATTRS} stroke-width="${stroke}" aria-hidden="true" focusable="false" pointer-events="none">${content}</svg>`;
}

/**
 * Whether an icon exists, for call sites migrating off the old sets.
 * @param {String} name
 * @returns {Boolean}
 */
export function hasLineIcon(name) {
	return !!lineIcons[name];
}

/**
 * Wraps arbitrary icon markup in the same box and stroke family.
 *
 * For the handful of icons that are generated per call rather than looked up
 * by name. Use `makeLineIcon` for everything else - an icon that can be named
 * should be in the map, where the contact sheet can find it.
 *
 * @param {String} content - path markup drawn on the 24 grid
 * @param {Number} size - rendered px
 * @returns {String} - SVG markup
 */
export function wrapLineIcon(content, size = 20) {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" ${ICON_ATTRS} stroke-width="${DEFAULT_STROKE}" aria-hidden="true" focusable="false" pointer-events="none">${content}</svg>`;
}

// --------------------------------------------------------------
// Canvas tools
// --------------------------------------------------------------

/*
	The pointer, four points and no tail - the macOS shape rather than the
	Windows one. The version with a leg needs seven points and a 2-unit notch,
	and at 20px that notch closes up into a dark corner, so the icon reads as a
	blob with a spike. This one keeps its silhouette all the way down.
*/
lineIcons.resize = `<path d="${roundedPolygon(
	[
		[5.5, 2.5], // tip
		[19.5, 12], // leading corner
		[12, 13.5], // notch
		[9, 20.5], // trailing corner
	],
	[1.6, 2.4, 2, 2.4]
)}"/>`;

/* A curve between two anchors. Round anchors, not square - see ROUNDED. */
lineIcons.pathEdit = `<path d="M6 17.5C6 11 18 13 18 6.5"/><circle cx="5" cy="19" r="2.5"/><circle cx="19" cy="5" r="2.5"/>`;

/* The same curve, gaining or losing a point. */
lineIcons.pathAddPoint = `<path d="M3.5 18.5C4.5 10 10 4.5 18.5 3.5"/><path d="M17 15v7M13.5 18.5h7"/>`;

lineIcons.pathRemovePoint = `<path d="M3.5 18.5C4.5 10 10 4.5 18.5 3.5"/><path d="M13.5 18.5h7"/>`;

/*
	A control handle: the arm off an anchor, with the round grip on its end.
	The same round anchor pathEdit uses, so the two read as one idea.
*/
lineIcons.handle = `<circle cx="5" cy="19" r="2.5"/><path d="M6.8 17.2L15 9"/><circle cx="17.5" cy="6.5" r="2.5"/>`;

/* A selection frame and the corner you pull. */
lineIcons.pathResize = squirclePath(3, 3, 18, 18, 4) + `<path d="M10 17h4a3 3 0 0 0 3-3v-4"/>`;

/*
	r 3, not 4. A smoothed corner spends SPAN x r along the edge, so on a box
	only 13 units tall r 4 left barely two straight units between the corners
	and the rectangle read as a capsule - which is the one thing this icon has
	to not look like, with an ellipse tool sitting next to it.
*/
lineIcons.newRectangle = squirclePath(3, 5.5, 18, 13, 3);

lineIcons.newOval = `<ellipse cx="12" cy="12" rx="8.5" ry="7"/>`;

/*
	The pen tool: a nib, tip down-left, with its vent hole.

	The previous one was a small triangle with a line running off to the corner,
	which read as a pencil or a paper plane depending on the size. This is the
	nib silhouette every vector tool uses - a long kite, wide at the shoulders
	and tapering to a point at each end.

	Corners are rounded in the geometry like the pointer, and for the same
	reason: the tip stays near-sharp because it is the part that says where the
	pen puts a point, while the shoulders take a full radius.
*/
/*
	The pen tool: a nib, with an anchor point and its two control handles above
	it. Supplied by the owner rather than drawn here, after several attempts at
	a nib alone failed to read as anything but a map pin or a paper dart - the
	handles are what say "bezier" rather than "pen", which is the actual job.

	It carries eight elements against the spec's three, and that is a deliberate
	exception: the extra parts are the meaning, not decoration. The cost is the
	stroke - at 2 the handles fill in at 20px, so this icon alone runs at 1.5.
*/
lineIcons.newPath = [
	'M10.75 22.5H13.27C14.23 22.5 14.85 21.82 14.67 20.99L14.26 19.18H9.76L9.35 20.99C9.17 21.77 9.85 22.5 10.75 22.5Z',
	'M14.26 19.17L15.99 17.63C16.96 16.77 17 16.17 16.23 15.2L13.18 11.33C12.54 10.52 11.49 10.52 10.85 11.33L7.8 15.2C7.03 16.17 7.03 16.8 8.04 17.63L9.77 19.17',
	'M12.01 11.12V13.65',
	'M11.15 5.19L10.37 4.41C9.9 3.94 9.9 3.18 10.37 2.71L11.15 1.93C11.62 1.46 12.38 1.46 12.85 1.93L13.63 2.71C14.1 3.18 14.1 3.94 13.63 4.41L12.85 5.19C12.38 5.66 11.62 5.66 11.15 5.19Z',
	'M19.45 9.81H20.55C21.21 9.81 21.75 10.35 21.75 11.01V12.11C21.75 12.77 21.21 13.31 20.55 13.31H19.45C18.79 13.31 18.25 12.77 18.25 12.11V11.01C18.25 10.35 18.79 9.81 19.45 9.81Z',
	'M4.55 9.81H3.45C2.79 9.81 2.25 10.35 2.25 11.01V12.11C2.25 12.77 2.79 13.31 3.45 13.31H4.55C5.21 13.31 5.75 12.77 5.75 12.11V11.01C5.75 10.35 5.21 9.81 4.55 9.81Z',
	'M18.54 10.1L13.24 4.8',
	'M5.46 10.1L10.76 4.8',
]
	.map((d) => `<path d="${d}"/>`)
	.join('');

iconStrokeWidth.newPath = 1.5;

/* Pencil over the pixel it lands on. */
lineIcons.pixelPen =
	`<path d="M20.2 6.8a2 2 0 0 0-2.8-2.8L9 12.4V15h2.6z"/>` + squirclePath(3, 16, 5, 5, 1.6);

/* Two sidebearing walls, and the space between them. */
lineIcons.kern = `<path d="M6 4v16M18 4v16"/><path d="M10.5 12h3"/>`;

// --------------------------------------------------------------
// Canvas view controls
// --------------------------------------------------------------

lineIcons.zoomIn = `<circle cx="10.5" cy="10.5" r="7"/><path d="M20.5 20.5l-5-5M10.5 7.5v6M7.5 10.5h6"/>`;

lineIcons.zoomOut = `<circle cx="10.5" cy="10.5" r="7"/><path d="M20.5 20.5l-5-5M7.5 10.5h6"/>`;

/* Zoom to fit: the four corners of the frame the artwork lands in. */
lineIcons.zoomEm = `<path d="M4 9V6a2 2 0 0 1 2-2h3M15 4h3a2 2 0 0 1 2 2v3M20 15v3a2 2 0 0 1-2 2h-3M9 20H6a2 2 0 0 1-2-2v-3"/>`;

/* Actual size: an em square holding one pixel. */
lineIcons.zoom1to1 = squirclePath(3, 3, 18, 18, 5) + squirclePath(9.5, 9.5, 5, 5, 1.6);

/* Move, in four directions. */
lineIcons.pan = `<path d="M12 3.5v17M3.5 12h17"/><path d="M9 6.5l3-3 3 3M9 17.5l3 3 3-3M6.5 9l-3 3 3 3M17.5 9l3 3-3 3"/>`;

/*
	Fill versus outline. The half-disc is the one deliberate fill in the set:
	the icon's whole job is to show the difference between filled and not, so
	drawing it in outline only would say nothing.
*/
lineIcons.displayModeFilled = `<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" stroke="none"/>`;

lineIcons.displayModeOutlined = `<circle cx="12" cy="12" r="8.5"/>`;

/* A window, and an arrow leaving it or coming back to it. */
lineIcons.openLivePreview = `<path d="M19 13.5V18a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3h4.5"/><path d="M15 3h6v6M21 3l-8.5 8.5"/>`;

lineIcons.closeLivePreview = `<path d="M19 13.5V18a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3h4.5"/><path d="M21 9h-6V3M15 9l6-6"/>`;

lineIcons.livePreview = lineIcons.openLivePreview;

/* The same box-with-an-arrow-out: it is the external-link glyph. */
lineIcons.externalLink = lineIcons.openLivePreview;

// --------------------------------------------------------------
// Sidebar panel sections
// --------------------------------------------------------------

lineIcons.panel_layers = `<path d="M12 3.5l8.5 4.7-8.5 4.7-8.5-4.7z"/><path d="M3.5 13.3l8.5 4.7 8.5-4.7"/>`;

lineIcons.panel_guides = `<path d="M3 8.5h18"/><path d="M8.5 3v18"/>`;

lineIcons.panel_anchors = `<circle cx="12" cy="12" r="2.5"/><path d="M12 3v5.5M12 15.5V21M3 12h5.5M15.5 12H21"/>`;

lineIcons.panel_transforms =
	squirclePath(3, 3, 13, 13, 3) + `<path d="M13.5 21H18a3 3 0 0 0 3-3v-4.5"/>`;

lineIcons.panel_contextCharacters = `<path d="M4 5v14M20 5v14"/>` + squirclePath(8.5, 6, 7, 12, 2);

lineIcons.panel_history = `<path d="M3.6 10.5a8.5 8.5 0 1 1 .4 5"/><path d="M3 20v-5h5"/><path d="M12 7.5V12l3 2"/>`;

lineIcons.panel_attributes = `<path d="M4 8h16M4 16h16"/><circle cx="9" cy="8" r="2.5"/><circle cx="15" cy="16" r="2.5"/>`;

lineIcons.panel_qualityChecks = `<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.3l2.4 2.4 4.6-5"/>`;

lineIcons.panel_characterInfo = `<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.7v.3"/>`;

/* The same circle as the info mark, with the bar and the dot swapped. */
lineIcons.alert = `<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5.5M12 16.3v.3"/>`;

lineIcons.panel_view = `<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>`;

/* The same eye, wherever something is a show-or-hide rather than a panel. */
lineIcons.eye = lineIcons.panel_view;

// --------------------------------------------------------------
// Commands
// --------------------------------------------------------------

lineIcons.command_save = `<path d="M12 3v11M8 10l4 4 4-4"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>`;

lineIcons.command_export = `<path d="M12 14V3M8 7l4-4 4 4"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>`;

lineIcons.command_icons = squirclePath(3.5, 3.5, 7, 7, 2) + squirclePath(13.5, 13.5, 7, 7, 2);

lineIcons.command_newTab = squirclePath(3, 3, 18, 18, 4) + `<path d="M12 8.5v7M8.5 12h7"/>`;

/*
	A sheet with a letter on it. The noun, not the verb: what the user has is a
	PICTURE of an alphabet, and the tracing is what the label says.

	Portrait, where command_newTab's frame is square, because a page is - and
	that is what keeps the two apart at 20px, along with a letter inside rather
	than a plus. Against page_characters, which is the same A bare and nearly
	twice this size, the frame is the whole difference and it is the meaning.
*/
lineIcons.command_specimenSheet =
	squirclePath(4, 3, 16, 18, 3) + `<path d="M8 17L12 7l4 10M10 13.5h4"/>`;

lineIcons.command_info = lineIcons.panel_characterInfo;

lineIcons.command_help = `<circle cx="12" cy="12" r="8.5"/><path d="M9.7 9.6a2.4 2.4 0 0 1 4.7.7c0 1.6-2.4 2.4-2.4 2.4M12 16.3v.3"/>`;

/* Advance width snapping out to the edges of the drawing. */
lineIcons.command_autoFit = `<path d="M4 4v16M20 4v16"/><path d="M9.5 9.5L7 12l2.5 2.5M14.5 9.5L17 12l-2.5 2.5"/>`;

lineIcons.command_verticalBar = `<path d="M12 3.5v17"/>`;

lineIcons.command_horizontalBar = `<path d="M3.5 12h17"/>`;

lineIcons.command_crossProjectActions =
	squirclePath(3, 3, 12, 12, 3) + `<path d="M9.5 21H18a3 3 0 0 0 3-3V9.5"/>`;

// --------------------------------------------------------------
// Pages
// --------------------------------------------------------------

lineIcons.page_overview = squirclePath(3, 3, 7.5, 18, 3) + squirclePath(13.5, 3, 7.5, 8, 3);

lineIcons.page_characters = `<path d="M5 20L12 4l7 16"/><path d="M8.2 14h7.6"/>`;

lineIcons.page_components = squirclePath(3, 3, 11, 11, 3) + squirclePath(10, 10, 11, 11, 3);

/* An f and an i, joined - the ligature everyone recognises. */
lineIcons.page_ligatures = `<path d="M5 20V8a3.5 3.5 0 0 1 5.5-2.9M3.5 12h8"/><path d="M16.5 20v-8M16.5 7.5v.3"/>`;

lineIcons.page_kerning = lineIcons.kern;

lineIcons.page_livePreview = squirclePath(3, 4, 18, 13, 3) + `<path d="M12 17v3M8.5 20h7"/>`;

lineIcons.page_globalActions = `<path d="M13.5 3L5.5 13.5H11l-.5 7.5 8-10.5H13z"/>`;

lineIcons.page_settings = `<path d="M6 21v-6M6 11V3M12 21v-9M12 8V3M18 21v-4M18 13V3"/><path d="M3.5 15h5M9.5 8h5M15.5 13h5"/>`;

lineIcons.page_help = lineIcons.command_help;

// Settings tabs. Three things a project is: its file, its font, this app.
lineIcons.settings_project = `<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h3.6a2 2 0 0 1 1.4.6l1.4 1.4h4.6A2.5 2.5 0 0 1 20 9.5v7A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-9Z"/>`;
lineIcons.settings_font = `<path d="M4.5 18L10 6l5.5 12"/><path d="M6.8 13.2h6.4"/><path d="M15.5 12.5c1.6-1.4 4-.9 4 1.3V18M19.5 15c-1.5-.5-4-.4-4 1.5s3 1.8 4 .4"/>`;
lineIcons.settings_app = `<path d="M3.5 7A2.5 2.5 0 0 1 6 4.5h12A2.5 2.5 0 0 1 20.5 7v10a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 17V7Z"/><path d="M3.5 9.5h17"/><path d="M6.5 7h.01M9 7h.01"/>`;

/*
	Three sliders: the settings mark, wherever thresholds hide behind one.
	Declared here rather than beside the panel icons - these are plain
	assignments, so an alias placed above its source gets undefined.
*/
lineIcons.settings = lineIcons.page_settings;

lineIcons.page_about = lineIcons.panel_characterInfo;

lineIcons.page_exportFont = `<path d="M4 15L8.5 5l4.5 10M5.7 12h5.6"/><path d="M18 4v10M15 11l3 3 3-3"/>`;

lineIcons.page_exportSVG = `<path d="M12 13V3M8.5 9.5L12 13l3.5-3.5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>`;

lineIcons.page_importAndExport = `<path d="M8 3v10M4.5 9.5L8 13l3.5-3.5"/><path d="M16 21V11M12.5 14.5L16 11l3.5 3.5"/>`;

// --------------------------------------------------------------
// Small, general purpose
// --------------------------------------------------------------

lineIcons.back = `<path d="M15 4.5L7.5 12l7.5 7.5"/>`;

lineIcons.more = `<circle cx="5.5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18.5" cy="12" r="1.6"/>`;

lineIcons.selected = `<path d="M5 12.6l4.6 4.6L19 6.8"/>`;

/*
	Deliberately empty. option-chooser draws this in the slot where the tick
	goes for the row that is not chosen, so it has to occupy the space without
	putting a mark in it - a hollow circle there reads as a radio button the
	user can click, which is not what that column is.
*/
lineIcons.notSelected = `<path d="M12 12h.01" stroke="none"/>`;

lineIcons.keyboard =
	squirclePath(2.5, 6, 19, 12, 3) + `<path d="M7 10.5h.3M11 10.5h.3M15 10.5h.3M8.5 14.5h7"/>`;

/* A tag on a string: the name hung off a thing, which is what a label is. */
lineIcons.label = `<path d="M11.5 3.5H5.5A2 2 0 0 0 3.5 5.5v6a2 2 0 0 0 .6 1.4l7 7a2 2 0 0 0 2.8 0l6-6a2 2 0 0 0 0-2.8l-7-7a2 2 0 0 0-1.4-.6Z"/><path d="M7.5 7.5h.01"/>`;

// --------------------------------------------------------------
// Panel actions - clipboard and history
// --------------------------------------------------------------

const clipboardBody = `<path d="M9 4.5H7a2.5 2.5 0 0 0-2.5 2.5v12A2.5 2.5 0 0 0 7 21.5h10a2.5 2.5 0 0 0 2.5-2.5V7A2.5 2.5 0 0 0 17 4.5h-2"/>`;

lineIcons.copy =
	squirclePath(9, 3, 12, 12, 3) +
	`<path d="M15 17.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.5"/>`;

lineIcons.paste = clipboardBody + squirclePath(8.5, 2.5, 7, 4, 1.5);

lineIcons.clearClipboard = clipboardBody + `<path d="M9.5 11.5l5 5M14.5 11.5l-5 5"/>`;

lineIcons.pastePathsFromAnotherGlyph =
	clipboardBody + `<path d="M8.5 13.5h7M13 11l2.5 2.5L13 16"/>`;

lineIcons.pastePathsFromAnotherProject =
	clipboardBody + `<path d="M15.5 8.5h5v5"/><path d="M20.5 8.5L14 15"/>`;

lineIcons.undo = `<path d="M3.5 8h11a5.75 5.75 0 0 1 0 11.5H8"/><path d="M7 4.5L3.5 8 7 11.5"/>`;

lineIcons.redo = `<path d="M20.5 8h-11a5.75 5.75 0 0 0 0 11.5H16"/><path d="M17 4.5L20.5 8 17 11.5"/>`;

// --------------------------------------------------------------
// Panel actions - shapes
// --------------------------------------------------------------

lineIcons.addShape = squirclePath(3, 3, 13, 13, 3) + `<path d="M18 14v6.5M14.75 17.25h6.5"/>`;

/*
	A component instance is two shapes, because it is the same outline appearing
	somewhere else. The old pair said the same thing in green versus grey, which
	the contrast rules rule out - a state cannot be carried by hue alone.
*/
lineIcons.addComponentInstance =
	squirclePath(2.5, 2.5, 11, 11, 3) +
	squirclePath(8, 8, 11, 11, 3) +
	`<path d="M20 15.5v5M17.5 18h5"/>`;

lineIcons.deleteShape = squirclePath(3, 3, 13, 13, 3) + `<path d="M14.75 17.25h6.5"/>`;

lineIcons.switchPathComponent = `<path d="M3.5 8.5h13M13 5l3.5 3.5L13 12"/><path d="M20.5 15.5h-13M11 12l-3.5 3.5L11 19"/>`;

lineIcons.linkToGlyph =
	`<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.6 1.6"/>` +
	`<path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.6-1.6"/>`;

/* Rounding: a square corner becoming a curve. */
lineIcons.round = `<path d="M4 20V10.5A6.5 6.5 0 0 1 10.5 4H20"/><path d="M4 20h1M8 20h1M12 20h1M16 20h1M20 20h.01M20 16v1M20 12v1M20 8v1"/>`;

/*
	The Transform panel's field marks. Each one sits inside its own input,
	saying what the number is - which is what lets that panel drop the row of
	label above every field.
*/

/* Advance width: the span between two walls. */
lineIcons.advanceWidth =
	`<path d="M4 4v16M20 4v16"/>` +
	`<path d="M8 12h8"/><path d="M10.5 9.5L8 12l2.5 2.5M13.5 9.5L16 12l-2.5 2.5"/>`;

/* An angle: two arms, and the arc that measures between them. */
lineIcons.angle = `<path d="M4.5 19.5V4.5"/><path d="M4.5 19.5h15"/><path d="M11.5 19.5a7 7 0 0 0-7-7"/>`;

/* Skew: a rectangle leaning off its own base. */
lineIcons.skew = `<path d="M4 20h8l8-13h-8z"/>`;

/* The same lean, measured across the top rather than as an angle. */
lineIcons.skewDistance =
	`<path d="M4 20h8l8-13h-8z"/>` + `<path d="M12 4h8"/><path d="M12 2.5v3M20 2.5v3"/>`;

/* Offset: the same outline again, further out. */
lineIcons.offsetPath =
	`<path d="M8 8h8v8H8z"/>` +
	`<path d="M4.5 6A1.5 1.5 0 0 1 6 4.5h12A1.5 1.5 0 0 1 19.5 6v12a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 18z"/>`;

/* Commit - what the Apply buttons carry now that they are 28px squares. */
lineIcons.check = `<path d="M5 12.5l4.5 4.5L19 7.5"/>`;

/*
	A quarter turn. An arc most of the way round a circle, with the gap and
	the arrowhead at the top: the head points the way the shape travels, so
	the direction is read from the head rather than from which way the arc
	happens to be drawn.
*/
lineIcons.rotateClockwise = `<path d="M12 5a7.5 7.5 0 1 0 7.5 7.5"/><path d="M9 8L12 5 9 2"/>`;

lineIcons.flipHorizontal = `<path d="M12 3v18"/><path d="M9 7.5L4.5 12 9 16.5zM15 7.5L19.5 12 15 16.5z"/>`;

lineIcons.flipVertical = `<path d="M3 12h18"/><path d="M7.5 9L12 4.5 16.5 9zM7.5 15L12 19.5 16.5 15z"/>`;

lineIcons.transforms = lineIcons.panel_transforms;

lineIcons.exportGlyphSVG = lineIcons.page_exportSVG;

lineIcons.importGlyphSVG = `<path d="M12 3.5v10M8.5 10L12 13.5 15.5 10"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>`;

const trash = `<path d="M4 6.5h16"/><path d="M9.5 6.5V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v1.5"/><path d="M6.5 6.5l.8 12.6a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9l.8-12.6"/>`;

lineIcons.deleteGlyph = trash;
lineIcons.delete = trash;

lineIcons.edit = `<path d="M20.2 6.8a2.12 2.12 0 0 0-3-3L4 17v3h3z"/><path d="M14.5 6.5l3 3"/>`;

// --------------------------------------------------------------
// Panel actions - boolean combine
//
// These are the one place in the set where a fill is doing the work. Two
// outlines alone cannot say which region survives the operation, which is the
// entire content of the icon, so the result is filled and the operands are
// drawn around it.
// --------------------------------------------------------------

const boolA = `<path d="M4 4h10v10H4z"/>`;
const boolB = `<path d="M10 10h10v10H10z"/>`;
const boolFill = (d, rule = '') =>
	`<path d="${d}" fill="currentColor" stroke="none"${rule ? ` fill-rule="${rule}"` : ''}/>`;
const unionOutline = 'M4 4h10v6h6v10H10v-6H4z';

lineIcons.combine_unite = boolFill(unionOutline) + `<path d="${unionOutline}"/>`;

lineIcons.combine_intersect = boolA + boolB + boolFill('M10 10h4v4h-4z');

lineIcons.combine_subtract = boolFill('M4 4h10v6h-4v4H4z') + boolB;

lineIcons.combine_exclude =
	boolFill(`${unionOutline} M10 10h4v4h-4z`, 'evenodd') + `<path d="${unionOutline}"/>`;

lineIcons.combine_divide = boolA + boolB + `<path d="M10 10h4v4h-4z"/>`;

// --------------------------------------------------------------
// Panel actions - layer order
// --------------------------------------------------------------

lineIcons.moveLayerUp = `<path d="M12 20.5V4.5M6 10.5L12 4.5l6 6"/>`;
lineIcons.moveLayerDown = `<path d="M12 3.5v16M6 13.5l6 6 6-6"/>`;
lineIcons.moveLayerTop = `<path d="M3.5 3.5h17"/><path d="M12 21V8.5M6.5 14L12 8.5l5.5 5.5"/>`;
lineIcons.moveLayerBottom = `<path d="M3.5 20.5h17"/><path d="M12 3v12.5M6.5 10L12 15.5 17.5 10"/>`;

// --------------------------------------------------------------
// Panel actions - alignment
//
// The rule is the edge things line up on; the two bars are the things. Unequal
// bars on purpose: two equal ones would look aligned whatever the setting.
// --------------------------------------------------------------

lineIcons.align_left =
	`<path d="M3.5 3v18"/>` + squirclePath(6.5, 6, 13, 4, 1.5) + squirclePath(6.5, 14, 8, 4, 1.5);
lineIcons.align_center =
	`<path d="M12 3v18"/>` + squirclePath(5.5, 6, 13, 4, 1.5) + squirclePath(8, 14, 8, 4, 1.5);
lineIcons.align_right =
	`<path d="M20.5 3v18"/>` + squirclePath(4.5, 6, 13, 4, 1.5) + squirclePath(9.5, 14, 8, 4, 1.5);
lineIcons.align_top =
	`<path d="M3 3.5h18"/>` + squirclePath(6, 6.5, 4, 13, 1.5) + squirclePath(14, 6.5, 4, 8, 1.5);
lineIcons.align_middle =
	`<path d="M3 12h18"/>` + squirclePath(6, 5.5, 4, 13, 1.5) + squirclePath(14, 8, 4, 8, 1.5);
lineIcons.align_bottom =
	`<path d="M3 20.5h18"/>` + squirclePath(6, 4.5, 4, 13, 1.5) + squirclePath(14, 9.5, 4, 8, 1.5);

// --------------------------------------------------------------
// Panel actions - path points
// --------------------------------------------------------------

lineIcons.resetPathPoint = `<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20.5 3.5v4.5H16"/><circle cx="12" cy="12" r="2.5"/>`;
lineIcons.deletePathPoint = `<circle cx="9.5" cy="12" r="3.5"/><path d="M15.5 12h6"/>`;
lineIcons.insertPathPoint = `<circle cx="9.5" cy="12" r="3.5"/><path d="M18.5 9v6M15.5 12h6"/>`;
lineIcons.mergePathPoints = `<circle cx="6.5" cy="12" r="3"/><circle cx="17.5" cy="12" r="3"/><path d="M10 12h4"/>`;
lineIcons.selectNextPathPoint = `<circle cx="8" cy="12" r="3"/><path d="M13.5 12h7.5M18 9l3 3-3 3"/>`;
lineIcons.selectPreviousPathPoint = `<circle cx="16" cy="12" r="3"/><path d="M10.5 12H3M6 9l-3 3 3 3"/>`;

// --------------------------------------------------------------
// Panel actions - kerning and metrics
// --------------------------------------------------------------

lineIcons.createNewKernGroup = `<path d="M4 4v16M13 4v16"/><path d="M18.5 9v6M15.5 12h6"/>`;
lineIcons.deleteSingleLetterPair = `<path d="M4 4v16M13 4v16"/><path d="M15.5 12h6"/>`;
lineIcons.findSingleLetterPair = `<path d="M4 4v16M11 4v16"/><circle cx="17" cy="11.5" r="3.5"/><path d="M19.5 14l2.5 2.5"/>`;

/* A key, because a metric key is what one glyph's spacing is locked to. */
lineIcons.metricKeys = `<circle cx="7.5" cy="12" r="4"/><path d="M11.5 12h9.5M18 12v3.5M21 12v2.5"/>`;

lineIcons.default = `<circle cx="12" cy="12" r="8.5"/>`;
lineIcons.test = `<path d="M9 3.5v6L4.3 18a2.2 2.2 0 0 0 1.9 3.3h11.6a2.2 2.2 0 0 0 1.9-3.3L15 9.5v-6"/><path d="M8 3.5h8"/>`;

// --------------------------------------------------------------
// Project hub
//
// The hub rail and its buttons had their own fifth set of icons, written as
// 16x16 filled paths inside open_project.js. Same names, drawn to the spec.
// --------------------------------------------------------------

lineIcons.clock = `<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3.2 1.9"/>`;

lineIcons.sparkle = `<path d="M12 3l1.9 5.1a3 3 0 0 0 2 2L21 12l-5.1 1.9a3 3 0 0 0-2 2L12 21l-1.9-5.1a3 3 0 0 0-2-2L3 12l5.1-1.9a3 3 0 0 0 2-2z"/>`;

lineIcons.plus = `<path d="M12 4.5v15M4.5 12h15"/>`;

lineIcons.upload = `<path d="M12 15.5V3.5M7.5 8L12 3.5 16.5 8"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>`;

/* Theme preference: follow the system, or pin light or dark. */
lineIcons.system = squirclePath(3, 4, 18, 13, 3) + `<path d="M9 20.5h6"/>`;

lineIcons.light = `<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"/>`;

lineIcons.dark = `<path d="M20.5 14.3A8.7 8.7 0 0 1 9.7 3.5a8.5 8.5 0 1 0 10.8 10.8z"/>`;

// --------------------------------------------------------------
// App shell
// --------------------------------------------------------------

/*
	The app mark, for the top of the left rail and the About identity.

	A G, drawn the way this editor draws one: the bowl and the bar are a
	path under edit - the arc with its three anchors, the handle off the top
	one ending in the square that marks a control point, and the bar as a
	segment ending in its own anchor - while the spur is the finished letter,
	set solid. The two meet: the spur hangs from the bar, its shoulder
	sweeping out from under the bar's left cap and down into the stem, so
	the construction line and the letter share one edge. Reading it goes
	from the work to the result, which is the product in one glyph.

	Proportioned on the golden section, phi = 1.618. The mark is 17 tall
	(y 3.5 to 20.5) and the bowl is its full height, radius 8.5. The bar
	sits at 10, which splits that height 6.5 above to 10.5 below - 1 : phi.
	The bar is 8.5 long - the radius - and the handle 5.25, the radius over
	phi, so the two segments are 1 : phi to each other; the bar's anchor
	lands on the spur's right edge. The spur is the bar's 8.5 wide, and it
	splits at the stem's left edge into 5.25 of shoulder and 3.25 of stem -
	the width over phi and over phi squared. That edge is x 17.25, which is
	where the handle ends: the stem stands directly under the control point. None of it is
	visible as arithmetic; it is why the halves feel like one weight.

	Stroke 1.5 rather than the family's 2: eight parts on a 24 grid, and at
	2 the arc and the bar closed up against the spur. The path itself - arc,
	handle and bar - is thinner again, .7, so the work reads as a
	construction line and the letter as the weight. It was drawn at 1.5 over
	phi = .93 and the owner took it down by eye in Illustrator, in the same
	pass that squared the spur's outer shoulder into the corner and made
	its inner edge a true quarter circle; the spur's top sits at 10.35, the
	bar's new underside. The path sits at 40% opacity as well, so it recedes
	behind the anchors and the letter the way a construction line should:
	the same drawing at two weights and two strengths. Two filled parts,
	on purpose. The anchors are dots because that is what an anchor is on the
	canvas, and the spur is a silhouette because a stroked spur is a hook,
	not a letter. Every corner is smoothed the way the set smooths them: the
	handle square is squircle() at r .9, and the spur's two feet carry the
	same SPAN and PULL by hand at r .4, so the curvature eases in rather
	than jumping from the edge. Its top right corner is the bar's anchor.

	The 24 grid has no room for the sparkle that sat at the bar's end in the
	brief, and in this icon set a four-point star means "generate", which
	the G does not. The splash and the favicon, at their own sizes, may.
*/
lineIcons.appMark =
	`<g opacity=".4">` +
	`<path d="M12 3.5A8.5 8.5 0 0 0 12 20.5" stroke-width=".7"/>` +
	`<path d="M12 3.5h3.75" stroke-width=".7"/>` +
	`<path d="M12 10h8.5" stroke-width=".7"/>` +
	`</g>` +
	`<circle cx="12" cy="3.5" r="1.4" fill="currentColor" stroke="none"/>` +
	`<circle cx="3.5" cy="12" r="1.4" fill="currentColor" stroke="none"/>` +
	`<circle cx="12" cy="20.5" r="1.4" fill="currentColor" stroke="none"/>` +
	`<path d="${squircle(15.75, 2, 3, 3, 0.9)}" fill="currentColor" stroke="none"/>` +
	`<circle cx="20.5" cy="10" r="1.4" fill="currentColor" stroke="none"/>` +
	`<path fill="currentColor" stroke="none" d="M12 10.35C17.6 10.35 20.5 10 20.5 16.8V19.96C20.5 20.35 20.35 20.5 19.96 20.5H17.79C17.4 20.5 17.25 20.35 17.25 19.96V15.735C17.25 13.229 15.534 11.019 13.087 10.473C12.739 10.394 12.375 10.35 12 10.35Z"/>`;
iconStrokeWidth.appMark = 1.5;

/* The three shell menus, as icons for the rail. */
lineIcons.menu_file = `<path d="M13.5 3.5H7A2.5 2.5 0 0 0 4.5 6v12A2.5 2.5 0 0 0 7 20.5h10a2.5 2.5 0 0 0 2.5-2.5V9.5z"/><path d="M13.5 3.5v6h6"/>`;

lineIcons.menu_projects = `<path d="M3.5 8.5V6A2.5 2.5 0 0 1 6 3.5h3.2a2 2 0 0 1 1.6.8l1.2 1.6a2 2 0 0 0 1.6.8H18A2.5 2.5 0 0 1 20.5 9.3"/><path d="M3.5 8.5h17A1.5 1.5 0 0 1 22 10.2l-1.3 8A2.5 2.5 0 0 1 18.2 20.5H5.8a2.5 2.5 0 0 1-2.5-2.3l-1.3-8A1.5 1.5 0 0 1 3.5 8.5z"/>`;

lineIcons.menu_help = lineIcons.command_help;

/*
	The hub rail's three destinations.

	A house for where you land, the shell's folder for the projects themselves
	- the same drawing the Projects menu uses, because it is the same idea -
	and an open book for the examples and the guide. A book rather than a
	graduation cap or a lightbulb: those mean "course" and "idea", and what is
	behind that tab is documentation and sample files.
*/
lineIcons.home = `<path d="M3.5 10.2 12 3.5l8.5 6.7"/><path d="M5.5 9.3V18a2.5 2.5 0 0 0 2.5 2.5h8a2.5 2.5 0 0 0 2.5-2.5V9.3"/>`;

lineIcons.book = `<path d="M12 6.8v12.7"/><path d="M12 6.8C10.3 5.5 8.2 4.8 6 4.8H3.5v12.7H6c2.2 0 4.3.7 6 2 1.7-1.3 3.8-2 6-2h2.5V4.8H18c-2.2 0-4.3.7-6 2Z"/>`;

/*
	Grid and list, for the switch over the project cards.

	Four squares is what a grid switch has been for twenty years and there is
	no three-element version of it that still reads as a grid - so this one
	takes a lighter stroke instead, which is what iconStrokeWidth is for. The
	list is rows with their bullets, drawn as two paths rather than six.
*/
lineIcons.viewGrid =
	squirclePath(3.5, 3.5, 7, 7, 2) +
	squirclePath(13.5, 3.5, 7, 7, 2) +
	squirclePath(3.5, 13.5, 7, 7, 2) +
	squirclePath(13.5, 13.5, 7, 7, 2);
iconStrokeWidth.viewGrid = 1.75;

lineIcons.viewList = `<path d="M9 6.5h11.5M9 12h11.5M9 17.5h11.5"/><path d="M4 6.5h.01M4 12h.01M4 17.5h.01"/>`;

/* A plain magnifier. zoomIn carries a plus and means something else. */
lineIcons.search = `<circle cx="10.5" cy="10.5" r="7"/><path d="M20.5 20.5l-5-5"/>`;

/* An envelope, for the feedback row - command_info is the About row's mark. */
lineIcons.mail = squirclePath(2.5, 5, 19, 14, 3) + `<path d="M3.5 7.5l8.5 6 8.5-6"/>`;

/*
	Close. Dialogs were drawing this with the &times; entity, which is a
	typographic multiplication sign - it inherits the UI font, sits on the text
	baseline rather than in the middle of its button, and comes out a different
	weight and size on every platform. Two strokes, on the same grid and with
	the same cap as every other icon in the set.
*/
lineIcons.close = `<path d="M6.75 6.75l10.5 10.5M17.25 6.75l-10.5 10.5"/>`;

/*
	Two halves of a chain, joined and parted. The control they belong to links
	a width field to a height one, and a chain is what every drawing tool has
	used for that since the first one - a padlock would say "this value cannot
	change", which is a different thing.
*/
lineIcons.linked = `<path d="M9.5 14.5l5-5"/><path d="M12.5 6.5l1.5-1.5a3.5 3.5 0 0 1 5 5l-1.5 1.5"/><path d="M11.5 17.5l-1.5 1.5a3.5 3.5 0 0 1-5-5l1.5-1.5"/>`;
lineIcons.unlinked = `<path d="M13.5 5.5l.5-.5a3.5 3.5 0 0 1 5 5l-.5.5"/><path d="M10.5 18.5l-.5.5a3.5 3.5 0 0 1-5-5l.5-.5"/><path d="M15 15l2.5 2.5M9 9L6.5 6.5"/>`;
