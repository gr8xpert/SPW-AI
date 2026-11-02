'use client';

import { useEffect, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import type { ApiKeyFilters, ApiKeySettings, ListingType } from '@spm/shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useWebsiteKeysText } from './website-keys-text';
import { useAiScope, useScopePreview, type WebsiteKeyInput } from './use-website-keys';
import { LISTING_TYPES, WebsiteKeyTabFilters, scopeToTabs, tabsToScope, type KeyTabs } from './website-key-tab-filters';

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

// Create or edit one website key: describe it in words (AI ticks the
// filters) or pick them by hand, with a live count of what the key will show.
const lines = (text: string) => text.split(/[\n,]+/).map((l) => l.trim()).filter(Boolean);

export function WebsiteKeyEditor({
  open,
  isNew,
  initial,
  saving,
  onClose,
  onSave,
}: {
  open: boolean;
  isNew: boolean;
  initial: Partial<WebsiteKeyInput> | null;
  saving: boolean;
  onClose: () => void;
  onSave: (input: WebsiteKeyInput) => void;
}) {
  const t = useWebsiteKeysText();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [tabs, setTabs] = useState<KeyTabs>(() => scopeToTabs(null));
  const [activeTab, setActiveTab] = useState<ListingType>('sale');
  const [domains, setDomains] = useState('');
  const [settings, setSettings] = useState<ApiKeySettings>({});
  const [emails, setEmails] = useState('');
  const [aiText, setAiText] = useState('');
  const [aiNote, setAiNote] = useState('');
  const ai = useAiScope();

  // Opens on the first listing type that is on; a key with some on can't lose them all.
  const showTabs = (next: KeyTabs) => {
    setTabs(next);
    setActiveTab(LISTING_TYPES.find((type) => next[type].on) ?? 'sale');
  };

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? '');
    showTabs(scopeToTabs(initial?.scope));
    setDomains((initial?.allowedDomains ?? []).join('\n'));
    setSettings(initial?.settings ?? {});
    setEmails((initial?.settings?.inquiryEmails ?? []).join('\n'));
    setAiText('');
    setAiNote('');
  }, [open, initial]);

  const save = () => {
    const look: ApiKeySettings = {};
    if (settings.currency?.trim()) look.currency = settings.currency.trim().toUpperCase();
    if (settings.primaryColor) look.primaryColor = settings.primaryColor;
    if (lines(emails).length) look.inquiryEmails = lines(emails);
    onSave({ name: name.trim(), scope: tabsToScope(tabs, initial?.scope?.excludeRefs), allowedDomains: lines(domains), settings: look });
  };

  const draft = useDebounced(tabsToScope(tabs, initial?.scope?.excludeRefs), 400);
  const preview = useScopePreview(draft, open);
  const setFilters = (type: ListingType, patch: Partial<ApiKeyFilters>) =>
    setTabs((all) => ({ ...all, [type]: { ...all[type], filters: { ...all[type].filters, ...patch } } }));
  const setOn = (type: ListingType, on: boolean) => setTabs((all) => ({ ...all, [type]: { ...all[type], on } }));
  const onCount = LISTING_TYPES.filter((type) => tabs[type].on).length;
  const copyToOthers = (from: ListingType) => {
    setTabs((all) => {
      const next = { ...all };
      for (const type of LISTING_TYPES) if (type !== from) next[type] = { ...all[type], filters: { ...all[from].filters } };
      return next;
    });
    toast({ title: t.copied });
  };

  const fillWithAi = () => {
    if (!aiText.trim()) return;
    ai.mutate(aiText.trim(), {
      onSuccess: (res) => {
        showTabs(scopeToTabs(res.scope));
        if (!name.trim() && res.name) setName(res.name);
        setAiNote(res.summary);
      },
      onError: (err) => toast({ title: t.failed, description: err.message, variant: 'destructive' }),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? t.createTitle : t.editTitle}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
            <Label htmlFor="wk-ai">{t.aiLabel}</Label>
            <Textarea id="wk-ai" rows={2} maxLength={400} value={aiText} placeholder={t.aiPlaceholder} onChange={(e) => setAiText(e.target.value)} />
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" size="sm" onClick={fillWithAi} disabled={ai.isPending || !aiText.trim()}>
                {ai.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                {ai.isPending ? t.aiFilling : t.aiFill}
              </Button>
              <span className="text-xs text-muted-foreground">{aiNote || t.aiHint}</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wk-name">{t.name}</Label>
            <Input id="wk-name" maxLength={100} value={name} placeholder={t.namePlaceholder} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>{t.listingTypes}</Label>
            <p className="text-xs text-muted-foreground">{t.tabsHint}</p>
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ListingType)}>
              <TabsList className="h-auto w-full flex-wrap justify-start">
                {LISTING_TYPES.map((type) => (
                  <TabsTrigger key={type} value={type} className={`gap-1.5 ${tabs[type].on ? '' : 'text-muted-foreground/70'}`} data-testid={`wk-tab-${type}`}>
                    {t.listingTypeNames[type]}
                    <span className="rounded-full bg-primary/10 px-1.5 text-xs text-primary">
                      {tabs[type].on ? (preview.data?.byListingType?.[type] ?? 0).toLocaleString() : t.paused}
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
              {LISTING_TYPES.map((type) => (
                <TabsContent key={type} value={type} className="space-y-4 rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <label className="flex items-center gap-3 text-sm font-medium">
                      <Switch
                        checked={tabs[type].on}
                        disabled={tabs[type].on && onCount === 1}
                        onCheckedChange={(v) => setOn(type, v)}
                        data-testid={`wk-tab-on-${type}`}
                      />
                      {t.tabOn}
                    </label>
                    {tabs[type].on && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => copyToOthers(type)}>
                        {t.copyToOthers}
                      </Button>
                    )}
                  </div>
                  {tabs[type].on ? (
                    <WebsiteKeyTabFilters t={t} filters={tabs[type].filters} onChange={(patch) => setFilters(type, patch)} />
                  ) : (
                    <p className="text-sm text-muted-foreground">{t.tabOffHint}</p>
                  )}
                  {tabs[type].on && onCount === 1 && <p className="text-xs text-muted-foreground">{t.keepOne}</p>}
                </TabsContent>
              ))}
            </Tabs>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wk-domains">{t.domains}</Label>
            <p className="text-xs text-muted-foreground">{t.domainsHint}</p>
            <Textarea id="wk-domains" rows={2} value={domains} placeholder="example.com" onChange={(e) => setDomains(e.target.value)} />
          </div>

          <div className="space-y-3 rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">{t.look}</p>
              <p className="text-xs text-muted-foreground">{t.lookHint}</p>
            </div>
            <div className="flex flex-wrap gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="wk-currency">{t.currency}</Label>
                <Input
                  id="wk-currency"
                  className="w-24 uppercase"
                  maxLength={3}
                  placeholder="EUR"
                  value={settings.currency ?? ''}
                  onChange={(e) => setSettings((s) => ({ ...s, currency: e.target.value.replace(/[^a-z]/gi, '').toUpperCase() || undefined }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wk-color">{t.color}</Label>
                <div className="flex items-center gap-2">
                  <input
                    id="wk-color"
                    type="color"
                    className="h-9 w-12 cursor-pointer rounded border bg-background"
                    value={settings.primaryColor ?? '#2563eb'}
                    onChange={(e) => setSettings((s) => ({ ...s, primaryColor: e.target.value }))}
                  />
                  {settings.primaryColor && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setSettings((s) => ({ ...s, primaryColor: undefined }))}>
                      {settings.primaryColor} ✕
                    </Button>
                  )}
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wk-emails">{t.inquiryEmails}</Label>
              <p className="text-xs text-muted-foreground">{t.inquiryEmailsHint}</p>
              <Textarea id="wk-emails" rows={2} value={emails} placeholder="sales@example.com" onChange={(e) => setEmails(e.target.value)} />
            </div>
          </div>

          <div className="rounded-lg border bg-muted/40 p-3" data-testid="wk-preview">
            <p className="text-sm">
              {t.preview}{' '}
              <strong>
                {preview.data ? t.listings(preview.data.count, preview.data.total) : t.counting}
              </strong>
            </p>
            {preview.data?.sample.length ? (
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {preview.data.sample.map((p) => (
                  <div key={p.reference} className="overflow-hidden rounded border bg-background text-xs">
                    {p.image ? <img src={p.image} alt="" className="h-16 w-full object-cover" /> : <div className="h-16 bg-muted" />}
                    <p className="truncate px-1.5 pt-1 font-medium">{p.title || p.reference}</p>
                    <p className="px-1.5 pb-1 text-muted-foreground">
                      {p.price != null ? `${p.price.toLocaleString()} ${p.currency}` : p.reference}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {/* Stays at the bottom while the form scrolls, so the count answers every click. */}
        <div
          className="sticky -bottom-6 z-10 -mx-6 -mb-6 flex flex-wrap items-center justify-between gap-3 border-t bg-background px-6 py-3 sm:rounded-b-xl"
          data-testid="wk-footer"
        >
          <p className="flex items-center gap-2 text-sm" aria-live="polite" data-testid="wk-count">
            {preview.isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            <span className="text-muted-foreground">{t.preview}</span>
            <strong className="text-primary">
              {preview.data ? t.listings(preview.data.count, preview.data.total) : t.counting}
            </strong>
          </p>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>{t.cancel}</Button>
            <Button onClick={save} disabled={saving || !name.trim()}>
              {saving ? t.saving : t.save}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
