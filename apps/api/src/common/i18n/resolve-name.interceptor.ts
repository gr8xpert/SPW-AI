import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

// Entities store multilingual content as JSON i18n maps (`{ en: "Villa", es: "Villa" }`).
// Public widget API contract is `string`, so we resolve maps to the requested language
// before responding. Without this, the widget renders an empty object and the text
// disappears (dropdown labels, card titles, descriptions, SEO meta).
//
// Covered fields: name (PropertyType/Feature/Location/Group), title/description
// (Property), metaTitle/metaDescription/metaKeywords/pageTitle (Property SEO).
//
// Language source order: ?lang query → Accept-Language header → 'en'.
// Fallback inside the map: requested lang → 'en' → first non-empty value → ''.

const I18N_KEYS = new Set([
  'name',
  'title',
  'description',
  'metaTitle',
  'metaDescription',
  'metaKeywords',
  'pageTitle',
]);

function pickLang(req: Request): string {
  const q = (req.query?.lang as string | undefined)?.trim();
  if (q) return q.toLowerCase().slice(0, 5);
  const header = req.headers['accept-language'];
  if (typeof header === 'string' && header) {
    const first = header.split(',')[0]?.split(';')[0]?.trim();
    if (first) return first.toLowerCase().slice(0, 5);
  }
  return 'en';
}

function resolveOne(value: Record<string, unknown>, lang: string): string {
  const base = lang.split('-')[0];
  const candidates = [lang, base, 'en'];
  for (const k of candidates) {
    const v = value[k];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  for (const v of Object.values(value)) {
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return '';
}

function isI18nNameObject(v: unknown): v is Record<string, string> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const vals = Object.values(v);
  if (vals.length === 0) return false;
  return vals.every((x) => typeof x === 'string' || x == null);
}

function walk(node: unknown, lang: string, seen: WeakSet<object>): unknown {
  if (node == null) return node;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) node[i] = walk(node[i], lang, seen);
    return node;
  }
  if (typeof node !== 'object') return node;
  if (seen.has(node as object)) return node;
  seen.add(node as object);

  for (const key of Object.keys(node as Record<string, unknown>)) {
    const val = (node as Record<string, unknown>)[key];
    if (I18N_KEYS.has(key) && isI18nNameObject(val)) {
      (node as Record<string, unknown>)[key] = resolveOne(val, lang);
    } else {
      (node as Record<string, unknown>)[key] = walk(val, lang, seen);
    }
  }
  return node;
}

@Injectable()
export class ResolveNameInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const lang = pickLang(req);
    return next.handle().pipe(map((body) => walk(body, lang, new WeakSet())));
  }
}
