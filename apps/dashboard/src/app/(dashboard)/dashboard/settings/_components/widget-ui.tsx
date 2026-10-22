'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useLanguage } from '@/i18n/i18n-provider';
import { useSettingsText } from '../_i18n';

// Building blocks shared by the Widget tab's sections.

/** Changes ?key=value in the address bar without a navigation (null removes it). */
export function updateQuery(params: Record<string, string | null>) {
  const url = new URL(window.location.href);
  for (const [k, v] of Object.entries(params)) {
    if (v == null) url.searchParams.delete(k);
    else url.searchParams.set(k, v);
  }
  window.history.replaceState(window.history.state, '', url.toString());
}

/** A titled setting with its explanation above the control. */
export function SettingBlock({ title, description, htmlFor, children }: { title: string; description?: ReactNode; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{title}</Label>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      {children}
    </div>
  );
}

/** An on/off setting in a bordered row; children show only while it's on. */
export function SwitchRow({
  id,
  title,
  description,
  checked,
  onCheckedChange,
  children,
}: {
  id: string;
  title: string;
  description: ReactNode;
  checked: boolean;
  onCheckedChange: (on: boolean) => void;
  children?: ReactNode;
}) {
  return (
    <div className="space-y-4 rounded-md border p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Label htmlFor={id}>{title}</Label>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
      </div>
      {checked && children}
    </div>
  );
}

/** A one-line summary that opens to the full editor. */
export function CollapsibleRow({ title, summary, children }: { title: string; summary: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/50"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="min-w-0">
          <span className="block text-sm font-medium">{title}</span>
          <span className="block truncate text-xs text-muted-foreground">{summary}</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="space-y-3 border-t px-4 py-3">{children}</div>}
    </div>
  );
}

/** Removable number chips plus a box that adds one on Enter (kept sorted). */
export function NumberChips({
  values,
  onChange,
  format,
  placeholder,
  max,
}: {
  values: number[];
  onChange: (values: number[]) => void;
  format?: (n: number) => string;
  placeholder?: string;
  max?: number;
}) {
  const t = useSettingsText();
  const { locale } = useLanguage();
  const show = format ?? ((n: number) => n.toLocaleString(locale));
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {values.map((n) => (
          <span key={n} className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium">
            {show(n)}
            <button
              type="button"
              aria-label={t.widget.chips.remove(show(n))}
              className="ml-1 rounded-sm p-0.5 hover:bg-muted"
              onClick={() => onChange(values.filter((v) => v !== n))}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={1}
          max={max}
          placeholder={placeholder ?? t.widget.chips.addValue}
          className="h-8 w-36 text-sm"
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            const input = e.target as HTMLInputElement;
            const val = Number(input.value);
            if (val > 0 && (!max || val <= max) && !values.includes(val)) {
              onChange([...values, val].sort((a, b) => a - b));
              input.value = '';
            }
          }}
        />
        <p className="text-xs text-muted-foreground">{t.widget.chips.pressEnter}</p>
      </div>
    </>
  );
}

/** Picks one of a few options shown as buttons (with an optional second line). */
export function ChoiceButtons<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; desc?: string; icon?: ReactNode; testId?: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          data-testid={o.testId}
          className={`flex ${o.desc ? 'flex-col items-start' : 'items-center gap-2'} rounded-md border px-4 py-2 text-sm transition-colors ${value === o.value ? 'border-primary bg-primary/10 text-primary' : 'border-input hover:bg-muted'}`}
          onClick={() => onChange(o.value)}
        >
          {o.icon}
          <span className="font-medium">{o.label}</span>
          {o.desc && <span className="text-xs text-muted-foreground">{o.desc}</span>}
        </button>
      ))}
    </div>
  );
}
