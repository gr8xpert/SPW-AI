'use client';

import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { apiPut } from '@/lib/api';
import type { TenantCurrent } from './types';

// State for the Widget tab (search options, theme colour, reCAPTCHA). All
// three cards save through the same onSaveWidget payload.
export function useWidgetSettings() {
  const { toast } = useToast();
  // Widget search options state
  const [bedroomOptions, setBedroomOptions] = useState<number[]>([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const [bathroomOptions, setBathroomOptions] = useState<number[]>([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const [priceOptions, setPriceOptions] = useState<Record<string, number[]>>({
    sale: [50000, 100000, 150000, 200000, 250000, 300000, 400000, 500000, 600000, 750000, 1000000, 1500000, 2000000, 3000000, 5000000],
    rent: [250, 500, 750, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 7500, 10000],
    holiday_rent: [150, 200, 250, 300, 400, 500, 750, 1000, 1500, 2000, 3000, 5000],
  });
  const [enabledListingTypes, setEnabledListingTypes] = useState<string[]>(['sale', 'rent', 'holiday_rent', 'development']);
  const [primaryColor, setPrimaryColor] = useState('#2563eb');
  const [wishlistIcon, setWishlistIcon] = useState<'heart' | 'star' | 'bookmark' | 'save'>('heart');
  const [mapVariation, setMapVariation] = useState<'auto' | '0' | '1' | '2'>('auto');
  const [mapTiles, setMapTiles] = useState<{ provider: 'osm' | 'maptiler' | 'custom'; key: string; url: string; attribution: string }>({ provider: 'osm', key: '', url: '', attribution: '' });
  const [recaptchaSiteKey, setRecaptchaSiteKey] = useState('');
  const [recaptchaSecretKey, setRecaptchaSecretKey] = useState('');
  const [similarPropertiesLimit, setSimilarPropertiesLimit] = useState(6);
  const [baseCurrency, setBaseCurrency] = useState('EUR');
  const [savingWidget, setSavingWidget] = useState(false);

  // Fills this tab from GET /api/dashboard/tenant (called by the page loader).
  const applyTenant = (res: TenantCurrent) => {
    const settings = res.data?.settings;
    // Secrets are not returned in settings; the API exposes top-level
    // *Configured booleans instead. A masked placeholder keeps the
    // "configured" state, and the API ignores the masked value on save.
    const tenantData = res.data as unknown as { recaptchaSecretKeyConfigured?: boolean };
    if (Array.isArray(settings?.bedroomOptions)) setBedroomOptions(settings.bedroomOptions);
    if (Array.isArray(settings?.bathroomOptions)) setBathroomOptions(settings.bathroomOptions);
    if (settings?.priceOptions && typeof settings.priceOptions === 'object' && !Array.isArray(settings.priceOptions)) {
      setPriceOptions(settings.priceOptions);
    }
    if (Array.isArray(settings?.enabledListingTypes)) setEnabledListingTypes(settings.enabledListingTypes);
    if (settings?.primaryColor) setPrimaryColor(settings.primaryColor);
    if (settings?.wishlistIcon) setWishlistIcon(settings.wishlistIcon);
    if (settings?.mapVariation) setMapVariation(settings.mapVariation);
    if (settings?.mapTiles?.provider) {
      setMapTiles({
        provider: settings.mapTiles.provider,
        key: settings.mapTiles.key || '',
        url: settings.mapTiles.url || '',
        attribution: settings.mapTiles.attribution || '',
      });
    }
    if (settings?.recaptchaSiteKey) setRecaptchaSiteKey(settings.recaptchaSiteKey);
    if (tenantData.recaptchaSecretKeyConfigured) setRecaptchaSecretKey('••••••••');
    if (typeof settings?.similarPropertiesLimit === 'number') setSimilarPropertiesLimit(settings.similarPropertiesLimit);
    if (settings?.baseCurrency) setBaseCurrency(settings.baseCurrency);
  };

  const onSaveWidget = async () => {
    setSavingWidget(true);
    try {
      await apiPut('/api/dashboard/tenant/settings', {
        bedroomOptions,
        bathroomOptions,
        priceOptions,
        enabledListingTypes,
        primaryColor,
        wishlistIcon,
        mapVariation,
        mapTiles:
          mapTiles.provider === 'maptiler'
            ? { provider: 'maptiler', key: mapTiles.key.trim() }
            : mapTiles.provider === 'custom'
              ? { provider: 'custom', url: mapTiles.url.trim(), attribution: mapTiles.attribution.trim() }
              : { provider: 'osm' },
        recaptchaSiteKey: recaptchaSiteKey.trim() || undefined,
        recaptchaSecretKey: recaptchaSecretKey.trim() || undefined,
        similarPropertiesLimit,
        baseCurrency,
      });
      toast({ title: 'Widget settings saved', description: 'Search options have been updated.' });
    } catch (err) {
      toast({ title: 'Failed to save widget settings', description: (err as Error).message || 'Unexpected error', variant: 'destructive' });
    } finally {
      setSavingWidget(false);
    }
  };

  return {
    bedroomOptions,
    setBedroomOptions,
    bathroomOptions,
    setBathroomOptions,
    priceOptions,
    setPriceOptions,
    enabledListingTypes,
    setEnabledListingTypes,
    primaryColor,
    setPrimaryColor,
    wishlistIcon,
    setWishlistIcon,
    mapVariation,
    setMapVariation,
    mapTiles,
    setMapTiles,
    recaptchaSiteKey,
    setRecaptchaSiteKey,
    recaptchaSecretKey,
    setRecaptchaSecretKey,
    similarPropertiesLimit,
    setSimilarPropertiesLimit,
    baseCurrency,
    setBaseCurrency,
    savingWidget,
    applyTenant,
    onSaveWidget,
  };
}

export type WidgetSettings = ReturnType<typeof useWidgetSettings>;
