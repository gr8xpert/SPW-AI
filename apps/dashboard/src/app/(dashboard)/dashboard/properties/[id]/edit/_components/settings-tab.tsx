'use client';

import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { TabsContent } from '@/components/ui/tabs';
import type { FormField, FormSectionProps } from './types';

const FLAG_FIELDS: Array<[FormField, string, string]> = [
  ['isFeatured', 'Featured Property', 'Appears at top of search results'],
  ['isPublished', 'Published', 'Visible on public website'],
  ['isOwnProperty', 'Own Property', ''],
  ['villaSelection', 'Villa Selection', ''],
  ['luxurySelection', 'Luxury Selection', ''],
  ['apartmentSelection', 'Apartment Selection', ''],
];

export function SettingsTab({ formData, onChange, propertySource }: FormSectionProps & { propertySource: string }) {
  return (
    <TabsContent value="settings" className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Visibility & Flags</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {FLAG_FIELDS.map(([field, label, desc]) => (
            <div key={field} className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>{label}</Label>
                {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
              </div>
              <Switch checked={formData[field] as boolean} onCheckedChange={(c) => onChange(field, c)} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Feed Sync</CardTitle>
          <CardDescription>
            {propertySource !== 'manual'
              ? <>Imported from <span className="font-medium capitalize">{propertySource}</span>. Control whether feed imports can update this property.</>
              : 'Control whether feed imports can overwrite this property if a matching record is found.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Enable Feed Sync</Label>
              <p className="text-xs text-muted-foreground">
                When turned off, this property will be skipped during feed imports — your manual edits will be preserved.
              </p>
            </div>
            <Switch
              checked={formData.syncEnabled}
              onCheckedChange={(c) => onChange('syncEnabled', c)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Brochure / PDF</CardTitle>
          <CardDescription>
            Controls which PDF layout downloads for this property. <em>Inherit</em> uses the tenant default set in Settings → Brochure.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label>Brochure Variant</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={formData.brochureVariant}
              onChange={(e) => onChange('brochureVariant', e.target.value)}
            >
              <option value="inherit">Inherit (tenant default)</option>
              <option value="branded">Branded (logo + QR + contact)</option>
              <option value="unbranded">Unbranded (blank header/footer)</option>
            </select>
          </div>
        </CardContent>
      </Card>
    </TabsContent>
  );
}
