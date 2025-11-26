import {
	type UseErrorAsValueErrorReturn,
	type UseErrorAsValueSuccessReturn,
	useAsyncErrorAsValue
} from '$lib/utils/useAsyncErrorAsValue';

interface GetAdguardStatsInput {
	username: string;
	password: string;
	href: string;
}

export interface GetAdguardStatsOutput {
	num_dns_queries: number;
	num_blocked_filtering: number;
	avg_processing_time: number;
	top_blocked_domains: Record<string, number>[];
}

export async function $getAdguardStats({
	username,
	password,
	href
}: GetAdguardStatsInput): Promise<
	UseErrorAsValueSuccessReturn<GetAdguardStatsOutput> | UseErrorAsValueErrorReturn
> {
	const base64 = Buffer.from(`${username}:${password}`).toString('base64');

	return useAsyncErrorAsValue(async () => {
		const response = await fetch(`${href}/control/stats`, {
			headers: {
				Authorization: `Basic ${base64}`,
				'Content-type': 'application/json'
			}
		});

		return response.json();
	});
}
