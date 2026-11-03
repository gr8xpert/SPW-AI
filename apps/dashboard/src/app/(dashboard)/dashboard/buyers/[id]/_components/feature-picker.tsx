'use client';

import { useMemo, useState } from 'react';
import { ChevronRight, X } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useBuyerText } from '../../_i18n/use-buyer-text';
import { nameOf, type PickOption } from '../../use-buyer-match';

// Buyers mostly ask about views and pools first; the long lists come last.
const GROUP_ORDER = ['views', 'community', 'exterior', 'parking', 'security', 'climate', 'interior', 'other'];

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// A client can have 100+ features: the picks stay at the top as removable
// chips, the rest sits in closed groups, and a search reaches across them all.
export function FeaturePicker({
  options,
  value,
  onChange,
}: {
  options: PickOption[];
  value: number[];
  onChange: (ids: number[]) => void;
}) {
  const t = useBuyerText().wishlist;
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string[]>([]);

  const groups = useMemo(() => {
    const byCategory = new Map<string, PickOption[]>();
    for (const f of options) byCategory.set(f.category || 'other', [...(byCategory.get(f.category || 'other') ?? []), f]);
    const rank = (c: string) => (GROUP_ORDER.indexOf(c) + 1 || GROUP_ORDER.length + 1);
    return Array.from(byCategory.entries())
      .sort(([a], [b]) => rank(a) - rank(b))
      .map(([category, list]) => ({ category, list: [...list].sort((a, b) => nameOf(a.name).localeCompare(nameOf(b.name))) }));
  }, [options]);

  const needle = plain(q.trim());
  const shown = needle
    ? groups.map((g) => ({ ...g, list: g.list.filter((f) => plain(nameOf(f.name)).includes(needle)) })).filter((g) => g.list.length)
    : groups;
  const chosen = new Set(value);
  const byId = new Map(options.map((o) => [o.id, o]));
  const picks = value.filter((id) => byId.has(id));
  const toggle = (id: number) => onChange(chosen.has(id) ? value.filter((v) => v !== id) : [...value, id]);
  const toggleGroup = (category: string) => setOpen((o) => (o.includes(category) ? o.filter((c) => c !== category) : [...o, category]));

  return (
    <div className="space-y-3" data-testid="pick-features">
      <div className="flex min-h-[28px] flex-wrap items-center gap-1.5" data-testid="feature-picks">
        {picks.length ? (
          <>
            {picks.map((id) => (
              <span key={id} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs text-primary">
                {nameOf(byId.get(id)?.name)}
                <button type="button" onClick={() => toggle(id)} aria-label={`${t.clear} ${nameOf(byId.get(id)?.name)}`}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <button type="button" onClick={() => onChange([])} className="px-1 text-xs text-muted-foreground underline-offset-2 hover:underline">
              {t.clear}
            </button>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">{t.featuresNone}</span>
        )}
      </div>

      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setQ('');
        }}
        placeholder={t.featuresSearch}
        aria-label={t.featuresSearch}
        className="h-9 sm:max-w-sm"
        data-testid="feature-search"
      />

      {shown.length ? (
        <div className="grid items-start gap-2 lg:grid-cols-2">
          {shown.map(({ category, list }) => {
            const expanded = !!needle || open.includes(category);
            const picked = list.filter((f) => chosen.has(f.id)).length;
            const panel = `feature-group-${category}`;
            return (
              <div key={category} className="rounded-md border" data-feature-group={category}>
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={panel}
                  disabled={!!needle}
                  onClick={() => toggleGroup(category)}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium enabled:hover:bg-muted"
                >
                  <ChevronRight className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-90')} />
                  <span className="flex-1">{t.featureCategories[category] ?? category}</span>
                  {picked ? <span className="whitespace-nowrap rounded-full bg-primary/10 px-2 py-0.5 text-xs font-normal text-primary">{t.chosen(picked)}</span> : null}
                  <span className="text-xs font-normal text-muted-foreground">{list.length}</span>
                </button>
                {expanded ? (
                  <div id={panel} className="grid gap-x-3 gap-y-0.5 border-t p-2 sm:grid-cols-2">
                    {list.map((f) => (
                      <label key={f.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted">
                        <Checkbox checked={chosen.has(f.id)} onCheckedChange={() => toggle(f.id)} data-feature={f.id} />
                        <span>{nameOf(f.name)}</span>
                      </label>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t.nothingFound}</p>
      )}
    </div>
  );
}
