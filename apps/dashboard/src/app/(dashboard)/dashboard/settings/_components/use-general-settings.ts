'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useToast } from '@/hooks/use-toast';
import { apiPut } from '@/lib/api';
import { generalSchema, type SlugFormat, type TenantCurrent } from './types';
import { useSettingsText } from '../_i18n';

// State for the General tab: company form, slug format, languages and the
// brochure card. Lives in the page (not the tab) so unsaved edits survive
// switching tabs — Radix unmounts inactive TabsContent.
export function useGeneralSettings() {
  const { toast } = useToast();
  const t = useSettingsText();
  const [savingGeneral, setSavingGeneral] = useState(false);
  const [slugFormat, setSlugFormat] = useState<SlugFormat>('title-ref');

  // Brochure
  const [brochureContactEmail, setBrochureContactEmail] = useState('');
  const [brochureContactPhone, setBrochureContactPhone] = useState('');
  const [brochureLogoUrl, setBrochureLogoUrl] = useState('');
  const [defaultBrochureVariant, setDefaultBrochureVariant] = useState<'branded' | 'unbranded'>('branded');
  const [savingBrochure, setSavingBrochure] = useState(false);

  // Tenant-level languages
  const [enabledLanguages, setEnabledLanguages] = useState<string[]>(['en']);
  const [savingLangs, setSavingLangs] = useState(false);

  const generalForm = useForm({
    resolver: zodResolver(generalSchema),
    defaultValues: {
      companyName: '',
      domain: '',
      defaultLanguage: 'en',
    },
  });

  // Fills this tab from GET /api/dashboard/tenant (called by the page loader).
  const applyTenant = (res: TenantCurrent) => {
    const settings = res.data?.settings;
    if (settings?.slugFormat) {
      setSlugFormat(settings.slugFormat as SlugFormat);
    }
    if (settings?.companyName) {
      generalForm.setValue('companyName', settings.companyName);
    }
    if (res.data?.domain) {
      generalForm.setValue('domain', res.data.domain);
    }
    if (settings?.defaultLanguage) {
      generalForm.setValue('defaultLanguage', settings.defaultLanguage);
    }
    if (settings?.languages?.length) {
      setEnabledLanguages(settings.languages);
    }
    if (typeof settings?.contactEmail === 'string') setBrochureContactEmail(settings.contactEmail);
    if (typeof settings?.contactPhone === 'string') setBrochureContactPhone(settings.contactPhone);
    if (typeof settings?.logoUrl === 'string') setBrochureLogoUrl(settings.logoUrl);
    if (settings?.defaultBrochureVariant === 'branded' || settings?.defaultBrochureVariant === 'unbranded') {
      setDefaultBrochureVariant(settings.defaultBrochureVariant);
    }
  };

  const onGeneralSubmit = async (data: z.infer<typeof generalSchema>) => {
    setSavingGeneral(true);
    try {
      await apiPut('/api/dashboard/tenant/settings', {
        companyName: data.companyName,
        defaultLanguage: data.defaultLanguage,
        slugFormat,
        languages: enabledLanguages,
      });
      toast({
        title: t.general.saved,
        description: t.general.savedText,
      });
    } catch (error) {
      toast({
        title: t.common.error,
        description: t.general.saveFailed,
        variant: 'destructive',
      });
    } finally {
      setSavingGeneral(false);
    }
  };

  const onSaveBrochure = async () => {
    setSavingBrochure(true);
    try {
      await apiPut('/api/dashboard/tenant/settings', {
        contactEmail: brochureContactEmail.trim() || undefined,
        contactPhone: brochureContactPhone.trim() || undefined,
        logoUrl: brochureLogoUrl.trim() || undefined,
        defaultBrochureVariant,
      });
      toast({ title: t.general.brochure.saved });
    } catch (err) {
      toast({ title: t.general.brochure.saveFailed, description: (err as Error).message, variant: 'destructive' });
    } finally {
      setSavingBrochure(false);
    }
  };

  return {
    generalForm,
    savingGeneral,
    slugFormat,
    setSlugFormat,
    enabledLanguages,
    setEnabledLanguages,
    savingLangs,
    setSavingLangs,
    brochureContactEmail,
    setBrochureContactEmail,
    brochureContactPhone,
    setBrochureContactPhone,
    brochureLogoUrl,
    setBrochureLogoUrl,
    defaultBrochureVariant,
    setDefaultBrochureVariant,
    savingBrochure,
    applyTenant,
    onGeneralSubmit,
    onSaveBrochure,
  };
}

export type GeneralSettings = ReturnType<typeof useGeneralSettings>;
