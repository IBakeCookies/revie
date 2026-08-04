/* Data-driven scenery vars: unlike the seeded vars (scenery-seed.ts) these
   derive from the real clock — the sun's position for sundial, the waking
   day's remaining hours for tide, the sky's darkness for city-windows.
   Recomputed every minute by the layout — these are positions, not
   animations, so they must follow the real clock for a tab left open all
   day. Every var has a CSS fallback (noon / half tide). SSR
   renders the SERVER's clock (upstream zenith derives the visitor's timezone
   from a Vercel IP header, which this self-hosted node build has no
   equivalent for); hydration does NOT re-patch the attribute, so the layout
   re-derives from the client clock in onMount — the value may shift once
   shortly after load. */

export function dataSceneryStyle(now: Date): string {
	const hours = now.getHours() + now.getMinutes() / 60;

	/* sundial: 0 at 06:00 → 1 at 20:00, clamped; alt is the sun's altitude
	   arc (0 at the ends, 1 at noon); vis fades the whole scenery out over
	   the hour past 20:00 and back in before 06:00 — at night the dial sleeps */
	const sun = Math.min(1, Math.max(0, (hours - 6) / 14));
	const alt = Math.sin(Math.PI * sun);
	const vis = Math.min(1, Math.max(0, Math.min(hours - 5, 21 - hours)));

	/* tide: the day's water — full early, ebbing to low at 23:00 */
	const tide = Math.min(1, Math.max(0, (23 - hours) / 16));

	/* city-windows: how dark the sky is — vis inverted, so the skyline's
	   windows light in waves as the sun goes down (thresholds in the CSS) */
	const dark = 1 - vis;

	return [
		`--sundial-t: ${sun.toFixed(3)}`,
		`--sundial-alt: ${alt.toFixed(3)}`,
		`--sundial-vis: ${vis.toFixed(3)}`,
		`--tide-level: ${tide.toFixed(3)}`,
		`--city-dark: ${dark.toFixed(3)}`,
	].join('; ');
}
