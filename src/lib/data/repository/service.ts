import {
	type UseErrorAsValueErrorReturn,
	type UseErrorAsValueSuccessReturn,
	useAsyncErrorAsValue
} from '$lib/utils/useAsyncErrorAsValue';

type GetServiceStateInput = string;

export interface GetServiceStateOutput {
	isAlive: boolean;
}

export async function getServiceState(
	href: GetServiceStateInput
): Promise<UseErrorAsValueSuccessReturn<GetServiceStateOutput> | UseErrorAsValueErrorReturn> {
	return useAsyncErrorAsValue(async () => {
		const raw = await fetch('/api/ping', {
			method: 'POST',
			body: JSON.stringify({
				href
			})
		});

		return await raw.json();
	});
}
