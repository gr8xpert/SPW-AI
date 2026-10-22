'use client';

import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSettingsText } from '../_i18n';

// Which choices the website's "Sort by" dropdown offers, and the order
// results start in. The widget reads them from the public config
// (enabledSortOptions / defaultSort); the API keeps defaultSort among them.

// Labels: settingsText sort.choices[value].
export const SORT_CHOICES = [
  { value: 'create_date_desc' },
  { value: 'create_date' },
  { value: 'write_date_desc' },
  { value: 'write_date' },
  { value: 'list_price' },
  { value: 'list_price_desc' },
  { value: 'is_featured_desc' },
  { value: 'location_id' },
] as const;

type SortValue = (typeof SORT_CHOICES)[number]['value'];

export interface SortOptionsForm {
  options: string[];
  defaultSort: string;
}

export const EMPTY_SORT_OPTIONS: SortOptionsForm = {
  options: SORT_CHOICES.map((c) => c.value),
  defaultSort: 'create_date_desc',
};

const KNOWN = new Set<string>(SORT_CHOICES.map((c) => c.value));

export function sortOptionsFromSettings(options: unknown, defaultSort: unknown): SortOptionsForm {
  const saved = Array.isArray(options) ? options.filter((v): v is string => typeof v === 'string' && KNOWN.has(v)) : [];
  const list = saved.length ? SORT_CHOICES.map((c): string => c.value).filter((v) => saved.includes(v)) : EMPTY_SORT_OPTIONS.options;
  const def = typeof defaultSort === 'string' && list.includes(defaultSort) ? defaultSort : list[0];
  return { options: list, defaultSort: def };
}

// All ticked = no limit saved, so choices added later show up by themselves.
export function sortOptionsToSettings(form: SortOptionsForm): { sortOptions: string[] | null; defaultSort: string } {
  return {
    sortOptions: form.options.length === SORT_CHOICES.length ? null : form.options,
    defaultSort: form.defaultSort,
  };
}

export function SortOptionsSettings({ value, onChange }: { value: SortOptionsForm; onChange: (v: SortOptionsForm) => void }) {
  const t = useSettingsText().sort;
  const label = (sort: SortValue) => t.choices[sort];
  const toggle = (sort: string, on: boolean) => {
    if (!on && value.options.length === 1) return;
    const options = SORT_CHOICES.map((c): string => c.value).filter((v) => (v === sort ? on : value.options.includes(v)));
    const defaultSort = options.includes(value.defaultSort) ? value.defaultSort : options[0];
    onChange({ options, defaultSort });
  };

  return (
    <div className="space-y-3 rounded-md border p-4">
      <div className="space-y-1">
        <Label>{t.title}</Label>
        <p className="text-xs text-muted-foreground">{t.help}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {SORT_CHOICES.map(({ value: sort }) => (
          <label key={sort} className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={value.options.includes(sort)}
              onChange={(e) => toggle(sort, e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <span className="text-sm">{label(sort)}</span>
          </label>
        ))}
      </div>
      <div className="space-y-1">
        <Label htmlFor="default-sort">{t.defaultSort}</Label>
        <p className="text-xs text-muted-foreground">{t.defaultHelp}</p>
        <Select value={value.defaultSort} onValueChange={(defaultSort) => onChange({ ...value, defaultSort })}>
          <SelectTrigger id="default-sort" className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_CHOICES.filter((c) => value.options.includes(c.value)).map((c) => (
              <SelectItem key={c.value} value={c.value}>{label(c.value)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
