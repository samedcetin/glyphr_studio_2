import { describe, expect, it } from 'vitest';
import { constantFromSlug, makeSlugs, slugFromFileName, uniqueSlug } from '../icon_names.js';

describe('Icon font: naming', () => {
	it('takes the name off the file', () => {
		expect(slugFromFileName('heart.svg')).toEqual('heart');
		expect(slugFromFileName('icons/ui/heart.svg')).toEqual('heart');
		expect(slugFromFileName('C:\\icons\\heart.svg')).toEqual('heart');
	});

	it('reads the three styles icon sets actually ship in', () => {
		expect(slugFromFileName('heart-filled.svg')).toEqual('heart-filled');
		expect(slugFromFileName('heart_filled.svg')).toEqual('heart-filled');
		expect(slugFromFileName('heartFilled.svg')).toEqual('heart-filled');
		expect(slugFromFileName('HeartFilled.svg')).toEqual('heart-filled');
	});

	it('drops prefixes that say nothing', () => {
		expect(slugFromFileName('icon-heart.svg')).toEqual('heart');
		expect(slugFromFileName('ic_heart.svg')).toEqual('heart');
		expect(slugFromFileName('ico-heart.svg')).toEqual('heart');
	});

	it('keeps digits, which are usually part of the name', () => {
		expect(slugFromFileName('arrow-2.svg')).toEqual('arrow-2');
		expect(slugFromFileName('star3.svg')).toEqual('star3');
	});

	it('never returns an empty name', () => {
		expect(slugFromFileName('.svg')).toEqual('icon');
		expect(slugFromFileName('___.svg')).toEqual('icon');
		expect(slugFromFileName('')).toEqual('icon');
	});

	it('handles spaces and punctuation without leaving stray dashes', () => {
		expect(slugFromFileName('Heart (filled).svg')).toEqual('heart-filled');
		expect(slugFromFileName('  spaced  out .svg')).toEqual('spaced-out');
	});

	it('makes a name unique rather than letting one shadow another', () => {
		const taken = new Set(['heart']);
		expect(uniqueSlug('heart', taken)).toEqual('heart-2');
		taken.add('heart-2');
		expect(uniqueSlug('heart', taken)).toEqual('heart-3');
	});

	it('keeps a whole set distinct, including files that differ only in style', () => {
		/*
			`heart.svg` and `Heart.svg` are two different files on a
			case-sensitive disk and the same slug - which would silently give
			the exported map one entry where there were two icons.
		*/
		const slugs = makeSlugs(['heart.svg', 'Heart.svg', 'heart-filled.svg', 'heartFilled.svg']);
		expect(new Set(slugs).size).toEqual(4);
		expect(slugs[0]).toEqual('heart');
		expect(slugs[1]).toEqual('heart-2');
	});

	it('respects names already in use in the project', () => {
		const slugs = makeSlugs(['heart.svg'], new Set(['heart']));
		expect(slugs).toEqual(['heart-2']);
	});

	it('makes a constant name for source code', () => {
		expect(constantFromSlug('heart-filled')).toEqual('HEART_FILLED');
	});
});
