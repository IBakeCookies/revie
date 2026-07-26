export interface AdguardStats {
	dnsQueries: number;
	numBlockedFiltering: number;
	avgProcessingTimeMs: number;
	topBlockedDomain: string;
}
