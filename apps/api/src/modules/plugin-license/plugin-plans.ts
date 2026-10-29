import { createHash, randomBytes } from 'crypto';

// Plans for SPM AI Translator for Polylang (owner-approved 2026-10-29). Stripe Payment Links on
// realtysoft.eu carry metadata spm_product=spm-ai-translator and spm_plan=<id below>, on the link
// itself (copied to the Checkout Session) and in subscription_data (copied to the Subscription).
export const PLUGIN_PRODUCT = 'spm-ai-translator';

export interface PluginPlan {
  id: string;
  label: string;
  sites: number;
  // Monthly word allowance for SPM AI credits plans; null = bring-your-own-key.
  words: number | null;
}

export const PLUGIN_PLANS: Record<string, PluginPlan> = {
  pro_single: { id: 'pro_single', label: 'Pro Single', sites: 1, words: null },
  pro_5: { id: 'pro_5', label: 'Pro 5 Sites', sites: 5, words: null },
  agency: { id: 'agency', label: 'Agency', sites: 25, words: null },
  credits_100k: { id: 'credits_100k', label: 'SPM AI credits 100k', sites: 1, words: 100_000 },
  credits_300k: { id: 'credits_300k', label: 'SPM AI credits 300k', sites: 1, words: 300_000 },
  credits_1m: { id: 'credits_1m', label: 'SPM AI credits 1M', sites: 3, words: 1_000_000 },
};

export function pluginPlan(id: string | undefined | null): PluginPlan | null {
  return id && Object.prototype.hasOwnProperty.call(PLUGIN_PLANS, id) ? PLUGIN_PLANS[id] : null;
}

// Keys look like SPMAI-7K2Q-9XWM-4TPA-HD3F-R8NC: 20 random characters from an alphabet without
// look-alikes (no 0/O, 1/I/L), 98+ bits of entropy, grouped for copying from an email.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export function generatePluginKey(): { rawKey: string; hash: string; last4: string } {
  const bytes = randomBytes(20);
  let chars = '';
  for (let i = 0; i < 20; i++) chars += ALPHABET[bytes[i] % ALPHABET.length];
  const rawKey = `SPMAI-${chars.match(/.{4}/g)!.join('-')}`;
  return { rawKey, hash: hashPluginKey(rawKey), last4: rawKey.slice(-4) };
}

export function hashPluginKey(rawKey: string): string {
  return createHash('sha256').update(rawKey.trim().toUpperCase()).digest('hex');
}

// Same normalisation as the plugin (LicenseClient::site_url): host + path, lowercase, no scheme, no www.
export function normaliseSiteUrl(input: string): string {
  let s = (input || '').trim().toLowerCase().replace(/^[a-z]+:\/\//, '');
  s = s.replace(/^www\./, '').replace(/[?#].*$/, '').replace(/\/+$/, '');
  return s.slice(0, 255);
}

// Words of the source text a translate call carries (HTML tags and shortcodes don't count).
export function countWords(texts: string[]): number {
  let n = 0;
  for (const t of texts) {
    const plain = String(t ?? '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\[[^\]]*\]/g, ' ')
      .trim();
    if (plain) n += plain.split(/\s+/u).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  }
  return n;
}
