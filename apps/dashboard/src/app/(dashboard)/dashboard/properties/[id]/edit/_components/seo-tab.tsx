'use client';

import { Languages, Loader2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { TabsContent } from '@/components/ui/tabs';
import { LanguageSelect, MultilingualInput, MultilingualTextarea } from './multilingual-fields';
import type { FormSectionProps, MultilingualChangeHandler } from './types';
import { usePropertiesText } from '../../../_i18n';

export function SeoTab({
  formData,
  onChange,
  onMultilingualChange,
  seoLang,
  onSeoLangChange,
  aiLocked,
  disabled,
  isGeneratingSeo,
  onGenerateSeo,
  isGeneratingSchema,
  onGenerateSchema,
  useCustomSchema,
  onUseCustomSchemaChange,
}: FormSectionProps & {
  onMultilingualChange: MultilingualChangeHandler;
  seoLang: string;
  onSeoLangChange: (lang: string) => void;
  aiLocked: boolean;
  /** True while the page is still loading. */
  disabled: boolean;
  isGeneratingSeo: boolean;
  onGenerateSeo: () => void;
  isGeneratingSchema: boolean;
  onGenerateSchema: () => void;
  useCustomSchema: boolean;
  onUseCustomSchemaChange: (checked: boolean) => void;
}) {
  const t = usePropertiesText();
  return (
    <TabsContent value="seo" className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle>{t.form.seoSettings}</CardTitle>
              <CardDescription>{t.form.seoDescription}</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <LanguageSelect value={seoLang} onChange={onSeoLangChange} />
              <Button
                variant="outline"
                size="sm"
                onClick={onGenerateSeo}
                disabled={isGeneratingSeo || disabled}
                title={aiLocked ? t.edit.aiSeoLocked : t.edit.generateSeoTitle}
              >
                {isGeneratingSeo ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : aiLocked ? <Lock className="h-4 w-4 mr-2" /> : <Languages className="h-4 w-4 mr-2" />}
                {isGeneratingSeo ? t.edit.generating : t.edit.generateSeo}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t.fields.slug}</Label>
            <Input value={formData.slug} onChange={(e) => onChange('slug', e.target.value)} placeholder="luxury-villa-nueva-andalucia" />
            <p className="text-xs text-muted-foreground">{t.form.slugHint}</p>
          </div>
          <MultilingualInput label={t.fields.pageTitle} lang={seoLang} value={formData.pageTitle} onChange={(lang, val) => onMultilingualChange('pageTitle', lang, val)} />
          <MultilingualInput label={t.fields.metaTitle} lang={seoLang} value={formData.metaTitle} onChange={(lang, val) => onMultilingualChange('metaTitle', lang, val)} />
          <MultilingualTextarea label={t.fields.metaDescription} lang={seoLang} value={formData.metaDescription} onChange={(lang, val) => onMultilingualChange('metaDescription', lang, val)} rows={3} />
          <MultilingualInput label={t.fields.metaKeywords} lang={seoLang} value={formData.metaKeywords} onChange={(lang, val) => onMultilingualChange('metaKeywords', lang, val)} placeholder={t.form.keywordsPlaceholder} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle>{t.edit.schemaTitle}</CardTitle>
              <CardDescription>
                {t.edit.schemaBefore}<code>RealEstateListing</code>{t.edit.schemaAfter}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={useCustomSchema}
                onCheckedChange={(checked) => {
                  onUseCustomSchemaChange(checked);
                  if (!checked) onChange('seoSchemaJson', '');
                }}
              />
              <Label className="text-sm">{t.edit.useCustomSchema}</Label>
            </div>
          </div>
        </CardHeader>
        {useCustomSchema && (
          <CardContent className="space-y-2">
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={onGenerateSchema}
                disabled={isGeneratingSchema || disabled}
                title={aiLocked ? t.edit.aiSchemaLocked : t.edit.generateSchemaTitle}
              >
                {isGeneratingSchema ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : aiLocked ? <Lock className="h-4 w-4 mr-2" /> : <Languages className="h-4 w-4 mr-2" />}
                {isGeneratingSchema ? t.edit.generating : t.edit.generateSchema}
              </Button>
            </div>
            <Textarea
              value={formData.seoSchemaJson}
              onChange={(e) => onChange('seoSchemaJson', e.target.value)}
              placeholder='{"@context":"https://schema.org","@type":"RealEstateListing",...}'
              rows={12}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              {t.edit.schemaHint}
            </p>
          </CardContent>
        )}
      </Card>
    </TabsContent>
  );
}
