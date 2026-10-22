'use client';

import { useState } from 'react';
import { Loader2, Lock, LockOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { useApi } from '@/hooks/use-api';
import type { useToast } from '@/hooks/use-toast';
import { labelOf, usePropertiesText } from '../../../_i18n';

// Plain names for the feed fields a save can lock are in t.locks.fields.

const FEED_NAMES: Record<string, string> = {
  resales: 'Resales', inmoba: 'Inmoba', infocasa: 'Infocasa', redsp: 'RedSP', kyero: 'Kyero', odoo: 'Odoo',
};

// Feed listings: fields changed in the dashboard are locked so the feed no
// longer overwrites them. Shows which, and lets the user hand them back.
export function FeedLocksNotice({
  api,
  toast,
  propertyId,
  source,
  lockedFields,
  onChange,
}: {
  api: ReturnType<typeof useApi<any>>;
  toast: ReturnType<typeof useToast>['toast'];
  propertyId: number;
  source: string;
  lockedFields: string[];
  onChange: (locked: string[]) => void;
}) {
  const t = usePropertiesText();
  const [busy, setBusy] = useState<string | null>(null);
  if (!lockedFields.length) return null;

  const feed = FEED_NAMES[source] ?? t.locks.theFeed;
  // lat + lng share one label; show it once.
  const shown = lockedFields.filter((f, i) => !(f === 'lng' && lockedFields.includes('lat')) && lockedFields.indexOf(f) === i);
  const fieldsOf = (f: string) => (f === 'lat' ? lockedFields.filter((x) => x === 'lat' || x === 'lng') : [f]);

  const unlock = async (fields: string[], key: string) => {
    setBusy(key);
    try {
      const res = await api.post(`/api/dashboard/properties/${propertyId}/unlock`, { fields });
      const saved = (res?.data ?? res)?.lockedFields;
      onChange(Array.isArray(saved) ? saved : lockedFields.filter((f) => !fields.includes(f)));
      const names = fields.length === lockedFields.length ? t.locks.allFields : labelOf(t.locks.fields, fields[0]);
      toast({ title: t.locks.unlocked(names), description: t.locks.nextSync(feed, fields.length > 1) });
    } catch {
      toast({ title: t.locks.unlockFailed, description: t.locks.unlockFailedDescription, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card hoverEffect={false} className="relative overflow-hidden rounded-lg p-5 pl-6">
      <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-amber-400" />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
            <Lock className="h-4 w-4" />
          </div>
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-foreground">
              {t.locks.heading(shown.length, feed)}
            </h2>
            <p className="max-w-prose text-sm text-muted-foreground">
              {t.locks.description(feed)}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="shrink-0 self-start" disabled={!!busy} onClick={() => unlock(lockedFields, '__all')}>
          {busy === '__all' ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <LockOpen className="mr-2 h-3.5 w-3.5" />}
          {t.locks.unlockAll}
        </Button>
      </div>

      <ul className="mt-4 flex flex-wrap gap-2 sm:pl-[3.125rem]">
        {shown.map((f) => {
          const label = labelOf(t.locks.fields, f);
          return (
            <li key={f}>
              <button
                type="button"
                title={t.locks.unlockField(label)}
                aria-label={t.locks.unlockField(label)}
                disabled={!!busy}
                onClick={() => unlock(fieldsOf(f), f)}
                className="group inline-flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                {busy === f ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <>
                    <Lock className="h-3 w-3 text-amber-600 group-hover:hidden group-focus-visible:hidden dark:text-amber-400" />
                    <LockOpen className="hidden h-3 w-3 group-hover:block group-focus-visible:block" />
                  </>
                )}
                {label}
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
