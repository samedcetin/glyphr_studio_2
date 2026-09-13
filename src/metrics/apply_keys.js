import { findKeyedGlyphs, getSideKey, resolveSideBearing } from './metric_keys.js';

/**
	APPLYING METRIC KEYS
	--------------------
	Turning the relationships into numbers.

	Both sides are worked out before either is written. Setting the left
	sidebearing moves the outline and changes the advance width, so a right
	side resolved after that would be resolved against a glyph that had already
	moved - and the two numbers would disagree by exactly the amount the left
	side had shifted.
 */

/**
 * Resolves and applies both sides of one glyph.
 *
 * @param {Object} project - a GlyphrStudioProject
 * @param {String} glyphID - which glyph
 * @returns {Object} - {ok, changed, reason}
 */
export function applyKeysToGlyph(project, glyphID) {
	const glyph = project?.glyphs ? project.glyphs[glyphID] : false;
	if (!glyph) return { ok: false, changed: false, reason: `No glyph ${glyphID}.` };

	const leftKey = getSideKey(glyph, 'left');
	const rightKey = getSideKey(glyph, 'right');
	if (!leftKey && !rightKey) return { ok: true, changed: false, reason: '' };

	/*
		A glyph with nothing drawn in it has no edges to measure from, so a
		sidebearing means nothing - the space is all there is, and its advance
		is set directly rather than keyed.
	*/
	if (!glyph.shapes || !glyph.shapes.length) {
		return { ok: false, changed: false, reason: 'Nothing drawn — no edges to space from.' };
	}

	// Resolve first, write after.
	const targets = {};

	if (leftKey) {
		const resolved = resolveSideBearing(project, glyphID, 'left');
		if (!resolved.ok) return { ok: false, changed: false, reason: resolved.reason };
		targets.left = resolved.value;
	}

	if (rightKey) {
		const resolved = resolveSideBearing(project, glyphID, 'right');
		if (!resolved.ok) return { ok: false, changed: false, reason: resolved.reason };
		targets.right = resolved.value;
	}

	let changed = false;

	if (targets.left !== undefined && Math.round(glyph.leftSideBearing) !== targets.left) {
		glyph.leftSideBearing = targets.left;
		changed = true;
	}

	if (targets.right !== undefined && Math.round(glyph.rightSideBearing) !== targets.right) {
		glyph.rightSideBearing = targets.right;
		changed = true;
	}

	if (changed) glyph.changed();
	return { ok: true, changed: changed, reason: '' };
}

/**
 * Applies every key in the project.
 *
 * No ordering is needed: resolving follows a chain to whichever glyph is not
 * keyed and takes the real measurement from there, so `d` keyed to `o` keyed
 * to `n` lands on the right number whichever of the three is done first.
 *
 * @param {Object} project - a GlyphrStudioProject
 * @returns {Object} - {updated, unchanged, failed}
 */
export function applyAllMetricKeys(project) {
	const updated = [];
	const unchanged = [];
	const failed = [];

	findKeyedGlyphs(project).forEach((id) => {
		const result = applyKeysToGlyph(project, id);
		if (!result.ok) failed.push({ id: id, reason: result.reason });
		else if (result.changed) updated.push(id);
		else unchanged.push(id);
	});

	return { updated: updated, unchanged: unchanged, failed: failed };
}

/**
 * Which glyphs would move if the keys were applied right now.
 *
 * Used to say whether anything is out of step without changing it - a keyed
 * glyph that has drifted is worth knowing about before deciding to fix it.
 *
 * @param {Object} project - a GlyphrStudioProject
 * @returns {Array<Object>} - [{id, side, current, target}]
 */
export function findDriftedGlyphs(project) {
	const drifted = [];

	findKeyedGlyphs(project).forEach((id) => {
		const glyph = project.glyphs[id];
		if (!glyph.shapes || !glyph.shapes.length) return;

		['left', 'right'].forEach((side) => {
			if (!getSideKey(glyph, side)) return;

			const resolved = resolveSideBearing(project, id, side);
			if (!resolved.ok) return;

			const current = Math.round(side === 'left' ? glyph.leftSideBearing : glyph.rightSideBearing);
			if (current !== resolved.value) {
				drifted.push({ id: id, side: side, current: current, target: resolved.value });
			}
		});
	});

	return drifted;
}
