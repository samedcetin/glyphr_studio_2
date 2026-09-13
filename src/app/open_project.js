import { addAsChildren, makeElement } from '../common/dom.js';
import { makeLineIcon } from '../common/icons.js';
import logoHorizontal from '../common/graphics/logo-wordmark-horizontal-small.svg?raw';
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
import { cycleThemePreference, getThemePreference, onThemeChange } from '../common/theme.js';
import { makeFontPreviewSVG, projectFromSavedData } from './project_preview.js';

/**
	PAGE > OPEN PROJECT
	-------------------
	The first screen you see, rebuilt as a file hub rather than a splash page.

	It used to be a marketing panel on the left and four tabs on the right, with
	auto-saved projects hidden behind a tab called "Restore" and shown as a list
	of ids and timestamps. Which meant the thing you almost always want - the
	font you were working on ten minutes ago - took two clicks and looked like
	a database row.

	Now it opens on your projects, as cards showing their own letterforms, with
	the create and open actions where a file browser puts them. Same handlers
	underneath; what changed is what you land on.
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

/** Which view the hub is showing: 'recents' | 'examples' | 'new' | 'open'. */
let currentView = 'recents';

/**
 * Sidebar / view definitions.
 * `title` heads the content area, `action` is the primary button beside it.
 */
const hubViews = {
	recents: { label: 'Your projects', icon: 'clock', title: 'Your projects' },
	examples: { label: 'Examples', icon: 'sparkle', title: 'Example projects' },
	new: { label: 'New font', icon: 'plus', title: 'Start a new font' },
	open: { label: 'Open a file', icon: 'upload', title: 'Open a file' },
};

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
['clock', 'sparkle', 'plus', 'upload', 'system', 'light', 'dark'].forEach((name) => {
	hubIcons[name] = makeLineIcon(name, 20);
});

const themeLabels = {
	system: 'Theme: follow system',
	light: 'Theme: light',
	dark: 'Theme: dark',
};

/**
 * Theme control for the hub.
 *
 * The hub covers the app's top bar, so the toggle up there is out of reach
 * here - which would strand anyone who lands on the wrong theme before they
 * have even opened a project.
 *
 * @returns {Element}
 */
function makeHubThemeToggle() {
	const button = makeElement({
		tag: 'button',
		className: 'hub-button hub-button--icon',
		attributes: {
			type: 'button',
			title: themeLabels[getThemePreference()],
			'aria-label': themeLabels[getThemePreference()],
		},
		innerHTML: hubIcons[getThemePreference()],
	});

	const render = () => {
		const preference = getThemePreference();
		button.innerHTML = hubIcons[preference];
		button.setAttribute('title', themeLabels[preference]);
		button.setAttribute('aria-label', themeLabels[preference]);
	};

	button.addEventListener('click', () => {
		cycleThemePreference();
		render();
	});

	onThemeChange(render);
	return button;
}

/**
 * Page Maker for the Open Project page
 * @param {Boolean} secondProjectFlag - true if it's not the currently selected project
 * @param {Boolean =} modalFlag - true when shown in a dialog rather than as the page
 * @returns {Element}
 */
export function makePage_OpenProject(secondProjectFlag = false, modalFlag = false) {
	isSecondProject = secondProjectFlag;
	isModal = modalFlag;

	// Land on whatever is most useful: your own work if you have any, the
	// new-font form on a genuinely first run.
	currentView = countAutoSaves() ? 'recents' : 'new';
	// Restoring an auto-save into a second editor is not supported, so that
	// view is not offered there.
	if (isSecondProject) currentView = 'new';
	/*
		The dialog opens on its list and nothing else. It is titled "Open a
		project"; landing on a box asking you to name a new one contradicts the
		thing you just clicked, and with nothing auto-saved there is still
		something to open.
	*/
	if (isModal) currentView = 'list';

	/*
		Two shells, because a dialog is not a page.

		The page gets the file-browser layout: a rail of destinations down the
		left, a heading and the app's own identity. Inside a dialog all of that
		is furniture you already have - you are three feet from the app's left
		rail and its theme toggle, and you know which app you are in. What a
		dialog needs is a title that says what pressing something here will do,
		one row of places to look, and the thing you came for.
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
			<div id="open-project__page">
				<div id="open-project__sidebar"></div>
				<div id="open-project__main">
					<header id="open-project__header"></header>
					<div id="open-project__body"></div>
				</div>
				<div id="open-project__drop-note"></div>
			</div>
		`,
	});

	if (isModal) {
		content.querySelector('#open-project__header').appendChild(makeModalHeading());
		content.querySelector('#open-project__footer').appendChild(makeModalFooter());
	} else {
		content.querySelector('#open-project__sidebar').appendChild(makeHubSidebar());
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

/**
 * @returns {Number} - how many auto-saved projects exist
 */
function countAutoSaves() {
	return Object.keys(getAutoSaves()).length;
}

// --------------------------------------------------------------
// Hub shell
// --------------------------------------------------------------

/**
 * The left rail: identity at the top, views in the middle, version at the foot.
 * @returns {Element}
 */
function makeHubSidebar() {
	const app = getGlyphrStudioApp();
	const wrapper = makeElement({ className: 'hub-sidebar' });

	const brand = makeElement({
		className: 'hub-sidebar__brand',
		innerHTML: logoHorizontal,
	});

	const nav = makeElement({ tag: 'nav', className: 'hub-sidebar__nav' });
	const availableViews = isSecondProject
		? ['new', 'open', 'examples']
		: ['recents', 'examples', 'new', 'open'];

	availableViews.forEach((viewName) => {
		const view = hubViews[viewName];
		const count = viewName === 'recents' ? countAutoSaves() : 0;

		const button = makeElement({
			tag: 'button',
			className: 'hub-sidebar__nav-item',
			attributes: { type: 'button', 'data-view': viewName },
			innerHTML: `
				${hubIcons[view.icon]}
				<span class="hub-sidebar__nav-label">${view.label}</span>
				${count ? `<span class="hub-sidebar__nav-count">${count}</span>` : ''}
			`,
		});

		if (viewName === currentView) button.setAttribute('selected', '');
		button.addEventListener('click', () => switchHubView(viewName));
		nav.appendChild(button);
	});

	const recent = 1000 * 60 * 60 * 24 * 7; // seven days in milliseconds
	const isRecentlyUpdated = Date.now() - app.versionDate < recent;

	const footer = makeElement({
		className: 'hub-sidebar__footer',
		innerHTML: `
			<div class="hub-sidebar__version">
				Version ${app.version}
				${
					isRecentlyUpdated
						? ` &middot; <a href="https://www.glyphrstudio.com/help/about/updates.html" target="_blank">what's new</a>`
						: ''
				}
			</div>
			<div class="hub-sidebar__legal">
				Free and open source under the
				<a href="https://www.gnu.org/licenses/gpl.html" target="_blank">GNU GPL</a>.
				<a href="http://www.glyphrstudio.com" target="_blank">glyphrstudio.com</a>
			</div>
		`,
	});

	addAsChildren(wrapper, [brand, nav, footer]);
	return wrapper;
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
 * The back link out of the new-font form.
 * @returns {Element}
 */
function makeBackToList() {
	return makeElement({
		tag: 'button',
		className: 'hub-back',
		attributes: { type: 'button' },
		innerHTML: `${makeLineIcon('back', 16)}<span>All projects</span>`,
		onClick: () => switchHubView('list'),
	});
}

/**
 * Switches which view is showing, without rebuilding the shell around it.
 * @param {String} viewName - key into hubViews
 */
function switchHubView(viewName) {
	// 'list' only exists in the dialog, where it is everything the page splits
	// across recents and examples.
	if (viewName !== 'list' && !hubViews[viewName]) return;
	currentView = viewName;

	document
		.querySelectorAll('.hub-sidebar__nav-item, .hub-modal__footer-actions [data-view]')
		.forEach((item) => {
			item.toggleAttribute('selected', item.getAttribute('data-view') === viewName);
		});

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
		The dialog's header is built once and stays: its title is about what the
		dialog does, which does not change with what is in the body.
	*/
	if (!isModal) {
		header.innerHTML = '';
		header.appendChild(
			makeElement({
				tag: 'h1',
				className: 'hub-header__title',
				content: hubViews[currentView].title,
			})
		);

		// Create and open stay reachable from every view, the way a file browser
		// keeps its "new" button in the corner regardless of which folder you are in.
		const actions = makeElement({ className: 'hub-header__actions' });
		addAsChildren(actions, [
			makeHubThemeToggle(),
			makeElement({
				tag: 'button',
				className: 'hub-button hub-button--primary',
				attributes: { type: 'button' },
				innerHTML: `${hubIcons.plus}<span>New font</span>`,
				onClick: () => switchHubView('new'),
			}),
			makeElement({
				tag: 'button',
				className: 'hub-button',
				attributes: { type: 'button' },
				innerHTML: `${hubIcons.upload}<span>Open file</span>`,
				onClick: () => getFilesFromFilePicker(handleOpenProjectPageFileInput),
			}),
		]);
		header.appendChild(actions);
	}

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

	if (currentView === 'recents') body.appendChild(makeRecentsView());
	else if (currentView === 'examples') body.appendChild(makeExamplesView());
	else if (currentView === 'new') body.appendChild(makeNewProjectView());
	else if (currentView === 'open') body.appendChild(makeOpenFileView());
}

/**
 * Import failures call this to put the user back somewhere useful.
 */
export function resetOpenProjectTabs() {
	const page = document.querySelector('#open-project__page');
	if (!page) return;
	if (isModal) switchHubView('list');
	else switchHubView(countAutoSaves() && !isSecondProject ? 'recents' : 'new');
}

// --------------------------------------------------------------
// Cards
// --------------------------------------------------------------

/**
 * One project card: preview on top, name and meta underneath.
 * @param {Object} args - card options
 * @param {String} args.title - project name
 * @param {String} args.meta - secondary line, e.g. a relative time
 * @param {String} args.previewHTML - inline SVG for the thumbnail
 * @param {(event: Event) => void} args.onClick - what opening the card does
 * @returns {Element}
 */
function makeProjectCard({ title, meta, previewHTML, onClick }) {
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

	const info = makeElement({
		className: 'hub-card__info',
		innerHTML: `
			<span class="hub-card__title">${title}</span>
			<span class="hub-card__meta">${meta}</span>
		`,
	});

	addAsChildren(card, [preview, info]);
	card.addEventListener('click', onClick);
	return card;
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
	const wrapper = makeElement({ className: 'hub-empty' });
	addAsChildren(wrapper, [
		makeElement({ className: 'hub-empty__message', content: message }),
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

/**
 * Grid of auto-saved projects, newest first.
 * @returns {Element}
 */
function makeRecentsView() {
	const saves = getAutoSaves();
	const ids = Object.keys(saves).sort((a, b) => (saves[b]?.time || 0) - (saves[a]?.time || 0));

	if (!ids.length) {
		return makeEmptyState(
			`Nothing saved yet. Projects you work on are auto-saved in this browser and show up here.`,
			// "Your first font" is only true on the page, where this is a first
			// run. In the dialog you are looking at this with a project open.
			isModal ? 'Start a new font' : 'Create your first font',
			() => switchHubView('new')
		);
	}

	const grid = makeElement({ className: 'hub-grid' });

	ids.forEach((id) => {
		const save = saves[id];
		const project = projectFromSavedData(save?.project);

		grid.appendChild(
			makeProjectCard({
				title: save?.name || 'Untitled',
				meta: describeTimeAgo(save?.time),
				previewHTML: makeFontPreviewSVG(project),
				onClick: () => loadProjectFromAutoSave(id),
			})
		);
	});

	const note = makeElement({
		className: 'hub-note',
		innerHTML: `Auto-saves live in this browser only. Use <b>File &rsaquo; Save</b> to keep a copy you can move between machines.`,
	});

	const wrapper = makeElement();
	addAsChildren(wrapper, [grid, note]);
	return wrapper;
}

/**
 * The two bundled sample projects, as cards.
 * @returns {Element}
 */
function makeExamplesView() {
	const grid = makeElement({ className: 'hub-grid' });
	addAsChildren(grid, makeExampleCards());
	return grid;
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
				<code>.gs2</code> <code>.txt</code> Glyphr Studio project<br>
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
