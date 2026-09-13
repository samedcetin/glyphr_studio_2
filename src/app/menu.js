import { insertAfter, makeElement } from '../common/dom.js';
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
	/*
		No class of its own. It lives in the left rail, which styles it, and the
		top-bar class it used to carry set a 28px box and no radius - both of
		which outranked the rail's rule and gave the button a square hover.
	*/
	const button = makeElement({
		tag: 'button',
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
	/*
		Same as the theme toggle: no class here. `menu-entry-point` was a top bar
		style - 24px tall, --r-xs corners, a text label's padding - and it beat
		the rail's own rule, so File, Projects and Help hovered as small square
		chips in a column of 32px rounded ones.
	*/
	let entryPoint = makeElement({
		tag: 'button',
		innerHTML: menuName,
	});
	const editor = getCurrentProjectEditor();
	if (menuName === 'File') {
		/** @type {Array} */
		let fileMenuData = [];
		// Preferred font export format (the format that was imported, or 'otf'
		// for new projects) drives the file name preview and the Ctrl+E note.
		const preferredExportFormat = getPreferredExportFormat();
		/*
			Headings name the group; the file name sits on the row that writes it.

			This menu used to head three of its four groups with a file name and
			the fourth with a category, all in the same style - so the first line
			a user read was "Oblegg - Glyphr Studio Project - 2026.9.13.gs2", and
			nothing said what the group was for. Worse, the font group's heading
			named one file while the four rows under it wrote four different ones.

			A project file and a font file are also the distinction a new user
			most needs and least has: one is the thing you keep editing, the other
			is the thing you ship. The descriptions say so once, here.
		*/
		if (typeof editor.loadedFileHandle === 'object') {
			let projectDisplayName = `${editor.project.settings.project.name} - Glyphr Studio Project.gs2`;

			// @ts-expect-error 'property does exist'
			if (typeof editor?.loadedFileHandle?.name === 'string') {
				// @ts-expect-error 'property does exist'
				projectDisplayName = editor.loadedFileHandle.name;
			}

			fileMenuData.push(
				{ type: 'heading', name: 'Project' },
				{
					name: 'Save project',
					description: projectDisplayName,
					icon: 'command_save',
					note: ['Ctrl', 's'],
					onClick: () => editor.saveProjectFile(),
				},
				{
					name: 'Save a copy',
					description: 'Keeps editing the original',
					icon: 'command_save',
					onClick: () => editor.saveProjectFile(true),
				}
			);
		} else {
			fileMenuData.push(
				{ type: 'heading', name: 'Project' },
				{
					/*
						The destination is in the verb, not the description. As a
						suffix on the file name it pushed the string past 80
						characters, and the half that got ellipsised away was the
						half that answered "where did it go?".
					*/
					name: 'Save project to downloads',
					description: makeFileName('gs2', true),
					icon: 'command_save',
					note: ['Ctrl', 's'],
					onClick: () => editor.saveProjectFile(),
				}
			);
		}
		/* Every export writes a different file, so every row names its own. */
		const fontFileName = (extension) =>
			`${editor.project.settings.font.family}-${editor.project.settings.font.style}.${extension}`.replaceAll(
				' ',
				''
			);

		fileMenuData = fileMenuData.concat([
			{ name: 'hr' },
			{ type: 'heading', name: 'Font' },
			{
				name: 'Export OTF file',
				description: fontFileName('otf'),
				icon: 'command_export',
				note: preferredExportFormat === 'otf' ? ['Ctrl', 'e'] : false,
				onClick: ioFont_exportOTF,
			},
			{
				name: 'Export TTF file',
				description: fontFileName('ttf'),
				icon: 'command_export',
				note: preferredExportFormat === 'ttf' ? ['Ctrl', 'e'] : false,
				onClick: ioFont_exportTTF,
			},
			{
				name: 'Export WOFF file',
				description: fontFileName('woff'),
				icon: 'command_export',
				note: preferredExportFormat === 'woff' ? ['Ctrl', 'e'] : false,
				onClick: ioFont_exportWOFF,
			},
			{
				name: 'Export WOFF2 file',
				description: fontFileName('woff2'),
				icon: 'command_export',
				note: preferredExportFormat === 'woff2' ? ['Ctrl', 'e'] : false,
				onClick: ioFont_exportWOFF2,
			},
			{
				name: 'Export SVG font file',
				description: makeFileName('svg'),
				icon: 'command_export',
				note: ['Ctrl', 'g'],
				onClick: ioSVG_exportSVGfont,
			},
			{ name: 'hr' },
			{ type: 'heading', name: 'For game engines' },
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
			/*
				Two groups, both named. The previews used to open the menu with no
				label at all, so two project thumbnails appeared above a list of
				commands with nothing saying they were the slots you can work in.

				The disabled row says why it is disabled. "Cross-project actions"
				greyed out with no explanation is a dead end; the description turns
				it into an instruction.
			*/
			const onlyOneProject = getGlyphrStudioApp().projectEditors.length === 1;

			/*
				The group lists what is open. It used to list what is open plus a
				dashed placeholder card reading "Open another project" - a button
				wearing the same box as a status display, which is what made the
				two unrelatable. Filling a free slot is an action, so it sits with
				the actions, as a row like every other row in this menu.
			*/
			const openProjects = [makeProjectPreviewRow(0), makeProjectPreviewRow(1)]
				.filter(Boolean)
				.map((card) => ({ child: card, className: 'spanAll' }));

			let menuRows = makeContextMenu(
				[
					{ type: 'heading', name: 'Open projects' },
					...openProjects,
					{ name: 'hr' },
					{ type: 'heading', name: 'Actions' },
					...(onlyOneProject
						? [
								{
									name: 'Open a second project',
									description: 'Work on two fonts in one window',
									icon: 'command_newTab',
									onClick: () => {
										showModalDialog(makePage_OpenProject(true), 760, true);
									},
								},
						  ]
						: []),
					{
						name: 'Cross-project actions',
						description: onlyOneProject
							? 'Open a second project to use this'
							: 'Copy glyphs, components and kerning between the two',
						icon: 'command_crossProjectActions',
						onClick: () => {
							getGlyphrStudioApp().appPageNavigate(makePage_CrossProjectActions);
						},
						disabled: onlyOneProject,
					},
					{
						/*
							Not "Open another project" - the empty slot above already
							says that, and it does something else: it loads a second
							project into this window. This one starts a separate copy
							of the app. Two rows with one label is how the rail ended
							up with two Helps.
						*/
						name: 'Open a new window',
						description: 'A separate copy of the app, with its own projects',
						icon: 'command_newTab',
						onClick: () => {
							window.open('https://glyphrstudio.com/app/', '_blank');
						},
					},
					{
						name: 'Working with two projects',
						description: 'glyphrstudio.com/help',
						icon: 'command_newTab',
						onClick: () => {
							window.open(
								'https://www.glyphrstudio.com/help/getting-started/working-with-multiple-projects.html',
								'_blank'
							);
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
					/*
						Five rows that went to five different places - a dialog, two
						pages in this app, an external site and an email client - laid
						out as one flat list. Nothing said which was which, and the
						only thing distinguishing "In-app help" from "External Help &
						Documentation site" was a long name doing a label's job.

						Each row says where it goes on its second line, so the choice
						is visible before the click rather than after it.
					*/
					[
						{ type: 'heading', name: 'Help' },
						{
							name: 'Keyboard shortcuts',
							icon: 'keyboard',
							note: ['Ctrl', '/'],
							onClick: showKeyboardShortcuts,
						},
						{
							name: 'Help & documentation',
							description: 'In this app',
							icon: 'command_help',
							onClick: () => {
								let editor = getCurrentProjectEditor();
								editor.nav.page = 'Help';
								editor.navigate();
							},
						},
						{
							name: 'Documentation site',
							description: 'glyphrstudio.com/help',
							icon: 'command_newTab',
							onClick: () => {
								window.open('https://glyphrstudio.com/help/', '_blank');
							},
						},
						{ name: 'hr' },
						{ type: 'heading', name: 'About' },
						{
							name: 'About Glyphr Studio',
							description: 'Version, credits and licence',
							icon: 'command_info',
							onClick: () => {
								let editor = getCurrentProjectEditor();
								editor.nav.page = 'About';
								editor.navigate();
							},
						},
						/*
							The feedback link used to be a standing "Found a bug? Have
							some feedback?" blurb in the top bar. With the bar gone it
							belongs here: it is a help action, and it was spending a
							permanent slice of chrome on something used once.
						*/
						{
							name: 'Send feedback',
							description: 'mail@glyphrstudio.com',
							icon: 'mail',
							onClick: () => {
								const app = getGlyphrStudioApp();
								window.open(
									`mailto:mail@glyphrstudio.com?subject=[${app.version}] Feedback`,
									'_blank'
								);
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
	const app = getGlyphrStudioApp();
	const projectEditor = app.projectEditors[projectID];
	if (!projectEditor) return false;

	const isCurrent = getCurrentProjectEditor() === projectEditor;
	const name = projectEditor.project.settings.project.name;

	const card = makeElement({
		tag: isCurrent ? 'div' : 'button',
		className: `project-card${isCurrent ? ' project-card--current' : ''}`,
		attributes: isCurrent
			? { 'aria-current': 'true' }
			: { type: 'button', title: `Switch to ${name}` },
	});

	const header = makeElement({ className: 'project-card__header' });
	header.appendChild(makeElement({ className: 'project-card__name', content: name, title: name }));
	header.appendChild(
		makeElement({
			className: 'project-card__state',
			content: isCurrent ? 'Editing' : 'Switch to',
		})
	);
	card.appendChild(header);

	card.appendChild(
		makeElement({
			tag: 'display-canvas',
			attributes: {
				text: projectEditor.project.settings.app.previewText || 'Aa Bb Cc Xx Yy Zz',
				'font-size': '24',
				'project-editor': `${projectID}`,
				'show-placeholder-message': 'true',
			},
		})
	);

	if (!isCurrent) {
		card.addEventListener('click', () => {
			const liveApp = getGlyphrStudioApp();
			liveApp.selectedProjectEditor = projectEditor;
			liveApp.selectedProjectEditor.navigate();
			showToast(`Switched to<br>${name}`, 2000, true);
		});
	}

	return card;
}
