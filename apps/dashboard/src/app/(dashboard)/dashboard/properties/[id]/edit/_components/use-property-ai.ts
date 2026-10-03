'use client';

import { useState, type Dispatch, type SetStateAction } from 'react';
import type { useApi } from '@/hooks/use-api';
import type { useToast } from '@/hooks/use-toast';
import { useAiTranslationGuard } from '@/hooks/use-ai-translation-guard';
import type { MultilingualField, PropertyFormData } from './types';

/**
 * The page's three AI actions: translate the content, generate SEO fields,
 * generate a JSON-LD schema. Each only fills the form; the user still saves.
 */
export function usePropertyAi({
  api,
  toast,
  propertyId,
  tenantLanguages,
  setFormData,
  setUseCustomSchema,
}: {
  api: ReturnType<typeof useApi<any>>;
  toast: ReturnType<typeof useToast>['toast'];
  propertyId: number;
  tenantLanguages: string[];
  setFormData: Dispatch<SetStateAction<PropertyFormData>>;
  setUseCustomSchema: (v: boolean) => void;
}) {
  const aiTranslation = useAiTranslationGuard();
  const [isTranslating, setIsTranslating] = useState(false);
  const [isGeneratingSeo, setIsGeneratingSeo] = useState(false);
  const [isGeneratingSchema, setIsGeneratingSchema] = useState(false);

  const handleTranslate = async () => {
    if (!aiTranslation.check()) return;
    if (tenantLanguages.length < 2) {
      toast({ title: 'Multiple languages required', description: 'Enable at least 2 languages in Settings → General to use AI translation.', variant: 'destructive' });
      return;
    }
    setIsTranslating(true);
    try {
      const res = await api.post(`/api/dashboard/translate/property/${propertyId}`, {
        targetLanguages: tenantLanguages,
      });
      const translated = (res as { data: Record<string, Record<string, string>> })?.data || res;
      if (translated) {
        const multiFields: MultilingualField[] = ['title', 'description', 'metaTitle', 'metaDescription', 'metaKeywords', 'pageTitle'];
        const updates: Partial<PropertyFormData> = {};
        for (const field of multiFields) {
          if (translated[field]) {
            updates[field] = translated[field];
          }
        }
        setFormData((prev) => ({ ...prev, ...updates }));
      }
      toast({ title: 'Translation complete', description: `Translated to ${tenantLanguages.length - 1} language(s). Review and save to keep changes.` });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unexpected error';
      toast({ title: 'Translation failed', description: errMsg, variant: 'destructive' });
    } finally {
      setIsTranslating(false);
    }
  };

  const handleGenerateSeo = async () => {
    if (!aiTranslation.check()) return;
    if (tenantLanguages.length === 0) {
      toast({ title: 'No languages configured', description: 'Enable at least one language in Settings → General.', variant: 'destructive' });
      return;
    }
    setIsGeneratingSeo(true);
    try {
      const res = await api.post(`/api/dashboard/ai-seo/property/${propertyId}`, {
        targetLanguages: tenantLanguages,
      });
      const body = (res as any)?.data || res;
      // Expect shape: { [lang]: { pageTitle, metaTitle, metaDescription, metaKeywords } }
      if (body && typeof body === 'object') {
        setFormData((prev) => {
          const next = { ...prev };
          const pageTitle = { ...prev.pageTitle };
          const metaTitle = { ...prev.metaTitle };
          const metaDescription = { ...prev.metaDescription };
          const metaKeywords = { ...prev.metaKeywords };
          for (const [lang, fields] of Object.entries(body as Record<string, any>)) {
            if (!fields || typeof fields !== 'object') continue;
            if (fields.pageTitle) pageTitle[lang] = String(fields.pageTitle);
            if (fields.metaTitle) metaTitle[lang] = String(fields.metaTitle);
            if (fields.metaDescription) metaDescription[lang] = String(fields.metaDescription);
            if (fields.metaKeywords) metaKeywords[lang] = String(fields.metaKeywords);
          }
          next.pageTitle = pageTitle;
          next.metaTitle = metaTitle;
          next.metaDescription = metaDescription;
          next.metaKeywords = metaKeywords;
          return next;
        });
        toast({ title: 'SEO generated', description: `Generated for ${Object.keys(body).length} language(s). Review and save to keep changes.` });
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unexpected error';
      toast({ title: 'SEO generation failed', description: errMsg, variant: 'destructive' });
    } finally {
      setIsGeneratingSeo(false);
    }
  };

  const handleGenerateSchema = async () => {
    if (!aiTranslation.check()) return;
    setIsGeneratingSchema(true);
    try {
      const res = await api.post(`/api/dashboard/ai-seo/property/${propertyId}/schema`, {});
      const body = (res as any)?.data || res;
      const schema = body?.schema;
      if (typeof schema === 'string' && schema.trim().length > 0) {
        setUseCustomSchema(true);
        setFormData((prev) => ({ ...prev, seoSchemaJson: schema }));
        toast({ title: 'Schema generated', description: 'Review the JSON-LD below and save to keep changes.' });
      } else {
        toast({ title: 'Schema generation returned empty', variant: 'destructive' });
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unexpected error';
      toast({ title: 'Schema generation failed', description: errMsg, variant: 'destructive' });
    } finally {
      setIsGeneratingSchema(false);
    }
  };

  return {
    aiLocked: aiTranslation.locked,
    isTranslating,
    isGeneratingSeo,
    isGeneratingSchema,
    handleTranslate,
    handleGenerateSeo,
    handleGenerateSchema,
  };
}
