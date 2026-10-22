'use client';

import { useEffect, useMemo, useState } from 'react';
import { Info, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useBuyerText } from '../../_i18n/use-buyer-text';
import type { Buyer, BuyerWishlist } from '../../use-buyers';
import { nameOf, useMatchOptions, useSaveWishlist, type PickOption } from '../../use-buyer-match';
import { FilterSelect } from '../../_components/filter-select';
import { MultiPicker } from './multi-picker';
import { AiButton } from './ai/ai-gate';
import { PasteDialog } from './ai/paste-dialog';
import { RulesCard } from './ai/rules-card';

const LISTING_TYPES = ['sale', 'development', 'rent', 'holiday_rent'] as const;
const COUNTS = ['1', '2', '3', '4', '5', '6'];
const NUMBER_KEYS = ['minBedrooms', 'minBathrooms', 'budgetMin', 'budgetMax', 'minBuildSize', 'maxBuildSize', 'minPlotSize', 'maxPlotSize'] as const;
type NumberKey = (typeof NUMBER_KEYS)[number];

interface Draft {
  listingTypes: string[];
  locationIds: number[];
  propertyTypeIds: number[];
  featureIds: number[];
  sendMatchesTo: '' | 'buyer' | 'agent' | 'both';
  numbers: Record<NumberKey, string>;
}

function toDraft(w: BuyerWishlist | null): Draft {
  return {
    listingTypes: [...(w?.listingTypes ?? [])],
    locationIds: [...(w?.locationIds ?? [])],
    propertyTypeIds: [...(w?.propertyTypeIds ?? [])],
    featureIds: [...(w?.featureIds ?? [])],
    sendMatchesTo: w?.sendMatchesTo ?? '',
    numbers: Object.fromEntries(NUMBER_KEYS.map((k) => [k, w?.[k] ? String(w[k]) : ''])) as Record<NumberKey, string>,
  };
}

function toBody(d: Draft): BuyerWishlist {
  const body: BuyerWishlist = {};
  if (d.listingTypes.length) body.listingTypes = d.listingTypes as BuyerWishlist['listingTypes'];
  if (d.locationIds.length) body.locationIds = d.locationIds;
  if (d.propertyTypeIds.length) body.propertyTypeIds = d.propertyTypeIds;
  if (d.featureIds.length) body.featureIds = d.featureIds;
  if (d.sendMatchesTo) body.sendMatchesTo = d.sendMatchesTo;
  for (const k of NUMBER_KEYS) {
    const n = Number(d.numbers[k].replace(/[\s.,](?=\d{3}\b)/g, ''));
    if (d.numbers[k].trim() && Number.isFinite(n) && n > 0) body[k] = n;
  }
  return body;
}

const same = (a: Draft, b: Draft) => JSON.stringify(toBody(a)) === JSON.stringify(toBody(b));

// The buyer's saved search: the same choices as the website search.
export function WishlistTab({ buyer }: { buyer: Buyer }) {
  const text = useBuyerText();
  const t = text.wishlist;
  const { toast } = useToast();
  const save = useSaveWishlist(buyer.id);
  const locations = useMatchOptions('locations');
  const types = useMatchOptions('property-types');
  const features = useMatchOptions('features');

  const original = useMemo(() => toDraft(buyer.wishlist), [buyer.wishlist]);
  const [draft, setDraft] = useState(original);
  useEffect(() => setDraft(original), [original]);
  const dirty = !same(draft, original);
  const [pasteOpen, setPasteOpen] = useState(false);

  const body = toBody(draft);
  const badRange =
    (body.budgetMin && body.budgetMax && body.budgetMin > body.budgetMax) ||
    (body.minBuildSize && body.maxBuildSize && body.minBuildSize > body.maxBuildSize) ||
    (body.minPlotSize && body.maxPlotSize && body.minPlotSize > body.maxPlotSize);

  const setNumber = (k: NumberKey, v: string) => setDraft((d) => ({ ...d, numbers: { ...d.numbers, [k]: v } }));
  const toggleIn = (key: 'listingTypes' | 'featureIds', v: string | number) =>
    setDraft((d) => {
      const list = d[key] as (string | number)[];
      return { ...d, [key]: list.includes(v) ? list.filter((x) => x !== v) : [...list, v] };
    });

  const submit = async () => {
    try {
      await save.mutateAsync(body);
      toast({ title: t.saved });
    } catch (err) {
      toast({ title: t.failed, description: (err as Error).message, variant: 'destructive' });
    }
  };

  const featureGroups = useMemo(() => {
    const groups = new Map<string, PickOption[]>();
    for (const f of features.data ?? []) groups.set(f.category || 'other', [...(groups.get(f.category || 'other') ?? []), f]);
    return Array.from(groups.entries());
  }, [features.data]);

  const numberInput = (k: NumberKey, placeholder: string, label: string, money = false) => (
    <Input
      inputMode="numeric"
      value={draft.numbers[k]}
      onChange={(e) => setNumber(k, e.target.value.replace(money ? /[^\d.,\s]/g : /[^\d]/g, ''))}
      placeholder={placeholder}
      className="h-9"
      aria-label={`${label} ${placeholder}`}
      name={k}
    />
  );

  return (
    <div className="space-y-4" data-testid="wishlist-tab">
      {buyer.wishlist?.guessed ? (
        <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          {t.guessed}
        </p>
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="space-y-1.5">
              <CardTitle className="text-base">{t.tab}</CardTitle>
              <CardDescription>{t.description}</CardDescription>
            </div>
            <AiButton
              size="sm"
              variant="outline"
              onClick={() => setPasteOpen(true)}
              disabled={dirty}
              title={dirty ? text.ai.paste.unsavedForm : undefined}
              data-testid="ai-paste-open"
            >
              {text.ai.paste.button}
            </AiButton>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>{t.listingTypes}</Label>
            <div className="flex flex-wrap gap-4">
              {LISTING_TYPES.map((lt) => (
                <label key={lt} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={draft.listingTypes.includes(lt)} onCheckedChange={() => toggleIn('listingTypes', lt)} aria-label={t.listingTypeNames[lt]} />
                  {t.listingTypeNames[lt]}
                </label>
              ))}
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t.locations}</Label>
              <p className="text-xs text-muted-foreground">{t.locationsHelp}</p>
              {locations.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                <MultiPicker testid="pick-locations" options={locations.data ?? []} value={draft.locationIds} onChange={(ids) => setDraft((d) => ({ ...d, locationIds: ids }))} />
              )}
            </div>
            <div className="space-y-1.5">
              <Label>{t.types}</Label>
              <p className="text-xs text-muted-foreground">{t.typesHelp}</p>
              {types.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                <MultiPicker testid="pick-types" options={types.data ?? []} value={draft.propertyTypeIds} onChange={(ids) => setDraft((d) => ({ ...d, propertyTypeIds: ids }))} />
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label>{t.budget}</Label>
              <div className="flex items-center gap-2">
                {numberInput('budgetMin', t.from, t.budget, true)}
                {numberInput('budgetMax', t.to, t.budget, true)}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t.bedrooms}</Label>
              <FilterSelect className="w-full" value={draft.numbers.minBedrooms} onChange={(v) => setNumber('minBedrooms', v)} anyLabel={t.any} options={COUNTS.map((c) => ({ value: c, label: `${c}+` }))} />
            </div>
            <div className="space-y-1.5">
              <Label>{t.bathrooms}</Label>
              <FilterSelect className="w-full" value={draft.numbers.minBathrooms} onChange={(v) => setNumber('minBathrooms', v)} anyLabel={t.any} options={COUNTS.map((c) => ({ value: c, label: `${c}+` }))} />
            </div>
            <div className="space-y-1.5">
              <Label>{t.buildSize}</Label>
              <div className="flex items-center gap-2">
                {numberInput('minBuildSize', t.min, t.buildSize)}
                {numberInput('maxBuildSize', t.max, t.buildSize)}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t.plotSize}</Label>
              <div className="flex items-center gap-2">
                {numberInput('minPlotSize', t.min, t.plotSize)}
                {numberInput('maxPlotSize', t.max, t.plotSize)}
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t.mustHaves}</p>

          <div className="space-y-2">
            <Label>{t.features}</Label>
            <p className="text-xs text-muted-foreground">{t.featuresHelp}</p>
            <div className="space-y-3">
              {featureGroups.map(([cat, list]) => (
                <div key={cat} className="flex flex-wrap items-center gap-1.5">
                  <span className="w-24 shrink-0 text-xs font-medium text-muted-foreground">{t.featureCategories[cat] ?? cat}</span>
                  {list.map((f) => {
                    const on = draft.featureIds.includes(f.id);
                    return (
                      <button
                        key={f.id}
                        type="button"
                        aria-pressed={on}
                        data-feature={f.id}
                        onClick={() => toggleIn('featureIds', f.id)}
                        className={cn('rounded-full border px-3 py-1 text-xs transition-colors', on ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted')}
                      >
                        {nameOf(f.name)}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t.sendTo}</Label>
            <div className="flex flex-wrap gap-4">
              {(['buyer', 'agent', 'both'] as const).map((v) => (
                <label key={v} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="sendMatchesTo"
                    value={v}
                    checked={draft.sendMatchesTo === v}
                    onChange={() => setDraft((d) => ({ ...d, sendMatchesTo: v }))}
                    className="h-4 w-4 accent-[hsl(var(--primary))]"
                  />
                  {t.sendToOptions[v]}
                </label>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-3 rounded-md border bg-background/95 p-3 backdrop-blur">
        {badRange ? <span className="mr-auto text-sm text-destructive">{t.badRange}</span> : dirty ? <span className="mr-auto text-sm text-muted-foreground">{t.unsaved}</span> : null}
        <Button variant="outline" size="sm" onClick={() => setDraft(original)} disabled={!dirty || save.isPending}>
          {t.discard}
        </Button>
        <Button size="sm" onClick={submit} disabled={!dirty || !!badRange || save.isPending} data-testid="wishlist-save">
          {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {t.save}
        </Button>
      </div>

      <RulesCard buyer={buyer} />
      <PasteDialog buyer={buyer} open={pasteOpen} onOpenChange={setPasteOpen} />
    </div>
  );
}
