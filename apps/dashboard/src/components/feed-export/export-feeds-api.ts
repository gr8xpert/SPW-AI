// Feed Export -> Feeds: shapes and helpers for the extra portal feeds.

export type ExportFeedFormat = 'kyero' | 'fotocasa' | 'thinkspain' | 'apits';

export const FEED_FORMATS: ExportFeedFormat[] = ['kyero', 'fotocasa', 'thinkspain', 'apits'];

export const FORMAT_LABELS: Record<ExportFeedFormat, string> = {
  kyero: 'Kyero V3',
  fotocasa: 'Fotocasa',
  thinkspain: 'ThinkSpain 1.15',
  apits: 'A Place in the Sun',
};

// File name at the end of the URL, so it looks like what the portal expects.
export const FORMAT_FILES: Record<ExportFeedFormat, string> = {
  kyero: 'kyero.xml',
  fotocasa: 'fotocasa.xml',
  thinkspain: 'thinkspain.xml',
  apits: 'aplaceinthesun.xml',
};

// Languages the feeds can carry (Kyero's list).
export const FEED_LANGUAGES = ['en', 'es', 'de', 'nl', 'fr', 'it', 'pt', 'ru', 'sv', 'no', 'da', 'fi', 'pl', 'ca'];

export interface ExportFeedSettings {
  title: string;
  format: ExportFeedFormat;
  isEnabled: boolean;
  includeUnpublished: boolean;
  listingScope: 'all' | 'own' | 'selected';
  propertyIds: number[];
  languages: string[];
  propertyUrlPattern: string;
}

export interface ExportFeedRow extends ExportFeedSettings {
  id: number;
  formatLabel: string;
  feedKey: string;
  lastGeneratedAt: string | null;
  propertyCount: number;
  skippedCount: number;
  skipped: Array<{ reference: string; reason: string }>;
}

export const NEW_FEED: ExportFeedSettings = {
  title: '',
  format: 'kyero',
  isEnabled: true,
  includeUnpublished: false,
  listingScope: 'selected',
  propertyIds: [],
  languages: [],
  propertyUrlPattern: '',
};

export function settingsOf(row: ExportFeedRow): ExportFeedSettings {
  return {
    title: row.title,
    format: row.format,
    isEnabled: row.isEnabled,
    includeUnpublished: row.includeUnpublished,
    listingScope: row.listingScope,
    propertyIds: row.propertyIds,
    languages: row.languages,
    propertyUrlPattern: row.propertyUrlPattern,
  };
}

// References in an old feed file: Kyero <ref>, ThinkSpain <unique_id>,
// A Place in the Sun <UniquePropertyID>, idealista JSON propertyCode.
export function referencesInFile(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const data = JSON.parse(trimmed);
      const list: any[] = Array.isArray(data) ? data : data.customerProperties || data.properties || [];
      return list
        .map((p) => String(p?.propertyCode ?? p?.propertyReference ?? p?.reference ?? p?.ref ?? '').trim())
        .filter(Boolean);
    } catch {
      return [];
    }
  }
  const doc = new DOMParser().parseFromString(trimmed, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) return [];
  const refs: string[] = [];
  for (const [parent, child] of [
    ['property', 'ref'],
    ['property', 'unique_id'],
    ['Property', 'UniquePropertyID'],
  ]) {
    for (const node of Array.from(doc.getElementsByTagName(parent))) {
      for (const el of Array.from(node.children)) {
        if (el.tagName === child && el.textContent?.trim()) refs.push(el.textContent.trim());
      }
    }
  }
  return [...new Set(refs)];
}
