'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApi } from '@/hooks/use-api';
import type { CampaignsText } from '../_i18n';
import { useCampaignsMoreText } from '../_i18n/more';

export interface TemplateOption {
  id: number;
  name: string;
  subject: string;
}

export interface CampaignFormValues {
  name: string;
  subject: string;
  templateId: number | null;
  tags: string[];
  featured: string;
}

export const emptyCampaignForm: CampaignFormValues = { name: '', subject: '', templateId: null, tags: [], featured: '' };

// "R1, R2 r3" -> ['R1', 'R2', 'r3']
export function parseReferences(text: string): string[] {
  return Array.from(new Set(text.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean)));
}

// The request body for create / update.
export function campaignBody(v: CampaignFormValues) {
  return {
    name: v.name.trim(),
    subject: v.subject.trim() || undefined,
    templateId: v.templateId ?? undefined,
    recipientFilter: { tags: v.tags },
    featuredReferences: parseReferences(v.featured),
  };
}

const unwrap = <T,>(res: unknown): T => ((res as { data?: T })?.data ?? res) as T;

// The subscriber tags, and how many subscribed contacts the chosen ones reach.
export function useAudience(tags: string[], enabled: boolean) {
  const api = useApi();
  const [allTags, setAllTags] = useState<string[]>([]);
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!api.isReady || !enabled) return;
    api.get('/api/dashboard/campaigns/tags').then((res) => setAllTags(unwrap<string[]>(res) || [])).catch(() => {});
  }, [api.isReady, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  const key = tags.join('\u0000');
  useEffect(() => {
    if (!api.isReady || !enabled) return;
    let live = true;
    const timer = setTimeout(() => {
      api
        .post('/api/dashboard/campaigns/recipient-count', { recipientFilter: { tags } })
        .then((res) => { if (live) setCount(unwrap<{ count: number }>(res)?.count ?? null); })
        .catch(() => { if (live) setCount(null); });
    }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [api.isReady, enabled, key]); // eslint-disable-line react-hooks/exhaustive-deps

  return { allTags, count };
}

// Whether the client set up (and tested) the email server for campaigns.
export function useEmailSetup(enabled = true) {
  const api = useApi();
  const [state, setState] = useState<'loading' | 'missing' | 'unverified' | 'ok'>('loading');
  useEffect(() => {
    if (!api.isReady || !enabled) return;
    api
      .get('/api/dashboard/email-config')
      .then((res) => {
        const config = unwrap<{ isVerified?: boolean; fromEmail?: string } | null>(res);
        setState(!config || !config.fromEmail ? 'missing' : config.isVerified ? 'ok' : 'unverified');
      })
      .catch(() => setState('loading'));
  }, [api.isReady, enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}

export function EmailSetupNotice({ state }: { state: ReturnType<typeof useEmailSetup> }) {
  const m = useCampaignsMoreText();
  if (state !== 'missing' && state !== 'unverified') return null;
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-md border px-4 py-3 text-sm',
        state === 'missing' ? 'border-destructive/40 bg-destructive/5' : 'border-amber-300 bg-amber-50 dark:bg-amber-950/30',
      )}
    >
      <AlertCircle className="h-4 w-4 shrink-0" />
      <span>{state === 'missing' ? m.emailSetupMissing : m.emailSetupUnverified}</span>
      <Link href="/dashboard/settings?tab=email" className="font-medium text-primary underline">
        {m.emailSetupLink}
      </Link>
    </div>
  );
}

export function CampaignFormFields({
  values,
  onChange,
  templates,
  t,
  enabled,
  showTemplate = true,
}: {
  values: CampaignFormValues;
  onChange: (v: CampaignFormValues) => void;
  templates: TemplateOption[];
  t: CampaignsText;
  enabled: boolean;
  showTemplate?: boolean;
}) {
  const m = useCampaignsMoreText();
  const { allTags, count } = useAudience(values.tags, enabled);
  const toggleTag = (tag: string) =>
    onChange({ ...values, tags: values.tags.includes(tag) ? values.tags.filter((x) => x !== tag) : [...values.tags, tag] });

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="campaign-name">{t.list.createDialog.nameLabel}</Label>
        <Input
          id="campaign-name"
          maxLength={100}
          placeholder={t.list.createDialog.namePlaceholder}
          value={values.name}
          onChange={(e) => onChange({ ...values, name: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="campaign-subject">{t.list.createDialog.subjectLabel}</Label>
        <Input
          id="campaign-subject"
          maxLength={255}
          placeholder={t.list.createDialog.subjectPlaceholder}
          value={values.subject}
          onChange={(e) => onChange({ ...values, subject: e.target.value })}
        />
      </div>

      {showTemplate && (
        <div className="space-y-2">
          <Label>{t.common.template}</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {templates.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                className={cn(
                  'flex items-center justify-between rounded-md border p-3 text-left text-sm transition-colors',
                  values.templateId === tpl.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50',
                )}
                onClick={() => onChange({ ...values, templateId: tpl.id })}
              >
                <span className="font-medium">{tpl.name}</span>
                {values.templateId === tpl.id && <Check className="h-4 w-4 text-primary" />}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label>{m.audienceLabel}</Label>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onChange({ ...values, tags: [] })}>
            <Badge variant={values.tags.length === 0 ? 'default' : 'outline'}>{m.audienceAll}</Badge>
          </button>
          {allTags.map((tag) => (
            <button key={tag} type="button" onClick={() => toggleTag(tag)}>
              <Badge variant={values.tags.includes(tag) ? 'default' : 'outline'}>{tag}</Badge>
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {allTags.length > 0 && <>{m.audienceHelp} </>}
          {count !== null && <span className="font-medium text-foreground">{m.recipientsMatch(count)}</span>}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="campaign-featured">{m.featuredLabel}</Label>
        <Input
          id="campaign-featured"
          placeholder={m.featuredPlaceholder}
          value={values.featured}
          onChange={(e) => onChange({ ...values, featured: e.target.value })}
        />
        <p className="text-xs text-muted-foreground">{m.featuredHelp}</p>
      </div>
    </div>
  );
}
