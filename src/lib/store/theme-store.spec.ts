import { describe, expect, it } from 'vitest';
import { getClassesToAdd, themes } from '$lib/store/theme-store.svelte';

// The store itself builds an $effect in its constructor, so it only exists inside a
// component; e2e/can-change-theme.spec.ts covers it against a real document.
describe('getClassesToAdd', () => {
	it('maps a theme to the classes the markup expects', () => {
		expect(getClassesToAdd('glass-dark')).toEqual(['glass', 'glass-dark']);
		expect(getClassesToAdd('cyber-punk')).toEqual(['cyber-punk']);
	});

	it('knows the classes of every theme, so none of them renders unstyled', () => {
		expect(themes.map((theme) => getClassesToAdd(theme.name))).not.toContainEqual([]);
	});
});
