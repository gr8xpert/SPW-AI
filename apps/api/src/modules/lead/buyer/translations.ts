import { BadRequestException } from '@nestjs/common';

const LANG_RE = /^[a-z]{2}(-[a-z]{2})?$/i;

// A translated name from the dashboard ({ en: 'Viewing', es: 'Visita' }) →
// only language-code keys with non-empty text, trimmed and capped. At least
// one language must be left.
export function cleanTranslations(raw: unknown, maxLength: number, what: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [lang, value] of Object.entries(raw as Record<string, unknown>)) {
      if (!LANG_RE.test(lang) || typeof value !== 'string') continue;
      const text = value.trim().slice(0, maxLength);
      if (text) out[lang.toLowerCase()] = text;
    }
  }
  if (!Object.keys(out).length) throw new BadRequestException(`${what} needs a name in at least one language`);
  return out;
}

// English first, else the first language given.
export function firstText(t: Record<string, string>): string {
  return t.en || Object.values(t)[0] || '';
}
