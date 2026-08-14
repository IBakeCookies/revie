/**
 * Errors as values, Go style: every layer hands the failure back instead of
 * throwing, so whoever is in a position to DECIDE what a failure means gets to
 * decide — log it, show a toast, retry, or ignore it. The innermost function
 * never has to guess, and nothing gets swallowed on the way up.
 *
 * `message` is required and is always a string. That is the whole point: an
 * error that cannot be rendered cannot be reported to a user.
 */

export interface AppError {
	/**
	 * Always present, always a string — so a failure is always reportable to a
	 * LOG. Never render it: it is minted where no locale exists, so putting it
	 * in front of a user puts an English line on a German page. Presentation
	 * picks the words from the data or the kind that crossed the layer.
	 */
	message: string;
	/** The original thrown value. For the log only — never render this. */
	cause?: unknown;
}

/** `[error, null]` or `[null, value]`. Truth-checking the first slot narrows the second. */
export type Result<T> = [AppError, null] | [null, T];

export async function useAsyncErrorAsValue<T>(
	cb: () => Promise<T>,
	/**
	 * What was being attempted — the href, the path. Prefixed to the thrown
	 * message, and stands alone when the thrown value carries none.
	 */
	context?: string,
): Promise<Result<T>> {
	try {
		return [null, await cb()];
	} catch (cause) {
		// Both halves are useful and neither is enough: `fetch failed` from undici
		// names no service, while the context alone loses "401 Unauthorized". They
		// used to compete, and the specific one always won — so every context was
		// discarded at every call site.
		const thrown = cause instanceof Error ? cause.message : '';
		const message = [context, thrown].filter(Boolean).join(': ') || 'An unknown error occurred';

		return [
			{
				message,
				cause,
			},
			null,
		];
	}
}
