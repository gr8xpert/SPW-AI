'use client';

import { useRef } from 'react';
import { Loader2, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { TabsContent } from '@/components/ui/tabs';
import type { useApi } from '@/hooks/use-api';
import type { useToast } from '@/hooks/use-toast';
import type { FormField, FormSectionProps, PropertyFormData } from './types';
import { usePropertiesText, type PropertiesText } from '../../../_i18n';

type FloorPlans = PropertyFormData['floorPlans'];

const LINK_FIELDS: Array<[FormField, keyof PropertiesText['fields'], string]> = [
  ['videoUrl', 'videoUrl', 'https://youtube.com/...'], ['virtualTourUrl', 'virtualTourUrl', 'https://matterport.com/...'],
  ['externalLink', 'externalLink', 'https://...'],
  ['blogUrl', 'blogUrl', 'https://yourblog.com/...'], ['mapLink', 'mapLink', 'https://maps.google.com/...'],
  ['websiteUrl', 'websiteUrl', 'https://yoursite.com/...'],
];

export function MediaTab({
  formData,
  onChange,
  onFloorPlansChange,
  isUploadingFloorPlan,
  setIsUploadingFloorPlan,
  api,
  toast,
}: FormSectionProps & {
  /** Functional update, so uploads that finish later never drop rows typed meanwhile. */
  onFloorPlansChange: (update: (prev: FloorPlans) => FloorPlans) => void;
  // Held by the page: tab panels unmount when hidden, and an upload can outlive that.
  isUploadingFloorPlan: boolean;
  setIsUploadingFloorPlan: (v: boolean) => void;
  api: ReturnType<typeof useApi<any>>;
  toast: ReturnType<typeof useToast>['toast'];
}) {
  const t = usePropertiesText();
  const floorPlanFileRef = useRef<HTMLInputElement>(null);

  const onFloorPlanFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsUploadingFloorPlan(true);
    try {
      const uploaded: FloorPlans = [];
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append('file', file);
        const res = await api.post('/api/dashboard/upload', fd);
        const data = (res as any)?.data || res;
        if (data?.url) uploaded.push({ url: data.url, label: file.name.replace(/\.[^.]+$/, '') });
      }
      if (uploaded.length > 0) {
        onFloorPlansChange((prev) => [...prev, ...uploaded]);
      }
    } catch (err: any) {
      toast({ title: t.common.uploadFailed, description: err?.message || String(err), variant: 'destructive' });
    } finally {
      setIsUploadingFloorPlan(false);
      e.target.value = '';
    }
  };

  return (
    <TabsContent value="media" className="space-y-6">
      <Card>
        <CardHeader><CardTitle>{t.edit.mediaTitle}</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            {LINK_FIELDS.map(([field, label, ph]) => (
              <div key={field} className="space-y-2"><Label>{t.fields[label]}</Label><Input value={formData[field] as string} onChange={(e) => onChange(field, e.target.value)} placeholder={ph} /></div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.edit.floorPlans}</CardTitle>
          <CardDescription>{t.edit.floorPlansDescription}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {formData.floorPlans.length === 0 && (
            <p className="text-sm text-muted-foreground">{t.edit.noFloorPlans}</p>
          )}
          {formData.floorPlans.map((plan, idx) => (
            <div key={idx} className="flex items-start gap-2 rounded-md border p-3">
              <div className="flex-1 space-y-2">
                <div className="grid gap-2 sm:grid-cols-[2fr_1fr]">
                  <Input
                    value={plan.url}
                    onChange={(e) => onFloorPlansChange((prev) => prev.map((p, i) => i === idx ? { ...p, url: e.target.value } : p))}
                    placeholder={t.edit.floorPlanUrlPlaceholder}
                  />
                  <Input
                    value={plan.label || ''}
                    onChange={(e) => onFloorPlansChange((prev) => prev.map((p, i) => i === idx ? { ...p, label: e.target.value } : p))}
                    placeholder={t.edit.floorPlanLabelPlaceholder}
                  />
                </div>
                {plan.url && (
                  <a href={plan.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline break-all">
                    {plan.url}
                  </a>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onFloorPlansChange((prev) => prev.filter((_, i) => i !== idx))}
                title={t.edit.removeFloorPlan}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onFloorPlansChange((prev) => [...prev, { url: '', label: '' }])}
            >
              {t.edit.addFloorPlanRow}
            </Button>
            <input
              ref={floorPlanFileRef}
              type="file"
              accept="image/*,application/pdf"
              multiple
              className="hidden"
              onChange={onFloorPlanFiles}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => floorPlanFileRef.current?.click()}
              disabled={isUploadingFloorPlan}
            >
              {isUploadingFloorPlan ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              {t.edit.uploadFloorPlans}
            </Button>
          </div>
        </CardContent>
      </Card>
    </TabsContent>
  );
}
