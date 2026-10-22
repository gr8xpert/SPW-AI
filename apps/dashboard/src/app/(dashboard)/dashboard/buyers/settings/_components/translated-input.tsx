'use client';

import { useState } from 'react';
import { Languages } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

// One text per website language: the first language inline, the others
// behind a "translate" toggle (filled-in ones are shown as a count).
export function TranslatedInput({
  value,
  onChange,
  languages,
  placeholder,
  maxLength = 150,
  className,
  disabled,
}: {
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  languages: string[];
  placeholder?: string;
  maxLength?: number;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [main, ...others] = languages.length ? languages : ['en'];
  const filled = others.filter((l) => value[l]?.trim()).length;
  const set = (lang: string, text: string) => onChange({ ...value, [lang]: text });

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex gap-1.5">
        <Input
          value={value[main] ?? ''}
          placeholder={placeholder}
          maxLength={maxLength}
          disabled={disabled}
          onChange={(e) => set(main, e.target.value)}
          aria-label={main.toUpperCase()}
        />
        {others.length ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 px-2 text-xs text-muted-foreground"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            title={others.map((l) => l.toUpperCase()).join(', ')}
          >
            <Languages className="mr-1 h-3.5 w-3.5" />
            {filled}/{others.length}
          </Button>
        ) : null}
      </div>
      {open ? (
        <div className="grid gap-1.5 sm:grid-cols-2">
          {others.map((lang) => (
            <div key={lang} className="flex items-center gap-1.5">
              <span className="w-7 shrink-0 text-[11px] font-medium uppercase text-muted-foreground">{lang}</span>
              <Input
                className="h-8"
                value={value[lang] ?? ''}
                maxLength={maxLength}
                disabled={disabled}
                onChange={(e) => set(lang, e.target.value)}
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// Empty translations are not sent (the API wants real text only).
export function compactTranslations(t: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(t).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim()]));
}
