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
  return (
    <TabsContent value="seo" className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle>SEO Settings</CardTitle>
              <CardDescription>Search engine optimization fields</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <LanguageSelect value={seoLang} onChange={onSeoLangChange} />
              <Button
                variant="outline"
                size="sm"
                onClick={onGenerateSeo}
                disabled={isGeneratingSeo || disabled}
                title={aiLocked ? 'AI SEO is a premium add-on — contact your account manager to unlock' : 'Generate SEO fields for all tenant languages'}
              >
                {isGeneratingSeo ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : aiLocked ? <Lock className="h-4 w-4 mr-2" /> : <Languages className="h-4 w-4 mr-2" />}
                {isGeneratingSeo ? 'Generating…' : 'Generate SEO with AI'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Slug</Label>
            <Input value={formData.slug} onChange={(e) => onChange('slug', e.target.value)} placeholder="luxury-villa-nueva-andalucia" />
            <p className="text-xs text-muted-foreground">Leave empty to use the default format from Settings. Enter a custom slug to override for this property only.</p>
          </div>
          <MultilingualInput label="Page Title" lang={seoLang} value={formData.pageTitle} onChange={(lang, val) => onMultilingualChange('pageTitle', lang, val)} />
          <MultilingualInput label="Meta Title" lang={seoLang} value={formData.metaTitle} onChange={(lang, val) => onMultilingualChange('metaTitle', lang, val)} />
          <MultilingualTextarea label="Meta Description" lang={seoLang} value={formData.metaDescription} onChange={(lang, val) => onMultilingualChange('metaDescription', lang, val)} rows={3} />
          <MultilingualInput label="Meta Keywords" lang={seoLang} value={formData.metaKeywords} onChange={(lang, val) => onMultilingualChange('metaKeywords', lang, val)} placeholder="Keywords separated by commas" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle>SEO Schema (JSON-LD)</CardTitle>
              <CardDescription>
                Override the auto-generated <code>RealEstateListing</code> schema.org block. Leave OFF to use the default schema built from the property&apos;s fields.
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
              <Label className="text-sm">Use custom schema</Label>
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
                title={aiLocked ? 'AI Schema is a premium add-on — contact your account manager to unlock' : 'Generate a schema.org JSON-LD block from this property’s fields'}
              >
                {isGeneratingSchema ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : aiLocked ? <Lock className="h-4 w-4 mr-2" /> : <Languages className="h-4 w-4 mr-2" />}
                {isGeneratingSchema ? 'Generating…' : 'Generate schema with AI'}
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
              Paste valid JSON-LD or generate one with AI. Validated on save — invalid JSON will surface an error and the widget will fall back to the auto-generated schema until fixed.
            </p>
          </CardContent>
        )}
      </Card>
    </TabsContent>
  );
}
