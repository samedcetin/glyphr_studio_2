import { addAsChildren, makeElement } from '../../common/dom.js';

/**
 * A range input with its value beside it.
 *
 * @param {Number =} initialValue
 * @param {Function =} callback - called with the new value
 * @param {Number =} min
 * @param {Number =} max
 * @param {Number =} step
 * @param {String =} suffix - the unit, written after the number
 * @returns {HTMLElement}
 */
export function makeFancySlider(
	initialValue = 50,
	callback,
	min = 0,
	max = 100,
	step = 1,
	suffix = ''
) {
	let wrapper = makeElement({ className: 'fancy-slider__wrapper' });

	/*
		The readout says its unit. Every one of these in the app is a
		percentage, and read as a bare `67` next to a bar it could as easily
		have been a count of something.
	*/
	const readoutText = (value) => `${value}${suffix}`;
	let sliderReadout = makeElement({
		className: 'fancy-slider__slider-readout',
		innerHTML: readoutText(initialValue),
	});

	let bar = makeElement({
		tag: 'input',
		attributes: {
			type: 'range',
			value: `${initialValue}`,
			min: `${min}`,
			max: `${max}`,
			step: `${step}`,
		},
		className: 'fancy-slider__bar',
	});

	bar.addEventListener('input', (event) => {
		// @ts-expect-error 'property does exist'
		const value = parseInt(event.target.value);
		sliderReadout.innerHTML = readoutText(value);
		if (callback) callback(value);
	});

	addAsChildren(wrapper, [bar, sliderReadout]);
	return wrapper;
}
