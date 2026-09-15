import { PRODUCT_NAME, PRODUCT_URL, UPSTREAM_HELP } from './brand.js';
import { addAsChildren, makeElement } from '../common/dom.js';
import { makeLineIcon } from '../common/icons.js';
import { makeAppPageRail, setAppPageRailTab } from './left_rail.js';
import { closeEveryTypeOfDialog, showError, showToast } from '../controls/dialogs/dialogs.js';
import { makeProgressIndicator } from '../controls/progress-indicator/progress_indicator.js';
import { cancelDefaultEventActions } from '../edit_canvas/events.js';
import { ioFont_importFont } from '../formats_io/otf/font_import.js';
import { ioSVG_importSVGfont } from '../formats_io/svg_font/svg_font_import.js';
import { validateSingleFileInput } from '../formats_io/validate_file_input.js';
import { GlyphrStudioProject } from '../project_data/glyphr_studio_project.js';
import { importGlyphrProjectFromText } from '../project_editor/import_project.js';
import obleggExampleProject from '../samples/oblegg.gs2?raw';
import simpleExampleProject from '../samples/simpleExampleProject.json';
import { updateWindowUnloadEvent } from './app.js';
import {
	addProjectEditorAndSetAsImportTarget,
	getCurrentProjectEditor,
	getGlyphrStudioApp,
	getProjectEditorImportTarget,
	setCurrentProjectEditor,
} from './main.js';
import { makeFontPreviewSVG, projectFromSavedData } from './project_preview.js';

/**
	PAGE > OPEN PROJECT
	-------------------
	The first screen you see: the hub.

	WHAT IT WAS. A 260px sidebar carrying the upstream wordmark, four labelled
	rows and a legal footer, beside one view at a time - so the first screen of
	the app taught a piece of chrome that vanished the moment you opened a
	project, and you landed on a different view depending on how many projects
	you happened to have.

	WHAT IT IS. The app's own rail, with the hub's three destinations in it,
	beside a page that always opens on the same thing: the headline, the two
	ways in as cards, the projects you already have, and the guide. The cards
	take the same --r-3xl shape the rebuilt content pages take, so the hub and
	the editor are recognisably one product.

	The dialog variant - Projects > Open - is a second shell in this same file
	and was left alone. It shares the cards, the sections and the handlers; it
	does not share the page's layout, because a dialog is not a page.
 */

/** True when opening a second project alongside the current one. */
let isSecondProject = false;

/**
 * True when the hub is running inside a modal dialog rather than as the page.
 *
 * This used to be inferred from isSecondProject, which was wrong in both
 * directions: the hub is a modal when you replace the project in this window
 * too, and it is the whole page at startup, where isSecondProject is also
 * false. The two questions are separate - what am I opening into, and where
 * am I being shown - and the second one is what decides the layout.
 */
let isModal = false;

/** Which view the hub is showing. */
let currentView = 'home';

/**
 * View definitions. `title` heads the view; `label` names its rail tab.
 *
 * Three of these are destinations in the rail. `new` and `open` are not: they
 * are what the two cards on the home view lead to, and a rail tab for each
 * would be a second way to reach the thing you are looking at.
 */
const hubViews = {
	home: { label: 'Home', icon: 'home', title: 'Home' },
	projects: { label: 'Your projects', icon: 'menu_projects', title: 'Your projects' },
	learn: { label: 'Examples and guides', icon: 'book', title: 'Examples and guides' },
	new: { label: 'New font', icon: 'plus', title: 'Start a new font' },
	open: { label: 'Open a file', icon: 'upload', title: 'Open a file' },
};

/** The destinations the rail offers, in order. */
const RAIL_TABS = ['home', 'projects', 'learn'];

/**
 * Which rail tab is lit for a given view.
 *
 * The new-font form and the file drop are reached from the home view and go
 * back to it, so they keep its tab lit rather than darkening the whole rail.
 *
 * @param {String} viewName - a key in hubViews
 * @returns {String} - a key in RAIL_TABS
 */
function railTabFor(viewName) {
	return RAIL_TABS.includes(viewName) ? viewName : 'home';
}

/** How the project grid is sorted: 'recent' | 'name'. */
let hubSort = 'recent';

/** How the project grid is laid out: 'grid' | 'list'. */
let hubLayout = 'grid';

/** What is typed into the project search, lower-cased. */
let hubQuery = '';

/** The file types the hub can open, for the copy that lists them. */
const ACCEPTED_FORMATS = ['.gs2', '.otf', '.ttf', '.woff', '.svg'];

/**
 * Hub icons, by name, from the one line set.
 *
 * This used to be seven 16x16 filled SVG strings written out here - a fifth
 * icon set living in a page file. The names are unchanged, so every call site
 * below still reads hubIcons.plus and friends.
 *
 * @type {Object<string, string>}
 */
const hubIcons = {};
['plus', 'upload'].forEach((name) => {
	hubIcons[name] = makeLineIcon(name, 20);
});

/*
	The hub used to build its own theme toggle, because it covered the app's
	top bar and the one up there was out of reach. It carries the app's rail
	now, and the rail has that control at the bottom of it - so the page and
	the editor change the theme with the same button in the same place.
*/

/**
 * Page Maker for the Open Project page
 * @param {Boolean} secondProjectFlag - true if it's not the currently selected project
 * @param {Boolean =} modalFlag - true when shown in a dialog rather than as the page
 * @returns {Element}
 */
export function makePage_OpenProject(secondProjectFlag = false, modalFlag = false) {
	isSecondProject = secondProjectFlag;
	isModal = modalFlag;

	/*
		The home view, always. It is the one that holds everything: the two
		ways in, the projects you already have, and the guide - so there is no
		state where landing on it is landing on nothing. The old page picked
		between two views on a count, which meant a first run and a tenth run
		opened on different screens.
	*/
	currentView = 'home';
	hubQuery = '';
	/*
		The dialog opens on its list and nothing else. It is titled "Open a
		project"; landing on a box asking you to name a new one contradicts the
		thing you just clicked, and with nothing auto-saved there is still
		something to open.
	*/
	if (isModal) currentView = 'list';

	/*
		Two shells, because a dialog is not a page.

		The page is a scrolling column under a bar, beside the app's own rail -
		the same rail the editor carries, so the chrome you learn on the first
		screen is the chrome you keep. Inside a dialog all of that is furniture
		you already have: you are three feet from that rail and its theme
		toggle, and you know which app you are in. What a dialog needs is a
		title that says what pressing something here will do, one row of places
		to look, and the thing you came for.
	*/
	const content = makeElement({
		tag: 'div',
		id: 'app__page',
		innerHTML: isModal
			? `
			<div id="open-project__page" class="open-project__page--modal">
				<header id="open-project__header"></header>
				<div id="open-project__body"></div>
				<footer id="open-project__footer"></footer>
				<div id="open-project__drop-note"></div>
			</div>
		`
			: `
			<div id="open-project__page" class="hub">
				<header id="open-project__header" class="hub__bar"></header>
				<div id="open-project__body" class="hub__body"></div>
				<footer class="hub__footer"></footer>
				<div id="open-project__drop-note"></div>
			</div>
		`,
	});

	if (isModal) {
		content.querySelector('#open-project__header').appendChild(makeModalHeading());
		content.querySelector('#open-project__footer').appendChild(makeModalFooter());
	} else {
		content.querySelector('.hub__footer').appendChild(makeHubFooter());
	}
	renderHubView(content);

	// Drag over handlers
	const page = content.querySelector('#open-project__page');
	page.addEventListener('dragenter', handleDragEnter);
	page.addEventListener('dragover', cancelDefaultEventActions);

	// Drop and Drag Leave handlers
	const dropNote = content.querySelector('#open-project__drop-note');
	dropNote.addEventListener('drop', (/** @type {DragEvent} */ event) => {
		cancelDefaultEventActions(event);
		handleOpenProjectPageFileInput(event?.dataTransfer?.items || []);
	});
	dropNote.addEventListener('dragleave', handleDragLeave);

	/*
		Put the keyboard somewhere useful. A dialog that opens with focus still
		out on the page behind it means the first Tab goes to whatever was next
		in the editor, and Escape is the only key that does anything.

		Queued, because the caller has not inserted this into the document yet
		and focus() on a detached node does nothing at all.
	*/
	if (isModal) {
		queueMicrotask(() => {
			if (!content.isConnected) return;
			/** @type {HTMLElement} */
			const target =
				content.querySelector('#input__new-project-name') ||
				content.querySelector('.hub-card') ||
				content.querySelector('.hub-modal__footer-actions .hub-button');
			target?.focus();
		});
	}

	return content;
}

/**
 * @returns {Object} - the auto-saves map from local storage, never undefined
 */
function getAutoSaves() {
	return getGlyphrStudioApp().getLocalStorage()?.autoSaves || {};
}

/*
	countAutoSaves() was here. It existed to pick which view the page opened
	on and which one an import error returned you to; both land on home now,
	whatever you have saved.
*/

// --------------------------------------------------------------
// Hub shell
// --------------------------------------------------------------

/**
 * The hub's rail.
 *
 * Built here rather than in left_rail.js because the destinations are the
 * hub's own; the rail itself - the mark, the button, the current state, the
 * theme toggle at the foot - is the app's, and comes from there unchanged.
 *
 * Restoring an auto-save into a second editor is not supported, so the
 * projects tab is not offered when that is what you are doing.
 *
 * @returns {Element}
 */
export function makeHubRail() {
	const tabs = RAIL_TABS.filter((id) => !(isSecondProject && id === 'projects')).map((id) => ({
		id: id,
		icon: hubViews[id].icon,
		label: hubViews[id].label,
	}));

	return makeAppPageRail({
		tabs: tabs,
		current: railTabFor(currentView),
		onSelect: switchHubView,
		footer: [
			makeElement({
				tag: 'button',
				className: 'left-rail__button',
				innerHTML: makeLineIcon('menu_help', 20),
				attributes: {
					type: 'button',
					title: 'Help',
					'aria-label': 'Help — opens the documentation in a new tab',
				},
				/*
					Out to the docs, not in to the Help page. The in-app one is
					a project editor page, and reaching it from here would build
					an editor around an empty project nobody asked for.
				*/
				onClick: () => window.open(UPSTREAM_HELP, '_blank', 'noopener'),
			}),
		],
	});
}

// --------------------------------------------------------------
// The bar, and the foot
// --------------------------------------------------------------

/**
 * The top bar: who you are looking at, a way to search, and the one action
 * that does not need a card to explain it.
 * @returns {Element}
 */
function makeHubTopBar() {
	const bar = makeElement({ tag: 'div', className: 'hub__bar-inner' });

	const identity = makeElement({ tag: 'div', className: 'hub__identity' });
	identity.appendChild(
		makeElement({ tag: 'span', className: 'hub__product', content: PRODUCT_NAME })
	);
	identity.appendChild(makeElement({ tag: 'span', className: 'hub__status-dot' }));
	identity.appendChild(
		makeElement({ tag: 'span', className: 'hub__status', content: 'Font design workspace' })
	);
	bar.appendChild(identity);

	const actions = makeElement({ tag: 'div', className: 'hub__bar-actions' });
	actions.appendChild(makeProjectSearch({ wide: true }));
	actions.appendChild(
		makeElement({
			tag: 'button',
			className: 'hub-button',
			attributes: { type: 'button' },
			innerHTML: `${hubIcons.upload}<span>Open file</span>`,
			onClick: () => getFilesFromFilePicker(handleOpenProjectPageFileInput),
		})
	);
	bar.appendChild(actions);

	return bar;
}

/**
 * The foot of the page: what this is, and whose it is.
 * @returns {Element}
 */
function makeHubFooter() {
	const app = getGlyphrStudioApp();
	const footer = makeElement({ tag: 'div', className: 'hub__footer-inner' });

	footer.appendChild(
		makeElement({
			tag: 'div',
			className: 'hub__footer-left',
			innerHTML: `Free and open source under the
				<a href="https://www.gnu.org/licenses/gpl.html" target="_blank">GNU GPL</a>`,
		})
	);
	footer.appendChild(
		makeElement({
			tag: 'div',
			className: 'hub__footer-right',
			innerHTML: `<a href="${PRODUCT_URL}" target="_blank">${PRODUCT_NAME}</a>
				<span class="hub__footer-version">${app.version}</span>`,
		})
	);

	return footer;
}

// --------------------------------------------------------------
// Modal shell
// --------------------------------------------------------------

/**
 * The dialog's title, and what it will do.
 *
 * The dialog used to open on "Start a new font" with no statement of
 * consequence anywhere in it - which is the one thing it owes you here, since
 * opening a project replaces one you may have been editing for an hour.
 *
 * @returns {Element}
 */
function makeModalHeading() {
	const currentName = getCurrentProjectEditor()?.project?.settings?.project?.name || 'this project';

	const wrapper = makeElement({ className: 'hub-modal__header-inner' });
	wrapper.appendChild(
		makeElement({
			tag: 'h1',
			className: 'hub-modal__title',
			content: isSecondProject ? 'Open a second project' : 'Open a project',
		})
	);
	wrapper.appendChild(
		makeElement({
			className: 'hub-modal__subtitle',
			content: isSecondProject
				? `Opens alongside ${currentName}. Switch between the two from Projects.`
				: `Replaces ${currentName} in this window.`,
		})
	);

	return wrapper;
}

/**
 * The footer: the two things that are not in the list.
 *
 * These used to be tabs, alongside the two lists. Which made a form and a
 * file picker into places you could be - and "New font" is not a place: you
 * went there and found a text box instead of projects. They are actions, so
 * they are drawn as buttons, and the list stops being one view among three
 * and becomes the thing the dialog is.
 *
 * @returns {Element}
 */
function makeModalFooter() {
	const footer = makeElement({ className: 'hub-modal__footer-inner' });

	const actions = makeElement({ className: 'hub-modal__footer-actions' });
	addAsChildren(actions, [
		makeElement({
			tag: 'button',
			className: 'hub-button',
			// Marked when the form it opens is what the body is showing, so it
			// is not still offering to take you somewhere you already are.
			attributes: { type: 'button', 'data-view': 'new' },
			innerHTML: `${hubIcons.plus}<span>New font</span>`,
			onClick: () => switchHubView('new'),
		}),
		makeElement({
			tag: 'button',
			className: 'hub-button',
			attributes: { type: 'button' },
			innerHTML: `${hubIcons.upload}<span>Open a file…</span>`,
			onClick: () => getFilesFromFilePicker(handleOpenProjectPageFileInput),
		}),
	]);

	addAsChildren(footer, [
		makeElement({
			className: 'hub-modal__drop-hint',
			innerHTML: `Or drop a font file anywhere here — <code>.gs2</code> <code>.otf</code> <code>.ttf</code> <code>.woff</code> <code>.svg</code>`,
		}),
		actions,
	]);
	return footer;
}

/**
 * Everything you can open, in one list.
 *
 * Your own work first, then the two samples, under headings - rather than one
 * behind each tab. Nothing to discover, no empty view to land in, and the
 * examples are visible to someone who has never seen them without having to
 * guess that a tab holds them.
 *
 * @returns {Element}
 */
function makeModalListView() {
	const wrapper = makeElement({ className: 'hub-sections' });

	// An auto-save cannot be restored into a second editor, so it is not offered.
	if (!isSecondProject) {
		const saves = getAutoSaves();
		const ids = Object.keys(saves).sort((a, b) => (saves[b]?.time || 0) - (saves[a]?.time || 0));

		wrapper.appendChild(
			makeHubSection(
				'Your projects',
				ids.length
					? ids.map((id) => {
							const save = saves[id];
							return makeProjectCard({
								title: save?.name || 'Untitled',
								meta: describeTimeAgo(save?.time),
								previewHTML: makeFontPreviewSVG(projectFromSavedData(save?.project)),
								onClick: () => loadProjectFromAutoSave(id),
							});
					  })
					: [],
				'Nothing auto-saved in this browser yet.'
			)
		);
	}

	wrapper.appendChild(makeHubSection('Examples', makeExampleCards()));
	return wrapper;
}

/**
 * One labelled group of cards.
 * @param {String} label - the heading
 * @param {Array<Element>} cards - what goes under it
 * @param {String =} emptyNote - shown instead of the grid when there are none
 * @returns {Element}
 */
function makeHubSection(label, cards, emptyNote = '') {
	const section = makeElement({ tag: 'section', className: 'hub-section' });
	section.appendChild(makeElement({ className: 'hub-section__label', content: label }));

	if (cards.length) {
		const grid = makeElement({ className: 'hub-grid' });
		addAsChildren(grid, cards);
		section.appendChild(grid);
	} else if (emptyNote) {
		section.appendChild(makeElement({ className: 'hub-section__empty', content: emptyNote }));
	}

	return section;
}

/**
 * The way back out of a form.
 * @param {String =} target - the view to go back to
 * @param {String =} label - what the link says
 * @returns {Element}
 */
function makeBackToList(target = 'list', label = 'All projects') {
	return makeElement({
		tag: 'button',
		className: 'hub-back',
		attributes: { type: 'button' },
		innerHTML: `${makeLineIcon('back', 16)}<span>${label}</span>`,
		onClick: () => switchHubView(target),
	});
}

/**
 * Switches which view is showing, without rebuilding the shell around it.
 * @param {String} viewName - key into hubViews
 */
function switchHubView(viewName) {
	// 'list' only exists in the dialog, where it is everything the page splits
	// across recents and examples.
	/*
		'list' is the dialog's view and has no entry in hubViews. Letting it
		through on the page used to leave the body empty and say nothing,
		because every branch in renderHubView missed.
	*/
	if (viewName === 'list' ? !isModal : !hubViews[viewName]) return;
	currentView = viewName;

	document.querySelectorAll('.hub-modal__footer-actions [data-view]').forEach((item) => {
		item.toggleAttribute('selected', item.getAttribute('data-view') === viewName);
	});

	if (!isModal) setAppPageRailTab(railTabFor(viewName));

	renderHubView(document);
}

/**
 * Fills the header and body for the current view.
 * @param {Document | Element} root - where to look for the hub elements
 */
function renderHubView(root) {
	const header = root.querySelector('#open-project__header');
	const body = root.querySelector('#open-project__body');
	if (!header || !body) return;

	body.innerHTML = '';

	/*
		Both headers are built once and stay. The dialog's is a title about what
		the dialog does; the page's is the app bar, which is about the app - and
		neither is about which view is open. Rebuilding the page's would also
		take the focus and the typed text out of the search field in it every
		time a key changed the grid underneath.
	*/
	if (!isModal && !header.firstElementChild) header.appendChild(makeHubTopBar());

	if (isModal && currentView === 'list') {
		body.appendChild(makeModalListView());
		return;
	}

	// The one place the dialog goes other than its list, and the way back out.
	if (isModal && currentView === 'new') {
		body.appendChild(makeBackToList());
		body.appendChild(makeNewProjectView());
		/** @type {HTMLElement} */
		const nameField = body.querySelector('#input__new-project-name');
		nameField?.focus();
		return;
	}

	if (currentView === 'home') body.appendChild(makeHomeView());
	else if (currentView === 'projects') body.appendChild(makeProjectsView());
	else if (currentView === 'learn') body.appendChild(makeLearnView());
	else if (currentView === 'new') body.appendChild(makeFormView('new'));
	else if (currentView === 'open') body.appendChild(makeFormView('open'));
}

/**
 * A form, with a heading over it and the way back out above that.
 *
 * The page's bar says what the app is and stays put, so a view that is not
 * the landing has to name itself. Without this the new-font form was a
 * labelled text box alone on an empty screen, with nothing saying what it
 * would make and no way back to what you came from.
 *
 * @param {String} viewName - 'new' or 'open'
 * @returns {Element}
 */
function makeFormView(viewName) {
	const view = makeElement({ tag: 'div', className: 'hub__home' });
	view.appendChild(makeBackToList('home', 'Home'));

	view.appendChild(
		makeSectionHead(
			hubViews[viewName].title,
			viewName === 'new'
				? 'It is saved in this browser as you work, and stays there until you export it.'
				: 'Drop a file anywhere on this page, or choose one.'
		)
	);

	const card = makeElement({ tag: 'div', className: 'studio-card hub__form-card' });
	card.appendChild(viewName === 'new' ? makeNewProjectView() : makeOpenFileView());
	view.appendChild(card);

	return view;
}

/**
 * Import failures call this to put the user back somewhere useful.
 */
export function resetOpenProjectTabs() {
	const page = document.querySelector('#open-project__page');
	if (!page) return;
	if (isModal) switchHubView('list');
	else switchHubView('home');
}

// --------------------------------------------------------------
// Cards
// --------------------------------------------------------------

/**
 * One project card: preview on top, name and meta underneath.
 *
 * The second meta line is the page's. A card there says what the font is -
 * its style and how much of it is drawn - and then when it was last touched,
 * which are two different questions and read badly run together. The dialog
 * passes one line and gets the row it had.
 *
 * @param {Object} args - card options
 * @param {String} args.title - project name
 * @param {String} args.meta - secondary line, e.g. a relative time
 * @param {String =} args.subMeta - a third line, under the meta
 * @param {String} args.previewHTML - inline SVG for the thumbnail
 * @param {(event: Event) => void} args.onClick - what opening the card does
 * @returns {Element}
 */
function makeProjectCard({ title, meta, subMeta = '', previewHTML, onClick }) {
	const card = makeElement({
		tag: 'button',
		className: 'hub-card',
		attributes: { type: 'button', title: `Open ${title}` },
	});

	/*
		No corner badge. Every card in the Examples view is an example, under a
		tab that says so - and the pill sat on top of the letterforms, which are
		the only thing on the card worth looking at.
	*/
	const preview = makeElement({
		className: 'hub-card__preview',
		innerHTML: previewHTML || `<span class="hub-card__preview-empty">No outlines yet</span>`,
	});

	/*
		Text, not markup. A project's name is whatever someone typed - or
		whatever family name was in an OTF they opened - and it was being
		interpolated into innerHTML, so a name with a '<' in it broke the card
		and a crafted one from a font file put arbitrary HTML on the page.
	*/
	const info = makeElement({ tag: 'div', className: 'hub-card__info' });
	const lines = [
		{ className: 'hub-card__title', text: title },
		{ className: 'hub-card__meta', text: meta },
	];
	if (subMeta) lines.push({ className: 'hub-card__meta hub-card__meta--sub', text: subMeta });

	lines.forEach((line) => {
		const span = makeElement({ tag: 'span', className: line.className });
		span.textContent = line.text;
		info.appendChild(span);
	});

	addAsChildren(card, [preview, info]);
	card.addEventListener('click', onClick);
	return card;
}

/**
 * What a project card says about the font itself.
 *
 * The count is of glyphs that have outlines, not of slots in the project: a
 * new project has a thousand empty characters in it, and reporting that as
 * "1046 characters" would describe work nobody has done.
 *
 * @param {Object | false} project - a GlyphrStudioProject, or false
 * @returns {String}
 */
function describeProject(project) {
	if (!project) return '';

	const style = project?.settings?.font?.style || 'Regular';
	const glyphs = project?.glyphs || {};
	const drawn = Object.keys(glyphs).filter((id) => glyphs[id]?.shapes?.length).length;

	/* The character, not the entity: this is set as text, not as markup. */
	return `${style} · ${drawn} character${drawn === 1 ? '' : 's'}`;
}

/**
 * What a card needs about one auto-save, worked out once.
 *
 * Every card builds a whole GlyphrStudioProject to draw its own letterforms,
 * which project_preview.js warns is fine for a handful and not for a loop.
 * The grid is rebuilt on every keystroke in the search, every sort change and
 * every layout toggle - so without this, typing five letters re-instantiated
 * every stored project five times.
 *
 * Keyed by the save's own timestamp as well as its id, so an entry goes stale
 * the moment the project behind it is saved again.
 *
 * @type {Map<String, Object>}
 */
const projectSummaryCache = new Map();

/**
 * @param {String} id - the auto-save's id
 * @param {Object} save - the auto-save record
 * @returns {Object} - { meta, previewHTML }
 */
function summarizeSave(id, save) {
	const key = `${id}:${save?.time || 0}`;
	const cached = projectSummaryCache.get(key);
	if (cached) return cached;

	const project = projectFromSavedData(save?.project);
	const summary = {
		meta: describeProject(project),
		previewHTML: makeFontPreviewSVG(project, { width: 300, height: 120, maxGlyphs: 6 }),
	};

	projectSummaryCache.set(key, summary);
	return summary;
}

/**
 * Turns a timestamp into "3 minutes ago" style text.
 * @param {Number} time - epoch milliseconds
 * @returns {String}
 */
function describeTimeAgo(time) {
	const elapsed = Date.now() - time;
	if (!isFinite(elapsed) || elapsed < 0) return 'Edited recently';

	const minute = 60 * 1000;
	const hour = 60 * minute;
	const day = 24 * hour;

	if (elapsed < minute) return 'Edited just now';
	if (elapsed < hour) {
		const count = Math.round(elapsed / minute);
		return `Edited ${count} minute${count === 1 ? '' : 's'} ago`;
	}
	if (elapsed < day) {
		const count = Math.round(elapsed / hour);
		return `Edited ${count} hour${count === 1 ? '' : 's'} ago`;
	}
	if (elapsed < day * 30) {
		const count = Math.round(elapsed / day);
		return `Edited ${count} day${count === 1 ? '' : 's'} ago`;
	}
	return `Edited ${new Date(time).toLocaleDateString()}`;
}

/**
 * An empty state with a single suggested next step.
 * @param {String} message - what is missing
 * @param {String} actionLabel - button text
 * @param {Function} onAction - button handler
 * @returns {Element}
 */
function makeEmptyState(message, actionLabel, onAction) {
	const wrapper = makeElement({ tag: 'div', className: 'hub-empty' });
	addAsChildren(wrapper, [
		makeElement({ tag: 'p', className: 'hub-empty__message', content: message }),
		makeElement({
			tag: 'button',
			className: 'hub-button hub-button--primary',
			attributes: { type: 'button' },
			innerHTML: `${hubIcons.plus}<span>${actionLabel}</span>`,
			onClick: onAction,
		}),
	]);
	return wrapper;
}

// --------------------------------------------------------------
// Views
// --------------------------------------------------------------

// --------------------------------------------------------------
// The project grid, and the three controls over it
// --------------------------------------------------------------

/**
 * The auto-saved project ids, filtered by the search and in sort order.
 * @returns {Array<String>}
 */
function sortedSaveIDs() {
	const saves = getAutoSaves();
	let ids = Object.keys(saves);

	if (hubQuery) {
		ids = ids.filter((id) => (saves[id]?.name || 'Untitled').toLowerCase().includes(hubQuery));
	}

	if (hubSort === 'name') {
		ids.sort((a, b) =>
			(saves[a]?.name || 'Untitled').localeCompare(saves[b]?.name || 'Untitled', undefined, {
				sensitivity: 'base',
			})
		);
	} else {
		ids.sort((a, b) => (saves[b]?.time || 0) - (saves[a]?.time || 0));
	}

	return ids;
}

/**
 * Cards for the auto-saved projects.
 * @param {Number =} limit - how many to build, or 0 for all of them
 * @returns {Array<Element>}
 */
function makeSavedProjectCards(limit = 0) {
	const saves = getAutoSaves();
	let ids = sortedSaveIDs();
	if (limit) ids = ids.slice(0, limit);

	return ids.map((id) => {
		const save = saves[id];
		const summary = summarizeSave(id, save);

		return makeProjectCard({
			title: save?.name || 'Untitled',
			meta: summary.meta,
			subMeta: describeTimeAgo(save?.time),
			previewHTML: summary.previewHTML,
			onClick: () => loadProjectFromAutoSave(id),
		});
	});
}

/**
 * The grid itself, which the three controls above it replace in place.
 * @param {Number =} limit - how many cards, or 0 for all of them
 * @returns {Element}
 */
function makeProjectGrid(limit = 0) {
	const grid = makeElement({
		tag: 'div',
		className: `hub-grid hub-grid--${hubLayout}`,
		id: 'hub__project-grid',
		attributes: { 'data-limit': String(limit) },
	});

	const cards = makeSavedProjectCards(limit);

	if (cards.length) {
		addAsChildren(grid, cards);
	} else if (hubQuery) {
		grid.appendChild(
			makeElement({
				tag: 'div',
				className: 'hub-section__empty',
				content: `No project here is called “${hubQuery}”.`,
			})
		);
	} else {
		grid.appendChild(
			makeEmptyState(
				`Nothing saved yet. Projects you work on are auto-saved in this browser and show up here.`,
				'Create your first font',
				() => switchHubView('new')
			)
		);
	}

	return grid;
}

/**
 * Rebuilds the grid without touching the controls over it, so the search
 * field keeps the focus and the caret it had.
 */
function refreshProjectGrid() {
	const grid = document.querySelector('#hub__project-grid');
	if (!grid) return;
	grid.replaceWith(makeProjectGrid(Number(grid.getAttribute('data-limit')) || 0));
}

/**
 * The project search.
 * @param {Object =} args
 * @param {Boolean =} args.wide - the bar's copy, which has room for more
 * @returns {Element}
 */
function makeProjectSearch({ wide = false } = {}) {
	const field = makeElement({
		tag: 'div',
		className: `hub__search${wide ? ' hub__search--wide' : ''}`,
	});
	field.appendChild(
		makeElement({
			tag: 'span',
			className: 'hub__search-icon',
			innerHTML: makeLineIcon('search', 16),
		})
	);

	const input = makeElement({
		tag: 'input',
		className: 'hub__search-input',
		attributes: {
			type: 'search',
			placeholder: 'Search projects…',
			spellcheck: 'false',
			'aria-label': 'Search projects',
			value: hubQuery,
		},
	});

	input.addEventListener('input', (event) => {
		// @ts-expect-error 'property does exist'
		const typed = event.target.value || '';
		hubQuery = typed.trim().toLowerCase();

		/*
			The bar's copy is on screen everywhere, including the views that
			have no project grid under them - so typing there took the query
			and silently did nothing. Searching for a project means you want to
			see projects.
		*/
		if (!document.querySelector('#hub__project-grid')) {
			if (hubQuery) switchHubView('projects');
		} else {
			refreshProjectGrid();
		}

		/* Both copies of the field are one control; keep them saying the same thing. */
		document.querySelectorAll('.hub__search-input').forEach((other) => {
			// @ts-expect-error 'property does exist'
			if (other.value !== typed) other.value = typed;
		});
	});

	field.appendChild(input);
	return field;
}

/**
 * What the sort control offers.
 *
 * "Last edited", not "last opened". The timestamp is written by the auto-saver
 * on a history step; nothing in the app records when a project was opened, and
 * the line on every card under this control already says "Edited N ago".
 */
const SORT_OPTIONS = [
	{ id: 'recent', label: 'Last edited' },
	{ id: 'name', label: 'Name' },
];

/**
 * Sort order, on the app's own dropdown.
 *
 * option-chooser rather than a native select: the platform control draws its
 * own list, in its own shape, with its own type - which is the one popover on
 * the page that is not ours. This is the control the range choosers and the
 * PANOSE fields use, so the list that opens here is the list that opens
 * everywhere else.
 *
 * @returns {Element}
 */
function makeSortSelect() {
	const wrapper = makeElement({ tag: 'div', className: 'hub__sort' });
	wrapper.appendChild(makeElement({ tag: 'span', className: 'hub__sort-label', content: 'Sort' }));

	const current = SORT_OPTIONS.find((option) => option.id === hubSort) || SORT_OPTIONS[0];

	const chooser = makeElement({
		tag: 'option-chooser',
		className: 'hub__sort-chooser',
		attributes: {
			'selected-id': current.id,
			'selected-name': current.label,
			'aria-label': 'Sort projects',
		},
	});

	SORT_OPTIONS.forEach((option) => {
		const row = makeElement({
			tag: 'option',
			innerHTML: option.label,
			/*
				The id is stated rather than derived from the label, so the
				sort keys stay 'recent' and 'name' if the wording changes.
			*/
			attributes: { 'selection-id': option.id },
		});
		row.addEventListener('click', () => {
			hubSort = option.id;
			refreshProjectGrid();
		});
		chooser.appendChild(row);
	});

	wrapper.appendChild(chooser);
	return wrapper;
}

/**
 * Grid or list.
 *
 * Two buttons on one sunken track with the selected one raised, the way the
 * Settings tabs work - built from an attribute rather than a measured thumb,
 * because two equal segments need no measuring.
 *
 * @returns {Element}
 */
function makeViewSwitch() {
	const track = makeElement({
		tag: 'div',
		className: 'hub__view-switch',
		attributes: {
			role: 'group',
			'aria-label': 'How projects are laid out',
			'data-layout': hubLayout,
		},
	});

	const options = [
		{ id: 'grid', icon: 'viewGrid', label: 'Grid' },
		{ id: 'list', icon: 'viewList', label: 'List' },
	];

	options.forEach((option) => {
		const button = makeElement({
			tag: 'button',
			className: 'hub__view-button',
			innerHTML: makeLineIcon(option.icon, 16),
			attributes: {
				type: 'button',
				title: option.label,
				'aria-label': option.label,
				'aria-pressed': String(hubLayout === option.id),
				'data-layout': option.id,
			},
			onClick: () => {
				hubLayout = option.id;
				track.setAttribute('data-layout', hubLayout);
				track.querySelectorAll('.hub__view-button').forEach((other) => {
					other.setAttribute(
						'aria-pressed',
						String(other.getAttribute('data-layout') === hubLayout)
					);
				});
				refreshProjectGrid();
			},
		});
		track.appendChild(button);
	});

	return track;
}

// --------------------------------------------------------------
// Views
// --------------------------------------------------------------

/**
 * A section heading with its controls on the same line.
 * @param {String} title - the heading
 * @param {String} subtitle - the sentence under it
 * @param {Array<Element> =} tools - controls, right aligned
 * @returns {Element}
 */
function makeSectionHead(title, subtitle, tools = []) {
	const head = makeElement({ tag: 'div', className: 'hub__section-head' });

	const titles = makeElement({ tag: 'div', className: 'hub__section-titles' });
	titles.appendChild(makeElement({ tag: 'h2', className: 'hub__section-title', content: title }));
	if (subtitle) {
		titles.appendChild(
			makeElement({ tag: 'div', className: 'hub__section-subtitle', content: subtitle })
		);
	}
	head.appendChild(titles);

	if (tools.length) {
		const toolbar = makeElement({ tag: 'div', className: 'hub__section-tools' });
		addAsChildren(toolbar, tools);
		head.appendChild(toolbar);
	}

	return head;
}

/**
 * The letterform decoration on the create card.
 *
 * Type and the curve under it, which is the whole of what this app does. Set
 * in the app's own face rather than a display serif, for the same reason
 * every other surface is: this is the product, not an advert for it.
 *
 * @returns {Element}
 */
function makeSpecimenArt() {
	return makeElement({
		tag: 'div',
		className: 'hub__art',
		attributes: { 'aria-hidden': 'true' },
		innerHTML: `
			<svg viewBox="0 0 240 160" xmlns="http://www.w3.org/2000/svg" focusable="false">
				<text class="hub__art-letters" x="120" y="126" text-anchor="middle">Aa</text>
				<g class="hub__art-curve">
					<path d="M30 122C60 44 180 44 210 122"/>
					<path class="hub__art-handle" d="M30 122L60 58M210 122L180 58"/>
					<circle cx="60" cy="58" r="4.5"/>
					<circle cx="180" cy="58" r="4.5"/>
					<rect x="25.5" y="117.5" width="9" height="9" rx="1.5"/>
					<rect x="205.5" y="117.5" width="9" height="9" rx="1.5"/>
				</g>
			</svg>
		`,
	});
}

/**
 * The two ways in, side by side.
 * @returns {Element}
 */
function makeStartCards() {
	const row = makeElement({ tag: 'div', className: 'hub__start' });

	// --- Create ---------------------------------------------------
	const create = makeElement({ tag: 'div', className: 'studio-card hub__start-card hub__create' });
	const createText = makeElement({ tag: 'div', className: 'hub__start-text' });
	createText.appendChild(
		makeElement({ tag: 'div', className: 'studio-eyebrow', content: 'Start from scratch' })
	);
	createText.appendChild(
		makeElement({ tag: 'h2', className: 'hub__start-title', content: 'Create a new font' })
	);
	createText.appendChild(
		makeElement({
			tag: 'div',
			className: 'hub__start-body',
			content: 'Give your ideas a character of their own.',
		})
	);
	createText.appendChild(
		makeElement({
			tag: 'button',
			className: 'hub-button hub-button--primary hub-button--large',
			attributes: { type: 'button' },
			innerHTML: `${hubIcons.plus}<span>New font</span>`,
			onClick: () => switchHubView('new'),
		})
	);
	addAsChildren(create, [createText, makeSpecimenArt()]);

	/*
		--- Import -----------------------------------------------------

		One head line, and under it one object: the action itself, taking
		whatever height the head leaves. It used to be a stack - eyebrow, a
		plate beside a heading and a line of body, a button, a row of chips -
		which is the shape of a description with a button at the bottom of it,
		and it left 33px of unpainted card under the last chip, because a fixed
		stack in a stretched row always leaves a remainder.

		The plate went on its own merits: 48px, --r-lg, --icon-accent, holding
		makeLineIcon('upload', 24), which is .drop-note__icon at 44px with
		makeLineIcon('upload', 22). The card was drawing the drag overlay's own
		icon, which is most of why it read as a drop zone.
	*/
	const spokenFormats = `${ACCEPTED_FORMATS.slice(0, -1).join(', ')} or ${
		ACCEPTED_FORMATS[ACCEPTED_FORMATS.length - 1]
	}`;

	const importCard = makeElement({
		tag: 'div',
		className: 'studio-card hub__start-card hub__import',
	});

	const importHead = makeElement({ tag: 'div', className: 'hub__import-head' });
	importHead.appendChild(
		makeElement({ tag: 'div', className: 'studio-eyebrow', content: 'Import existing' })
	);
	/*
		Not <code>. resets.css dresses every `code` in the app as a key cap -
		20px tall, sunken, bordered - so a file extension rendered as one reads
		as a key you are being told to press. One line of mono text says the
		same thing and adds no box to a card whose argument is one soft corner.

		aria-hidden because the same list is spoken, punctuated, in the button's
		own name below. Both are built from ACCEPTED_FORMATS, so what the picker
		takes and what the card advertises cannot drift apart.
	*/
	importHead.appendChild(
		makeElement({
			tag: 'div',
			className: 'hub__import-formats',
			attributes: { 'aria-hidden': 'true' },
			content: ACCEPTED_FORMATS.join(' · '),
		})
	);
	importCard.appendChild(importHead);

	/*
		The action. A button's content model is phrasing content, so everything
		inside it is makeElement's default <span> - the one place in this file
		where the default is the right tag - and the CSS supplies the box.
	*/
	const importAction = makeElement({
		tag: 'button',
		className: 'hub__import-action',
		attributes: { type: 'button', 'aria-label': `Open a font file: ${spokenFormats}` },
		onClick: () => getFilesFromFilePicker(handleOpenProjectPageFileInput),
	});

	const importText = makeElement({ className: 'hub__import-text' });
	importText.appendChild(
		makeElement({ className: 'hub__import-title', content: 'Open a font file' })
	);
	importText.appendChild(
		makeElement({
			className: 'hub__import-caption',
			content: 'A saved project, or a typeface you already have.',
		})
	);

	addAsChildren(importAction, [
		importText,
		makeElement({
			className: 'hub__import-arrow',
			attributes: { 'aria-hidden': 'true' },
			innerHTML: '&rarr;',
		}),
	]);
	importCard.appendChild(importAction);

	addAsChildren(row, [create, importCard]);
	return row;
}

/**
 * The guide, along the foot of the home view.
 * @returns {Element}
 */
function makeGuideBanner() {
	const banner = makeElement({ tag: 'div', className: 'studio-card hub__guide' });

	banner.appendChild(
		makeElement({ tag: 'div', className: 'hub__plate', innerHTML: makeLineIcon('book', 24) })
	);

	const text = makeElement({ tag: 'div', className: 'hub__guide-text' });
	text.appendChild(
		makeElement({ tag: 'div', className: 'hub__guide-title', content: 'Make your first font' })
	);
	text.appendChild(
		makeElement({
			tag: 'div',
			className: 'hub__guide-body',
			content: 'A practical guide from first glyph to export.',
		})
	);
	banner.appendChild(text);

	banner.appendChild(
		makeElement({
			tag: 'a',
			className: 'studio-link hub__guide-link',
			attributes: { href: `${UPSTREAM_HELP}/`, target: '_blank' },
			innerHTML: `<span>Read the guide</span><span class="studio-link-arrow">&rarr;</span>`,
		})
	);

	return banner;
}

/**
 * The landing view: the headline, the two ways in, what you already have,
 * and the guide.
 * @returns {Element}
 */
function makeHomeView() {
	const view = makeElement({ tag: 'div', className: 'hub__home' });

	const hero = makeElement({ tag: 'div', className: 'hub__hero' });
	hero.appendChild(
		makeElement({
			tag: 'h1',
			className: 'hub__hero-title',
			content: 'Your next typeface starts here.',
		})
	);
	hero.appendChild(
		makeElement({
			tag: 'div',
			className: 'hub__hero-subtitle',
			content: 'Create a font, open a file, or pick up where you left off.',
		})
	);
	view.appendChild(hero);

	view.appendChild(makeStartCards());

	/*
		An auto-save cannot be restored into a second editor, so the projects
		you have are not offered when that is what you are doing.
	*/
	if (!isSecondProject) {
		const recents = makeElement({ tag: 'section', className: 'hub__recents' });
		recents.appendChild(
			makeSectionHead('Recent projects', 'Continue where you left off.', [
				makeProjectSearch(),
				makeSortSelect(),
				makeViewSwitch(),
			])
		);
		/* Three, because the rest of the page is what this one is for. */
		recents.appendChild(makeProjectGrid(3));
		view.appendChild(recents);
	}

	view.appendChild(makeGuideBanner());
	return view;
}

/**
 * Everything auto-saved in this browser.
 * @returns {Element}
 */
function makeProjectsView() {
	const view = makeElement({ tag: 'div', className: 'hub__home' });

	view.appendChild(
		makeSectionHead('Your projects', 'Auto-saved in this browser, newest first.', [
			makeProjectSearch(),
			makeSortSelect(),
			makeViewSwitch(),
		])
	);
	view.appendChild(makeProjectGrid());

	view.appendChild(
		makeElement({
			tag: 'div',
			className: 'hub-note',
			innerHTML: `Auto-saves live in this browser only. Use <b>File &rsaquo; Save</b> to keep a copy you can move between machines.`,
		})
	);

	return view;
}

/**
 * The bundled sample projects, and the documentation.
 * @returns {Element}
 */
function makeLearnView() {
	const view = makeElement({ tag: 'div', className: 'hub__home' });

	view.appendChild(makeSectionHead('Examples', 'Open a finished project and take it apart.'));
	const grid = makeElement({ tag: 'div', className: 'hub-grid hub-grid--grid' });
	addAsChildren(grid, makeExampleCards());
	view.appendChild(grid);

	view.appendChild(makeSectionHead('Guides', 'How to get from a first glyph to an exported font.'));
	view.appendChild(makeGuideBanner());

	return view;
}

/**
 * The bundled sample projects, as cards - shared by the page's Examples view
 * and the dialog's one list.
 * @returns {Array<Element>}
 */
function makeExampleCards() {
	const examples = [
		{
			id: 'oblegg',
			name: 'Oblegg',
			meta: 'Full test font — every feature exercised',
			data: obleggExampleProject,
		},
		{
			id: 'simpleProject',
			name: 'Simple v2 project',
			meta: 'A few characters, to show the basics',
			data: simpleExampleProject,
		},
	];

	return examples.map((example) => {
		// The samples ship as raw text or JSON depending on the file, so they go
		// through the same importer the file drop uses before being previewed.
		let previewHTML = '';
		try {
			const parsed =
				typeof example.data === 'string'
					? importGlyphrProjectFromText(example.data)
					: projectFromSavedData(example.data);
			previewHTML = makeFontPreviewSVG(parsed);
		} catch (error) {
			console.warn(`Could not preview example project ${example.id}:`, error);
		}

		return makeProjectCard({
			title: example.name,
			meta: example.meta,
			previewHTML: previewHTML,
			onClick: () => handleLoadSample(example.id),
		});
	});
}

/**
 * The new-font form.
 * @returns {Element}
 */
function makeNewProjectView() {
	const panel = makeElement({ className: 'hub-panel' });

	const label = makeElement({
		tag: 'label',
		className: 'hub-panel__label',
		attributes: { for: 'input__new-project-name' },
		content: 'Font name',
	});

	const input = makeElement({
		tag: 'input',
		id: 'input__new-project-name',
		className: 'hub-panel__input',
		attributes: { type: 'text', value: 'My Font', autofocus: 'true', spellcheck: 'false' },
	});

	const createButton = makeElement({
		tag: 'button',
		id: 'button__create-new-project',
		className: 'hub-button hub-button--primary hub-button--large',
		attributes: { type: 'button' },
		innerHTML: `${hubIcons.plus}<span>Create font</span>`,
		onClick: handleNewProject,
	});

	// Enter is what people press in a single-field form.
	input.addEventListener('keydown', (/** @type {KeyboardEvent} */ event) => {
		if (event.key === 'Enter') handleNewProject();
	});

	const hint = makeElement({
		className: 'hub-panel__hint',
		innerHTML: `You can rename the font later in <b>Settings &rsaquo; Font</b>. Nothing is uploaded anywhere — the project stays in this browser until you export it.`,
	});

	addAsChildren(panel, [label, input, createButton, hint]);
	return panel;
}

/**
 * Drop zone plus file picker.
 * @returns {Element}
 */
function makeOpenFileView() {
	const panel = makeElement({ className: 'hub-panel hub-panel--wide' });

	const dropTarget = makeElement({
		id: 'open-project__drop-target',
		innerHTML: `
			<div class="hub-drop__icon">${hubIcons.upload}</div>
			<div class="hub-drop__title">Drop a font file anywhere on this page</div>
			<div class="hub-drop__formats">
				<code>.gs2</code> <code>.txt</code> Blue Rain Type project<br>
				<code>.otf</code> <code>.ttf</code> <code>.woff</code> OpenType, TrueType, WOFF<br>
				<code>.svg</code> SVG font
			</div>
		`,
	});

	const openFileChooser = makeElement({
		tag: 'button',
		className: 'hub-button hub-button--primary hub-button--large',
		attributes: { type: 'button' },
		innerHTML: `${hubIcons.upload}<span>Choose a file</span>`,
		onClick: () => getFilesFromFilePicker(handleOpenProjectPageFileInput),
	});

	addAsChildren(panel, [dropTarget, openFileChooser]);
	return panel;
}

/**
 * Shows an OS File Picker, then returns the selected files
 * to a provided callback function.
 * @param {Function} callback - what to do with the files
 * @param {Object} pickerOptions - OS File Picker Options Object
 */
export async function getFilesFromFilePicker(callback, pickerOptions = {}) {
	// @ts-expect-error 'property does exist'
	if (window.showOpenFilePicker) {
		// @ts-expect-error 'property does exist'
		const files = await window.showOpenFilePicker(pickerOptions);
		callback(files);
	} else {
		// showError(`Can't open OS File Picker. Try dragging and dropping a file instead.`);
		/** @type {any} */
		const fallbackFileChooser = makeElement({ tag: 'input', attributes: { type: 'file' } });
		fallbackFileChooser.addEventListener('change', (event) => {
			// log(fallbackFileChooser.files);
			cancelDefaultEventActions(event);
			callback(fallbackFileChooser.files);
		});
		fallbackFileChooser.click();
	}
}

/**
 * Handle file input or drop
 * @param {Object} files - event from drop, or fileHandle from showOpenFilePicker
 */
async function handleOpenProjectPageFileInput(files) {
	// log('handleOpenProjectPageFileInput', 'start');
	// log(`\n⮟files⮟`);
	// log(files);

	/** @type {HTMLElement} */
	const dropNote = document.querySelector('#open-project__drop-note');
	dropNote?.classList.remove('is-active');

	const body = document.querySelector('#open-project__body');
	if (body) {
		body.innerHTML = '';
		body.appendChild(makeProgressIndicator());
	}

	let fileInput;
	let fileResult;
	if (files.length) {
		fileInput = files[0];
		// log(fileInput);
		if (fileInput.getAsFileSystemHandle) fileResult = await fileInput.getAsFileSystemHandle();
		else if (fileInput.getAsFile) fileResult = await fileInput.getAsFile();
		else fileResult = fileInput;
	} else {
		showError(`No files were found that could be imported.`);
	}

	// log(fileResult);
	if (!fileResult) {
		showError(`The file could not be read.`);
		resetOpenProjectTabs();
	} else {
		validateSingleFileInput(fileResult, postValidationCallback);
	}

	// log('handleOpenProjectPageFileInput', 'end');
}

/**
 * What to do after a file has been validated
 * @param {Object} validationResult - validation object
 */
function postValidationCallback(validationResult) {
	// log(`postValidationCallback`, 'start');
	if (isSecondProject) addProjectEditorAndSetAsImportTarget();
	if (validationResult.content) {
		if (validationResult.fileType === 'font') {
			ioFont_importFont(validationResult.content, false, validationResult.fileSuffix);
		} else if (validationResult.fileType === 'svg') {
			ioSVG_importSVGfont(validationResult.content);
		} else if (validationResult.fileType === 'project') {
			getCurrentProjectEditor().loadedFileHandle = validationResult.fileHandle;
			importProjectDataAndNavigate(validationResult.content);
		}
	} else {
		if (validationResult.errorMessage) {
			showError(validationResult.errorMessage);
		} else {
			showError(`Some unknown error happened when loading the file.`);
		}

		resetOpenProjectTabs();
	}
	// log(`postValidationCallback`, 'end');
}

/**
 * Do all the stuff necessary to import a text file and
 * get the UI to the right page.
 * @param {GlyphrStudioProject | Object} glyphrStudioProjectFile
 */
export function importProjectDataAndNavigate(glyphrStudioProjectFile) {
	// log(`importProjectDataAndNavigate`, 'start');
	closeEveryTypeOfDialog();
	const editor = getProjectEditorImportTarget();
	setCurrentProjectEditor(editor);
	if (!glyphrStudioProjectFile) {
		/** @type {HTMLInputElement} */
		const nameInput = document.querySelector('#input__new-project-name');
		const name = nameInput?.value || 'My Font';
		editor.project = new GlyphrStudioProject({
			settings: { project: { name }, font: { family: name } },
		});
	} else {
		editor.project = importGlyphrProjectFromText(glyphrStudioProjectFile);
	}

	editor.project.resetSessionStateForAllItems();
	editor.nav.page = 'Overview';
	if (isSecondProject) showToast(`Switched to<br>${editor.project.settings.project.name}`);
	updateWindowUnloadEvent();
	editor.navigate();
	// log(`importProjectDataAndNavigate`, 'end');
}

/**
 * Finds and loads a project by ID from local storage
 * @param {String} projectID - internal Glyphr Studio Project ID
 * @returns nothing
 */
function loadProjectFromAutoSave(projectID) {
	const saves = getGlyphrStudioApp().getLocalStorage().autoSaves;
	for (let id in saves) {
		if (id === projectID) {
			importProjectDataAndNavigate(saves[id].project);
			showToast(`Restored project from auto-save:<br>${saves[id].name}`);
			return;
		}
	}
}

/**
 * Handle Message event
 * @param {Object} event - event
 */
// TODO Paste handler on open project page
/*
function handleMessage(event) {
	const app = getGlyphrStudioApp();
	// assume strings are SVG fonts
	app.temp.droppedFileContent = event.data;

	if (typeof event.data === 'string') {
		// ioSVG_importSVGfont(false);
		// assume array buffers are otf fonts
	} else if (event.data instanceof ArrayBuffer) {
		// ioFont_importFont(false);
	}
}
*/
// --------------------------------------------------------------
// Drag Events
// --------------------------------------------------------------

/**
 * Handle DragOver event
 * @param {Object} event - event
 */
function handleDragEnter(event) {
	// log(`handleDragEnter`, 'start');
	event.dataTransfer.dropEffect = 'copy';
	/** @type {HTMLElement} */
	const dropNote = document.querySelector('#open-project__drop-note');
	if (!dropNote) return;

	/*
		Built once and kept. It used to be written on every dragenter, which
		fires again for every element the cursor crosses - so the overlay's
		contents were being torn down and rebuilt continuously for as long as a
		file was held over the window.
	*/
	if (!dropNote.firstElementChild) {
		const card = makeElement({ className: 'drop-note__card' });
		addAsChildren(card, [
			makeElement({ className: 'drop-note__icon', innerHTML: makeLineIcon('upload', 22) }),
			makeElement({
				className: 'drop-note__title',
				content: isSecondProject ? 'Drop to open alongside' : 'Drop to open',
			}),
			makeElement({
				className: 'drop-note__formats',
				innerHTML: ['.gs2', '.otf', '.ttf', '.woff', '.svg']
					.map((extension) => `<code>${extension}</code>`)
					.join(''),
			}),
		]);
		dropNote.appendChild(card);
	}

	dropNote.classList.add('is-active');
	// log(`handleDragEnter`, 'end');
}

/**
 * Handle DragLeave event
 */
function handleDragLeave() {
	// log(`handleDragLeave`, 'start');
	/** @type {HTMLElement} */
	const dropNote = document.querySelector('#open-project__drop-note');
	// One class, and the stylesheet fades it out. There is no longer a 170ms
	// timer racing a 170ms animation to decide when it disappears.
	dropNote?.classList.remove('is-active');
	// log(`handleDragLeave`, 'end');
}

// --------------------------------------------------------------
// Loading projects
// --------------------------------------------------------------

/**
 * Create a new project from scratch
 */
function handleNewProject() {
	if (isSecondProject) addProjectEditorAndSetAsImportTarget();
	setTimeout(importProjectDataAndNavigate, 10);
}

/**
 * Load a project sample
 * @param {String} name - which sample to load
 */
function handleLoadSample(name) {
	if (isSecondProject) addProjectEditorAndSetAsImportTarget();
	const body = document.querySelector('#open-project__body');
	if (body) {
		body.innerHTML = '';
		body.appendChild(makeProgressIndicator());
	}

	let project = simpleExampleProject;
	if (name === 'oblegg') project = obleggExampleProject;
	setTimeout(function () {
		// log(`Loading sample project ${name}`);

		importProjectDataAndNavigate(project);
	}, 100);
}
