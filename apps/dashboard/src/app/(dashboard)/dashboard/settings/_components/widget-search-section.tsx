'use client';

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import type { WidgetSettings } from './use-widget-settings';
import { SortOptionsSettings } from './sort-options-settings';
import { CollapsibleRow, NumberChips, SettingBlock, SwitchRow } from './widget-ui';

// Widget tab → Search: what the website's search offers.

const LISTING_TYPES = [
  { value: 'sale', label: 'Sale' },
  { value: 'rent', label: 'Long-term Rent' },
  { value: 'holiday_rent', label: 'Holiday Rent' },
  { value: 'development', label: 'Development' },
];

const PRICE_ROWS: { key: string; label: string; hint?: string }[] = [
  { key: 'sale', label: 'Sale' },
  { key: 'development', label: 'New Development', hint: 'Empty uses the Sale prices' },
  { key: 'rent', label: 'Long-term Rent' },
  { key: 'holiday_rent', label: 'Holiday Rent' },
];

function countSummary(values: number[], unit: string, format: (n: number) => string): string {
  if (!values.length) return `No ${unit}s`;
  const range = values.length > 1 ? ` · ${format(values[0])} to ${format(values[values.length - 1])}` : ` · ${format(values[0])}`;
  return `${values.length} ${unit}${values.length === 1 ? '' : 's'}${range}`;
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
  const plus = (n: number) => `${n}+`;
  const money = (n: number) => n.toLocaleString();

  return (
    <div className="space-y-6">
      <SettingBlock title="Listing Types" description="Which listing types the search offers. At least one must stay ticked.">
        <div className="flex flex-wrap gap-4">
          {LISTING_TYPES.map(({ value, label }) => (
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
              <span className="text-sm">{label}</span>
            </label>
          ))}
        </div>
      </SettingBlock>

      <SwitchRow
        id="hide-empty-options"
        title="Hide search options with no listings"
        description="Locations, property types, statuses and features that would find nothing for the visitor's search disappear from the dropdowns as they search. Listing-type tabs always stay. Turn off to show everything."
        checked={hideEmptySearchOptions}
        onCheckedChange={setHideEmptySearchOptions}
      />

      <SortOptionsSettings value={sortOptions} onChange={setSortOptions} />

      <SettingBlock title="Bedrooms & Bathrooms" description={'Values in the bedrooms and bathrooms dropdowns/buttons. Each value means "X or more".'}>
        <div className="space-y-2">
          <CollapsibleRow title="Bedrooms" summary={countSummary(bedroomOptions, 'value', plus)}>
            <NumberChips values={bedroomOptions} onChange={setBedroomOptions} format={plus} max={20} />
          </CollapsibleRow>
          <CollapsibleRow title="Bathrooms" summary={countSummary(bathroomOptions, 'value', plus)}>
            <NumberChips values={bathroomOptions} onChange={setBathroomOptions} format={plus} max={20} />
          </CollapsibleRow>
        </div>
      </SettingBlock>

      <SettingBlock
        title="Prices"
        description={
          <>
            The price dropdown values per listing type; the search shows the right list for the chosen type.
            &ldquo;Hide properties below&rdquo; keeps cheaper listings of that type off your website altogether (search,
            lists, map, carousels, AI chat); properties without a price still show.
          </>
        }
      >
        <div className="space-y-2">
          {PRICE_ROWS.map(({ key, label, hint }) => {
            const values = priceOptions[key] || [];
            const floor = minPrices[key] > 0 ? minPrices[key] : 0;
            const summary = `${values.length === 0 && hint ? hint : countSummary(values, 'price', money)} · Hide below: ${floor ? money(floor) : 'none'}`;
            return (
              <CollapsibleRow key={key} title={label} summary={summary}>
                <NumberChips
                  values={values}
                  onChange={(next) => setPriceOptions({ ...priceOptions, [key]: next })}
                  placeholder="Add price"
                />
                <div className="flex items-center gap-2">
                  <Label htmlFor={`min-price-${key}`} className="text-xs font-normal text-muted-foreground">
                    Hide properties below
                  </Label>
                  <Input
                    id={`min-price-${key}`}
                    type="number"
                    min={0}
                    placeholder="No minimum"
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
