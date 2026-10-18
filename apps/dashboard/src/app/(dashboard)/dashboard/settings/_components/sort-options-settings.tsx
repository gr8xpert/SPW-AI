'use client';

import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Which choices the website's "Sort by" dropdown offers, and the order
// results start in. The widget reads them from the public config
// (enabledSortOptions / defaultSort); the API keeps defaultSort among them.

export const SORT_CHOICES: { value: string; label: string }[] = [
  { value: 'create_date_desc', label: 'Newest Listings' },
  { value: 'create_date', label: 'Oldest Listings' },
  { value: 'write_date_desc', label: 'Recently Updated' },
  { value: 'write_date', label: 'Oldest Updated' },
  { value: 'list_price', label: 'Price: Low to High' },
  { value: 'list_price_desc', label: 'Price: High to Low' },
  { value: 'is_featured_desc', label: 'Featured First' },
  { value: 'location_id', label: 'By Location' },
];

export interface SortOptionsForm {
  options: string[];
  defaultSort: string;
}

export const EMPTY_SORT_OPTIONS: SortOptionsForm = {
  options: SORT_CHOICES.map((c) => c.value),
  defaultSort: 'create_date_desc',
};

const KNOWN = new Set(SORT_CHOICES.map((c) => c.value));

export function sortOptionsFromSettings(options: unknown, defaultSort: unknown): SortOptionsForm {
  const saved = Array.isArray(options) ? options.filter((v): v is string => typeof v === 'string' && KNOWN.has(v)) : [];
  const list = saved.length ? SORT_CHOICES.map((c) => c.value).filter((v) => saved.includes(v)) : EMPTY_SORT_OPTIONS.options;
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
  const toggle = (sort: string, on: boolean) => {
    if (!on && value.options.length === 1) return;
    const options = SORT_CHOICES.map((c) => c.value).filter((v) => (v === sort ? on : value.options.includes(v)));
    const defaultSort = options.includes(value.defaultSort) ? value.defaultSort : options[0];
    onChange({ options, defaultSort });
  };

  return (
    <div className="space-y-3 rounded-md border p-4">
      <div className="space-y-1">
        <Label>Sort Options</Label>
        <p className="text-xs text-muted-foreground">
          The choices in the website&apos;s &quot;Sort by&quot; dropdown, on every search and listing design. At least one must stay ticked.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {SORT_CHOICES.map(({ value: sort, label }) => (
          <label key={sort} className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={value.options.includes(sort)}
              onChange={(e) => toggle(sort, e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <span className="text-sm">{label}</span>
          </label>
        ))}
      </div>
      <div className="space-y-1">
        <Label htmlFor="default-sort">Default sort</Label>
        <p className="text-xs text-muted-foreground">How results are ordered until the visitor picks another sort.</p>
        <Select value={value.defaultSort} onValueChange={(defaultSort) => onChange({ ...value, defaultSort })}>
          <SelectTrigger id="default-sort" className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_CHOICES.filter((c) => value.options.includes(c.value)).map((c) => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
