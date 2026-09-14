import { getCurrentProject, getCurrentProjectEditor } from '../app/main.js';
import { addAsChildren, makeElement } from '../common/dom.js';
import { applyKeysToGlyph } from './apply_keys.js';
import { parseMetricKey, resolveSideBearing } from './metric_keys.js';

/**
	METRIC KEY ROW
	--------------
	The two key fields under the sidebearings in the Properties panel.

	They sit directly below the numbers they control, because that is the
	relationship: the key is what was meant, and the number underneath it is
	what that works out to today. Putting them anywhere else would leave people
	editing a number that something else is about to overwrite.
 */

/**
 * The label and the pair of key inputs.
 * @param {Object} glyph - the glyph being edited
 * @returns {Array<Element>} - label, inputs, message
 */
export function makeMetricKeyRow(glyph) {
	const label = makeElement({
		tag: 'label',
		className: 'info',
		innerHTML: `
			<span>metric keys</span>
			<info-bubble>
				<h1>Metric keys</h1>
				Space a glyph by naming another one instead of typing a number.
				Change the glyph it points at, and this one follows.
				<br><br>
				<h2>Syntax</h2>
				<code>=n</code> — the same side of the n<br>
				<code>=|n</code> — the <b>other</b> side of the n, mirrored. This is
				what round letters want: a <code>b</code>'s right side is an
				<code>o</code>'s left side seen from the other way round.<br>
				<code>=n+10</code> — that, plus ten units. <code>-</code> and
				<code>*</code> work too.
				<br><br>
				Leave a field empty to space that side by hand.
			</info-bubble>
		`,
	});

	/*
		The same two-column pair as the bearings directly above, so the two
		rows break in the same place. This was the older three-track split with
		a spacer in the middle, which left these fields narrower than the
		numbers they belong to and the seam between them in a different spot.
	*/
	const wrapper = makeElement({ tag: 'div', className: 'doubleInput doubleInput--pair' });
	const message = makeElement({ className: 'metric-key__message' });

	const leftInput = makeKeyInput(glyph, 'left', message);
	const rightInput = makeKeyInput(glyph, 'right', message);

	addAsChildren(wrapper, [leftInput, rightInput]);

	updateMessage(glyph, message);

	return [label, wrapper, message];
}

/**
 * One key field.
 * @param {Object} glyph - the glyph being edited
 * @param {String} side - 'left' or 'right'
 * @param {Element} message - where problems are reported
 * @returns {Element}
 */
function makeKeyInput(glyph, side, message) {
	const property = side === 'left' ? 'leftSideBearingKey' : 'rightSideBearingKey';

	const input = makeElement({
		tag: 'input',
		className: 'metric-key__input',
		attributes: {
			type: 'text',
			value: glyph[property] || '',
			placeholder: side === 'left' ? '=n' : '=|o',
			spellcheck: 'false',
			'aria-label': `${side} side bearing key`,
		},
	});

	input.addEventListener('change', (event) => {
		// @ts-expect-error - inputs have a value
		const typed = String(event.target.value || '').trim();

		/*
			A bare glyph name is what people reach for first, so an equals sign
			is added rather than the whole thing being rejected. Anything that
			still will not parse is left in the field for them to fix, not
			silently discarded.
		*/
		const normalized = typed && !typed.startsWith('=') ? `=${typed}` : typed;

		if (normalized && !parseMetricKey(normalized)) {
			message.textContent = `Could not read "${typed}".`;
			message.classList.add('metric-key__message--bad');
			return;
		}

		glyph[property] = normalized;
		// @ts-expect-error - inputs have a value
		event.target.value = normalized;

		const editor = getCurrentProjectEditor();
		const result = applyKeysToGlyph(getCurrentProject(), glyph.id);

		editor.history.addState(
			normalized ? `Set ${side} metric key: ${normalized}` : `Cleared ${side} metric key`
		);
		editor.publish('currentItem', editor.selectedItem);

		if (!result.ok && normalized) {
			message.textContent = result.reason;
			message.classList.add('metric-key__message--bad');
		} else {
			updateMessage(glyph, message);
		}
	});

	return input;
}

/**
 * Says what the keys currently work out to, or what is wrong with them.
 * @param {Object} glyph - the glyph being edited
 * @param {Element} message - where to write
 */
function updateMessage(glyph, message) {
	const project = getCurrentProject();
	const parts = [];
	let bad = false;

	['left', 'right'].forEach((side) => {
		const key = side === 'left' ? glyph.leftSideBearingKey : glyph.rightSideBearingKey;
		if (!key) return;

		const resolved = resolveSideBearing(project, glyph.id, side);
		if (resolved.ok) parts.push(`${side} ${resolved.value}`);
		else {
			parts.push(resolved.reason);
			bad = true;
		}
	});

	message.textContent = parts.join(' · ');
	message.classList.toggle('metric-key__message--bad', bad);
}
