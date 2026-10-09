import axios from 'axios';

// Shared by the XML-file feeds (Kyero, RedSP). These feeds are one big file
// with no paging at the source, while the importer asks for 100 listings at a
// time — so the file is downloaded and mapped once per run, kept here, and
// later pages slice the kept list. Page 1 always downloads fresh.

const KEEP_MS = 10 * 60 * 1000;
const kept = new Map<string, { at: number; items: unknown[] }>();

export interface XmlFeedPage<T> {
  items: T[];
  totalCount: number;
  hasMore: boolean;
}

export async function loadXmlFeedPage<T>(
  url: string,
  page: number,
  limit: number,
  load: (xml: string) => T[],
): Promise<XmlFeedPage<T>> {
  let entry = kept.get(url);
  if (page <= 1 || !entry || Date.now() - entry.at > KEEP_MS) {
    const response = await axios.get(url, {
      timeout: 180000,
      responseType: 'text',
      maxContentLength: 300 * 1024 * 1024,
    });
    // The raw string is only referenced inside load(), so it can be freed as
    // soon as the mapped list exists.
    entry = { at: Date.now(), items: load(String(response.data)) };
    kept.set(url, entry);
  }
  const items = entry.items as T[];
  const start = (page - 1) * limit;
  const hasMore = start + limit < items.length;
  if (!hasMore) kept.delete(url);
  return { items: items.slice(start, start + limit), totalCount: items.length, hasMore };
}

// Reads only the start of the file to tell whether the URL is the right feed,
// instead of downloading tens of MB to check a URL.
export async function probeXml(
  url: string,
  needles: string[],
  label: string,
): Promise<{ valid: boolean; error?: string }> {
  try {
    const response = await axios.get(url, { timeout: 15000, responseType: 'stream' });
    const head = await new Promise<string>((resolve, reject) => {
      let text = '';
      const stream = response.data;
      stream.on('data', (chunk: Buffer) => {
        text += chunk.toString('utf8');
        if (text.length >= 8192) {
          stream.destroy();
          resolve(text);
        }
      });
      stream.on('end', () => resolve(text));
      stream.on('error', reject);
    });
    if (!needles.some((n) => head.includes(n))) {
      return { valid: false, error: `${label}: the URL is not a ${label} XML feed` };
    }
    return { valid: true };
  } catch (error: any) {
    const msg = error.response?.status ? `HTTP ${error.response.status}` : error.message || 'Connection failed';
    return { valid: false, error: `${label}: ${msg}` };
  }
}

export function toNumber(value: unknown): number | undefined {
  if (value == null || value === '') return undefined;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

// Energy letter, from <energy_rating><consumption>X</consumption> or a plain letter.
export function toEnergyRating(value: unknown): string | undefined {
  if (value == null) return undefined;
  const v = String(value).trim().toUpperCase();
  return /^[A-G]$/.test(v) ? v : undefined;
}
