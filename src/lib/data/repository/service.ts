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
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				href
			})
		});

		if (!raw.ok) {
			throw new Error(`Ping responded with ${raw.status} ${raw.statusText}`);
		}

		return await raw.json();
	});
}
