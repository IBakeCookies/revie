import { describe, expect, it } from 'vitest';
import { GRID_COLUMNS, cn, normalizeSpan, spanStyle } from '$lib/utils/style';

describe('cn', () => {
	it('lets a later class win over the one it conflicts with', () => {
		expect(cn('p-box-xs', 'p-box-lg')).toBe('p-box-lg');
	});

	it('keeps the custom spacing scale apart from unrelated utilities', () => {
		expect(cn('p-box-md', 'mt-grid-lg')).toBe('p-box-md mt-grid-lg');
	});

	it('resolves conditional and falsy inputs', () => {
		expect(cn('rounded', { 'rounded-xs': true, hidden: false }, undefined)).toBe('rounded-xs');
	});
});

describe('spanStyle', () => {
	it('always emits the custom property, because an unset --span drops grid-column', () => {
		expect(spanStyle(6)).toBe('--span:6');
		expect(spanStyle()).toBe(`--span:${GRID_COLUMNS}`);
	});
});

describe('normalizeSpan', () => {
	it('clamps to the grid', () => {
		expect(normalizeSpan(0)).toBe(1);
		expect(normalizeSpan(99)).toBe(GRID_COLUMNS);
		expect(normalizeSpan(6)).toBe(6);
	});

	it('rejects anything that is not an integer', () => {
		expect(normalizeSpan('6')).toBeUndefined();
		expect(normalizeSpan(1.5)).toBeUndefined();
		expect(normalizeSpan(undefined)).toBeUndefined();
	});
});
