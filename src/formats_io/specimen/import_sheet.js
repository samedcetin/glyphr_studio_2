/**
	SPECIMEN SHEET — IMPORT

	Turning accepted assignments into glyphs in the project.

	Two things here are defensive rather than obvious, and both come from
	reading what the project actually does rather than assuming.

	COLLISIONS. `addItemByType` writes `destination[newID] = newItem` with no
	check at all, so importing over a character someone has already drawn
	destroys it silently. Worse, the same call runs `incrementRangeCountFor`
	unconditionally, so importing the same sheet twice inflates the character
	range counts. So this module partitions first - what is new, what is
	already there - hands that count to the caller to put in front of the
	user, and writes an existing glyph IN PLACE rather than through the adder.

	ONE HISTORY STATE. A pre-state before anything changes and a post-state
	after everything has: eighty-seven glyphs arriving is one thing that
	happened, and undo should take all of it back in one press.
*/

import { Glyph } from '../../project_data/glyph.js';
import { bezierDataToGlyph } from '../svg_outlines/svg_outline_import.js';
import { acceptedAssignments, unassignedCells } from './assign_glyphs.js';
import {
	defaultOvershoot,
	defaultSidebearing,
	expectedExtent,
	verticalTarget,
} from './sheet_metrics.js';
import { traceGlyphCell } from './trace_glyph.js';

/**
 * The project ID for a single character.
 * @param {String} character
 * @returns {String}
 */
export function glyphIdFor(character) {
	return `glyph-0x${character.codePointAt(0).toString(16).toUpperCase()}`;
}

/**
 * Traces every accepted cell and works out what would land where.
 *
 * Nothing is written. The result is what the review grid draws and what the
 * user approves, so that what they approve is exactly what lands - the plan
 * carries finished glyphs in font space, not raw geometry to be transformed
 * later by some other code path.
 *
 * @param {Object} source - { sheet, assignment, metrics }
 * @param {Object} options
 * @param {Object} options.project - to check for collisions
 * @param {Boolean =} options.level - put each glyph on the line it belongs on
 * @param {Boolean =} options.fit - bring each glyph to the height it should be
 * @param {Boolean =} options.includeReviewed - take cells the user was warned of
 * @param {Boolean =} options.keepUnassigned - also trace the shapes the layout
 *   had no character for, so they can be kept as components rather than lost
 * @param {Number =} options.tolerance - curve fitting, in source pixels
 * @param {Number =} options.sidebearing - font units, defaults from the face
 * @returns {Object} { entries, leftovers, newCount, replaceCount, nodes }
 */
export function planImport(source, options) {
	const { sheet, assignment, metrics } = source;
	const {
		project,
		level = true,
		fit = true,
		includeReviewed = false,
		keepUnassigned = true,
		tolerance = 0.4,
		sidebearing,
	} = options;

	const face = metrics.derived;
	const overshoot = defaultOvershoot(face);
	const bearing = sidebearing ?? defaultSidebearing(face);

	const entries = [];
	let nodes = 0;

	for (const { character, cell, row } of acceptedAssignments(assignment, includeReviewed)) {
		const traced = traceGlyphCell(sheet, cell, {
			baseline: metrics.rows[row].baseline,
			unitsPerPixel: metrics.unitsPerPixel,
			sidebearing: bearing,
			tolerance,
			snap: level ? verticalTarget(character, face, overshoot) : null,
			fit: fit ? expectedExtent(character, face, overshoot) : null,
		});

		if (!traced.bezierData.length) continue;

		const id = glyphIdFor(character);
		entries.push({
			character,
			id,
			cell,
			row,
			bezierData: traced.bezierData,
			advanceWidth: Math.round(traced.advanceWidth),
			contours: traced.contours,
			nodes: traced.nodes,
			replaces: Boolean(project?.glyphs?.[id]),
		});
		nodes += traced.nodes;
	}

	/*
		The shapes the layout had no character for, traced all the same.

		They land as COMPONENTS rather than as glyphs, because that is what an
		unassigned one is - something drawn that is not a character yet - and
		because the project already carries components through a save and back
		(hydrateProjectItems on `components`). Keeping them in some bucket of
		this feature's own would mean inventing a second store, serialising it,
		and having it quietly empty on reload.
	*/
	const leftovers = [];
	if (keepUnassigned) {
		for (const { cell, row, position } of unassignedCells(assignment)) {
			const traced = traceGlyphCell(sheet, cell, {
				baseline: metrics.rows[row].baseline,
				unitsPerPixel: metrics.unitsPerPixel,
				sidebearing: bearing,
				tolerance,
				// No character, so no rule about which line it belongs on. It
				// keeps the position and size the sheet drew it at.
			});
			if (!traced.bezierData.length) continue;

			leftovers.push({
				character: null,
				name: `Sheet row ${row + 1}, shape ${position + 1}`,
				cell,
				row,
				position,
				bezierData: traced.bezierData,
				advanceWidth: Math.round(traced.advanceWidth),
				contours: traced.contours,
				nodes: traced.nodes,
			});
			nodes += traced.nodes;
		}
	}

	return {
		entries,
		leftovers,
		newCount: entries.filter((entry) => !entry.replaces).length,
		replaceCount: entries.filter((entry) => entry.replaces).length,
		nodes,
	};
}

/**
 * Writes a planned import into the project, as one undoable change.
 *
 * @param {Object} plan - from planImport
 * @param {Object} context
 * @param {Object} context.project
 * @param {Object} context.history - the editor's history, or null to skip
 * @param {Object =} context.face - metrics to set on the project, from
 *   measureSheet's `derived`; omit to leave the project's own alone
 * @param {Array =} context.only - characters to write; omit for all of them
 * @param {Boolean =} context.keepLeftovers - also write the shapes the layout
 *   had no character for, as components
 * @returns {Object} { written, replaced, skipped, kept }
 */
export function importSheet(plan, context) {
	const { project, history = null, face = null, only = null, keepLeftovers = true } = context;
	const wanted = only ? new Set(only) : null;
	const entries = plan.entries.filter((entry) => !wanted || wanted.has(entry.character));

	const leftoverCount = keepLeftovers ? (plan.leftovers ?? []).length : 0;
	if (!entries.length && !leftoverCount) return { written: 0, replaced: 0, skipped: 0, kept: 0 };

	const total = entries.length + leftoverCount;
	history?.addWholeProjectChangePreState(
		`Import ${total} shape${total === 1 ? '' : 's'} from a specimen sheet`
	);

	let written = 0;
	let replaced = 0;
	let skipped = 0;

	for (const entry of entries) {
		let glyph;
		try {
			glyph = bezierDataToGlyph(entry.bezierData, project.settings?.project?.upm ?? 2048);
		} catch (error) {
			skipped++;
			continue;
		}

		glyph.advanceWidth = entry.advanceWidth;

		const existing = project.glyphs?.[entry.id];
		if (existing) {
			// In place, deliberately. Going through addItemByType would count
			// this character into its range a second time.
			existing.shapes = glyph.shapes;
			existing.advanceWidth = entry.advanceWidth;
			existing.changed();
			replaced++;
		} else {
			project.addItemByType(glyph, 'Glyph', entry.id);
			written++;
		}
	}

	/*
		The shapes with no character go in as components, in the same undoable
		change. A component carries no code point and belongs to no range, so
		nothing here has to be guarded the way a glyph does - and the project
		saves and reloads them without this feature owning any of that.

		They are tagged so the Overview panel can tell a shape that came off a
		sheet from a component someone drew on purpose.
	*/
	let kept = 0;
	if (keepLeftovers) {
		for (const leftover of plan.leftovers ?? []) {
			let component;
			try {
				component = bezierDataToGlyph(leftover.bezierData, project.settings?.project?.upm ?? 2048);
			} catch (error) {
				skipped++;
				continue;
			}
			component.advanceWidth = leftover.advanceWidth;
			component.name = leftover.name;
			component.fromSpecimenSheet = true;
			project.addItemByType(component, 'Component');
			kept++;
		}
	}

	// The sheet describes the face, so its proportions become the project's.
	// The cap height is not touched: it is what the scale was anchored to, so
	// it already agrees.
	if (face && project.settings?.font) {
		project.settings.font.xHeight = face.xHeight;
		project.settings.font.ascent = face.ascent;
		project.settings.font.descent = face.descent;
	}

	history?.addWholeProjectChangePostState();

	return { written, replaced, skipped, kept };
}

/**
 * A line describing what the import will do, for the dialog footer.
 * @param {Object} plan - from planImport
 * @returns {String}
 */
export function describePlan(plan) {
	if (!plan.entries.length) return 'Nothing to import yet';
	const parts = [];
	if (plan.newCount) parts.push(`${plan.newCount} new`);
	if (plan.replaceCount) {
		parts.push(`${plan.replaceCount} already in this project and will be replaced`);
	}
	return `${plan.entries.length} character${plan.entries.length === 1 ? '' : 's'} — ${parts.join(', ')}`;
}
