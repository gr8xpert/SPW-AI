'use client';

import { useState, type Dispatch, type SetStateAction } from 'react';
import type { useApi } from '@/hooks/use-api';
import type { useToast } from '@/hooks/use-toast';
import { useAiTranslationGuard } from '@/hooks/use-ai-translation-guard';
import type { MultilingualField, PropertyFormData } from './types';
import { usePropertiesText } from '../../../_i18n';

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
  const t = usePropertiesText();
  const [isTranslating, setIsTranslating] = useState(false);
  const [isGeneratingSeo, setIsGeneratingSeo] = useState(false);
  const [isGeneratingSchema, setIsGeneratingSchema] = useState(false);

  const handleTranslate = async () => {
    if (!aiTranslation.check()) return;
    if (tenantLanguages.length < 2) {
      toast({ title: t.ai.multipleLanguages, description: t.ai.multipleLanguagesDescription, variant: 'destructive' });
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
      toast({ title: t.ai.translationComplete, description: t.ai.translatedTo(tenantLanguages.length - 1) });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : t.common.unexpectedError;
      toast({ title: t.ai.translationFailed, description: errMsg, variant: 'destructive' });
    } finally {
      setIsTranslating(false);
    }
  };

  const handleGenerateSeo = async () => {
    if (!aiTranslation.check()) return;
    if (tenantLanguages.length === 0) {
      toast({ title: t.ai.noLanguages, description: t.ai.noLanguagesDescription, variant: 'destructive' });
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
        toast({ title: t.ai.seoGenerated, description: t.ai.seoGeneratedDescription(Object.keys(body).length) });
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : t.common.unexpectedError;
      toast({ title: t.ai.seoFailed, description: errMsg, variant: 'destructive' });
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
        toast({ title: t.ai.schemaGenerated, description: t.ai.schemaGeneratedDescription });
      } else {
        toast({ title: t.ai.schemaEmpty, variant: 'destructive' });
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : t.common.unexpectedError;
      toast({ title: t.ai.schemaFailed, description: errMsg, variant: 'destructive' });
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
