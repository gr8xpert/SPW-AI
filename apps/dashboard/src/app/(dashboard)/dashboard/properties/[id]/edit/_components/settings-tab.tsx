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
import { usePropertiesText, type PropertiesText } from '../../../_i18n';

type Flags = PropertiesText['form']['flags'];

// Field, label key, hint key (none when there is no hint).
const FLAG_FIELDS: Array<[FormField, keyof Flags, keyof Flags | null]> = [
  ['isFeatured', 'isFeatured', 'isFeaturedHint'],
  ['isPublished', 'isPublished', 'isPublishedHint'],
  ['isOwnProperty', 'isOwnProperty', null],
  ['villaSelection', 'villaSelection', null],
  ['luxurySelection', 'luxurySelection', null],
  ['apartmentSelection', 'apartmentSelection', null],
];

export function SettingsTab({ formData, onChange, propertySource }: FormSectionProps & { propertySource: string }) {
  const t = usePropertiesText();
  return (
    <TabsContent value="settings" className="space-y-6">
      <Card>
        <CardHeader><CardTitle>{t.form.visibility}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {FLAG_FIELDS.map(([field, label, desc]) => (
            <div key={field} className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>{t.form.flags[label]}</Label>
                {desc && <p className="text-xs text-muted-foreground">{t.form.flags[desc]}</p>}
              </div>
              <Switch checked={formData[field] as boolean} onCheckedChange={(c) => onChange(field, c)} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.form.feedSync}</CardTitle>
          <CardDescription>
            {propertySource !== 'manual'
              ? <>{t.form.importedFrom}<span className="font-medium capitalize">{propertySource}</span>{t.form.importedFromAfter}</>
              : t.form.feedSyncDescription}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t.form.enableFeedSync}</Label>
              <p className="text-xs text-muted-foreground">
                {t.form.feedSyncHint}
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
          <CardTitle>{t.form.brochure}</CardTitle>
          <CardDescription>
            {t.form.brochureBefore}<em>{t.form.brochureInherit}</em>{t.form.brochureAfter}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label>{t.form.brochureVariant}</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={formData.brochureVariant}
              onChange={(e) => onChange('brochureVariant', e.target.value)}
            >
              <option value="inherit">{t.form.brochureOptions.inherit}</option>
              <option value="branded">{t.form.brochureOptions.branded}</option>
              <option value="unbranded">{t.form.brochureOptions.unbranded}</option>
            </select>
          </div>
        </CardContent>
      </Card>
    </TabsContent>
  );
}
