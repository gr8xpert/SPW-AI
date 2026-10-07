'use client';

// The plain field-grid tabs: Details, Address, Financial, Features, Location.

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TabsContent } from '@/components/ui/tabs';
import { displayName, type FeatureOption, type FormField, type FormSectionProps } from './types';

const RANGE_FIELDS: Array<[FormField, FormField, string]> = [
  ['bedrooms', 'bedroomsTo', 'Bedrooms'],
  ['bathrooms', 'bathroomsTo', 'Bathrooms'],
  ['buildSize', 'buildSizeTo', 'Build Size (m²)'],
  ['plotSize', 'plotSizeTo', 'Plot Size (m²)'],
  ['terraceSize', 'terraceSizeTo', 'Terrace (m²)'],
];

const SINGLE_NUMBER_FIELDS: Array<[FormField, string]> = [
  ['gardenSize', 'Garden (m²)'], ['solariumSize', 'Solarium (m²)'], ['builtYear', 'Built Year'],
  ['energyConsumption', 'Energy (kWh/m²)'], ['distanceToBeach', 'Distance to Beach (m)'],
];

const ADDRESS_FIELDS: Array<[FormField, string, string]> = [
  ['street', 'Street', 'Calle del Valle'], ['streetNumber', 'Street No.', '12'], ['floor', 'Floor', '3A'],
  ['postcode', 'Postcode', '29660'], ['cadastralReference', 'Cadastral Reference', '1234567AB1234C0001XX'],
];

const FINANCIAL_FIELDS: Array<[FormField, string, string]> = [
  ['communityFees', 'Community Fees (€/month)', '450'], ['basuraTax', 'Basura Tax (€/year)', '120'],
  ['ibiFees', 'IBI Fees (€/year)', '3200'], ['commission', 'Commission (%)', '5.00'],
];

const FEATURE_CATEGORIES = ['interior', 'exterior', 'community', 'climate', 'views', 'security', 'parking', 'other'];

export function DetailsTab({ formData, onChange }: FormSectionProps) {
  return (
    <TabsContent value="details" className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Dimensions & Building</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
            {RANGE_FIELDS.map(([from, to, label]) => (
              <div key={from} className="space-y-2 md:col-span-2">
                <Label>{label}</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input type="number" step="any" placeholder="From" value={formData[from] as string} onChange={(e) => onChange(from, e.target.value)} />
                  <Input type="number" step="any" placeholder="To" value={formData[to] as string} onChange={(e) => onChange(to, e.target.value)} />
                </div>
              </div>
            ))}
            {SINGLE_NUMBER_FIELDS.map(([field, label]) => (
              <div key={field} className="space-y-2"><Label>{label}</Label><Input type="number" value={formData[field] as string} onChange={(e) => onChange(field, e.target.value)} /></div>
            ))}
            <div className="space-y-2">
              <Label>Energy Rating</Label>
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
            <div className="space-y-2"><Label>Delivery Date</Label><Input type="date" value={formData.deliveryDate} onChange={(e) => onChange('deliveryDate', e.target.value)} /></div>
            <div className="space-y-2"><Label>Completion Date</Label><Input type="date" value={formData.completionDate} onChange={(e) => onChange('completionDate', e.target.value)} /></div>
            <div className="space-y-2 md:col-span-2"><Label>Development Name</Label><Input value={formData.developmentName} onChange={(e) => onChange('developmentName', e.target.value)} placeholder="New developments only" /></div>
            <div className="flex items-end pb-2">
              <div className="flex items-center space-x-2">
                <Checkbox id="keyReady" checked={formData.keyReady} onCheckedChange={(c) => onChange('keyReady', !!c)} />
                <Label htmlFor="keyReady">Key Ready</Label>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </TabsContent>
  );
}

export function AddressTab({ formData, onChange }: FormSectionProps) {
  return (
    <TabsContent value="address" className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Property Address</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
            {ADDRESS_FIELDS.map(([field, label, ph]) => (
              <div key={field} className="space-y-2"><Label>{label}</Label><Input value={formData[field] as string} onChange={(e) => onChange(field, e.target.value)} placeholder={ph} /></div>
            ))}
          </div>
        </CardContent>
      </Card>
    </TabsContent>
  );
}

export function FinancialTab({ formData, onChange }: FormSectionProps) {
  return (
    <TabsContent value="financial" className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Fees & Taxes</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
            {FINANCIAL_FIELDS.map(([field, label, ph]) => (
              <div key={field} className="space-y-2"><Label>{label}</Label><Input type="number" step={field === 'commission' ? '0.01' : undefined} value={formData[field] as string} onChange={(e) => onChange(field, e.target.value)} placeholder={ph} /></div>
            ))}
            <div className="flex items-end pb-2">
              <div className="flex items-center space-x-2">
                <Checkbox id="sharedCommission" checked={formData.sharedCommission} onCheckedChange={(c) => onChange('sharedCommission', !!c)} />
                <Label htmlFor="sharedCommission">Shared Commission</Label>
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
        <CardHeader><CardTitle>Property Features</CardTitle></CardHeader>
        <CardContent>
          {Object.keys(featuresByCategory).length === 0 ? (
            <p className="text-sm text-muted-foreground">No features available.</p>
          ) : (
            <div className="space-y-6">
              {FEATURE_CATEGORIES.map((category) => {
                const catFeatures = featuresByCategory[category];
                if (!catFeatures?.length) return null;
                return (
                  <div key={category}>
                    <h4 className="font-medium capitalize mb-3">{category}</h4>
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
  return (
    <TabsContent value="location" className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Coordinates</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2"><Label>Latitude</Label><Input type="number" step="any" value={formData.lat} onChange={(e) => onChange('lat', e.target.value)} /></div>
            <div className="space-y-2"><Label>Longitude</Label><Input type="number" step="any" value={formData.lng} onChange={(e) => onChange('lng', e.target.value)} /></div>
            <div className="space-y-2"><Label>Location Label</Label><Input value={formData.geoLocationLabel} onChange={(e) => onChange('geoLocationLabel', e.target.value)} placeholder="Nueva Andalucia, Marbella" /></div>
          </div>
          <div className="aspect-video rounded-lg border bg-muted flex items-center justify-center">
            <p className="text-muted-foreground">Map integration will be displayed here</p>
          </div>
        </CardContent>
      </Card>
    </TabsContent>
  );
}
