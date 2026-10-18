// Settings → Widget → Listing titles: the client writes a pattern per
// language, e.g. "{type} for sale in {location}", and the website shows every
// listing's title built from it — on cards and on the property page. The
// public API applies it (PropertyTitleInterceptor), so the widget, the WP
// plugin's page title / Open Graph tags and the Next.js kit all get the same
// text. Feed exports and the dashboard keep the listing's own title, and so do
// property URLs (urlSegment is built before the pattern is applied).

export const TITLE_TOKENS = ['type', 'location', 'area', 'listingType', 'bedrooms', 'ref', 'title'] as const;
export type TitleToken = (typeof TITLE_TOKENS)[number];

// A pattern per listing type replaces `default` for that type.
export const TITLE_PATTERN_KEYS = ['default', 'sale', 'rent', 'holiday_rent', 'development'] as const;
export type TitlePatternKey = (typeof TITLE_PATTERN_KEYS)[number];

export type I18nText = Record<string, string>;
export type TitlePatternSet = Partial<Record<TitlePatternKey, I18nText>>;

export interface TitlePatterns {
  enabled: boolean;
  card: TitlePatternSet;
  // The property page uses the card patterns unless this is false.
  detailSameAsCard: boolean;
  detail: TitlePatternSet;
}

export type TitleValues = Partial<Record<TitleToken, string | null | undefined>>;

const TOKEN_RE = /\{([a-zA-Z]+)\}/g;
const LANG_RE = /^[a-z]{2}(-[a-z]{2})?$/;
const MAX_PATTERN = 200;

function cleanSet(value: unknown): TitlePatternSet {
  const out: TitlePatternSet = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  for (const key of TITLE_PATTERN_KEYS) {
    const texts = (value as Record<string, unknown>)[key];
    if (!texts || typeof texts !== 'object' || Array.isArray(texts)) continue;
    const clean: I18nText = {};
    for (const [lang, text] of Object.entries(texts as Record<string, unknown>)) {
      const l = lang.toLowerCase();
      if (!LANG_RE.test(l) || typeof text !== 'string') continue;
      const t = text.replace(/\s+/g, ' ').trim().slice(0, MAX_PATTERN);
      if (t) clean[l] = t;
    }
    if (Object.keys(clean).length) out[key] = clean;
  }
  return out;
}

/** The saved setting, cleaned. Anything unusable reads as switched off. */
export function cleanTitlePatterns(value: unknown): TitlePatterns {
  const v = (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as Record<string, unknown>;
  return {
    enabled: v.enabled === true,
    card: cleanSet(v.card),
    detailSameAsCard: v.detailSameAsCard !== false,
    detail: cleanSet(v.detail),
  };
}

/** Tokens in the patterns that aren't fields, e.g. a typo like "{loction}". */
export function unknownTitleTokens(patterns: TitlePatterns): string[] {
  const bad = new Set<string>();
  for (const set of [patterns.card, patterns.detail]) {
    for (const texts of Object.values(set)) {
      for (const text of Object.values(texts ?? {})) {
        for (const m of text.matchAll(TOKEN_RE)) {
          if (!(TITLE_TOKENS as readonly string[]).includes(m[1])) bad.add(m[1]);
        }
      }
    }
  }
  return [...bad];
}

/** Every field the given pattern set uses, so lookups run only when needed. */
export function tokensUsed(set: TitlePatternSet): Set<string> {
  const used = new Set<string>();
  for (const texts of Object.values(set)) {
    for (const text of Object.values(texts ?? {})) {
      for (const m of text.matchAll(TOKEN_RE)) used.add(m[1]);
    }
  }
  return used;
}

export function patternSetFor(patterns: TitlePatterns, kind: 'card' | 'detail'): TitlePatternSet {
  return kind === 'detail' && !patterns.detailSameAsCard ? patterns.detail : patterns.card;
}

function inLang(texts: I18nText | undefined, lang: string): string | undefined {
  if (!texts) return undefined;
  return texts[lang] || texts[lang.split('-')[0]];
}

/**
 * The pattern for one listing in one language. The visitor's language comes
 * first — a listing-type pattern written only in English must not put English
 * words on the Spanish site when a Spanish default exists — then English.
 */
export function pickTitlePattern(set: TitlePatternSet, listingType: string | null | undefined, lang: string): string | null {
  const lt = listingType === 'offplan' ? 'development' : listingType;
  const own = lt && lt !== 'default' && (TITLE_PATTERN_KEYS as readonly string[]).includes(lt) ? set[lt as TitlePatternKey] : undefined;
  return inLang(own, lang) || inLang(set.default, lang) || own?.en || set.default?.en || null;
}

/**
 * The pattern with its fields filled in, or null when a field it uses has no
 * value on this listing (the caller then keeps the listing's own title, so a
 * listing with no location never reads "Apartment for sale in").
 */
export function renderTitle(pattern: string, values: TitleValues): string | null {
  let missing = false;
  const out = pattern.replace(TOKEN_RE, (_, name: string) => {
    const v = (TITLE_TOKENS as readonly string[]).includes(name) ? values[name as TitleToken] : undefined;
    const s = typeof v === 'string' ? v.trim() : '';
    if (!s) missing = true;
    return s;
  });
  if (missing) return null;
  const clean = out.replace(/\s+/g, ' ').trim();
  return clean || null;
}

/** "3" or "2–4" (developments), or null with no bedrooms. */
export function bedroomsText(from: unknown, to: unknown): string | null {
  const a = Number(from);
  const b = Number(to);
  if (!(a > 0)) return null;
  return b > a ? `${a}–${b}` : String(a);
}

// Label keys for {listingType}: the same words the cards' listing-type badge uses.
export const LISTING_TYPE_LABEL_KEYS: Record<string, string> = {
  sale: 'card_for_sale',
  rent: 'card_for_rent',
  holiday_rent: 'card_holiday_rent',
  development: 'card_development',
  offplan: 'card_development',
};
