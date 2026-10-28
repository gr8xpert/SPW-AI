'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, KeyRound, Loader2, Lock, Plus } from 'lucide-react';
import type { ApiKeyScope } from '@spm/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { nameOf, useMatchOptions, type PickOption } from '../../buyers/use-buyer-match';
import { useSettingsText } from '../_i18n';
import { useWebsiteKeysText, type WebsiteKeysText } from './website-keys-text';
import { WebsiteKeyEditor } from './website-key-editor';
import { WebsiteKeySuggestions } from './website-key-suggestions';
import {
  useCreateWebsiteKey,
  useRemoveWebsiteKey,
  useRotateWebsiteKey,
  useUpdateWebsiteKey,
  useWebsiteKeys,
  type WebsiteKeyInput,
} from './use-website-keys';

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

// The scope as short chips: "Marbella · New development · €500,000+".
function useScopeChips(t: WebsiteKeysText) {
  const locations = useMatchOptions('locations');
  const types = useMatchOptions('property-types');
  const features = useMatchOptions('features');
  return useMemo(() => {
    const names = (opts: PickOption[] | undefined) => new Map((opts ?? []).map((o) => [o.id, nameOf(o.name)]));
    const loc = names(locations.data);
    const typ = names(types.data);
    const fea = names(features.data);
    return (s: ApiKeyScope): string[] => {
      const chips: string[] = [];
      for (const id of s.locationIds ?? []) chips.push(loc.get(id) || `#${id}`);
      for (const id of s.propertyTypeIds ?? []) chips.push(typ.get(id) || `#${id}`);
      for (const lt of s.listingTypes ?? []) chips.push(t.listingTypeNames[lt] || lt);
      for (const id of s.features ?? []) chips.push(fea.get(id) || `#${id}`);
      if (s.priceMin && s.priceMax) chips.push(`${s.priceMin.toLocaleString()}–${s.priceMax.toLocaleString()}`);
      else if (s.priceMin) chips.push(`${s.priceMin.toLocaleString()}+`);
      else if (s.priceMax) chips.push(`≤ ${s.priceMax.toLocaleString()}`);
      if (s.ownOnly) chips.push(t.ownOnly);
      if (s.featuredOnly) chips.push(t.featuredOnly);
      return chips;
    };
  }, [locations.data, types.data, features.data, t]);
}

export function WebsiteKeysCard() {
  const t = useWebsiteKeysText();
  const st = useSettingsText();
  const { toast } = useToast();
  const list = useWebsiteKeys();
  const create = useCreateWebsiteKey();
  const update = useUpdateWebsiteKey();
  const rotate = useRotateWebsiteKey();
  const remove = useRemoveWebsiteKey();
  const chips = useScopeChips(t);
  // id null = a new key (blank, or filled from a suggestion).
  const [editing, setEditing] = useState<{ id: number | null; initial: Partial<WebsiteKeyInput> } | null>(null);
  const [revealed, setRevealed] = useState<{ id: number; key: string } | null>(null);

  const fail = (err: Error) => toast({ title: t.failed, description: err.message, variant: 'destructive' });

  const onSave = (input: WebsiteKeyInput) => {
    if (editing && editing.id === null) {
      create.mutate(input, {
        onSuccess: (res) => {
          setEditing(null);
          setRevealed({ id: res.key.id, key: res.apiKey });
          toast({ title: t.saved });
        },
        onError: fail,
      });
    } else if (editing && editing.id !== null) {
      update.mutate({ id: editing.id, ...input }, {
        onSuccess: () => {
          setEditing(null);
          toast({ title: t.saved });
        },
        onError: fail,
      });
    }
  };

  const onRotate = (id: number) => {
    if (!window.confirm(t.confirmRotate)) return;
    rotate.mutate(id, { onSuccess: (res) => setRevealed({ id, key: res.apiKey }), onError: fail });
  };

  const onRemove = (id: number) => {
    if (!window.confirm(t.confirmRemove)) return;
    remove.mutate(id, { onError: fail });
  };

  const data = list.data;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle>{t.title}</CardTitle>
            <CardDescription className="mt-1.5 max-w-2xl">{t.desc}</CardDescription>
          </div>
          <Button size="sm" onClick={() => setEditing({ id: null, initial: {} })}>
            <Plus className="mr-2 h-4 w-4" />
            {t.add}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {list.isLoading || !data ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-4">
              <div className="flex items-center gap-3">
                <KeyRound className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="font-medium">{t.mainName} <span className="font-mono text-xs text-muted-foreground">spm_…{data.main.last4}</span></p>
                  <p className="text-sm text-muted-foreground">{t.everything} · {t.listings(data.main.count, data.total)}</p>
                  <p className="text-xs text-muted-foreground">{t.stats(data.main.views30d, data.main.enquiries30d)}</p>
                </div>
              </div>
            </div>

            {data.keys.length === 0 && <p className="text-sm text-muted-foreground">{t.none}</p>}

            {data.keys.map((k) => {
              const keyChips = chips(k.scope);
              return (
                <div key={k.id} className="rounded-lg border p-4" data-testid={`website-key-${k.id}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1.5">
                      <p className="font-medium">
                        {k.name} <span className="font-mono text-xs text-muted-foreground">spm_…{k.last4}</span>
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {(keyChips.length ? keyChips : [t.everything]).map((c, i) => (
                          <span key={i} className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs text-primary">{c}</span>
                        ))}
                        {k.allowedDomains.length > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                            <Lock className="h-3 w-3" />
                            {t.locked(k.allowedDomains.join(', '))}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t.listings(k.count, data.total)} ·{' '}
                        {k.lastUsedAt ? t.lastUsed(new Date(k.lastUsedAt).toLocaleString(), k.lastUsedOrigin) : t.neverUsed}
                      </p>
                      <p className="text-xs text-muted-foreground">{t.stats(k.views30d, k.enquiries30d)}</p>
                      {k.isActive && Date.now() - new Date(k.lastUsedAt ?? k.createdAt).getTime() > MONTH_MS && (
                        <p className="flex items-center gap-1 text-xs text-amber-600">
                          <AlertTriangle className="h-3 w-3" />
                          {t.unused}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Switch
                          checked={k.isActive}
                          onCheckedChange={(v) => update.mutate({ id: k.id, isActive: v }, { onError: fail })}
                        />
                        {k.isActive ? t.active : t.paused}
                      </label>
                      <Button variant="outline" size="sm" onClick={() => setEditing({ id: k.id, initial: k })}>{t.edit}</Button>
                      <Button variant="outline" size="sm" onClick={() => onRotate(k.id)} disabled={rotate.isPending}>{t.newKey}</Button>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => onRemove(k.id)} disabled={remove.isPending}>{t.remove}</Button>
                    </div>
                  </div>
                  {revealed?.id === k.id && (
                    <div className="mt-3 rounded-md border border-primary/20 bg-secondary/20 p-3">
                      <p className="text-sm font-medium text-primary">{t.copyNow}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <code className="flex-1 break-all rounded bg-muted px-2 py-1 text-xs">{revealed.key}</code>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            void navigator.clipboard.writeText(revealed.key);
                            toast({ title: st.common.copied });
                          }}
                        >
                          {st.common.copy}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setRevealed(null)}>{st.common.dismiss}</Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            <WebsiteKeySuggestions chips={chips} onUse={(sg) => setEditing({ id: null, initial: { name: sg.name, scope: sg.scope } })} />
          </>
        )}
      </CardContent>

      <WebsiteKeyEditor
        open={editing !== null}
        isNew={editing?.id === null}
        initial={editing?.initial ?? null}
        saving={create.isPending || update.isPending}
        onClose={() => setEditing(null)}
        onSave={onSave}
      />
    </Card>
  );
}
