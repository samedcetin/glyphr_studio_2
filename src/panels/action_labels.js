/**
	ACTION LABELS
	-------------
	Shared presentation rules for turning an entry from `getActionData` into a
	menu or palette row.

	Action `title` fields are written as tooltips - "Name\\nA sentence or two
	explaining what this does" - which is right for a hover but wrong for a
	list. These helpers pull out the name, shorten the handful that are written
	as full sentences, and drop rows that would read as duplicates.

	Both the canvas context menu and the command palette use this, so a command
	is named the same thing wherever it appears.
 */

/**
 * Shorter labels for commands whose titles are written as sentences.
 * Keyed by the title's first line, because most actions have no id.
 */
const shortLabels = {
	'Round all path point and handle position values': 'Round values',
	'Round path point and handle position values': 'Round values',
	'Turn Path into a Component Instance': 'Convert to component',
	'Turn Component Instance into a Path': 'Convert to path',
	'Combine Shapes: Unite': 'Unite',
	'Combine Shapes: Divide': 'Divide',
	'Combine Shapes: Subtract': 'Subtract',
	'Combine Shapes: Exclude': 'Exclude',
	'Combine Shapes: Intersect': 'Intersect',
	'Combine all paths: Unite': 'Unite all paths',
	'Select pervious Path Point': 'Select previous point',
	'Select next Path Point': 'Select next point',
	'Move Shapes to the Top': 'Bring to front',
	'Move Shapes Up': 'Bring forward',
	'Move Shapes Down': 'Send backward',
	'Move Shapes to the Bottom': 'Send to back',
	'Align Shapes: Left': 'Align left',
	'Align Shapes: Center': 'Align center',
	'Align Shapes: Right': 'Align right',
	'Align Shapes: Top': 'Align top',
	'Align Shapes: Middle': 'Align middle',
	'Align Shapes: Bottom': 'Align bottom',
	'Align Path Points: Left': 'Align points left',
	'Align Path Points: Center': 'Align points center',
	'Align Path Points: Right': 'Align points right',
	'Align Path Points: Top': 'Align points top',
	'Align Path Points: Middle': 'Align points middle',
	'Align Path Points: Bottom': 'Align points bottom',
	'Add Component Instance': 'Add component instance',
	'Get Paths From Another Project': 'Get paths from another project',
	'Clear Glyphr Studio Clipboard': 'Clear clipboard',
	'Import paths from a SVG File': 'Import paths from SVG',
	'Export glyph SVG File': 'Export glyph as SVG',
};

/**
 * The display label for one action.
 * @param {Object} action - an entry from getActionData
 * @returns {String} - empty when the action has no usable title
 */
export function getActionLabel(action) {
	const rawLabel = String(action?.title || '')
		.split('\n')[0]
		.trim();
	return shortLabels[rawLabel] || rawLabel;
}

/**
 * Drops rows whose label already appeared.
 *
 * Action groups overlap on purpose - "Copy" is both a shape action and a
 * universal one, under two different ids - so deduping is by visible label.
 * Two rows reading the same thing are a duplicate to the user whatever their
 * ids say.
 *
 * @param {Array} rows - rows in display order, each with a `name`
 * @param {String=} separatorName - a name to always keep, e.g. 'hr'
 * @returns {Array}
 */
export function dropDuplicateLabels(rows, separatorName = '') {
	const seen = new Set();
	return rows.filter((row) => {
		if (separatorName && row.name === separatorName) return true;
		if (seen.has(row.name)) return false;
		seen.add(row.name);
		return true;
	});
}
