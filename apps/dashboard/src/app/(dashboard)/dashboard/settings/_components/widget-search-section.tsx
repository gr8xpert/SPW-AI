'use client';

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import type { WidgetSettings } from './use-widget-settings';
import { SortOptionsSettings } from './sort-options-settings';
import { useLanguage } from '@/i18n/i18n-provider';
import { CollapsibleRow, NumberChips, SettingBlock, SwitchRow } from './widget-ui';
import { useSettingsText, type SettingsText } from '../_i18n';

// Widget tab → Search: what the website's search offers.

// Labels: settingsText search.types / search.priceRows.
const LISTING_TYPES = ['sale', 'rent', 'holiday_rent', 'development'] as const;

const PRICE_ROWS = ['sale', 'development', 'rent', 'holiday_rent'] as const;

type SearchText = SettingsText['search'];

function countSummary(values: number[], unit: 'value' | 'price', format: (n: number) => string, t: SearchText): string {
  if (!values.length) return unit === 'value' ? t.noValues : t.noPrices;
  const range = values.length > 1 ? ` · ${t.range(format(values[0]), format(values[values.length - 1]))}` : ` · ${format(values[0])}`;
  return `${unit === 'value' ? t.values(values.length) : t.prices(values.length)}${range}`;
}

export function WidgetSearchSection({ widget }: { widget: WidgetSettings }) {
  const {
    enabledListingTypes,
    setEnabledListingTypes,
    hideEmptySearchOptions,
    setHideEmptySearchOptions,
    sortOptions,
    setSortOptions,
    bedroomOptions,
    setBedroomOptions,
    bathroomOptions,
    setBathroomOptions,
    priceOptions,
    setPriceOptions,
    minPrices,
    setMinPrices,
  } = widget;
  const t = useSettingsText().search;
  const { locale } = useLanguage();
  const plus = (n: number) => `${n}+`;
  const money = (n: number) => n.toLocaleString(locale);

  return (
    <div className="space-y-6">
      <SettingBlock title={t.listingTypes} description={t.listingTypesHelp}>
        <div className="flex flex-wrap gap-4">
          {LISTING_TYPES.map((value) => (
            <label key={value} className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={enabledListingTypes.includes(value)}
                onChange={(e) => {
                  if (e.target.checked) setEnabledListingTypes([...enabledListingTypes, value]);
                  else if (enabledListingTypes.length > 1) setEnabledListingTypes(enabledListingTypes.filter((v) => v !== value));
                }}
                className="h-4 w-4 rounded border-gray-300"
              />
              <span className="text-sm">{t.types[value]}</span>
            </label>
          ))}
        </div>
      </SettingBlock>

      <SwitchRow
        id="hide-empty-options"
        title={t.hideEmpty}
        description={t.hideEmptyHelp}
        checked={hideEmptySearchOptions}
        onCheckedChange={setHideEmptySearchOptions}
      />

      <SortOptionsSettings value={sortOptions} onChange={setSortOptions} />

      <SettingBlock title={t.bedsBaths} description={t.bedsBathsHelp}>
        <div className="space-y-2">
          <CollapsibleRow title={t.bedrooms} summary={countSummary(bedroomOptions, 'value', plus, t)}>
            <NumberChips values={bedroomOptions} onChange={setBedroomOptions} format={plus} max={20} />
          </CollapsibleRow>
          <CollapsibleRow title={t.bathrooms} summary={countSummary(bathroomOptions, 'value', plus, t)}>
            <NumberChips values={bathroomOptions} onChange={setBathroomOptions} format={plus} max={20} />
          </CollapsibleRow>
        </div>
      </SettingBlock>

      <SettingBlock
        title={t.pricesTitle}
        description={t.pricesHelp}
      >
        <div className="space-y-2">
          {PRICE_ROWS.map((key) => {
            const hint = key === 'development' ? t.developmentHint : undefined;
            const values = priceOptions[key] || [];
            const floor = minPrices[key] > 0 ? minPrices[key] : 0;
            const summary = `${values.length === 0 && hint ? hint : countSummary(values, 'price', money, t)} · ${t.hideBelowSummary(floor ? money(floor) : t.none)}`;
            return (
              <CollapsibleRow key={key} title={t.priceRows[key]} summary={summary}>
                <NumberChips
                  values={values}
                  onChange={(next) => setPriceOptions({ ...priceOptions, [key]: next })}
                  placeholder={t.addPrice}
                />
                <div className="flex items-center gap-2">
                  <Label htmlFor={`min-price-${key}`} className="text-xs font-normal text-muted-foreground">
                    {t.hideBelow}
                  </Label>
                  <Input
                    id={`min-price-${key}`}
                    type="number"
                    min={0}
                    placeholder={t.noMinimum}
                    className="h-8 w-32 text-sm"
                    value={floor || ''}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setMinPrices({ ...minPrices, [key]: val > 0 ? val : 0 });
                    }}
                  />
                </div>
              </CollapsibleRow>
            );
          })}
        </div>
      </SettingBlock>
    </div>
  );
}
