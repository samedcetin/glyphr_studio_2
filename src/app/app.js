import { PRODUCT_NAME, SUPPORT_EMAIL } from './brand.js';
import { makeElement } from '../common/dom.js';
import { makeLineIcon } from '../common/icons.js';
import { shortcutLabel } from '../common/keyboard.js';
import { copyToClipboard, countItems } from '../common/functions.js';
import { closeEveryTypeOfDialog, showToast } from '../controls/dialogs/dialogs.js';
import { parseSemVer } from '../formats_io/validate_file_input.js';
import { importGlyphrProjectFromText } from '../project_editor/import_project.js';
import { ProjectEditor } from '../project_editor/project_editor.js';
import boolTestProject from '../samples/boolean_tests.gs2?raw';
import obleggSampleProject from '../samples/oblegg.gs2?raw';
import simpleExampleProject from '../samples/simpleExampleProject.json';
/** @type {Object} */
import * as config from './app_config.json';
import { _DEV } from './dev_mode_includes.js';
import {
	addProjectEditorAndSetAsImportTarget,
	getCurrentProject,
	getGlyphrStudioApp,
	getProjectEditorImportTarget,
	setCurrentProjectEditor,
} from './main.js';
import { makeHubRail, makePage_OpenProject } from './open_project.js';

/**
 * Creates a new Glyphr Studio Application
 */
export class GlyphrStudioApp {
	constructor() {
		// Settings
		this.settings = {
			dev: {
				// Internal Dev Stuff
				mode: config.devMode, // {bool} global switch for all the stuff below
				overwriteTitle: false, // {bool} Use a 'Dev Mode' window title
				/*
					Off, so a dev build starts on the project hub the same way a
					real one does. Upstream jumped straight into the sample
					project on the Live preview page, which hid the hub entirely
					while developing.
				*/
				sampleProject: false, // {true/false, 'oblegg', 'bool'} Load the sample project
				twoSampleProjects: false, // {bool} Load two sample projects
				currentPage: false, // {Sentence case page name} navigate straight to a page
				currentGlyphID: false, // {glyph id} select a glyph
				currentPanel: false, // {Sentence case panel name} navigate straight to a panel
				currentTool: false, // {Tool name} select a tool
				stopPageNavigation: false, // {bool} overwrite project-level setting
				autoSave: false, // {bool} trigger auto saves
				selectFirstShape: false, // {bool} select the first shape
				selectFirstPoint: false, // {bool} select the first path point
				testActions: [], // {name: '', onClick: ()=>{}} adds test actions to the Glyph card
				testOnLoad: function () {}, // code to run on load
				testOnRedraw: function () {}, // code to run on Edit Canvas redraw
			},
			/*
				Off. The tag in addTelemetry() below is upstream's Google Analytics
				property, so leaving this on would report this app's page views to
				someone else's dashboard. Turn it back on only with our own tag.
			*/
			telemetry: false,
		};

		// Version
		this.version = config.version;
		this.versionDate = config.versionDate;
		const semVer = parseSemVer(config.version);
		this.versionName = `Version ${semVer.major}.${semVer.minor}`;

		// Project Editors
		this.projectEditors = [];
		this._selectedProjectEditor = undefined;

		// Current import target
		this._editorImportTarget = undefined;
		this.temp = {};
	}

	/**
	 * Starts up the app
	 */
	setUp() {
		// log(`GlyphrStudioApp.setUp`, 'start');
		let editor = addProjectEditorAndSetAsImportTarget();

		// Dev mode stuff
		const dev = this.settings.dev;
		if (dev.mode) {
			if (dev.overwriteTitle) document.title = '⡄⡆⡇🄳🄴🅅 🄼🄾🄳🄴⡇⡆⡄';
			// @ts-expect-error 'property does exist'
			window._DEV = _DEV;

			// Test Function
			if (dev.testOnLoad) dev.testOnLoad();

			// Navigation & selection
			if (dev.twoSampleProjects) {
				editor.project = importGlyphrProjectFromText(obleggSampleProject);
				addProjectEditorAndSetAsImportTarget();
				editor = getProjectEditorImportTarget();
				setCurrentProjectEditor(editor);
				editor.project = importGlyphrProjectFromText(simpleExampleProject);
				// editor.project = importGlyphrProjectFromText(obleggSampleProject);
				if (typeof dev.currentPage === 'string') editor.nav.page = dev.currentPage;
				updateWindowUnloadEvent();
			} else if (typeof dev.sampleProject === 'boolean' && dev.sampleProject) {
				importGlyphrProjectFromText(simpleExampleProject);
			} else if (typeof dev.sampleProject === 'string') {
				let proj;
				if (dev.sampleProject === 'oblegg') proj = obleggSampleProject;
				if (dev.sampleProject === 'bool') proj = boolTestProject;
				// if (dev.sampleProject === 'test') proj = test;
				editor.project = importGlyphrProjectFromText(proj);
			}
			if (typeof dev.currentGlyphID === 'string') editor.selectedGlyphID = dev.currentGlyphID;
			if (typeof dev.currentPage === 'string') editor.nav.page = dev.currentPage;
			if (typeof dev.currentPanel === 'string') editor.nav.panel = dev.currentPanel;
			if (dev.currentTool) editor.selectedTool = dev.currentTool;
			if (dev.selectFirstShape) editor.multiSelect.shapes.select(editor.selectedItem.shapes[0]);
			if (dev.selectFirstPoint)
				editor.multiSelect.points.select(editor.selectedItem.shapes[0].pathPoints[0]);
		}
		// log(editor);
		// log(editor.nav.page);

		if (this.settings.telemetry && !dev.mode) {
			addTelemetry();
		}

		// Load the Open Project page
		if (dev.mode && dev.currentPage) {
			editor.navigate();
		} else {
			this.appPageNavigate(makePage_OpenProject, makeHubRail);
		}
		this.fadeOutLandingPage();

		// Final dev mode stuff
		if (dev.mode && (dev.selectFirstShape || dev.selectFirstPoint))
			editor.editCanvas.redraw('dev mode select first shape');
		console.log(this);
		// log(`GlyphrStudioApp.setUp`, 'end');
	}

	/**
	 * Returns the selected Project Editor
	 * @returns {ProjectEditor}
	 */
	get selectedProjectEditor() {
		if (!this._selectedProjectEditor) {
			if (this.projectEditors.length === 0) this.projectEditors[0] = new ProjectEditor();
			this.selectedProjectEditor = this.projectEditors[0];
		}

		return this._selectedProjectEditor;
	}

	/**
	 * Sets the selected Project Editor
	 * @param {ProjectEditor} editor
	 */
	set selectedProjectEditor(editor) {
		if (!editor) return;
		// Make sure the editor is tracked in the projectEditors list,
		// then select it. Previously this only worked for editors that
		// were already at index 0 or 1, silently ignoring any other editor.
		if (!this.projectEditors.includes(editor)) {
			this.projectEditors.push(editor);
		}
		this._selectedProjectEditor = editor;
	}

	/**
	 * Returns the selected Project Editor Import Target
	 * @returns {ProjectEditor}
	 */
	get editorImportTarget() {
		if (!this._editorImportTarget) {
			this._editorImportTarget = this.selectedProjectEditor;
		}

		return this._editorImportTarget;
	}

	/**
	 * Sets the selected Project Editor Import Target
	 * @param {ProjectEditor} editor
	 */
	set editorImportTarget(editor) {
		if (this.projectEditors[0] === editor) {
			this._editorImportTarget = this.projectEditors[0];
		}
		if (this.projectEditors[1] === editor) {
			this._editorImportTarget = this.projectEditors[1];
		}
	}

	/**
	 * Returns the project editor that isn't the selected project editor
	 * @returns {ProjectEditor}
	 */
	get otherProjectEditor() {
		if (this.selectedProjectEditor === this.projectEditors[0]) {
			return this.projectEditors[1];
		} else {
			return this.projectEditors[0];
		}
	}

	/**
	 * App Pages are 'above' Project Editor Pages, so we need a custom navigation
	 * handler for Open Project and Cross Project Actions pages
	 *
	 * A page may bring a rail. The hub does - the same one the editor carries,
	 * with its own destinations in it - so the app's one piece of persistent
	 * chrome is there from the first screen rather than appearing when you open
	 * a project. A page that brings none is still laid out full width by the
	 * `#app__main-content:only-child` rule in app.css.
	 *
	 * @param {Function} pageMaker - function that creates app page content
	 * @param {Function =} railMaker - function that creates the page's rail
	 */
	appPageNavigate(pageMaker, railMaker = undefined) {
		const mainContent = makeElement({
			tag: 'div',
			id: 'app__main-content',
		});
		mainContent.appendChild(pageMaker());
		const wrapper = document.querySelector('#app__wrapper');
		wrapper.innerHTML = '';
		if (railMaker) wrapper.appendChild(railMaker());
		wrapper.appendChild(mainContent);
	}

	/**
	 * Fades out the initial load screen to show the App.
	 *
	 * The splash draws its mark on (see the animation in index.html), and on a
	 * fast machine the app is ready before the drawing is done. So this waits
	 * for whatever is still animating on the splash to finish first - with a
	 * ceiling, so a stuck animation can never hold the app hostage. With
	 * reduced motion there is nothing running and the fade starts at once.
	 *
	 * @param {Number} delay - override default fadeout time
	 */
	fadeOutLandingPage(delay = 700) {
		/** @type {HTMLElement} */
		const landingPage = document.querySelector('#app__landing-page');
		if (!landingPage) return;

		const running =
			typeof landingPage.getAnimations === 'function'
				? landingPage.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => {}))
				: [];
		const settled = Promise.race([
			Promise.all(running),
			new Promise((resolve) => setTimeout(resolve, 2000)),
		]);

		settled.then(() => {
			landingPage.style.opacity = '0';
			setTimeout(() => landingPage.remove(), delay);
		});
	}

	// --------------------------------------------------------------
	// Local Storage and Auto-saves
	// --------------------------------------------------------------

	/**
	 * Wrapper for getting the Glyphr Studio area of local storage
	 * @returns {Object} - current data
	 */
	getLocalStorage() {
		// log(`GlyphrStudioApp.getLocalStorage`, 'start');
		if (!window.localStorage.getItem('GlyphrStudio')) {
			window.localStorage.setItem('GlyphrStudio', '{}');
		}
		const jsonData = window.localStorage.getItem('GlyphrStudio');
		let data = {};
		if (jsonData) data = JSON.parse(jsonData);
		// log(`\n⮟data⮟`);
		// log(data);
		// log(`GlyphrStudioApp.getLocalStorage`, 'end');
		return data;
	}

	/**
	 * Wrapper to write a key/value pair to the
	 * Glyphr Studio area of local storage
	 * @param {String} key - what part to set
	 * @param {String} newData - value to set
	 */
	setLocalStorage(key, newData) {
		// log(`GlyphrStudioApp.setLocalStorage`, 'start');
		// log(`key: ${key}`);
		// log(`\n⮟data⮟`);
		// log(newData);

		const data = this.getLocalStorage();
		data[key] = newData;
		try {
			window.localStorage.setItem('GlyphrStudio', JSON.stringify(data));
		} catch {
			showToast(
				`There is not enough space for this project to be auto-saved. The auto-save option has been turned off in Settings > App.`
			);
			getCurrentProject().settings.app.autoSave = false;
		}

		// log(`\n⮟window.localStorage⮟`);
		// log(window.localStorage);
		// log(`GlyphrStudioApp.setLocalStorage`, 'end');
	}

	/**
	 * Counts how many projects are saved locally
	 * @returns {Number}
	 */
	countLocalStorageProjects() {
		const data = this.getLocalStorage();
		return countItems(data.autoSaves);
	}

	/**
	 * Automatically writes the current state to the
	 * local storage for the current project
	 */
	addAutoSaveState() {
		// log(`addAutoSaveState`, 'start');
		const projectData = getCurrentProject().save();
		const metadata = projectData.settings.project;
		const saveData = {
			time: new Date().getTime(),
			name: metadata.name,
			id: metadata.id,
			project: projectData,
		};
		// log(`metadata.name: ${metadata.name}`);
		// log(`metadata.id: ${metadata.id}`);
		let newSaves = this.getLocalStorage()?.autoSaves || {};
		newSaves[metadata.id] = saveData;
		// log(`\n⮟newSaves⮟`);
		// log(newSaves);
		this.setLocalStorage('autoSaves', newSaves);
		// log(`addAutoSaveState`, 'end');
	}
}

/**
 * Conditionally load Google Telemetry
 */
function addTelemetry() {
	let gScript = document.createElement('script');
	gScript.setAttribute('src', 'https://www.googletagmanager.com/gtag/js?id=G-L8S3D8WCC9');
	gScript.setAttribute('async', '');
	document.head.appendChild(gScript);

	// @ts-expect-error 'property does exist'
	window.dataLayer = window.dataLayer || [];
	function gtag() {
		// @ts-expect-error 'property does exist'
		window.dataLayer.push(arguments);
	}
	gtag('js', new Date());
	gtag('config', 'G-L8S3D8WCC9');
}

// --------------------------------------------------------------
// Window behavior
// --------------------------------------------------------------

/**
 * Sets the appropriate window unload event
 */
export function updateWindowUnloadEvent() {
	const project = getCurrentProject();
	const app = getGlyphrStudioApp();

	if (app.settings.dev.mode) {
		if (app.settings.dev.stopPageNavigation) {
			window.onbeforeunload = showBeforeUnloadConfirmation;
		} else {
			window.onbeforeunload = () => {};
		}
	} else if (project.settings.app.stopPageNavigation) {
		window.onbeforeunload = showBeforeUnloadConfirmation;
	} else {
		window.onbeforeunload = () => {};
	}
}

/**
 * handler for onBeforeUnload
 * @param {Event} event - original event
 * @returns {String} - message to show
 */
function showBeforeUnloadConfirmation(event) {
	// console.log(`event.type: ${event.type}`);
	event.preventDefault();
	event.stopPropagation();
	let message = 'Are you sure you want to exit? Any unsaved data may be lost.';
	return message;
}

// --------------------------------------------------------------
// Issues
// --------------------------------------------------------------

/**
	THE CRASH SCREEN.

	It borrowed #app__landing-page - the boot splash - for its box, so it
	arrived on the splash's purple gradient, left-aligned, with 189px of
	padding under it, none of which was written for it. What it did own was a
	table-flip emoticon at 36px in hue-285 purple, an unstyled stack trace, and
	a mailto whose subject was joined with `&` instead of `?`, so it never
	reached the mail client.

	It is the app's own surface now, on --bg-app, theme-aware like everything
	else. And it does the two things this screen is for: gets you out (Reload),
	and gets the details to us (Copy, or the email link, which now carries its
	subject). The trace is kept, in a well you can select and scroll.

	No table flip. Someone reading this may have just lost an afternoon's work,
	and a joke at that moment is a joke at their expense.

	DEFENSIVE ON PURPOSE. Every value here is read through a guard: this runs
	after something has already failed, and main.js calls it when the app
	failed to *load*, which is the one moment getGlyphrStudioApp() may have
	nothing to give. A crash screen that throws leaves a blank window.
 */

/**
 * Catch an error and show this page instead
 * @param {String} friendlyMessage - What human-readable message to show
 * @param {Object} errorObject - Error data
 */
export function showAppErrorPage(friendlyMessage = '', errorObject = { message: '', stack: '' }) {
	const wrapper = document.querySelector('#app__wrapper');
	if (!wrapper) return;
	closeEveryTypeOfDialog();

	let version = '';
	try {
		version = getGlyphrStudioApp()?.version || '';
	} catch {
		/* The load path can reach here before there is an app to ask. */
	}

	const details = String(errorObject?.stack || errorObject?.message || '').trim();
	const subject = `[${version || PRODUCT_NAME}] Error report`;

	const page = makeElement({ tag: 'div', className: 'app-error' });
	const card = makeElement({ tag: 'div', className: 'app-error__card' });

	card.appendChild(
		makeElement({
			tag: 'div',
			className: 'app-error__mark',
			attributes: { 'aria-hidden': 'true' },
			innerHTML: makeLineIcon('alert', 24),
		})
	);
	/* textContent, not makeElement's `content`, which is innerHTML: the caller's
		message is a sentence, and one carrying a `<` should read as a `<`. */
	const title = makeElement({ tag: 'h1', className: 'app-error__title' });
	title.textContent = friendlyMessage || `${PRODUCT_NAME} ran into a problem`;
	card.appendChild(title);
	card.appendChild(
		makeElement({
			tag: 'p',
			className: 'app-error__body',
			content: `Reloading starts the app again, and any project auto-saved in this
				browser comes back with it. If this keeps happening, send us the details
				below and we will look at it.`,
		})
	);

	// --- Actions -------------------------------------------------
	const actions = makeElement({ tag: 'div', className: 'app-error__actions' });

	actions.appendChild(
		makeElement({
			tag: 'button',
			className: 'hub-button hub-button--primary',
			attributes: { type: 'button' },
			innerHTML: `<span>Reload ${PRODUCT_NAME}</span>`,
			onClick: () => window.location.reload(),
		})
	);

	const copyButton = makeElement({
		tag: 'button',
		className: 'hub-button',
		attributes: { type: 'button' },
		innerHTML: `${makeLineIcon('copy', 16)}<span>Copy details</span>`,
	});
	copyButton.addEventListener('click', async () => {
		const copied = await copyToClipboard(`${friendlyMessage}\n${version}\n\n${details}`);
		const label = copyButton.querySelector('span');
		if (copied) {
			if (label) label.textContent = 'Copied';
			return;
		}
		/*
			The clipboard can be refused - a denied permission, or a page served
			over file://, which is a supported way to run this. Telling someone to
			press Ctrl C with nothing selected is advice that does not work, so
			select the trace for them first and then say it.
		*/
		const trace = page.querySelector('.app-error__trace');
		if (trace) {
			const range = document.createRange();
			range.selectNodeContents(trace);
			const selection = window.getSelection();
			selection?.removeAllRanges();
			selection?.addRange(range);
		}
		if (label) {
			label.textContent = trace
				? `Selected — press ${shortcutLabel(['Ctrl', 'C'])}`
				: 'Could not copy';
		}
	});
	actions.appendChild(copyButton);

	actions.appendChild(
		makeElement({
			tag: 'a',
			className: 'app-error__mail',
			attributes: {
				/* `?`, not `&`: the subject is the first parameter, so it opens the
					query string rather than continuing one that was never started. */
				href: `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`,
			},
			innerHTML: `${makeLineIcon('mail', 16)}<span>${SUPPORT_EMAIL}</span>`,
		})
	);

	card.appendChild(actions);

	// --- What actually happened ----------------------------------
	if (details) {
		card.appendChild(
			makeElement({ tag: 'div', className: 'studio-eyebrow app-error__label', content: 'Details' })
		);
		/* textContent, not innerHTML: a stack trace is text, and it can carry
			angle brackets that would otherwise be read as markup. */
		const trace = makeElement({ tag: 'pre', className: 'app-error__trace' });
		trace.textContent = details;
		card.appendChild(trace);
	}

	page.appendChild(card);
	wrapper.innerHTML = '';
	wrapper.appendChild(page);
}

/**
 * Makes a mailto link
 * @param {String} displayText - what text to show
 * @returns {String} - mailto link
 */
export function emailLink(displayText = SUPPORT_EMAIL) {
	let app = getGlyphrStudioApp();
	return `
		<a class="mailto" href="mailto:${SUPPORT_EMAIL}?subject=[${app.version}] Feedback">${displayText}</a>
	`;
}

/**
 * Generates the content for the "email us" link
 * @returns {String}
 */
export function makeEmailContent() {
	const con = `Have a feature idea or ran into an issue%3F We'd be happy to help!
	%0A%0A%0A%0A___________________________________________%0A
	version %09${PRODUCT_NAME}  ${getGlyphrStudioApp().version} %0A
	user agent %09 ${encodeURIComponent(navigator.userAgent)} %0A`;

	// log(con);
	return con;
}
