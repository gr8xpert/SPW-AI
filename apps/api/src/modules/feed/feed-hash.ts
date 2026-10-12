import { createHash } from 'crypto';
import { FeedProperty } from './adapters';

// What a feed says about a listing, without its images (those are compared
// by URL). Equal hash on the next run = nothing to write.
//
// Keys are sorted at every level. (An earlier version passed the top-level
// key list to JSON.stringify as a replacer; a replacer array also filters
// nested objects, so title, description and location were hashed as "{}"
// and a text change at the source never reached the listing.)
export function computeFeedHash(feedProperty: FeedProperty): string {
  const { images, ...data } = feedProperty;
  return createHash('sha256').update(stableStringify(data)).digest('hex');
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
