'use client';

import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { apiPut } from '@/lib/api';
import type { TenantCurrent } from './types';

// State for the Widget tab (search options, theme colour, reCAPTCHA). All
// three cards save through the same onSaveWidget payload.
const RECAPTCHA_KEY_RE = /^6L[\w-]{38}$/;

const DEFAULT_SALE_PRICES = [50000, 100000, 150000, 200000, 250000, 300000, 400000, 500000, 600000, 750000, 1000000, 1500000, 2000000, 3000000, 5000000];

export function useWidgetSettings() {
  const { toast } = useToast();
  // Widget search options state
  const [bedroomOptions, setBedroomOptions] = useState<number[]>([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const [bathroomOptions, setBathroomOptions] = useState<number[]>([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const [priceOptions, setPriceOptions] = useState<Record<string, number[]>>({
    sale: DEFAULT_SALE_PRICES,
    development: DEFAULT_SALE_PRICES,
    rent: [250, 500, 750, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 7500, 10000],
    holiday_rent: [150, 200, 250, 300, 400, 500, 750, 1000, 1500, 2000, 3000, 5000],
  });
  // "Hide properties below" per listing type; an empty box means no floor.
  const [minPrices, setMinPrices] = useState<Record<string, number>>({});
  const [enabledListingTypes, setEnabledListingTypes] = useState<string[]>(['sale', 'rent', 'holiday_rent', 'development']);
  const [primaryColor, setPrimaryColor] = useState('#2563eb');
  const [wishlistIcon, setWishlistIcon] = useState<'heart' | 'star' | 'bookmark' | 'save'>('heart');
  const [mapVariation, setMapVariation] = useState<'auto' | '0' | '1' | '2'>('auto');
  const [mapTiles, setMapTiles] = useState<{ provider: 'osm' | 'maptiler' | 'custom'; key: string; url: string; attribution: string }>({ provider: 'osm', key: '', url: '', attribution: '' });
  const [recaptchaSiteKey, setRecaptchaSiteKey] = useState('');
  const [recaptchaSecretKey, setRecaptchaSecretKey] = useState('');
  const [similarPropertiesLimit, setSimilarPropertiesLimit] = useState(6);
  // Mortgage calculator's starting rate (%); empty = the widget's 3.5.
  const [mortgageInterestRate, setMortgageInterestRate] = useState('');
  // Hide search choices with no listings (default on).
  const [hideEmptySearchOptions, setHideEmptySearchOptions] = useState(true);
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
      // New Development got its own row on 2026-10-05: until a client edits
      // it, it starts as a copy of their Sale prices.
      const saved = settings.priceOptions as Record<string, number[]>;
      setPriceOptions(
        saved.development?.length || !saved.sale?.length ? saved : { ...saved, development: [...saved.sale] },
      );
    }
    if (settings?.minPrices && typeof settings.minPrices === 'object' && !Array.isArray(settings.minPrices)) {
      setMinPrices(settings.minPrices as Record<string, number>);
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
    // A saved value that isn't a key (an auto-filled email) shows empty, so the
    // next save clears it.
    if (settings?.recaptchaSiteKey && RECAPTCHA_KEY_RE.test(settings.recaptchaSiteKey)) setRecaptchaSiteKey(settings.recaptchaSiteKey);
    if (tenantData.recaptchaSecretKeyConfigured) setRecaptchaSecretKey('••••••••');
    if (typeof settings?.similarPropertiesLimit === 'number') setSimilarPropertiesLimit(settings.similarPropertiesLimit);
    setMortgageInterestRate(typeof settings?.mortgageInterestRate === 'number' ? String(settings.mortgageInterestRate) : '');
    setHideEmptySearchOptions(settings?.hideEmptySearchOptions !== false);
    if (settings?.baseCurrency) setBaseCurrency(settings.baseCurrency);
  };

  const onSaveWidget = async () => {
    const site = recaptchaSiteKey.trim();
    const secret = recaptchaSecretKey.trim();
    if ((site && !RECAPTCHA_KEY_RE.test(site)) || (secret && !secret.includes('••••') && !RECAPTCHA_KEY_RE.test(secret))) {
      toast({
        title: 'reCAPTCHA keys look wrong',
        description: 'Each key is 40 characters and starts with "6L" (google.com/recaptcha/admin). Leave both empty to switch reCAPTCHA off.',
        variant: 'destructive',
      });
      return;
    }
    if (!!site !== !!secret) {
      toast({ title: 'reCAPTCHA needs both keys', description: 'Fill in the site key and the secret key, or leave both empty.', variant: 'destructive' });
      return;
    }
    setSavingWidget(true);
    try {
      await apiPut('/api/dashboard/tenant/settings', {
        bedroomOptions,
        bathroomOptions,
        priceOptions,
        // Every type is sent, so clearing a box removes its floor.
        minPrices: Object.fromEntries(
          ['sale', 'development', 'rent', 'holiday_rent'].map((k) => [k, minPrices[k] > 0 ? minPrices[k] : null]),
        ),
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
        // Empty strings clear them (undefined used to leave the old value).
        recaptchaSiteKey: site,
        recaptchaSecretKey: secret,
        similarPropertiesLimit,
        // null clears it (back to the widget default).
        mortgageInterestRate: mortgageInterestRate.trim() === '' ? null : Number(mortgageInterestRate.replace(',', '.')),
        hideEmptySearchOptions,
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
    minPrices,
    setMinPrices,
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
    mortgageInterestRate,
    setMortgageInterestRate,
    hideEmptySearchOptions,
    setHideEmptySearchOptions,
    baseCurrency,
    setBaseCurrency,
    savingWidget,
    applyTenant,
    onSaveWidget,
  };
}

export type WidgetSettings = ReturnType<typeof useWidgetSettings>;
