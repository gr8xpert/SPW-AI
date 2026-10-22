'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SUPPORTED_CURRENCIES } from './types';
import type { WidgetSettings } from './use-widget-settings';
import { ChoiceButtons, SettingBlock } from './widget-ui';
import { useSettingsText } from '../_i18n';

// Widget tab → Maps, Look & currency, Forms.

const SWATCHES = ['#2563eb', '#c8a255', '#16a34a', '#dc2626', '#7c3aed', '#0891b2', '#ea580c', '#1e293b'];

export function WidgetMapsSection({ widget }: { widget: WidgetSettings }) {
  const { mapTiles, setMapTiles } = widget;
  const t = useSettingsText().maps;
  return (
    <SettingBlock title={t.title} description={t.help}>
      <ChoiceButtons
        value={mapTiles.provider}
        onChange={(provider) => setMapTiles((t) => ({ ...t, provider }))}
        options={[
          { value: 'osm', label: 'OpenStreetMap', desc: t.osmDesc, testId: 'map-tiles-osm' },
          { value: 'maptiler', label: 'MapTiler', desc: t.maptilerDesc, testId: 'map-tiles-maptiler' },
          { value: 'custom', label: t.custom, desc: t.customDesc, testId: 'map-tiles-custom' },
        ]}
      />
      {mapTiles.provider === 'maptiler' && (
        <div className="max-w-md space-y-1">
          <Input
            placeholder={t.maptilerKey}
            value={mapTiles.key}
            onChange={(e) => setMapTiles((t) => ({ ...t, key: e.target.value }))}
          />
          <p className="text-xs text-muted-foreground">
            {t.maptilerHelp}
            {mapTiles.key.trim() && !/^[A-Za-z0-9_-]{8,64}$/.test(mapTiles.key.trim()) && (
              <span className="block text-destructive">{t.maptilerInvalid}</span>
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
            placeholder={t.attribution}
            value={mapTiles.attribution}
            onChange={(e) => setMapTiles((t) => ({ ...t, attribution: e.target.value }))}
          />
          {mapTiles.url.trim() &&
            !(/^https:\/\//.test(mapTiles.url.trim()) && ['{z}', '{x}', '{y}'].every((p) => mapTiles.url.includes(p))) && (
              <p className="text-xs text-destructive">
                {t.urlInvalid}
              </p>
            )}
        </div>
      )}
    </SettingBlock>
  );
}

export function WidgetLookSection({ widget }: { widget: WidgetSettings }) {
  const { primaryColor, setPrimaryColor, baseCurrency, setBaseCurrency } = widget;
  const t = useSettingsText().look;
  return (
    <div className="space-y-6">
      <SettingBlock title={t.themeColor} description={t.themeHelp}>
        <div className="flex items-center gap-4">
          <input
            type="color"
            aria-label={t.pickColour}
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
            {t.preview}
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
        title={t.currency}
        description={t.currencyHelp}
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
  const t = useSettingsText().forms;
  return (
    <SettingBlock title={t.title} description={t.help}>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="recaptchaSiteKey">{t.siteKey}</Label>
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
          <p className="text-xs text-muted-foreground">{t.siteKeyHelp}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="recaptchaSecretKey">{t.secretKey}</Label>
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
          <p className="text-xs text-muted-foreground">{t.secretKeyHelp}</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {t.getKeys}{' '}
        <a href="https://www.google.com/recaptcha/admin" target="_blank" rel="noopener noreferrer" className="underline">
          google.com/recaptcha/admin
        </a>
        {t.getKeysAfter}
      </p>
    </SettingBlock>
  );
}
