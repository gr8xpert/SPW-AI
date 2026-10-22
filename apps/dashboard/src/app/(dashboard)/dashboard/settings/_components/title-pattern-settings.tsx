'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { apiPost } from '@/lib/api';
import { languageName, useSettingsText } from '../_i18n';

// Listing titles built from a pattern per language, e.g. "{type} for sale in
// {location}", on cards and the property page. The API applies them
// (apps/api/src/modules/property/title-pattern.ts); the preview runs there too.

type PatternKey = 'default' | 'sale' | 'rent' | 'holiday_rent' | 'development';
type PatternSet = Partial<Record<PatternKey, Record<string, string>>>;

export interface TitlePatternsForm {
  enabled: boolean;
  card: PatternSet;
  detailSameAsCard: boolean;
  detail: PatternSet;
}

export const EMPTY_TITLE_PATTERNS: TitlePatternsForm = { enabled: false, card: {}, detailSameAsCard: true, detail: {} };

// Labels: settingsText titles.keys[key] / titles.fields[token].
const KEYS: { key: PatternKey }[] = [
  { key: 'default' },
  { key: 'sale' },
  { key: 'development' },
  { key: 'rent' },
  { key: 'holiday_rent' },
];

const FIELDS = ['type', 'location', 'area', 'listingType', 'bedrooms', 'ref', 'title'] as const;

function cleanSet(value: unknown): PatternSet {
  const out: PatternSet = {};
  if (!value || typeof value !== 'object') return out;
  for (const { key } of KEYS) {
    const texts = (value as Record<string, unknown>)[key];
    if (texts && typeof texts === 'object') {
      out[key] = Object.fromEntries(Object.entries(texts).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
    }
  }
  return out;
}

export function titlePatternsFromSettings(value: unknown): TitlePatternsForm {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  return {
    enabled: v.enabled === true,
    card: cleanSet(v.card),
    detailSameAsCard: v.detailSameAsCard !== false,
    detail: cleanSet(v.detail),
  };
}

// Empty boxes are dropped; the API cleans the rest again.
export function titlePatternsToSettings(form: TitlePatternsForm) {
  const strip = (set: PatternSet) =>
    Object.fromEntries(
      Object.entries(set)
        .map(([k, texts]) => [k, Object.fromEntries(Object.entries(texts ?? {}).map(([l, t]) => [l, t.trim()]).filter(([, t]) => t))])
        .filter(([, texts]) => Object.keys(texts as object).length),
    );
  return { enabled: form.enabled, card: strip(form.card), detailSameAsCard: form.detailSameAsCard, detail: strip(form.detail) };
}

interface PreviewRow {
  reference: string;
  original: Record<string, string>;
  card: Record<string, string>;
  detail: Record<string, string>;
}

export function TitlePatternSettings({
  value,
  onChange,
  languages,
}: {
  value: TitlePatternsForm;
  onChange: (v: TitlePatternsForm) => void;
  languages: string[];
}) {
  const { toast } = useToast();
  const st = useSettingsText();
  const t = st.titles;
  const langs = languages.length ? languages : ['en'];
  const [lang, setLang] = useState(langs[0]);
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  // The box a field button types into (the last one the client clicked).
  const focused = useRef<{ part: 'card' | 'detail'; key: PatternKey; el?: HTMLInputElement }>({ part: 'card', key: 'default' });
  const caret = useRef<{ el: HTMLInputElement; pos: number } | null>(null);
  const current = langs.includes(lang) ? lang : langs[0];

  const setText = (part: 'card' | 'detail', key: PatternKey, text: string) => {
    const set = value[part];
    onChange({ ...value, [part]: { ...set, [key]: { ...(set[key] ?? {}), [current]: text } } });
  };

  const insert = (token: string) => {
    const f = focused.current;
    const text = value[f.part][f.key]?.[current] ?? '';
    const at = f.el?.selectionStart ?? text.length;
    const before = text.slice(0, at);
    const piece = `${before && !before.endsWith(' ') ? ' ' : ''}{${token}}`;
    setText(f.part, f.key, before + piece + text.slice(at));
    if (f.el) caret.current = { el: f.el, pos: at + piece.length };
  };

  // Puts the cursor after an inserted field once React has written the new
  // text into the box (a later frame raced with typing).
  useLayoutEffect(() => {
    const c = caret.current;
    if (!c) return;
    caret.current = null;
    c.el.focus();
    c.el.setSelectionRange(c.pos, c.pos);
  });

  const runPreview = async () => {
    setLoading(true);
    try {
      const res = await apiPost<unknown>('/api/dashboard/properties/title-preview', {
        titlePatterns: titlePatternsToSettings(value),
        languages: langs,
      });
      const rows = ((res as { data?: unknown })?.data ?? res) as PreviewRow[];
      setPreview(Array.isArray(rows) ? rows : []);
    } catch (e) {
      toast({ title: t.previewFailed, description: (e as Error).message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const boxes = (part: 'card' | 'detail') => (
    <div className="space-y-2">
      {KEYS.map(({ key }) => (
        <div key={key} className="grid items-center gap-1 sm:grid-cols-[13rem_1fr] sm:gap-3">
          <Label htmlFor={`tp-${part}-${key}`} className="text-sm font-normal">{t.keys[key]}</Label>
          <Input
            id={`tp-${part}-${key}`}
            placeholder={key === 'default' ? t.defaultPlaceholder : t.emptyPlaceholder}
            value={value[part][key]?.[current] ?? ''}
            onFocus={(e) => (focused.current = { part, key, el: e.currentTarget })}
            onChange={(e) => setText(part, key, e.target.value)}
          />
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-4 rounded-md border p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Label htmlFor="title-patterns-enabled">{t.title}</Label>
          <p className="text-xs text-muted-foreground">{t.help}</p>
        </div>
        <Switch id="title-patterns-enabled" checked={value.enabled} onCheckedChange={(enabled) => onChange({ ...value, enabled })} />
      </div>

      {value.enabled && (
        <>
          <div className="flex flex-wrap gap-1">
            {langs.map((l) => (
              <Button key={l} type="button" size="sm" variant={l === current ? 'default' : 'outline'} onClick={() => setLang(l)}>
                {languageName(st, l) ?? l.toUpperCase()}
              </Button>
            ))}
          </div>

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t.addField}</p>
            <div className="flex flex-wrap gap-1">
              {FIELDS.map((token) => (
                <Button key={token} type="button" size="sm" variant="secondary" onMouseDown={(e) => e.preventDefault()} onClick={() => insert(token)}>
                  + {t.fields[token]}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>{value.detailSameAsCard ? t.cardsAndPage : t.cards}</Label>
            {boxes('card')}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={value.detailSameAsCard}
              onChange={(e) => onChange({ ...value, detailSameAsCard: e.target.checked })}
            />
            {t.sameAsCards}
          </label>

          {!value.detailSameAsCard && (
            <div className="space-y-2">
              <Label>{t.propertyPage}</Label>
              {boxes('detail')}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            {t.fallbackHelp}
          </p>

          <div className="space-y-2">
            <Button type="button" variant="outline" size="sm" disabled={loading} onClick={runPreview}>
              {loading ? st.common.loading : t.preview}
            </Button>
            {preview && (preview.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t.noListings}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr><th className="py-1 pr-3">{t.colRef}</th><th className="py-1 pr-3">{t.colCard}</th>{!value.detailSameAsCard && <th className="py-1 pr-3">{t.propertyPage}</th>}<th className="py-1">{t.colOwn}</th></tr>
                  </thead>
                  <tbody>
                    {preview.map((r) => (
                      <tr key={r.reference} className="border-t align-top">
                        <td className="py-1 pr-3 font-mono text-xs">{r.reference}</td>
                        <td className="py-1 pr-3">{r.card[current]}</td>
                        {!value.detailSameAsCard && <td className="py-1 pr-3">{r.detail[current]}</td>}
                        <td className="py-1 text-muted-foreground">{r.original[current]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
