import { addAsChildren, insertAfter, makeElement } from '../common/dom.js';
import logoHorizontal from '../common/graphics/logo-wordmark-horizontal-small.svg?raw';
import {
	closeEveryTypeOfDialog,
	makeContextMenu,
	showModalDialog,
	showToast,
} from '../controls/dialogs/dialogs.js';
import {
	getPreferredExportFormat,
	ioFont_exportOTF,
	ioFont_exportTTF,
	ioFont_exportWOFF,
	ioFont_exportWOFF2,
} from '../formats_io/otf/font_export.js';
import { showAtlasExportDialog } from '../formats_io/atlas/atlas_export.js';
import { showIconImportDialog, showIconMapDialog } from '../icon_font/icon_dialogs.js';
import { ioSVG_exportSVGfont } from '../formats_io/svg_font/svg_font_export.js';
import { makeFileName } from '../project_editor/file_io.js';
import { emailLink } from './app.js';
import { makeBreadcrumb } from '../project_editor/navigator.js';
import { makePage_CrossProjectActions } from './cross_project_actions/cross_project_actions.js';
import { getCurrentProjectEditor, getGlyphrStudioApp } from './main.js';
import { cycleThemePreference, getThemePreference, onThemeChange } from '../common/theme.js';
import {
	showCommandPalette,
	showKeyboardShortcuts,
} from '../controls/command-palette/command_palette.js';
import { makePage_OpenProject } from './open_project.js';

// --------------------------------------------------------------
// Top bar for the App
// --------------------------------------------------------------

/**
 * Makes the Top Bar for the App
 * @returns {Element}
 */
export function makeAppTopBar() {
	let topBar = makeElement({ tag: 'div', id: 'app__top-bar' });

	let logo = makeElement({ innerHTML: logoHorizontal, className: 'top-bar__logo' });

	let menus = makeElement({ className: 'top-bar__menus' });
	menus.appendChild(makeMenu('File'));
	menus.appendChild(makeMenu('Projects'));
	menus.appendChild(makeMenu('Help'));

	let mailIcon = `
<?xml version="1.0" encoding="UTF-8"?><svg id="Mail" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 9"><polygon points="8 1 0 1 0 2 8 2 8 1 8 1"/><polygon points="20 0 10 0 10 1 20 1 20 0 20 0"/><polygon points="20 8 10 8 10 9 20 9 20 8 20 8"/><polygon points="8 3 2 3 2 4 8 4 8 3 8 3"/><polygon points="8 7 6 7 6 8 8 8 8 7 8 7"/><polygon points="10 1 9 1 9 8 10 8 10 1 10 1"/><polygon points="21 1 20 1 20 8 21 8 21 1 21 1"/><polygon points="8 5 4 5 4 6 8 6 8 5 8 5"/><polygon points="12 2 10 2 10 3 12 3 12 2 12 2"/><polygon points="14 3 12 3 12 4 14 4 14 3 14 3"/><polygon points="16 4 14 4 14 5 16 5 16 4 16 4"/><polygon points="20 2 18 2 18 3 20 3 20 2 20 2"/><polygon points="18 3 16 3 16 4 18 4 18 3 18 3"/></svg>`;
	let bugContact = makeElement({
		className: 'top-bar__bug-contact',
	});

	bugContact.appendChild(
		makeElement({
			className: 'top-bar__bug-blurb',
			innerHTML: 'Found a bug? Have some feedback?',
		})
	);

	bugContact.appendChild(
		makeElement({
			className: 'top-bar__bug-icon',
			innerHTML: emailLink(mailIcon),
		})
	);

	bugContact.appendChild(
		makeElement({
			className: 'top-bar__bug-link',
			innerHTML: emailLink(),
		})
	);

	/*
		Where you are lives in the top bar now, not in a stack of slabs above
		the left panel. That is what frees the rest of the window to be canvas.
	*/
	const breadcrumb = makeBreadcrumb();
	/** @type {Array<Element>} */
	const children = [logo, menus];
	if (breadcrumb) children.push(breadcrumb);
	children.push(makeCommandSearch(), makeThemeToggle(), bugContact);

	addAsChildren(topBar, children);

	return topBar;
}

/**
 * The command search affordance in the top bar.
 *
 * It looks like a search field but opens the palette - the same pattern Figma
 * and Linear use. A palette nobody knows about is a palette nobody uses, and
 * a keyboard shortcut alone does not teach itself.
 *
 * @returns {Element}
 */
function makeCommandSearch() {
	const isMac = navigator.platform.toLowerCase().includes('mac');
	const modifierKey = isMac ? '\u2318' : 'Ctrl';

	const button = makeElement({
		tag: 'button',
		className: 'top-bar__command-search',
		attributes: { type: 'button', title: 'Search commands, characters and pages' },
		innerHTML: `
			<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M7 2.5a4.5 4.5 0 1 1-2.9 7.94l-2.7 2.7a.5.5 0 0 1-.7-.7l2.7-2.7A4.5 4.5 0 0 1 7 2.5Zm0 1a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"/></svg>
			<span class="top-bar__command-search-label">Search commands</span>
			<span class="top-bar__command-search-keys"><code>${modifierKey}</code><code>K</code></span>
		`,
		onClick: showCommandPalette,
	});

	return button;
}

/**
 * Icons for each theme preference. Three states rather than two, because
 * "follow the OS" is a real choice and collapsing it into a toggle loses it.
 */
const themeIcons = {
	system: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v6a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 9.5v-6Zm1.5-.5a.5.5 0 0 0-.5.5v6a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5v-6a.5.5 0 0 0-.5-.5h-9ZM5 13h6v1H5v-1Z"/></svg>`,
	light: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6Zm0-1a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0-9a.5.5 0 0 1 .5.5v1.5a.5.5 0 0 1-1 0V1.5A.5.5 0 0 1 8 1Zm0 12a.5.5 0 0 1 .5.5V15a.5.5 0 0 1-1 0v-1.5A.5.5 0 0 1 8 13ZM15 8a.5.5 0 0 1-.5.5H13a.5.5 0 0 1 0-1h1.5A.5.5 0 0 1 15 8ZM3 8a.5.5 0 0 1-.5.5H1a.5.5 0 0 1 0-1h1.5A.5.5 0 0 1 3 8Zm9.9-4.9a.5.5 0 0 1 0 .7l-1 1a.5.5 0 1 1-.8-.7l1-1a.5.5 0 0 1 .8 0ZM4.9 11.1a.5.5 0 0 1 0 .7l-1 1a.5.5 0 0 1-.8-.7l1-1a.5.5 0 0 1 .8 0Zm8 1.8a.5.5 0 0 1-.8 0l-1-1a.5.5 0 0 1 .8-.7l1 1a.5.5 0 0 1 0 .7ZM4.9 4.9a.5.5 0 0 1-.8 0l-1-1a.5.5 0 1 1 .8-.7l1 1a.5.5 0 0 1 0 .7Z"/></svg>`,
	dark: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.2 2.1a.5.5 0 0 1 .1.6 5 5 0 0 0 6.9 6.9.5.5 0 0 1 .7.6A6 6 0 1 1 5.6 2a.5.5 0 0 1 .6.1Zm-1.3 1.3a5 5 0 1 0 7.7 7.7A6 6 0 0 1 4.9 3.4Z"/></svg>`,
};

const themeLabels = {
	system: 'Theme: follow system',
	light: 'Theme: light',
	dark: 'Theme: dark',
};

/**
 * The theme control in the top bar. Cycles system -> light -> dark.
 * @returns {Element}
 */
function makeThemeToggle() {
	const button = makeElement({
		tag: 'button',
		className: 'top-bar__theme-toggle',
		title: themeLabels[getThemePreference()],
		innerHTML: themeIcons[getThemePreference()],
		attributes: { 'aria-label': themeLabels[getThemePreference()] },
	});

	const render = () => {
		const preference = getThemePreference();
		button.innerHTML = themeIcons[preference];
		button.setAttribute('title', themeLabels[preference]);
		button.setAttribute('aria-label', themeLabels[preference]);
	};

	button.addEventListener('click', () => {
		cycleThemePreference();
		render();
	});

	// Keeps the icon honest if the OS flips while the preference is 'system'.
	onThemeChange(render);

	return button;
}

// --------------------------------------------------------------
// Menu
// --------------------------------------------------------------

/**
 * Makes one menu, with an entry point and a hidden dropdown
 * @param {String} menuName - Name for the menu entry point
 * @returns {Element}
 */
function makeMenu(menuName) {
	let entryPoint = makeElement({
		tag: 'button',
		innerHTML: menuName,
		className: 'menu-entry-point',
	});
	const editor = getCurrentProjectEditor();
	if (menuName === 'File') {
		/** @type {Array} */
		let fileMenuData = [];
		// Preferred font export format (the format that was imported, or 'otf'
		// for new projects) drives the file name preview and the Ctrl+E note.
		const preferredExportFormat = getPreferredExportFormat();
		if (typeof editor.loadedFileHandle === 'object') {
			let projectDisplayName = `${editor.project.settings.project.name} - Glyphr Studio Project.gs2`;

			// @ts-expect-error 'property does exist'
			if (typeof editor?.loadedFileHandle?.name === 'string') {
				// @ts-expect-error 'property does exist'
				projectDisplayName = editor.loadedFileHandle.name;
			}

			fileMenuData.push(
				{
					child: makeElement({
						tag: 'h2',
						content: projectDisplayName,
					}),
					className: 'spanAll',
				},
				{
					name: 'Save this project file',
					icon: 'command_save',
					note: ['Ctrl', 's'],
					onClick: () => editor.saveProjectFile(),
				},
				{
					name: 'Save a copy of this project file',
					icon: 'command_save',
					onClick: () => editor.saveProjectFile(true),
				}
			);
		} else {
			fileMenuData.push(
				{
					child: makeElement({
						tag: 'h2',
						content: makeFileName('gs2', true),
					}),
					className: 'spanAll',
				},
				{
					name: 'Save project file (to downloads folder)',
					icon: 'command_save',
					note: ['Ctrl', 's'],
					onClick: () => editor.saveProjectFile(),
				}
			);
		}
		fileMenuData = fileMenuData.concat([
			{ name: 'hr' },
			{
				child: makeElement({
					tag: 'h2',
					content:
						`${editor.project.settings.font.family}-${editor.project.settings.font.style}.${preferredExportFormat}`.replaceAll(
							' ',
							''
						),
				}),
				className: 'spanAll',
			},
			{
				name: 'Export OTF file',
				icon: 'command_export',
				note: preferredExportFormat === 'otf' ? ['Ctrl', 'e'] : false,
				onClick: ioFont_exportOTF,
			},
			{
				name: 'Export TTF file',
				icon: 'command_export',
				note: preferredExportFormat === 'ttf' ? ['Ctrl', 'e'] : false,
				onClick: ioFont_exportTTF,
			},
			{
				name: 'Export WOFF file',
				icon: 'command_export',
				note: preferredExportFormat === 'woff' ? ['Ctrl', 'e'] : false,
				onClick: ioFont_exportWOFF,
			},
			{
				name: 'Export WOFF2 file',
				icon: 'command_export',
				note: preferredExportFormat === 'woff2' ? ['Ctrl', 'e'] : false,
				onClick: ioFont_exportWOFF2,
			},
			{ name: 'hr' },
			{
				child: makeElement({
					tag: 'h2',
					content: makeFileName('svg'),
				}),
				className: 'spanAll',
			},
			{
				name: 'Export SVG font file',
				icon: 'command_export',
				note: ['Ctrl', 'g'],
				onClick: ioSVG_exportSVGfont,
			},
			{ name: 'hr' },
			{
				child: makeElement({
					tag: 'h2',
					content: 'For game engines',
				}),
				className: 'spanAll',
			},
			{
				name: 'Export font atlas…',
				icon: 'command_export',
				note: 'bitmap or MSDF',
				onClick: showAtlasExportDialog,
			},
			{
				name: 'Import SVG icons…',
				icon: 'command_icons',
				note: 'to the PUA',
				onClick: showIconImportDialog,
			},
			{
				name: 'Export icon names…',
				icon: 'command_export',
				note: 'JSON or CSS',
				onClick: showIconMapDialog,
			},
		]);
		entryPoint.addEventListener('click', (event) => {
			// @ts-expect-error 'property does exist'
			let rect = event.target.getBoundingClientRect();
			closeEveryTypeOfDialog();
			insertAfter(entryPoint, makeContextMenu(fileMenuData, rect.x, rect.y + rect.height));
		});
	}

	if (menuName === 'Projects') {
		entryPoint.addEventListener('click', (event) => {
			// @ts-expect-error 'property does exist'
			let rect = event.target.getBoundingClientRect();
			closeEveryTypeOfDialog();
			let menuRows = makeContextMenu(
				[
					{
						child: makeProjectPreviewRow(0),
						className: 'spanAll',
					},
					{
						child: makeProjectPreviewRow(1),
						className: 'spanAll',
					},
					{
						name: 'Cross-project actions',
						icon: 'command_crossProjectActions',
						onClick: () => {
							getGlyphrStudioApp().appPageNavigate(makePage_CrossProjectActions);
						},
						disabled: getGlyphrStudioApp().projectEditors.length === 1,
					},
					{
						name: 'Learn more about working with two projects',
						icon: 'command_newTab',
						onClick: () => {
							window.open(
								'https://www.glyphrstudio.com/help/getting-started/working-with-multiple-projects.html',
								'_blank'
							);
						},
					},
					{
						name: 'hr',
					},
					{
						name: 'Open a separate project in a new window',
						icon: 'command_newTab',
						onClick: () => {
							window.open('https://glyphrstudio.com/app/', '_blank');
						},
					},
				],
				rect.x,
				rect.y + rect.height,
				500
			);

			insertAfter(entryPoint, menuRows);
		});
	}

	if (menuName === 'Help') {
		entryPoint.addEventListener('click', (event) => {
			// @ts-expect-error 'property does exist'
			let rect = event.target.getBoundingClientRect();
			closeEveryTypeOfDialog();
			insertAfter(
				entryPoint,
				makeContextMenu(
					[
						{
							name: 'Keyboard shortcuts',
							icon: 'keyboard',
							note: ['Ctrl', '/'],
							onClick: showKeyboardShortcuts,
						},
						{ name: 'hr' },
						{
							name: 'External Help & Documentation site',
							icon: 'command_newTab',
							onClick: () => {
								window.open('https://glyphrstudio.com/help/', '_blank');
							},
						},
						{ name: 'hr' },
						{
							name: 'In-app help',
							icon: 'command_help',
							onClick: () => {
								let editor = getCurrentProjectEditor();
								editor.nav.page = 'Help';
								editor.navigate();
							},
						},
						{
							name: 'About Glyphr Studio',
							icon: 'command_info',
							onClick: () => {
								let editor = getCurrentProjectEditor();
								editor.nav.page = 'About';
								editor.navigate();
							},
						},
					],
					rect.x,
					rect.y + rect.height
				)
			);
		});
	}

	return entryPoint;
}

/**
 * Makes a special row for a menu that displays a small
 * project preview
 * @param {Number} projectID - which project to show
 * @returns {Element}
 */
function makeProjectPreviewRow(projectID = 0) {
	// log(`makeProjectPreviewRow`, 'start');
	// log(`projectID: ${projectID}`);
	const app = getGlyphrStudioApp();
	const projectEditor = app.projectEditors[projectID];
	// log(`\n⮟projectEditor⮟`);
	// log(projectEditor);

	let rowWrapper = makeElement({ tag: 'div', className: 'project-preview__row-wrapper' });
	let superTitle;
	let title = makeElement({ tag: 'h3' });
	let thumbnail;

	if (projectEditor) {
		superTitle = makeElement({ className: 'project-preview__super-title' });
		if (getCurrentProjectEditor() === projectEditor) {
			superTitle.innerHTML = 'Editing';
			rowWrapper.classList.add('project-preview__primary');
		} else {
			superTitle.innerHTML = 'Switch to';
			rowWrapper.classList.add('project-preview__secondary');
			rowWrapper.addEventListener('click', () => {
				const app = getGlyphrStudioApp();
				app.selectedProjectEditor = projectEditor;
				app.selectedProjectEditor.navigate();
				showToast(`Switched to<br>${projectEditor.project.settings.project.name}`, 2000, true);
			});
		}
		title.innerHTML = projectEditor.project.settings.project.name;
		let previewText = projectEditor.project.settings.app.previewText || 'Aa Bb Cc Xx Yy Zz';
		thumbnail = makeElement({
			tag: 'display-canvas',
			attributes: {
				text: previewText,
				'font-size': '24',
				'project-editor': projectID,
				'show-placeholder-message': 'true',
			},
		});
	} else {
		title.innerHTML = 'Open another project';
		rowWrapper.classList.add('project-preview__no-project');
		rowWrapper.addEventListener('click', () => {
			showModalDialog(makePage_OpenProject(true), 760, true);
		});
	}

	if (superTitle) addAsChildren(rowWrapper, superTitle);
	addAsChildren(rowWrapper, title);
	if (thumbnail) addAsChildren(rowWrapper, thumbnail);

	// log(`makeProjectPreviewRow`, 'end');
	return rowWrapper;
}
