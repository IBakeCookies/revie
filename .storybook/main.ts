import type { StorybookConfig } from '@storybook/sveltekit';

const config: StorybookConfig = {
	// Stories live beside the component they document.
	stories: ['../src/**/*.stories.svelte'],
	addons: [
		'@storybook/addon-svelte-csf',
		'@chromatic-com/storybook',
		'@storybook/addon-vitest',
		'@storybook/addon-a11y',
		'@storybook/addon-docs',
	],
	framework: '@storybook/sveltekit',

	// themes.css reaches for url('/themes/glass-light.jpg'); kit's dev middleware
	// serves static/ but `storybook build` does not copy it, so the two glass
	// themes lose their background in the built storybook without this.
	staticDirs: ['../static'],
};

export default config;
