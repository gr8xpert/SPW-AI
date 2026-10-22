'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useBuyerText } from '../../_i18n/use-buyer-text';
import { useBuyerSettings, useTenantLanguages, useUpdateBuyerSettings } from '../../use-buyers';

const valid = (v: string) => !v.trim() || (/^https?:\/\/[^\s{}]+$/i.test(v.trim()) && v.length <= 500);

// The agency's own buyer page per language (the buyer's code is added as
// ?t=). Empty = the page the WordPress plugin made, else the SPM fallback.
export function PageUrlSettings({ canEdit }: { canEdit: boolean }) {
  const s = useBuyerText().settingsPage.pageUrls;
  const fail = useBuyerText().settingsPage.failed;
  const { toast } = useToast();
  const settings = useBuyerSettings();
  const langs = useTenantLanguages();
  const save = useUpdateBuyerSettings();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const saved = settings.data?.buyerPageUrls ?? {};

  useEffect(() => {
    if (settings.data) setDraft({ ...(settings.data.buyerPageUrls ?? {}) });
  }, [settings.data]);

  const keys = ['default', ...(langs.data ?? ['en'])];
  const dirty = keys.some((k) => (draft[k] ?? '') !== (saved[k] ?? ''));
  const bad = keys.filter((k) => !valid(draft[k] ?? ''));

  const submit = async () => {
    try {
      // '' clears a language.
      await save.mutateAsync({ buyerPageUrls: Object.fromEntries(keys.map((k) => [k, (draft[k] ?? '').trim()])) });
      toast({ title: s.saved });
    } catch (err) {
      toast({ title: fail, description: (err as Error).message, variant: 'destructive' });
    }
  };

  return (
    <Card className="max-w-3xl" data-testid="page-urls">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{s.title}</CardTitle>
        <CardDescription>{s.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <fieldset disabled={!canEdit} className="space-y-3">
          {keys.map((k) => (
            <div key={k} className="space-y-1">
              <Label htmlFor={`page-url-${k}`}>{k === 'default' ? s.default : `${s.perLanguage} ${k.toUpperCase()}`}</Label>
              <Input
                id={`page-url-${k}`}
                value={draft[k] ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                placeholder={k === 'default' ? s.example : ''}
                aria-invalid={bad.includes(k)}
              />
              {bad.includes(k) ? <p className="text-xs text-destructive">{s.invalid}</p> : null}
            </div>
          ))}
          <div className="flex justify-end">
            <Button size="sm" onClick={submit} disabled={!dirty || bad.length > 0 || save.isPending}>
              {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {s.save}
            </Button>
          </div>
        </fieldset>
      </CardContent>
    </Card>
  );
}
