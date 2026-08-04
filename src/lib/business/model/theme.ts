/**
 * The theme catalogue: every theme's identifier, display label and CSS
 * classes, plus the pure helpers over it.
 *
 * Deliberately free of runes and of any storage concern, so the SSR path
 * (`hooks.server.ts` stamps the theme class into the HTML before first paint)
 * can import it without pulling in the client-reactive store.
 */

export type ThemeName =
	| 'revie'
	| 'solid-light'
	| 'solid-dark'
	| 'glass-light'
	| 'glass-dark'
	| 'aurora'
	| 'daybreak'
	| 'royal'
	| 'terminal'
	| 'blueprint'
	| 'bubblegum'
	| 'ukiyo'
	| 'abyss'
	| 'parchment'
	| 'noir'
	| 'ember'
	| 'glacier'
	| 'orbit'
	| 'lantern-drift'
	| 'canopy'
	| 'meridian'
	| 'dunes'
	| 'synthwave'
	| 'sundial'
	| 'tide'
	| 'breath'
	| 'city-windows';

export interface ThemeItem {
	name: ThemeName;
	/* display name for the UI; name stays the cookie/CSS identifier */
	label: string;
	css: string[];
}

export const themes: ThemeItem[] = [
	{
		name: 'revie',
		label: 'Revie',
		css: ['revie', 'dark'],
	},
	{
		name: 'solid-light',
		label: 'Classic Light',
		css: ['solid-light'],
	},
	{
		name: 'solid-dark',
		label: 'Classic Dark',
		css: ['dark'],
	},
	{
		name: 'glass-light',
		label: 'Morning Glass',
		css: ['glass-light'],
	},
	{
		name: 'glass-dark',
		label: 'Night Glass',
		css: ['glass-dark', 'dark'],
	},
	{
		name: 'aurora',
		label: 'Aurora',
		css: ['aurora', 'dark'],
	},
	{
		name: 'daybreak',
		label: 'Daybreak',
		css: ['daybreak'],
	},
	{
		name: 'royal',
		label: 'Royal Velvet',
		css: ['royal', 'dark'],
	},
	{
		name: 'terminal',
		label: 'Terminal',
		css: ['terminal', 'dark'],
	},
	{
		name: 'blueprint',
		label: 'Blueprint',
		css: ['blueprint', 'dark'],
	},
	{
		name: 'bubblegum',
		label: 'Bubblegum',
		css: ['bubblegum'],
	},
	{
		name: 'ukiyo',
		label: 'Ukiyo-e',
		css: ['ukiyo'],
	},
	{
		name: 'abyss',
		label: 'Abyss',
		css: ['abyss', 'dark'],
	},
	{
		name: 'parchment',
		label: 'Parchment',
		css: ['parchment'],
	},
	{
		name: 'noir',
		label: 'Noir',
		css: ['noir', 'dark'],
	},
	{
		name: 'ember',
		label: 'Ember',
		css: ['ember', 'dark'],
	},
	{
		name: 'glacier',
		label: 'Glacier',
		css: ['glacier'],
	},
	{
		name: 'orbit',
		label: 'Orbit',
		css: ['orbit', 'dark'],
	},
	{
		name: 'lantern-drift',
		label: 'Lantern Drift',
		css: ['lantern-drift', 'dark'],
	},
	{
		name: 'canopy',
		label: 'Canopy',
		css: ['canopy'],
	},
	{
		name: 'meridian',
		label: 'Meridian',
		css: ['meridian', 'dark'],
	},
	{
		name: 'dunes',
		label: 'Dunes',
		css: ['dunes'],
	},
	{
		name: 'synthwave',
		label: 'Synthwave',
		css: ['synthwave', 'dark'],
	},
	{
		name: 'sundial',
		label: 'Sundial',
		css: ['sundial'],
	},
	{
		name: 'tide',
		label: 'Tide',
		css: ['tide'],
	},
	{
		name: 'breath',
		label: 'Breath',
		css: ['breath', 'dark'],
	},
	{
		name: 'city-windows',
		label: 'City Windows',
		css: ['city-windows', 'dark'],
	},
] as const;

/* Defaults for first visit (no cookie). hooks.server.ts injects both class
   lists into app.html's pre-paint script, so this stays the only definition.
   `revie` is this app's own theme and is dark, so it can only be the dark
   default; a light-preferring OS gets the frosted light theme nearest to it. */
export const DEFAULT_THEME: ThemeName = 'glass-light';

export const DEFAULT_DARK_THEME: ThemeName = 'revie';

/* 32-bit scenery seed. The store only mints and persists the number;
   mapping it to CSS vars is presentation's job (utils/scenery-seed.ts). */
export function randomScenerySeed(): number {
	return Math.floor(Math.random() * 0x100000000);
}

export function getClassesToAdd(themeName: ThemeName): string[] {
	return themes.find((t) => t.name === themeName)?.css ?? [];
}

/**
 * A stored/untrusted theme identifier → a known theme, or undefined.
 *
 * Cookies outlive deploys: one written before a theme was removed still names
 * it. Every read path must go through here rather than casting, or a deleted
 * theme resolves to no CSS classes and the app renders unstyled.
 */
export function resolveThemeName(candidate: string | undefined): ThemeName | undefined {
	return themes.find((t) => t.name === candidate)?.name;
}
