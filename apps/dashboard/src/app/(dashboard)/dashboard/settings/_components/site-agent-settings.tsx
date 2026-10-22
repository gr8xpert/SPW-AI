'use client';

import Link from 'next/link';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { initialsOf, useAgentOptions } from '@/hooks/use-agents';
import { useSettingsText } from '../_i18n';

// The agent shown on every property page (design 02's side column, above the
// form): one of the "Show on website" people from the Agents page, or none —
// then each listing shows its own agent. The server copies the person's card
// into settings and refreshes it when they are edited.
export interface SiteAgentForm {
  userId: string;
}

export const EMPTY_SITE_AGENT: SiteAgentForm = { userId: '' };

export function siteAgentFromSettings(value: unknown): SiteAgentForm {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const id = Number(v.userId);
  return { userId: Number.isInteger(id) && id > 0 ? String(id) : '' };
}

export function siteAgentToSettings(form: SiteAgentForm) {
  return form.userId ? { userId: Number(form.userId) } : {};
}

const NONE = 'none';

export function SiteAgentSettings({ value, onChange }: { value: SiteAgentForm; onChange: (v: SiteAgentForm) => void }) {
  const t = useSettingsText().siteAgent;
  const options = useAgentOptions();
  const people = (options.data ?? []).filter((a) => a.showOnWebsite);
  const picked = people.find((a) => String(a.id) === value.userId) ?? null;

  return (
    <div className="space-y-3 rounded-md border p-4" data-testid="site-agent">
      <div className="space-y-1">
        <Label>{t.title}</Label>
        <p className="text-xs text-muted-foreground">
          {t.helpBefore}{' '}
          <Link href="/dashboard/team" className="underline">{t.agentsPage}</Link> {t.helpAfter}
        </p>
      </div>
      <Select value={value.userId || NONE} onValueChange={(v) => onChange({ userId: v === NONE ? '' : v })}>
        <SelectTrigger className="sm:max-w-sm" aria-label={t.title}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>{t.none}</SelectItem>
          {people.map((a) => (
            <SelectItem key={a.id} value={String(a.id)}>{a.name || a.email}</SelectItem>
          ))}
          {value.userId && !picked && !options.isLoading && (
            <SelectItem value={value.userId}>{t.gone}</SelectItem>
          )}
        </SelectContent>
      </Select>
      {picked && (
        <div className="flex items-center gap-3 rounded-md bg-muted/50 p-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-sm font-semibold text-muted-foreground">
            {picked.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={picked.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              initialsOf(picked.name)
            )}
          </div>
          <div className="min-w-0 text-sm">
            <p className="font-medium">{picked.name}</p>
            <p className="truncate text-muted-foreground">
              {[picked.title, picked.phone, picked.whatsapp && `WhatsApp ${picked.whatsapp}`, picked.publicEmail].filter(Boolean).join(' · ') || t.noDetails}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
