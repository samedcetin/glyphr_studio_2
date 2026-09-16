import { addAsChildren, makeElement } from '../../common/dom.js';
import { makeLineIcon } from '../../common/icons.js';
import { closeAllInfoBubbles } from '../dialogs/dialogs.js';

/**
	TAB CONTROL
	-----------
	A row of tabs and the panel they switch.

	The container carries two custom properties, --tab-thumb-x and
	--tab-thumb-w, that say where the selected tab sits. A stylesheet that
	wants a sliding highlight - the segmented control on the Settings page -
	draws a pseudo-element from them; one that does not can ignore them. The
	measuring lives here so every caller gets it without asking.
 */
export class TabControl {
	constructor(targetElement) {
		this.tabs = [];
		this.targetElement = targetElement;
		this.targetElement.addEventListener('scroll', closeAllInfoBubbles);
		/** @type {HTMLElement | false} */
		this.tabContainer = false;
		/** @type {ResizeObserver | false} */
		this.resizeObserver = false;
	}

	/**
	 * Saves a new tab object to this tab group
	 * @param {String} tabName - name for the tab
	 * @param {function} contentMaker - function that creates the tab content
	 * @param {Object=} options - { icon } a line icon name drawn before the label
	 */
	registerTab(tabName = 'Tab Name', contentMaker = () => {}, { icon = '' } = {}) {
		const iconMarkup = icon
			? `<span class="tab-control__icon">${makeLineIcon(icon, 16)}</span>`
			: '';

		let newTab = {
			name: tabName,
			contentMaker: contentMaker,
			tabElement: makeElement({
				tag: 'button',
				className: 'tab-control__tab',
				innerHTML: `${iconMarkup}<span class="tab-control__label">${tabName}</span>`,
				attributes: { type: 'button', role: 'tab', 'aria-selected': 'false' },
				onClick: () => {
					this.selectTab(tabName);
				},
			}),
		};

		this.tabs.push(newTab);
	}

	/**
	 * Makes the tabs
	 * @param {Object=} options - { segmented } draws the row as one track with
	 *     a sliding thumb, the way the Settings page has it
	 * @returns {Element}
	 */
	makeTabs({ segmented = false } = {}) {
		// The segmented track is its own surface, not a panel card: the card's
		// grid and its full width are exactly what a row of segments is not.
		const tabContainer = makeElement({
			tag: 'div',
			className: segmented
				? 'tab-control__tab-container tab-control__tab-container--segmented'
				: 'tab-control__tab-container panel__card full-width',
			attributes: { role: 'tablist' },
		});

		this.tabs.forEach((tabData) => {
			tabContainer.appendChild(tabData.tabElement);
		});

		if (tabContainer instanceof HTMLElement) {
			this.tabContainer = tabContainer;

			/*
				The thumb is measured from layout, and layout moves: fonts
				load, the window resizes, the sidebar is dragged. Re-measuring
				on every size change keeps it under the selected tab.
			*/
			if (typeof ResizeObserver !== 'undefined') {
				this.resizeObserver = new ResizeObserver(() => this.updateThumb());
				this.resizeObserver.observe(tabContainer);
			}
		}

		return tabContainer;
	}

	/**
	 * Selects the specified tab
	 * @param {String} tabName - which to select
	 */
	selectTab(tabName) {
		this.targetElement.innerHTML = '';
		this.tabs.forEach((tab) => {
			if (tab.name === tabName) {
				tab.tabElement.setAttribute('selected', '');
				tab.tabElement.setAttribute('aria-selected', 'true');
				addAsChildren(this.targetElement, tab.contentMaker());
			} else {
				tab.tabElement.removeAttribute('selected');
				tab.tabElement.setAttribute('aria-selected', 'false');
			}
		});
		closeAllInfoBubbles();
		this.updateThumb();
	}

	/**
	 * Writes the selected tab's position onto the container.
	 *
	 * Tabs are often selected before the page is in the document, when
	 * nothing has a size yet - so a container that is not connected is tried
	 * again on the next frame rather than measured as zero.
	 *
	 * @param {Number=} attempts - frames left to wait for layout
	 */
	updateThumb(attempts = 30) {
		const container = this.tabContainer;
		if (!container) return;

		if (!container.isConnected || !container.offsetWidth) {
			if (attempts > 0) requestAnimationFrame(() => this.updateThumb(attempts - 1));
			return;
		}

		const selected = this.tabs.find((tab) => tab.tabElement.hasAttribute('selected'));
		if (!selected || !(selected.tabElement instanceof HTMLElement)) return;

		container.style.setProperty('--tab-thumb-x', `${selected.tabElement.offsetLeft}px`);
		container.style.setProperty('--tab-thumb-w', `${selected.tabElement.offsetWidth}px`);
		container.setAttribute('data-thumb-ready', '');
	}
}
