'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Heart, Star, Bookmark, Save } from 'lucide-react';
import { WidgetThemeCards } from './widget-theme-cards';
import { SUPPORTED_CURRENCIES } from './types';
import type { WidgetSettings } from './use-widget-settings';

export function WidgetTab({ widget }: { widget: WidgetSettings }) {
  const {
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
    wishlistIcon,
    setWishlistIcon,
    mapVariation,
    setMapVariation,
    mapTiles,
    setMapTiles,
    similarPropertiesLimit,
    setSimilarPropertiesLimit,
    mortgageInterestRate,
    setMortgageInterestRate,
    baseCurrency,
    setBaseCurrency,
    savingWidget,
    onSaveWidget,
  } = widget;

  return (
    <TabsContent value="widget">
      <Card>
        <CardHeader>
          <CardTitle>Search Widget Options</CardTitle>
          <CardDescription>
            Configure the bedroom, bathroom, and price options shown in
            the search widget dropdowns and button groups.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Listing Types</Label>
              <p className="text-xs text-muted-foreground">
                Select which listing types are available in the search widget. At least one must be enabled.
              </p>
              <div className="flex flex-wrap gap-4">
                {[
                  { value: 'sale', label: 'Sale' },
                  { value: 'rent', label: 'Long-term Rent' },
                  { value: 'holiday_rent', label: 'Holiday Rent' },
                  { value: 'development', label: 'Development' },
                ].map(({ value, label }) => (
                  <label key={value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enabledListingTypes.includes(value)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setEnabledListingTypes([...enabledListingTypes, value]);
                        } else if (enabledListingTypes.length > 1) {
                          setEnabledListingTypes(enabledListingTypes.filter(v => v !== value));
                        }
                      }}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <span className="text-sm">{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Wishlist / Favorites Icon</Label>
              <p className="text-xs text-muted-foreground">
                Choose the icon used for saving properties across the widget (listing cards, detail page, wishlist).
              </p>
              <div className="flex gap-2">
                {([
                  { value: 'heart' as const, icon: Heart, label: 'Heart' },
                  { value: 'star' as const, icon: Star, label: 'Star' },
                  { value: 'bookmark' as const, icon: Bookmark, label: 'Bookmark' },
                  { value: 'save' as const, icon: Save, label: 'Save' },
                ]).map(({ value, icon: Icon, label }) => (
                  <button
                    key={value}
                    type="button"
                    className={`flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors ${wishlistIcon === value ? 'border-primary bg-primary/10 text-primary' : 'border-input hover:bg-muted'}`}
                    onClick={() => setWishlistIcon(value)}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Property Detail Map Display</Label>
              <p className="text-xs text-muted-foreground">
                How the property location is shown on the detail page map. &quot;Auto&quot; uses the best available data.
              </p>
              <div className="flex flex-wrap gap-2">
                {([
                  { value: 'auto' as const, label: 'Auto (Best Available)', desc: 'Pin → Zip → Location' },
                  { value: '0' as const, label: 'Pin + Circle', desc: 'Approximate marker with radius' },
                  { value: '1' as const, label: 'Zip Code Area', desc: 'Boundary around postal code' },
                  { value: '2' as const, label: 'Location Area', desc: 'Boundary around municipality' },
                ]).map(({ value, label, desc }) => (
                  <button
                    key={value}
                    type="button"
                    className={`flex flex-col items-start rounded-md border px-4 py-2 text-sm transition-colors ${mapVariation === value ? 'border-primary bg-primary/10 text-primary' : 'border-input hover:bg-muted'}`}
                    onClick={() => setMapVariation(value)}
                  >
                    <span className="font-medium">{label}</span>
                    <span className="text-xs text-muted-foreground">{desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Map Style</Label>
              <p className="text-xs text-muted-foreground">
                Background used by the maps on your website (map search and property pages).
              </p>
              <div className="flex flex-wrap gap-2">
                {([
                  { value: 'osm' as const, label: 'OpenStreetMap', desc: 'Free, no setup needed' },
                  { value: 'maptiler' as const, label: 'MapTiler', desc: 'Cleaner look, free key from maptiler.com' },
                  { value: 'custom' as const, label: 'Custom', desc: 'Any tile server URL' },
                ]).map(({ value, label, desc }) => (
                  <button
                    key={value}
                    type="button"
                    data-testid={`map-tiles-${value}`}
                    className={`flex flex-col items-start rounded-md border px-4 py-2 text-sm transition-colors ${mapTiles.provider === value ? 'border-primary bg-primary/10 text-primary' : 'border-input hover:bg-muted'}`}
                    onClick={() => setMapTiles((t) => ({ ...t, provider: value }))}
                  >
                    <span className="font-medium">{label}</span>
                    <span className="text-xs text-muted-foreground">{desc}</span>
                  </button>
                ))}
              </div>
              {mapTiles.provider === 'maptiler' && (
                <div className="space-y-1 max-w-md">
                  <Input
                    placeholder="MapTiler API key"
                    value={mapTiles.key}
                    onChange={(e) => setMapTiles((t) => ({ ...t, key: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Create a free account at maptiler.com, copy the key from &quot;API keys&quot; and restrict it to
                    your website&apos;s domain there.
                    {mapTiles.key.trim() && !/^[A-Za-z0-9_-]{8,64}$/.test(mapTiles.key.trim()) && (
                      <span className="block text-destructive">This does not look like a MapTiler key.</span>
                    )}
                  </p>
                </div>
              )}
              {mapTiles.provider === 'custom' && (
                <div className="space-y-2 max-w-xl">
                  <Input
                    placeholder="https://tiles.example.com/{z}/{x}/{y}.png"
                    value={mapTiles.url}
                    onChange={(e) => setMapTiles((t) => ({ ...t, url: e.target.value }))}
                  />
                  <Input
                    placeholder="Attribution, e.g. © OpenStreetMap contributors"
                    value={mapTiles.attribution}
                    onChange={(e) => setMapTiles((t) => ({ ...t, attribution: e.target.value }))}
                  />
                  {mapTiles.url.trim() &&
                    !(/^https:\/\//.test(mapTiles.url.trim()) && ['{z}', '{x}', '{y}'].every((p) => mapTiles.url.includes(p))) && (
                      <p className="text-xs text-destructive">
                        The URL must start with https:// and contain {'{z}'}, {'{x}'} and {'{y}'}. Until then OpenStreetMap is used.
                      </p>
                    )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Display Currency</Label>
              <p className="text-xs text-muted-foreground">
                Currency prices are shown in on your website. Prices in another currency are converted at
                the daily exchange rate.
              </p>
              <Select value={baseCurrency} onValueChange={setBaseCurrency}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SUPPORTED_CURRENCIES.map((code) => (
                    <SelectItem key={code} value={code}>{code}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Similar Properties</Label>
              <p className="text-xs text-muted-foreground">
                Number of similar properties shown on the property detail page. Set to 0 to hide the section entirely.
              </p>
              <Input
                type="number"
                min={0}
                max={20}
                value={similarPropertiesLimit}
                onChange={(e) => setSimilarPropertiesLimit(Number(e.target.value))}
                className="w-28"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="mortgage-rate">Mortgage Interest Rate (%)</Label>
              <p className="text-xs text-muted-foreground">
                The rate the mortgage calculator on the property page starts with. Visitors can still change it there. Leave empty for 3.5%.
              </p>
              <Input
                id="mortgage-rate"
                type="number"
                inputMode="decimal"
                min={0}
                max={30}
                step={0.01}
                placeholder="3.5"
                value={mortgageInterestRate}
                onChange={(e) => setMortgageInterestRate(e.target.value)}
                className="w-28"
              />
            </div>

            <div className="space-y-2">
              <Label>Bedroom Options</Label>
              <p className="text-xs text-muted-foreground">
                Values shown in the bedrooms dropdown/buttons. Each value means &quot;X or more&quot;.
              </p>
              <div className="flex flex-wrap gap-2">
                {bedroomOptions.map((n) => (
                  <span
                    key={n}
                    className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-sm font-medium"
                  >
                    {n}+
                    <button
                      type="button"
                      className="ml-1 rounded-sm hover:bg-muted p-0.5"
                      onClick={() =>
                        setBedroomOptions(bedroomOptions.filter((v) => v !== n))
                      }
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={20}
                  placeholder="Add value"
                  className="w-28"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const val = Number((e.target as HTMLInputElement).value);
                      if (val > 0 && !bedroomOptions.includes(val)) {
                        setBedroomOptions([...bedroomOptions, val].sort((a, b) => a - b));
                        (e.target as HTMLInputElement).value = '';
                      }
                    }
                  }}
                />
                <p className="text-xs text-muted-foreground">Press Enter to add</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Bathroom Options</Label>
              <p className="text-xs text-muted-foreground">
                Values shown in the bathrooms dropdown/buttons. Each value means &quot;X or more&quot;.
              </p>
              <div className="flex flex-wrap gap-2">
                {bathroomOptions.map((n) => (
                  <span
                    key={n}
                    className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-sm font-medium"
                  >
                    {n}+
                    <button
                      type="button"
                      className="ml-1 rounded-sm hover:bg-muted p-0.5"
                      onClick={() =>
                        setBathroomOptions(bathroomOptions.filter((v) => v !== n))
                      }
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={20}
                  placeholder="Add value"
                  className="w-28"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const val = Number((e.target as HTMLInputElement).value);
                      if (val > 0 && !bathroomOptions.includes(val)) {
                        setBathroomOptions([...bathroomOptions, val].sort((a, b) => a - b));
                        (e.target as HTMLInputElement).value = '';
                      }
                    }
                  }}
                />
                <p className="text-xs text-muted-foreground">Press Enter to add</p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
              <Label>Price Dropdown Options</Label>
              <p className="text-xs text-muted-foreground">
                Configure price dropdown values per listing type. The widget automatically shows the right prices based on the selected listing type.
                &ldquo;Hide properties below&rdquo; keeps cheaper listings of that type off your website altogether (search, lists, map, carousels, AI chat); properties without a price still show.
              </p>
              {[
                { key: 'sale', label: 'Sale' },
                { key: 'development', label: 'New Development', hint: 'Empty uses the Sale prices' },
                { key: 'rent', label: 'Long-term Rent' },
                { key: 'holiday_rent', label: 'Holiday Rent' },
              ].map(({ key, label, hint }: { key: string; label: string; hint?: string }) => {
                const values = priceOptions[key] || [];
                return (
                  <div key={key} className="rounded-md border p-3 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">
                        {label}
                        {hint && values.length === 0 && (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">{hint}</span>
                        )}
                      </p>
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        Hide properties below
                        <Input
                          type="number"
                          min={0}
                          placeholder="No minimum"
                          className="w-32 h-8 text-sm"
                          value={minPrices[key] > 0 ? minPrices[key] : ''}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setMinPrices({ ...minPrices, [key]: val > 0 ? val : 0 });
                          }}
                        />
                      </label>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {values.map((n) => (
                        <span
                          key={n}
                          className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium"
                        >
                          {n.toLocaleString()}
                          <button
                            type="button"
                            className="ml-1 rounded-sm hover:bg-muted p-0.5"
                            onClick={() =>
                              setPriceOptions({
                                ...priceOptions,
                                [key]: values.filter((v) => v !== n),
                              })
                            }
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        placeholder="Add price"
                        className="w-36 h-8 text-sm"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const val = Number((e.target as HTMLInputElement).value);
                            if (val > 0 && !values.includes(val)) {
                              setPriceOptions({
                                ...priceOptions,
                                [key]: [...values, val].sort((a, b) => a - b),
                              });
                              (e.target as HTMLInputElement).value = '';
                            }
                          }
                        }}
                      />
                      <p className="text-xs text-muted-foreground">Press Enter to add</p>
                    </div>
                  </div>
                );
              })}
            </div>

          <Button onClick={onSaveWidget} disabled={savingWidget}>
            {savingWidget ? 'Saving...' : 'Save Widget Settings'}
          </Button>
        </CardContent>
      </Card>

      <WidgetThemeCards widget={widget} />
    </TabsContent>
  );
}
