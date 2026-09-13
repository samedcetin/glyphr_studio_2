import { addAsChildren, insertAfter, makeElement } from '../common/dom.js';
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
import { makePage_CrossProjectActions } from './cross_project_actions/cross_project_actions.js';
import { getCurrentProjectEditor, getGlyphrStudioApp } from './main.js';
import { cycleThemePreference, getThemePreference, onThemeChange } from '../common/theme.js';
import { showKeyboardShortcuts } from '../controls/command-palette/command_palette.js';
import { makePage_OpenProject } from './open_project.js';

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
export function makeThemeToggle() {
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
 * Where a shell menu opens from its entry point.
 *
 * Beside the button and top-aligned, because the entry points live in a
 * vertical rail. Below-and-left-aligned was right when they sat in a horizontal
 * top bar; kept there, every menu opened on top of the rail it came from.
 *
 * Measured from the button rather than from event.target: the target is now the
 * SVG inside the button, and an icon's box is not the control's box.
 *
 * @param {Element} entryPoint - the button the menu belongs to
 * @returns {Object} - { x, y }
 */
function menuAnchor(entryPoint) {
	const rect = entryPoint.getBoundingClientRect();
	/*
		From the rail's edge, not the button's. The buttons are 32px centred in a
		56px column, so anchoring to the button left the menu sitting 6px over the
		rail it belongs to.
	*/
	const rail = entryPoint.closest('#app__left-rail');
	const from = rail ? rail.getBoundingClientRect().right : rect.right;
	return { x: Math.round(from) + 6, y: Math.round(rect.top) };
}

/**
 * Makes one menu, with an entry point and a hidden dropdown.
 * @param {String} menuName - Name for the menu entry point
 * @returns {Element}
 */
export function makeMenu(menuName) {
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
		entryPoint.addEventListener('click', () => {
			const rect = menuAnchor(entryPoint);
			closeEveryTypeOfDialog();
			insertAfter(entryPoint, makeContextMenu(fileMenuData, rect.x, rect.y));
		});
	}

	if (menuName === 'Projects') {
		entryPoint.addEventListener('click', () => {
			const rect = menuAnchor(entryPoint);
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
				rect.y,
				500
			);

			insertAfter(entryPoint, menuRows);
		});
	}

	if (menuName === 'Help') {
		entryPoint.addEventListener('click', () => {
			const rect = menuAnchor(entryPoint);
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
						/*
							The feedback link used to be a standing "Found a bug? Have
							some feedback?" blurb in the top bar. With the bar gone it
							belongs here: it is a help action, and it was spending a
							permanent slice of chrome on something used once.
						*/
						{
							name: 'Send feedback',
							icon: 'command_info',
							onClick: () => {
								const app = getGlyphrStudioApp();
								window.open(
									`mailto:mail@glyphrstudio.com?subject=[${app.version}] Feedback`,
									'_blank'
								);
							},
						},
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
					rect.y
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
