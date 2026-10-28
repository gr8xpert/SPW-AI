'use client';

import { useEffect, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import type { ApiKeyScope, ApiKeySettings } from '@spm/shared';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { MultiPicker } from '../../buyers/[id]/_components/multi-picker';
import { useMatchOptions } from '../../buyers/use-buyer-match';
import { useWebsiteKeysText } from './website-keys-text';
import { useAiScope, useScopePreview, type WebsiteKeyInput } from './use-website-keys';

const LISTING_TYPES = ['sale', 'development', 'rent', 'holiday_rent'] as const;

// The scope with empty parts left out, as the API stores it.
function compact(s: ApiKeyScope): ApiKeyScope {
  const out: ApiKeyScope = {};
  if (s.locationIds?.length) out.locationIds = s.locationIds;
  if (s.propertyTypeIds?.length) out.propertyTypeIds = s.propertyTypeIds;
  if (s.listingTypes?.length) out.listingTypes = s.listingTypes;
  if (s.features?.length) {
    out.features = s.features;
    out.featureMatch = s.featureMatch ?? 'all';
  }
  if (s.priceMin && s.priceMin > 0) out.priceMin = s.priceMin;
  if (s.priceMax && s.priceMax > 0) out.priceMax = s.priceMax;
  if (s.ownOnly) out.ownOnly = true;
  if (s.featuredOnly) out.featuredOnly = true;
  if (s.excludeRefs?.length) out.excludeRefs = s.excludeRefs;
  return out;
}

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
  const [scope, setScope] = useState<ApiKeyScope>({});
  const [domains, setDomains] = useState('');
  const [settings, setSettings] = useState<ApiKeySettings>({});
  const [emails, setEmails] = useState('');
  const [aiText, setAiText] = useState('');
  const [aiNote, setAiNote] = useState('');
  const ai = useAiScope();
  const locations = useMatchOptions('locations');
  const types = useMatchOptions('property-types');
  const features = useMatchOptions('features');

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? '');
    setScope(initial?.scope ?? {});
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
    onSave({ name: name.trim(), scope: compact(scope), allowedDomains: lines(domains), settings: look });
  };

  const draft = useDebounced(compact(scope), 400);
  const preview = useScopePreview(draft, open);
  const set = (patch: Partial<ApiKeyScope>) => setScope((s) => ({ ...s, ...patch }));
  const toggleType = (type: (typeof LISTING_TYPES)[number]) => {
    const now = scope.listingTypes ?? [];
    set({ listingTypes: now.includes(type) ? now.filter((x) => x !== type) : [...now, type] });
  };
  const num = (v: string) => {
    const n = Number(v.replace(/[^\d.]/g, ''));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };

  const fillWithAi = () => {
    if (!aiText.trim()) return;
    ai.mutate(aiText.trim(), {
      onSuccess: (res) => {
        setScope(res.scope ?? {});
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

          <div className="space-y-1.5">
            <Label>{t.locations}</Label>
            <p className="text-xs text-muted-foreground">{t.locationsHint}</p>
            {locations.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
              <MultiPicker options={locations.data ?? []} value={scope.locationIds ?? []} onChange={(ids) => set({ locationIds: ids })} />
            )}
          </div>

          <div className="space-y-1.5">
            <Label>{t.types}</Label>
            <p className="text-xs text-muted-foreground">{t.typesHint}</p>
            {types.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
              <MultiPicker options={types.data ?? []} value={scope.propertyTypeIds ?? []} onChange={(ids) => set({ propertyTypeIds: ids })} />
            )}
          </div>

          <div className="space-y-1.5">
            <Label>{t.listingTypes}</Label>
            <div className="flex flex-wrap gap-4">
              {LISTING_TYPES.map((type) => (
                <label key={type} className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox checked={scope.listingTypes?.includes(type) ?? false} onCheckedChange={() => toggleType(type)} />
                  {t.listingTypeNames[type]}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t.features}</Label>
            {features.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
              <MultiPicker options={features.data ?? []} value={scope.features ?? []} onChange={(ids) => set({ features: ids })} />
            )}
            {(scope.features?.length ?? 0) > 1 && (
              <div className="flex items-center gap-2 text-sm">
                <span>{t.featureMatch}</span>
                <Select value={scope.featureMatch ?? 'all'} onValueChange={(v) => set({ featureMatch: v as 'all' | 'any' })}>
                  <SelectTrigger className="h-8 w-[160px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t.matchAll}</SelectItem>
                    <SelectItem value="any">{t.matchAny}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>{t.price}</Label>
            <div className="flex items-center gap-2">
              <Input inputMode="numeric" className="w-40" placeholder={t.priceMin} value={scope.priceMin ?? ''} onChange={(e) => set({ priceMin: num(e.target.value) })} />
              <span className="text-muted-foreground">–</span>
              <Input inputMode="numeric" className="w-40" placeholder={t.priceMax} value={scope.priceMax ?? ''} onChange={(e) => set({ priceMax: num(e.target.value) })} />
            </div>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-3 text-sm">
              <Switch checked={!!scope.ownOnly} onCheckedChange={(v) => set({ ownOnly: v })} />
              {t.ownOnly}
            </label>
            <label className="flex items-center gap-3 text-sm">
              <Switch checked={!!scope.featuredOnly} onCheckedChange={(v) => set({ featuredOnly: v })} />
              {t.featuredOnly}
            </label>
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

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>{t.cancel}</Button>
          <Button onClick={save} disabled={saving || !name.trim()}>
            {saving ? t.saving : t.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
