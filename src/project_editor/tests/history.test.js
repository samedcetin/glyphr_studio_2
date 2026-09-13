import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { XMLtoJSON } from '@mattlag/xmltojson';
import { FontFlux } from 'font-flux-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
	getCurrentProjectEditor,
	getGlyphrStudioApp,
	setCurrentProjectEditor,
} from '../../app/main.js';
import { ioFont_importFont } from '../../formats_io/otf/font_import.js';
import { ioSVG_importSVGfont } from '../../formats_io/svg_font/svg_font_import.js';
import svgFont from '../../formats_io/svg_font/tests/ObleggExtendedTest.svg?raw';
import oblegg from '../../samples/oblegg.gs2?raw';
import { importGlyphrProjectFromText } from '../import_project.js';
import { ProjectEditor } from '../project_editor.js';

describe('History: initial project state', () => {
	let editor;
	let previousEditor;
	let previousImportTarget;
	let previousEditors;

	beforeEach(() => {
		const app = getGlyphrStudioApp();
		previousEditor = getCurrentProjectEditor();
		previousImportTarget = app.editorImportTarget;
		previousEditors = app.projectEditors.slice();
		editor = new ProjectEditor({ project: importGlyphrProjectFromText(oblegg) });
		app.projectEditors = [editor];
		app.editorImportTarget = editor;
		setCurrentProjectEditor(editor);
		editor.project.settings.app.autoSave = false;
		editor.nav.page = 'Characters';
		editor.selectedGlyphID = 'glyph-0x41';
		document.title = 'Glyphr Studio v2';
	});

	afterEach(() => {
		vi.restoreAllMocks();
		const app = getGlyphrStudioApp();
		app.projectEditors = previousEditors;
		app._editorImportTarget = previousImportTarget;
		setCurrentProjectEditor(previousEditor);
	});

	it('undoes the first edit and supports repeated undo/redo', () => {
		const originalWidth = editor.selectedItem.advanceWidth;
		editor.selectedItem.advanceWidth += 100;
		editor.history.addState('Change advance width');
		for (let i = 0; i < 2; i++) {
			editor.history.restoreState();
			expect(editor.selectedItem.advanceWidth).toBe(originalWidth);
			editor.history.redoState();
			expect(editor.selectedItem.advanceWidth).toBe(originalWidth + 100);
		}
	});

	it('restores nested path coordinates after a new edit replaces an undone edit', () => {
		const originalX = editor.selectedItem.shapes[0].pathPoints[0].p.x;
		for (const delta of [10, 20]) {
			editor.selectedItem.shapes[0].pathPoints[0].p.x += delta;
			editor.history.addState('Move point');
			expect(editor.history.redoQueue).toHaveLength(0);
			editor.history.restoreState();
			expect(editor.selectedItem.shapes[0].pathPoints[0].p.x).toBe(originalX);
		}
	});

	it('restores the initial kerning value', () => {
		editor.nav.page = 'Kerning';
		editor.selectedKernGroupID = Object.keys(editor.project.kerning)[0];
		const originalValue = editor.selectedItem.value;
		editor.selectedItem.value += 50;
		editor.history.addState('Change kerning');
		editor.history.restoreState();
		expect(editor.selectedItem.value).toBe(originalValue);
	});

	it('can undo back to a blank character created after the project was opened', () => {
		editor.selectedGlyphID = 'glyph-0x1F600';
		const originalWidth = editor.selectedItem.advanceWidth;
		editor.selectedItem.advanceWidth += 100;
		editor.history.addState('Edit new character');
		while (editor.history.queue.length) editor.history.restoreState();
		expect(editor.selectedItem.shapes).toHaveLength(0);
		expect(editor.selectedItem.advanceWidth).toBe(originalWidth);
	});

	it.each(['binary', 'SVG'])('undoes the first edit after importing a %s font', async (format) => {
		vi.spyOn(editor, 'navigate').mockImplementation(() => {});
		if (format === 'binary') {
			const data = readFileSync(
				resolve(__dirname, '../../formats_io/otf/tests/MostBasicTestRegular.otf')
			);
			await ioFont_importFont(FontFlux.open(new Uint8Array(data).buffer));
		} else {
			await ioSVG_importSVGfont(XMLtoJSON(svgFont));
		}
		editor.nav.page = 'Characters';
		editor.selectedGlyphID = 'glyph-0x41';
		const originalWidth = editor.selectedItem.advanceWidth;
		editor.selectedItem.advanceWidth += 100;
		editor.history.addState('Change imported advance width');
		editor.history.restoreState();
		expect(editor.selectedItem.advanceWidth).toBe(originalWidth);
	});
});
