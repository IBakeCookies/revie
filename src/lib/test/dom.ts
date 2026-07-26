/**
 * The grid column width is passed as a custom property, and the browser normalizes
 * the inline style, so the attribute cannot be compared as a string.
 */
export function spanOf(container: HTMLElement): string {
	const element = container.firstElementChild as HTMLElement | null;

	return element?.style.getPropertyValue('--span').trim() ?? '';
}
