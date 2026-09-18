/**
	SPECIMEN SHEET — WHAT IS STILL LOOSE

	A sheet almost never maps cleanly on the first try. A row's count is off by
	one, the punctuation row is not declared, a speck survives segmentation -
	and the shapes that did not find a character have to go somewhere, or the
	user watches twenty-six of them in the review and ends up with none.

	They go in as components, and this is how the rest of the app finds them
	again. A component that came off a sheet and is used by nothing is the
	definition of unfinished business.
*/

/**
 * Whether a component was traced off a specimen sheet.
 * @param {Object} component
 * @returns {Boolean}
 */
export function isFromSheet(component) {
	return Boolean(component?.fromSpecimenSheet);
}

/**
 * Whether a component has been put to work in a glyph yet.
 *
 * `usedIn` is the project's own record of where a component is placed, kept up
 * to date by the component-instance machinery - so this asks the project
 * rather than keeping a second answer that could disagree with it.
 *
 * @param {Object} component
 * @returns {Boolean}
 */
export function isPlaced(component) {
	return Array.isArray(component?.usedIn) && component.usedIn.length > 0;
}

/**
 * The traced shapes still waiting for a character.
 *
 * @param {Object} project
 * @returns {Array} { id, component }, in the order they were imported
 */
export function looseSheetShapes(project) {
	const components = project?.components ?? {};
	return Object.entries(components)
		.filter(([, component]) => isFromSheet(component) && !isPlaced(component))
		.map(([id, component]) => ({ id, component }));
}

/**
 * How many shapes from a sheet are in the project, and how many are still loose.
 * @param {Object} project
 * @returns {Object} { total, loose, placed }
 */
export function countSheetShapes(project) {
	const components = Object.values(project?.components ?? {}).filter(isFromSheet);
	const placed = components.filter(isPlaced).length;
	return { total: components.length, loose: components.length - placed, placed };
}
