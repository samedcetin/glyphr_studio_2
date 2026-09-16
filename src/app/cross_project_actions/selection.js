/**
	SELECTION
	---------
	Which rows of a cross-project table are ticked.

	A Set rather than an array with indexOf/splice. The old array version had
	one bug that the shape of the data invited: unticking an id that was not in
	the list ran `splice(-1, 1)` and dropped whatever happened to be last. The
	toggle-all checkbox carried no id, so every click on it removed a row nobody
	had touched. A Set has no index to get wrong.
 */

/**
 * @returns {Object} - a selection
 */
export function createSelection() {
	/** @type {Set<String>} */
	const ids = new Set();

	return {
		/**
		 * Ticks or unticks one id.
		 * @param {String} id - the row's id
		 * @param {Boolean} on - ticked or not
		 * @returns {Boolean} - whether the selection changed
		 */
		set(id, on) {
			if (!id) return false;
			const had = ids.has(id);
			if (on && !had) ids.add(id);
			else if (!on && had) ids.delete(id);
			else return false;
			return true;
		},

		/**
		 * Ticks or unticks a whole list at once.
		 * @param {Array<String>} list - ids
		 * @param {Boolean} on - ticked or not
		 */
		setAll(list, on) {
			list.forEach((id) => this.set(id, on));
		},

		/** Unticks everything. */
		clear() {
			ids.clear();
		},

		/**
		 * @param {String} id - the row's id
		 * @returns {Boolean}
		 */
		has(id) {
			return ids.has(id);
		},

		/** @returns {Number} */
		get size() {
			return ids.size;
		},

		/** @returns {Array<String>} - in insertion order */
		get list() {
			return [...ids];
		},

		/**
		 * Drops ids that are no longer on screen.
		 *
		 * When the range changes, the rows change - and a selection that kept
		 * ids from the old range would act on items the user can no longer
		 * see. Keeping the ones that are still shown, rather than clearing,
		 * means switching between two ranges and back loses nothing.
		 *
		 * @param {Array<String>} visible - ids that are on screen now
		 */
		keepOnly(visible) {
			const keep = new Set(visible);
			[...ids].forEach((id) => {
				if (!keep.has(id)) ids.delete(id);
			});
		},
	};
}
