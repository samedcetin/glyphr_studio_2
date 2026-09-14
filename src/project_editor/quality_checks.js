import { getCurrentProject } from '../app/main.js';
import { calculateLength, valuesAreClose } from '../common/functions.js';

/**
	QUALITY CHECKS
	--------------
	Four tests for the small data errors that come out of an SVG import:
	points sitting on top of each other, handles too short to do anything,
	and points that just miss x=0 or y=0.

	THEY ALWAYS RUN. They used to be four switches you turned on one at a
	time, which made the panel a settings screen: it asked which tests you
	wanted rather than answering whether the glyph was clean. Running all
	four costs one pass over the points of the item you are already looking
	at, and it means the panel has a number in it the moment you open it.

	WHEN THEY RUN. Not on every frame. The old code called this from
	EditCanvas.paint, so every pan and every zoom walked every point of
	every shape and then deep-cloned four arrays per shape - work that
	produced exactly the same answer as the frame before, because panning
	does not move a point. The results are cached against the item and
	thrown away by `invalidateQualityChecks`, which pub_sub calls on any
	publish. So an edit still recomputes immediately, and a pan does not.

	The results hold the PathPoint objects themselves rather than indices
	into a per-shape array, so the panel can hand them straight to
	multiSelect and select the offending points.
 */

/**
 * @typedef {Object} QualityCheck
 * @property {String} id - also the key of its threshold in settings.app
 * @property {String} name - what the panel row says
 * @property {String} colorKey - getCanvasColors() key for its ring and dot
 * @property {String} colorToken - the same colour as a CSS variable name
 * @property {String} help - one line, shown beside its threshold
 * @property {Function} test - (point, index, path, threshold) => Boolean
 */

/** @type {Array<QualityCheck>} */
export const qualityChecks = [
	{
		id: 'highlightPointsNearPoints',
		name: 'Points near other points',
		colorKey: 'checkNearPoint',
		colorToken: '--canvas-check-near-point',
		help: 'Two points closer together than this are probably one point.',
		test: (point, index, path, threshold) => {
			/* A one-point path is its own next point, so it always measured
				zero and always tripped this check. */
			if (path.pathPoints.length < 2) return false;
			const next = path.pathPoints[path.getNextPointNumber(index)];
			return calculateLength(point.p, next.p) <= threshold;
		},
	},
	{
		id: 'highlightPointsNearHandles',
		name: 'Short handles',
		colorKey: 'checkShortHandle',
		colorToken: '--canvas-check-short-handle',
		help: 'A handle shorter than this is doing nothing to the curve.',
		test: (point, index, path, threshold) => {
			const h1 = point.h1.use && calculateLength(point.p, point.h1) <= threshold;
			const h2 = point.h2.use && calculateLength(point.p, point.h2) <= threshold;
			return h1 || h2;
		},
	},
	{
		id: 'highlightPointsNearXZero',
		name: 'Points near x = 0',
		colorKey: 'checkNearX',
		colorToken: '--canvas-check-near-x',
		help: 'Points this close to the left side bearing meant to be on it.',
		test: (point, index, path, threshold) =>
			valuesAreClose(point.p.x, 0, threshold) && point.p.x !== 0,
	},
	{
		id: 'highlightPointsNearYZero',
		name: 'Points near y = 0',
		colorKey: 'checkNearY',
		colorToken: '--canvas-check-near-y',
		help: 'Points this close to the baseline meant to be on it.',
		test: (point, index, path, threshold) =>
			valuesAreClose(point.p.y, 0, threshold) && point.p.y !== 0,
	},
];

// --------------------------------------------------------------
// Running them
// --------------------------------------------------------------

/**
 * @typedef {Object} QualityCheckResults
 * @property {String} itemID
 * @property {Object} hits - { checkID: Array<PathPoint> }
 * @property {Object} counts - { checkID: Number }
 * @property {Number} total
 * @property {Number} pointsChecked
 * @property {Number} pathsChecked
 * @property {Number} componentInstances - shapes this cannot look inside
 */

/** @type {QualityCheckResults | false} */
let cachedResults = false;

/**
 * Throw the cached results away.
 *
 * Called from pub_sub on every publish. A publish is the app saying
 * something changed; recomputing is cheaper than working out whether the
 * particular thing that changed was a point.
 */
export function invalidateQualityChecks() {
	cachedResults = false;
}

/**
 * Every check, over one item.
 *
 * @param {Object} item - Glyph, Ligature or Component
 * @returns {QualityCheckResults | false} - false for anything with no shapes
 */
export function getQualityCheckResults(item) {
	if (!item || !item.shapes) return false;
	if (cachedResults && cachedResults.itemID === item.id) return cachedResults;

	const settings = getCurrentProject()?.settings?.app;
	if (!settings) return false;

	/** @type {Object} */
	const hits = {};
	qualityChecks.forEach((check) => (hits[check.id] = []));

	let pointsChecked = 0;
	let pathsChecked = 0;
	let componentInstances = 0;

	item.shapes.forEach((shape) => {
		/*
			A component instance is a reference to another item. Its points
			live there and are checked when you edit it, so counting them
			here would report the same problem once per use. The panel says
			how many were skipped rather than leaving you to assume a glyph
			built from components is clean.
		*/
		if (shape.objType !== 'Path') {
			componentInstances++;
			return;
		}

		pathsChecked++;
		for (let index = 0; index < shape.pathPoints.length; index++) {
			const point = shape.pathPoints[index];
			pointsChecked++;
			qualityChecks.forEach((check) => {
				if (check.test(point, index, shape, settings[check.id])) hits[check.id].push(point);
			});
		}
	});

	/** @type {Object} */
	const counts = {};
	let total = 0;
	qualityChecks.forEach((check) => {
		counts[check.id] = hits[check.id].length;
		total += counts[check.id];
	});

	cachedResults = {
		itemID: item.id,
		hits: hits,
		counts: counts,
		total: total,
		pointsChecked: pointsChecked,
		pathsChecked: pathsChecked,
		componentInstances: componentInstances,
	};

	return cachedResults;
}

// --------------------------------------------------------------
// Whether the canvas draws them
// --------------------------------------------------------------

/**
 * One view option for the lot, saved with the project.
 *
 * It replaces four booleans that lived in a module-level object and were
 * never written anywhere, so every reload turned all four off while the
 * thresholds beside them survived.
 *
 * @returns {Boolean}
 */
export function getShowQualityChecksOnCanvas() {
	return !!getCurrentProject()?.settings?.app?.showQualityChecksOnCanvas;
}

/**
 * @param {Boolean} value
 */
export function setShowQualityChecksOnCanvas(value) {
	const settings = getCurrentProject()?.settings?.app;
	if (settings) settings.showQualityChecksOnCanvas = !!value;
}
