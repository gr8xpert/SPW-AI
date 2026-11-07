import type { Property } from '../../database/entities';
import type { ExportFeedFormat } from '../../database/entities';
import type { ExportLookups } from './export-rows';
import { KyeroFeedWriter, KyeroResult } from './kyero/kyero-builder';
import { ThinkSpainFeedWriter } from './portals/thinkspain-builder';
import { ApitsFeedWriter } from './portals/apits-builder';

// One writer per export feed format (Feed Export -> Feeds). Each takes
// listings a batch at a time and returns the finished XML.

export interface FeedWriter {
  add(properties: Property[]): void;
  finish(): KyeroResult;
}

export interface PortalOptions {
  // Title / description / feature languages, in order. Empty = the format's default.
  languages: string[];
  urlFor?: (p: Property) => string | null;
  // The agency name some formats put in their header.
  agentName: string;
}

export const FORMAT_LABELS: Record<ExportFeedFormat, string> = {
  kyero: 'Kyero V3',
  fotocasa: 'Fotocasa',
  thinkspain: 'ThinkSpain 1.15',
  apits: 'A Place in the Sun',
};

export function makeFeedWriter(format: ExportFeedFormat, lookups: ExportLookups, options: PortalOptions): FeedWriter {
  switch (format) {
    case 'thinkspain':
      return new ThinkSpainFeedWriter(lookups, options);
    case 'apits':
      return new ApitsFeedWriter(lookups, options);
    case 'fotocasa':
      return new KyeroFeedWriter(lookups, { ...options, variant: 'fotocasa' });
    case 'kyero':
    default:
      return new KyeroFeedWriter(lookups, { ...options, variant: 'kyero' });
  }
}
