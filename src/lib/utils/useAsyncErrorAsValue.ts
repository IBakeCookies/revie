interface GenericError {
	message: string;
}

export type UseErrorAsValueSuccessReturn<R> = [null, R | Awaited<R>];

export type UseErrorAsValueErrorReturn = [
	{
		cause: Error | GenericError | unknown;
		message?: string;
		code?: number;
	},
	null
];

export async function useAsyncErrorAsValue<R>(
	cb: () => Promise<R>
): Promise<UseErrorAsValueErrorReturn | UseErrorAsValueSuccessReturn<R>> {
	try {
		const response: Awaited<R> = await cb();

		return [null, response];
	} catch (error: unknown) {
		if (error instanceof Error) {
			return [
				{
					cause: error
				},
				null
			];
		}

		return [
			{
				message: 'An unknown error occurred',
				cause: error as GenericError | unknown
			},
			null
		];
	}
}
