// A feed provider that refuses us (403) or asks us to slow down (429) tends to
// refuse every feed in the queue for a while. Failing straight away would burn
// through the whole queue in seconds with no second try until the next morning,
// so the job goes back to wait and tries again later.

// Minutes to wait before each new try. Once these are used up the run fails.
export const FEED_RETRY_DELAYS_MS = [30, 60, 120].map((minutes) => minutes * 60 * 1000);

export function isProviderRefusal(error: unknown): boolean {
  const status = (error as { response?: { status?: number } } | null)?.response?.status;
  return status === 403 || status === 429;
}

// Thrown by processImport after keeping the run open, for the processor to delay the job.
export class FeedRetryLaterError extends Error {
  constructor(cause: unknown) {
    super(`Provider refused the import: ${String(cause)}`);
    this.name = 'FeedRetryLaterError';
  }
}
