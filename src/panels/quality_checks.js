import { getCurrentProjectEditor } from '../app/main.js';
import { makeElement } from '../common/dom.js';
import { makeLineIcon } from '../common/icons.js';
import { attachTooltip } from '../controls/tooltip/tooltip.js';
import {
	getQualityCheckResults,
	getShowQualityChecksOnCanvas,
	qualityChecks,
	setShowQualityChecksOnCanvas,
} from '../project_editor/quality_checks.js';

/**
	QUALITY CHECKS PANEL
	--------------------
	A report, not a settings screen.

	It used to be four checkboxes, each with a threshold, each turning on a
	canvas overlay. So it asked which tests you wanted rather than answering
	the question you opened it for - is this glyph clean - and the answer,
	once you had turned something on, was a red ring somewhere on the canvas
	that you then had to find.

	Now all four checks always run, each row carries its count, and clicking
	a row with findings selects those points. That is the whole panel: a
	verdict, four numbers, and a way to get to them.

	The thresholds moved behind the settings button. They are set once and
	forgotten, and they were taking half the panel.

	The old layout was an accident rather than a design. Each check pushed
	three children - checkbox, label, input-number - into a card grid that
	has two columns, so the phase shifted on every row and the threshold
	ended up underneath the check it belonged to at 42px wide. The intro
	paragraph was `.spanAll` in a collapsed single-column grid where
	`justify-items: left` shrank it to its longest word: measured, it was
	55px wide and 237px tall, one word per line, in a 551px panel. It is the
	empty state's text now, so it is there when it explains something and
	gone when it does not.
 */

/** Rebuilt on demand rather than held: the panel is remade on item change. */
let panelState = {
	/** @type {HTMLElement | false} */ card: false,
	/** @type {Object} */ rows: {},
	/** @type {HTMLElement | false} */ verdict: false,
	/** @type {HTMLElement | false} */ note: false,
};

// --------------------------------------------------------------
// Acting on a finding
// --------------------------------------------------------------

/**
 * Select the points one check found, and switch to the tool that shows them.
 *
 * Both halves are necessary. `computeAndDrawPathPoints` walks
 * `multiSelect.shapes`, so a point whose path is not selected is not drawn;
 * and it only runs at all in path-edit mode, so selecting points while the
 * resize tool is up puts a selection on screen that nothing renders.
 *
 * @param {Array} points - the PathPoints to select
 */
function selectPoints(points) {
	if (!points.length) return;
	const editor = getCurrentProjectEditor();
	const shapes = editor.multiSelect.shapes;
	const msPoints = editor.multiSelect.points;

	/*
		One publish at the end rather than one per point. Each add() publishes,
		and each publish walks the subscriber list and refreshes the sidebar -
		fifty findings would have rebuilt the panel fifty times.
	*/
	shapes.allowPublishing = false;
	msPoints.allowPublishing = false;

	shapes.clear();
	msPoints.clear();

	/* A check can find points in more than one path. */
	const parents = [];
	points.forEach((point) => {
		if (point.parent && !parents.includes(point.parent)) parents.push(point.parent);
	});
	parents.forEach((path) => shapes.add(path));
	points.forEach((point) => msPoints.add(point));

	shapes.allowPublishing = true;
	msPoints.allowPublishing = true;

	editor.selectedTool = 'pathEdit';
	editor.publish('whichToolIsSelected', 'pathEdit');
	editor.publish('whichPathPointIsSelected', msPoints.members);
}

// --------------------------------------------------------------
// Pieces
// --------------------------------------------------------------

/**
 * The one-line answer at the top.
 *
 * @returns {HTMLElement}
 */
function makeVerdict() {
	return makeElement({ className: 'quality-checks__verdict' });
}

/**
 * Fill the verdict from a set of results.
 *
 * @param {HTMLElement} element - the verdict line
 * @param {Object | false} results
 */
function fillVerdict(element, results) {
	element.innerHTML = '';
	if (!results) return;

	const clean = results.total === 0;
	element.classList.toggle('quality-checks__verdict--clean', clean);
	element.classList.toggle('quality-checks__verdict--problems', !clean);

	element.innerHTML = makeLineIcon(clean ? 'panel_qualityChecks' : 'alert', 16);

	const text = makeElement({ className: 'quality-checks__verdict-text' });
	const headline = makeElement({ className: 'quality-checks__verdict-headline' });
	headline.textContent = clean
		? 'No problems found'
		: `${results.total} ${results.total === 1 ? 'problem' : 'problems'} found`;

	const detail = makeElement({ className: 'quality-checks__verdict-detail' });
	const points = `${results.pointsChecked} ${results.pointsChecked === 1 ? 'point' : 'points'}`;
	const paths = `${results.pathsChecked} ${results.pathsChecked === 1 ? 'path' : 'paths'}`;
	detail.textContent = `${points} in ${paths} checked`;

	text.appendChild(headline);
	text.appendChild(detail);
	element.appendChild(text);
}

/**
 * One check: its colour, its name, its count, and a way in.
 *
 * @param {Object} check - an entry of `qualityChecks`
 * @returns {Object} - { element, update(results) }
 */
function makeRow(check) {
	const row = makeElement({
		tag: 'button',
		className: 'quality-checks__row',
		attributes: { type: 'button' },
	});

	const dot = makeElement({ className: 'quality-checks__dot' });
	dot.style.setProperty('--dot', `var(${check.colorToken})`);
	row.appendChild(dot);

	const name = makeElement({ className: 'quality-checks__name' });
	name.textContent = check.name;
	row.appendChild(name);

	const count = makeElement({ className: 'quality-checks__count' });
	row.appendChild(count);

	/* Rotated in CSS: the back chevron is the only one in the set. */
	row.appendChild(
		makeElement({ className: 'quality-checks__go', innerHTML: makeLineIcon('back', 14) })
	);

	let points = [];
	row.addEventListener('click', () => selectPoints(points));

	return {
		element: row,
		update(results) {
			points = results ? results.hits[check.id] : [];
			const found = points.length;
			count.textContent = found ? `${found}` : '0';
			row.classList.toggle('quality-checks__row--found', found > 0);
			/*
				aria-disabled, not disabled. A disabled button stops firing pointer
				events in Chrome, so the row with nothing to select would also be the
				row that cannot tell you what it checks. The click is inert either way
				- selectPoints returns on an empty set.
			*/
			row.setAttribute('aria-disabled', `${!found}`);
			attachTooltip(row, {
				name: found ? `Select ${found} ${found === 1 ? 'point' : 'points'}` : check.name,
				body: check.help,
			});
		},
	};
}

/**
 * The thresholds, behind the settings button.
 *
 * @returns {HTMLElement}
 */
function makeThresholds() {
	const editor = getCurrentProjectEditor();
	const block = makeElement({ className: 'quality-checks__thresholds' });
	block.hidden = true;

	const intro = makeElement({ className: 'quality-checks__thresholds-intro' });
	intro.textContent = 'How close counts, in em units.';
	block.appendChild(intro);

	qualityChecks.forEach((check) => {
		const row = makeElement({ className: 'quality-checks__threshold' });

		const label = makeElement({ tag: 'label', className: 'quality-checks__threshold-label' });
		label.textContent = check.name;
		attachTooltip(label, { name: check.name, body: check.help });
		row.appendChild(label);

		const input = makeElement({
			tag: 'input-number',
			attributes: {
				value: `${editor.project.settings.app[check.id]}`,
				suffix: 'em',
				min: '0',
			},
		});

		/*
			parseFloat, not parseInt. The old panel truncated, so a threshold
			of 0.5 em became 0 and the check silently stopped finding anything.
		*/
		input.addEventListener('change', (event) => {
			const value = parseFloat(/** @type {HTMLInputElement} */ (event.target).value);
			if (isNaN(value)) return;
			editor.project.settings.app[check.id] = value;
			editor.publish('currentItem', editor.selectedItem);
		});

		row.appendChild(input);
		block.appendChild(row);
	});

	return block;
}

/**
 * The canvas toggle: one view option for all four checks.
 *
 * @returns {HTMLElement}
 */
function makeCanvasToggle() {
	const editor = getCurrentProjectEditor();
	const row = makeElement({ tag: 'label', className: 'quality-checks__canvas' });

	const checkbox = makeElement({
		tag: 'input',
		attributes: { type: 'checkbox' },
	});
	if (getShowQualityChecksOnCanvas()) checkbox.setAttribute('checked', '');

	checkbox.addEventListener('change', (event) => {
		setShowQualityChecksOnCanvas(/** @type {HTMLInputElement} */ (event.target).checked);
		editor.publish('editCanvasView', editor.view);
	});

	const text = makeElement({ tag: 'span' });
	text.textContent = 'Show on canvas';

	row.appendChild(checkbox);
	row.appendChild(text);
	return row;
}

// --------------------------------------------------------------
// The panel
// --------------------------------------------------------------

/**
 * Rewrite the counts without rebuilding anything.
 *
 * The panel holds a field people type into, and the thresholds block keeps
 * its open or closed state, so it updates in place rather than being remade
 * on every publish - see `skipOnRefresh` in sidebar.js.
 */
function updateResults() {
	if (!panelState.card) return;

	const editor = getCurrentProjectEditor();
	const results = getQualityCheckResults(editor.selectedItem);

	if (panelState.verdict) fillVerdict(panelState.verdict, results);
	qualityChecks.forEach((check) => panelState.rows[check.id]?.update(results));

	if (panelState.note) {
		const skipped = results ? results.componentInstances : 0;
		panelState.note.hidden = !skipped;
		if (skipped) {
			panelState.note.textContent =
				`${skipped} component ${skipped === 1 ? 'instance was' : 'instances were'} ` +
				`not checked - open the component itself to check its points.`;
		}
	}
}

/**
 * @returns {Array<HTMLElement>} - one card
 */
export function makePanel_QualityChecks() {
	const editor = getCurrentProjectEditor();

	const card = makeElement({ className: 'panel__card quality-checks' });
	panelState = { card: card, rows: {}, verdict: false, note: false };

	// The verdict, with the settings button beside it.
	const head = makeElement({ className: 'quality-checks__head' });
	const verdict = makeVerdict();
	panelState.verdict = verdict;
	head.appendChild(verdict);

	const thresholds = makeThresholds();

	/*
		A disclosure rather than a popover. The popover control positions
		itself against its own button with a 320px floor, and the sidebar it
		would open in is 289px - it would hang off the edge of the panel.
	*/
	const settingsButton = makeElement({
		tag: 'button',
		className: 'quality-checks__settings',
		innerHTML: makeLineIcon('settings', 16),
		attributes: { type: 'button', 'aria-expanded': 'false' },
		onClick: () => {
			const open = thresholds.hidden;
			thresholds.hidden = !open;
			settingsButton.setAttribute('aria-expanded', `${open}`);
			settingsButton.classList.toggle('quality-checks__settings--open', open);
		},
	});
	attachTooltip(settingsButton, {
		name: 'Thresholds',
		body: 'How close two points have to be before a check counts them.',
	});
	head.appendChild(settingsButton);
	card.appendChild(head);

	card.appendChild(thresholds);

	// The four rows.
	const list = makeElement({ className: 'quality-checks__list' });
	qualityChecks.forEach((check) => {
		const row = makeRow(check);
		panelState.rows[check.id] = row;
		list.appendChild(row.element);
	});
	card.appendChild(list);

	// What could not be checked.
	const note = makeElement({ className: 'quality-checks__note' });
	note.hidden = true;
	panelState.note = note;
	card.appendChild(note);

	card.appendChild(makeCanvasToggle());

	/*
		The explanation, where it is worth reading. It used to sit above the
		checks on every glyph forever, which is right the first time and
		furniture after that.
	*/
	const help = makeElement({ className: 'quality-checks__help' });
	help.textContent =
		'These checks look for the small data errors that come out of an SVG import: ' +
		'points on top of each other, handles too short to bend anything, and points that ' +
		'just miss the baseline or the left side bearing.';
	card.appendChild(help);

	updateResults();

	editor.subscribe({
		topic: [
			'currentItem',
			'currentPath',
			'whichGlyphIsSelected',
			'whichLigatureIsSelected',
			'whichComponentIsSelected',
		],
		subscriberID: 'qualityChecksPanel',
		callback: () => updateResults(),
	});

	return [card];
}
