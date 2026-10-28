import type { NextFunction, Request, Response } from 'express';

// Norwegian has three codes: "no" (what we store translations under), and the
// two written forms "nb" (Bokmål) and "nn" (Nynorsk). WordPress sites send
// nb_NO / nn_NO, so a Nynorsk page asked for "nn", found nothing and fell back
// to English (Elpano, 10-28). All of them mean our "no".
const ALIASES: Record<string, string> = { nb: 'no', nn: 'no' };

// "nn_NO", "nb-NO", "NO" → "no". Other codes are returned as they came.
export function canonicalLang(code: string): string {
  const trimmed = code.trim();
  const base = trimmed.split(/[-_]/)[0].toLowerCase();
  return ALIASES[base] ?? trimmed;
}

// The first tag of an Accept-Language header, mapped the same way; the rest
// of the header is left alone.
function canonicalAcceptLanguage(header: string): string {
  const [first, ...rest] = header.split(',');
  const [tag, ...params] = first.split(';');
  const mapped = canonicalLang(tag);
  if (mapped === tag.trim()) return header;
  return [[mapped, ...params].join(';'), ...rest].join(',');
}

// Runs before every route, so each endpoint (labels, names, titles, brochure,
// forms) reads "no" for any Norwegian code without its own mapping.
export function canonicalLanguageMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const q = req.query as Record<string, unknown> | undefined;
  for (const key of ['lang', 'language']) {
    if (q && typeof q[key] === 'string') q[key] = canonicalLang(q[key] as string);
  }
  const header = req.headers['accept-language'];
  if (typeof header === 'string' && header) req.headers['accept-language'] = canonicalAcceptLanguage(header);
  next();
}
