'use client';

// The plain field-grid tabs: Details, Address, Financial, Features, Location.

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TabsContent } from '@/components/ui/tabs';
import { displayName, type FeatureOption, type FormField, type FormSectionProps } from './types';
import { labelOf, usePropertiesText, type PropertiesText } from '../../../_i18n';

type Fields = PropertiesText['fields'];

const RANGE_FIELDS: Array<[FormField, FormField, keyof Fields]> = [
  ['bedrooms', 'bedroomsTo', 'bedrooms'],
  ['bathrooms', 'bathroomsTo', 'bathrooms'],
  ['buildSize', 'buildSizeTo', 'buildSize'],
  ['plotSize', 'plotSizeTo', 'plotSize'],
  ['terraceSize', 'terraceSizeTo', 'terrace'],
];

const SINGLE_NUMBER_FIELDS: Array<[FormField, keyof Fields]> = [
  ['gardenSize', 'garden'], ['solariumSize', 'solarium'], ['builtYear', 'builtYear'],
  ['energyConsumption', 'energy'], ['distanceToBeach', 'distanceToBeach'],
];

const ADDRESS_FIELDS: Array<[FormField, keyof Fields, string]> = [
  ['street', 'street', 'Calle del Valle'], ['streetNumber', 'streetNo', '12'], ['floor', 'floor', '3A'],
  ['postcode', 'postcode', '29660'], ['cadastralReference', 'cadastralReference', '1234567AB1234C0001XX'],
];

const FINANCIAL_FIELDS: Array<[FormField, keyof Fields, string]> = [
  ['communityFees', 'communityFees', '450'], ['basuraTax', 'basuraTax', '120'],
  ['ibiFees', 'ibiFees', '3200'], ['commission', 'commission', '5.00'],
];

const FEATURE_CATEGORIES = ['interior', 'exterior', 'community', 'climate', 'views', 'security', 'parking', 'other'];

export function DetailsTab({ formData, onChange }: FormSectionProps) {
  const t = usePropertiesText();
  return (
    <TabsContent value="details" className="space-y-6">
      <Card>
        <CardHeader><CardTitle>{t.edit.dimensions}</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
            {RANGE_FIELDS.map(([from, to, label]) => (
              <div key={from} className="space-y-2 md:col-span-2">
                <Label>{t.fields[label]}</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input type="number" step="any" placeholder={t.common.from} value={formData[from] as string} onChange={(e) => onChange(from, e.target.value)} />
                  <Input type="number" step="any" placeholder={t.common.to} value={formData[to] as string} onChange={(e) => onChange(to, e.target.value)} />
                </div>
              </div>
            ))}
            {SINGLE_NUMBER_FIELDS.map(([field, label]) => (
              <div key={field} className="space-y-2"><Label>{t.fields[label]}</Label><Input type="number" value={formData[field] as string} onChange={(e) => onChange(field, e.target.value)} /></div>
            ))}
            <div className="space-y-2">
              <Label>{t.fields.energyRating}</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={formData.energyRating}
                onChange={(e) => onChange('energyRating', e.target.value)}
              >
                <option value="">—</option>
                {['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2"><Label>{t.fields.deliveryDate}</Label><Input type="date" value={formData.deliveryDate} onChange={(e) => onChange('deliveryDate', e.target.value)} /></div>
            <div className="space-y-2"><Label>{t.fields.completionDate}</Label><Input type="date" value={formData.completionDate} onChange={(e) => onChange('completionDate', e.target.value)} /></div>
            <div className="space-y-2 md:col-span-2"><Label>{t.fields.developmentName}</Label><Input value={formData.developmentName} onChange={(e) => onChange('developmentName', e.target.value)} placeholder={t.form.newDevelopmentsOnly} /></div>
            <div className="flex items-end pb-2">
              <div className="flex items-center space-x-2">
                <Checkbox id="keyReady" checked={formData.keyReady} onCheckedChange={(c) => onChange('keyReady', !!c)} />
                <Label htmlFor="keyReady">{t.fields.keyReady}</Label>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </TabsContent>
  );
}

export function AddressTab({ formData, onChange }: FormSectionProps) {
  const t = usePropertiesText();
  return (
    <TabsContent value="address" className="space-y-6">
      <Card>
        <CardHeader><CardTitle>{t.form.propertyAddress}</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
            {ADDRESS_FIELDS.map(([field, label, ph]) => (
              <div key={field} className="space-y-2"><Label>{t.fields[label]}</Label><Input value={formData[field] as string} onChange={(e) => onChange(field, e.target.value)} placeholder={ph} /></div>
            ))}
          </div>
        </CardContent>
      </Card>
    </TabsContent>
  );
}

export function FinancialTab({ formData, onChange }: FormSectionProps) {
  const t = usePropertiesText();
  return (
    <TabsContent value="financial" className="space-y-6">
      <Card>
        <CardHeader><CardTitle>{t.form.feesTaxes}</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
            {FINANCIAL_FIELDS.map(([field, label, ph]) => (
              <div key={field} className="space-y-2"><Label>{t.fields[label]}</Label><Input type="number" step={field === 'commission' ? '0.01' : undefined} value={formData[field] as string} onChange={(e) => onChange(field, e.target.value)} placeholder={ph} /></div>
            ))}
            <div className="flex items-end pb-2">
              <div className="flex items-center space-x-2">
                <Checkbox id="sharedCommission" checked={formData.sharedCommission} onCheckedChange={(c) => onChange('sharedCommission', !!c)} />
                <Label htmlFor="sharedCommission">{t.fields.sharedCommission}</Label>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </TabsContent>
  );
}

export function FeaturesTab({
  selected,
  allFeatures,
  onToggle,
}: {
  selected: number[];
  allFeatures: FeatureOption[];
  onToggle: (featureId: number) => void;
}) {
  const t = usePropertiesText();
  const featuresByCategory = allFeatures.reduce(
    (acc, feature) => {
      const cat = feature.category || 'other';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(feature);
      return acc;
    },
    {} as Record<string, FeatureOption[]>
  );

  return (
    <TabsContent value="features" className="space-y-6">
      <Card>
        <CardHeader><CardTitle>{t.form.propertyFeatures}</CardTitle></CardHeader>
        <CardContent>
          {Object.keys(featuresByCategory).length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.form.noFeatures}</p>
          ) : (
            <div className="space-y-6">
              {FEATURE_CATEGORIES.map((category) => {
                const catFeatures = featuresByCategory[category];
                if (!catFeatures?.length) return null;
                return (
                  <div key={category}>
                    <h4 className="font-medium capitalize mb-3">{labelOf(t.form.featureCategories, category)}</h4>
                    <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                      {catFeatures.map((feature) => (
                        <div key={feature.id} className="flex items-center space-x-2">
                          <Checkbox id={`feature-${feature.id}`} checked={selected.includes(feature.id)} onCheckedChange={() => onToggle(feature.id)} />
                          <Label htmlFor={`feature-${feature.id}`} className="font-normal">{displayName(feature.name)}</Label>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </TabsContent>
  );
}

export function LocationTab({ formData, onChange }: FormSectionProps) {
  const t = usePropertiesText();
  return (
    <TabsContent value="location" className="space-y-6">
      <Card>
        <CardHeader><CardTitle>{t.form.coordinates}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2"><Label>{t.fields.latitude}</Label><Input type="number" step="any" value={formData.lat} onChange={(e) => onChange('lat', e.target.value)} /></div>
            <div className="space-y-2"><Label>{t.fields.longitude}</Label><Input type="number" step="any" value={formData.lng} onChange={(e) => onChange('lng', e.target.value)} /></div>
            <div className="space-y-2"><Label>{t.fields.locationLabel}</Label><Input value={formData.geoLocationLabel} onChange={(e) => onChange('geoLocationLabel', e.target.value)} placeholder="Nueva Andalucia, Marbella" /></div>
          </div>
          <div className="aspect-video rounded-lg border bg-muted flex items-center justify-center">
            <p className="text-muted-foreground">{t.form.mapPlaceholder}</p>
          </div>
        </CardContent>
      </Card>
    </TabsContent>
  );
}
