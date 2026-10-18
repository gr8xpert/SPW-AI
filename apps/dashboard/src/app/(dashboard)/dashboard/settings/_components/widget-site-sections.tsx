'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SUPPORTED_CURRENCIES } from './types';
import type { WidgetSettings } from './use-widget-settings';
import { ChoiceButtons, SettingBlock } from './widget-ui';

// Widget tab → Maps, Look & currency, Forms.

const SWATCHES = ['#2563eb', '#c8a255', '#16a34a', '#dc2626', '#7c3aed', '#0891b2', '#ea580c', '#1e293b'];

export function WidgetMapsSection({ widget }: { widget: WidgetSettings }) {
  const { mapTiles, setMapTiles } = widget;
  return (
    <SettingBlock title="Map Style" description="Background used by the maps on your website (map search and property pages).">
      <ChoiceButtons
        value={mapTiles.provider}
        onChange={(provider) => setMapTiles((t) => ({ ...t, provider }))}
        options={[
          { value: 'osm', label: 'OpenStreetMap', desc: 'Free, no setup needed', testId: 'map-tiles-osm' },
          { value: 'maptiler', label: 'MapTiler', desc: 'Cleaner look, free key from maptiler.com', testId: 'map-tiles-maptiler' },
          { value: 'custom', label: 'Custom', desc: 'Any tile server URL', testId: 'map-tiles-custom' },
        ]}
      />
      {mapTiles.provider === 'maptiler' && (
        <div className="max-w-md space-y-1">
          <Input
            placeholder="MapTiler API key"
            value={mapTiles.key}
            onChange={(e) => setMapTiles((t) => ({ ...t, key: e.target.value }))}
          />
          <p className="text-xs text-muted-foreground">
            Create a free account at maptiler.com, copy the key from &quot;API keys&quot; and restrict it to your
            website&apos;s domain there.
            {mapTiles.key.trim() && !/^[A-Za-z0-9_-]{8,64}$/.test(mapTiles.key.trim()) && (
              <span className="block text-destructive">This does not look like a MapTiler key.</span>
            )}
          </p>
        </div>
      )}
      {mapTiles.provider === 'custom' && (
        <div className="max-w-xl space-y-2">
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
    </SettingBlock>
  );
}

export function WidgetLookSection({ widget }: { widget: WidgetSettings }) {
  const { primaryColor, setPrimaryColor, baseCurrency, setBaseCurrency } = widget;
  return (
    <div className="space-y-6">
      <SettingBlock title="Theme Color" description="All buttons, links and accents on your website follow this colour.">
        <div className="flex items-center gap-4">
          <input
            type="color"
            aria-label="Pick a colour"
            value={primaryColor}
            onChange={(e) => setPrimaryColor(e.target.value)}
            className="h-10 w-14 cursor-pointer rounded border border-input p-0.5"
          />
          <Input
            value={primaryColor}
            onChange={(e) => {
              const v = e.target.value;
              if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setPrimaryColor(v);
            }}
            className="w-32 font-mono"
            maxLength={7}
            placeholder="#2563eb"
          />
          <div
            className="flex h-10 flex-1 items-center justify-center rounded-md text-sm font-medium text-white"
            style={{ backgroundColor: primaryColor }}
          >
            Preview
          </div>
        </div>
        <div className="flex gap-2">
          {SWATCHES.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={color}
              className={`h-8 w-8 rounded-full border-2 transition-transform hover:scale-110 ${primaryColor === color ? 'scale-110 border-foreground' : 'border-transparent'}`}
              style={{ backgroundColor: color }}
              onClick={() => setPrimaryColor(color)}
            />
          ))}
        </div>
      </SettingBlock>

      <SettingBlock
        title="Display Currency"
        description="The currency prices are shown in on your website. Prices in another currency are converted at the daily exchange rate."
      >
        <Select value={baseCurrency} onValueChange={setBaseCurrency}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {SUPPORTED_CURRENCIES.map((code) => (
              <SelectItem key={code} value={code}>{code}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingBlock>
    </div>
  );
}

export function WidgetFormsSection({ widget }: { widget: WidgetSettings }) {
  const { recaptchaSiteKey, setRecaptchaSiteKey, recaptchaSecretKey, setRecaptchaSecretKey } = widget;
  return (
    <SettingBlock
      title="reCAPTCHA"
      description={
        <>
          Protects the inquiry form from spam with Google reCAPTCHA v2. When both keys are set, a reCAPTCHA checkbox
          appears above the &quot;Send Inquiry&quot; button on property pages.
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="recaptchaSiteKey">Site Key</Label>
          <Input
            id="recaptchaSiteKey"
            // Never the browser's saved login (10-06: an email address and
            // password were auto-filled here and blocked every inquiry).
            autoComplete="off"
            name="spm-recaptcha-site"
            data-1p-ignore
            data-lpignore="true"
            spellCheck={false}
            placeholder="6Lc..."
            value={recaptchaSiteKey}
            onChange={(e) => setRecaptchaSiteKey(e.target.value)}
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">The public key embedded in the widget HTML.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="recaptchaSecretKey">Secret Key</Label>
          <Input
            id="recaptchaSecretKey"
            // Text masked by CSS, not type="password": password managers
            // fill any password field with the saved login.
            type="text"
            autoComplete="off"
            name="spm-recaptcha-secret"
            data-1p-ignore
            data-lpignore="true"
            spellCheck={false}
            placeholder="6Lc..."
            value={recaptchaSecretKey}
            onChange={(e) => setRecaptchaSecretKey(e.target.value)}
            className="font-mono text-sm"
            style={{ WebkitTextSecurity: 'disc' } as React.CSSProperties}
          />
          <p className="text-xs text-muted-foreground">The private key used for server-side verification.</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Get your keys from{' '}
        <a href="https://www.google.com/recaptcha/admin" target="_blank" rel="noopener noreferrer" className="underline">
          google.com/recaptcha/admin
        </a>
        . Choose reCAPTCHA v2 &quot;I&apos;m not a robot&quot; checkbox. Leave both fields empty to switch reCAPTCHA off.
      </p>
    </SettingBlock>
  );
}
