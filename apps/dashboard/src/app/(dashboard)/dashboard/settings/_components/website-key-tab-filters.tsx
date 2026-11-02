'use client';

import { Loader2 } from 'lucide-react';
import type { ApiKeyFilters, ApiKeyScope, ListingType } from '@spm/shared';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { MultiPicker } from '../../buyers/[id]/_components/multi-picker';
import { useMatchOptions } from '../../buyers/use-buyer-match';
import type { WebsiteKeysText } from './website-keys-text';

export const LISTING_TYPES: ListingType[] = ['sale', 'development', 'rent', 'holiday_rent'];

export type KeyTabs = Record<ListingType, { on: boolean; filters: ApiKeyFilters }>;

// The filters with empty parts left out, as the API stores them.
function compact(s: ApiKeyFilters): ApiKeyFilters {
  const out: ApiKeyFilters = {};
  if (s.locationIds?.length) out.locationIds = s.locationIds;
  if (s.propertyTypeIds?.length) out.propertyTypeIds = s.propertyTypeIds;
  if (s.features?.length) {
    out.features = s.features;
    out.featureMatch = s.featureMatch ?? 'all';
  }
  for (const key of ['priceMin', 'priceMax', 'bedsMin', 'bedsMax', 'bathsMin', 'bathsMax'] as const) {
    const value = s[key];
    if (value && value > 0) out[key] = value;
  }
  if (s.ownOnly) out.ownOnly = true;
  if (s.featuredOnly) out.featuredOnly = true;
  return out;
}

// A saved scope as tabs. A plain scope gives every type it covers the same
// filters, so an old key opens showing exactly what it shows today.
export function scopeToTabs(scope: ApiKeyScope | null | undefined): KeyTabs {
  const s = scope ?? {};
  const covered = s.listingTypes?.length ? s.listingTypes : LISTING_TYPES;
  const tab = (type: ListingType) => {
    if (s.byListingType) return { on: !!s.byListingType[type], filters: s.byListingType[type] ?? {} };
    return { on: covered.includes(type), filters: covered.includes(type) ? compact(s) : {} };
  };
  return { sale: tab('sale'), development: tab('development'), rent: tab('rent'), holiday_rent: tab('holiday_rent') };
}

// Tabs back to a scope. The API folds tabs that all say the same into the plain form.
export function tabsToScope(tabs: KeyTabs, excludeRefs: string[] | undefined): ApiKeyScope {
  const byListingType: NonNullable<ApiKeyScope['byListingType']> = {};
  for (const type of LISTING_TYPES) if (tabs[type].on) byListingType[type] = compact(tabs[type].filters);
  return { byListingType, ...(excludeRefs?.length ? { excludeRefs } : {}) };
}

const num = (v: string) => {
  const n = Number(v.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

// One listing type's filters in the key editor.
export function WebsiteKeyTabFilters({
  t,
  filters,
  onChange,
}: {
  t: WebsiteKeysText;
  filters: ApiKeyFilters;
  onChange: (patch: Partial<ApiKeyFilters>) => void;
}) {
  const locations = useMatchOptions('locations');
  const types = useMatchOptions('property-types');
  const features = useMatchOptions('features');

  const range = (label: string, minKey: 'priceMin' | 'bedsMin' | 'bathsMin', maxKey: 'priceMax' | 'bedsMax' | 'bathsMax', width: string) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <Input inputMode="numeric" className={width} placeholder={t.priceMin} aria-label={`${label}: ${t.priceMin}`} value={filters[minKey] ?? ''} onChange={(e) => onChange({ [minKey]: num(e.target.value) })} />
        <span className="text-muted-foreground">–</span>
        <Input inputMode="numeric" className={width} placeholder={t.priceMax} aria-label={`${label}: ${t.priceMax}`} value={filters[maxKey] ?? ''} onChange={(e) => onChange({ [maxKey]: num(e.target.value) })} />
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label>{t.locations}</Label>
        <p className="text-xs text-muted-foreground">{t.locationsHint}</p>
        {locations.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
          <MultiPicker options={locations.data ?? []} value={filters.locationIds ?? []} onChange={(ids) => onChange({ locationIds: ids })} />
        )}
      </div>

      <div className="space-y-1.5">
        <Label>{t.types}</Label>
        <p className="text-xs text-muted-foreground">{t.typesHint}</p>
        {types.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
          <MultiPicker options={types.data ?? []} value={filters.propertyTypeIds ?? []} onChange={(ids) => onChange({ propertyTypeIds: ids })} />
        )}
      </div>

      <div className="space-y-1.5">
        <Label>{t.features}</Label>
        {features.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
          <MultiPicker options={features.data ?? []} value={filters.features ?? []} onChange={(ids) => onChange({ features: ids })} />
        )}
        {(filters.features?.length ?? 0) > 1 && (
          <div className="flex items-center gap-2 text-sm">
            <span>{t.featureMatch}</span>
            <Select value={filters.featureMatch ?? 'all'} onValueChange={(v) => onChange({ featureMatch: v as 'all' | 'any' })}>
              <SelectTrigger className="h-8 w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t.matchAll}</SelectItem>
                <SelectItem value="any">{t.matchAny}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {range(t.price, 'priceMin', 'priceMax', 'w-40')}
      <div className="flex flex-wrap gap-6">
        {range(t.bedrooms, 'bedsMin', 'bedsMax', 'w-20')}
        {range(t.bathrooms, 'bathsMin', 'bathsMax', 'w-20')}
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-3 text-sm">
          <Switch checked={!!filters.ownOnly} onCheckedChange={(v) => onChange({ ownOnly: v })} />
          {t.ownOnly}
        </label>
        <label className="flex items-center gap-3 text-sm">
          <Switch checked={!!filters.featuredOnly} onCheckedChange={(v) => onChange({ featuredOnly: v })} />
          {t.featuredOnly}
        </label>
      </div>
    </div>
  );
}
