'use client';

import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { useBuyerText } from '../../_i18n/use-buyer-text';
import { nameOf, type PickOption } from '../../use-buyer-match';

// A searchable checklist of a tree (locations or property types): every
// level can be picked, children are indented under their parent, and the
// picks show as removable chips.
export function MultiPicker({
  options,
  value,
  onChange,
  testid,
}: {
  options: PickOption[];
  value: number[];
  onChange: (ids: number[]) => void;
  testid?: string;
}) {
  const t = useBuyerText().wishlist;
  const [q, setQ] = useState('');

  const ordered = useMemo(() => {
    const byParent = new Map<number | null, PickOption[]>();
    const ids = new Set(options.map((o) => o.id));
    for (const o of options) {
      const parent = o.parentId != null && ids.has(o.parentId) ? o.parentId : null;
      byParent.set(parent, [...(byParent.get(parent) || []), o]);
    }
    const out: { option: PickOption; depth: number }[] = [];
    const walk = (parent: number | null, depth: number) => {
      const kids = (byParent.get(parent) || []).sort(
        (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || nameOf(a.name).localeCompare(nameOf(b.name)),
      );
      for (const k of kids) {
        out.push({ option: k, depth });
        if (depth < 6) walk(k.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  }, [options]);

  const needle = q.trim().toLowerCase();
  const shown = needle ? ordered.filter((r) => nameOf(r.option.name).toLowerCase().includes(needle)) : ordered;
  const chosen = new Set(value);
  const byId = new Map(options.map((o) => [o.id, o]));
  const toggle = (id: number) => onChange(chosen.has(id) ? value.filter((v) => v !== id) : [...value, id]);

  return (
    <div className="space-y-2" data-testid={testid}>
      <div className="flex min-h-[28px] flex-wrap gap-1.5">
        {value.length ? (
          value.map((id) => (
            <span key={id} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs text-primary">
              {nameOf(byId.get(id)?.name) || `#${id}`}
              <button type="button" onClick={() => toggle(id)} aria-label={`${t.clear} ${nameOf(byId.get(id)?.name)}`}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))
        ) : (
          <span className="text-xs text-muted-foreground">{t.noneChosen}</span>
        )}
      </div>
      <div className="rounded-md border">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t.searchPlaceholder}
          className="h-8 rounded-b-none border-0 border-b focus-visible:ring-0"
        />
        <div className="max-h-56 overflow-y-auto p-1">
          {shown.length ? (
            shown.map(({ option, depth }) => (
              <label
                key={option.id}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted"
                style={{ paddingLeft: needle ? 8 : 8 + depth * 16 }}
              >
                <Checkbox checked={chosen.has(option.id)} onCheckedChange={() => toggle(option.id)} />
                <span>{nameOf(option.name)}</span>
                {option.level ? <span className="text-xs text-muted-foreground">{option.level}</span> : null}
              </label>
            ))
          ) : (
            <p className="px-2 py-1 text-sm text-muted-foreground">{t.nothingFound}</p>
          )}
        </div>
      </div>
    </div>
  );
}
