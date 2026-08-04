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
	/** Always present, always safe to show a user. A toast renders it verbatim. */
	message: string;
	/** The original thrown value. For the log only — never render this. */
	cause?: unknown;
}

/** `[error, null]` or `[null, value]`. Truth-checking the first slot narrows the second. */
export type Result<T> = [AppError, null] | [null, T];

export async function useAsyncErrorAsValue<T>(
	cb: () => Promise<T>,
	/** Used only when the thrown value carries no message of its own. */
	fallbackMessage = 'An unknown error occurred',
): Promise<Result<T>> {
	try {
		return [null, await cb()];
	} catch (cause) {
		// A thrown Error's own message is the more specific one — the repositories
		// throw things like "AdGuard responded with 401 Unauthorized" — so it wins.
		const message = cause instanceof Error && cause.message ? cause.message : fallbackMessage;

		return [{ message, cause }, null];
	}
}
