'use client';

import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { SettingBlock } from './widget-ui';
import { useSettingsText } from '../_i18n';

// Widget tab → Listing cards → Badges. Saved as the list switched OFF
// (settings.hiddenBadges), so a new badge shows until a client hides it.

// Labels: settingsText badges.items[key].
const BADGES = ['listingType', 'keyReady', 'featured', 'own', 'propertyType', 'reference'] as const;

export function BadgeSettings({ hidden, onChange }: { hidden: string[]; onChange: (hidden: string[]) => void }) {
  const t = useSettingsText().badges;
  const toggle = (key: string, on: boolean) =>
    onChange(on ? hidden.filter((k) => k !== key) : [...hidden, key]);
  return (
    <SettingBlock
      title={t.title}
      description={t.help}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        {BADGES.map((key) => (
          <div key={key} className="flex items-start justify-between gap-3 rounded-md border p-3">
            <div className="space-y-0.5">
              <Label htmlFor={`badge-${key}`}>{t.items[key].label}</Label>
              <p className="text-xs text-muted-foreground">{t.items[key].where}</p>
            </div>
            <Switch id={`badge-${key}`} checked={!hidden.includes(key)} onCheckedChange={(on) => toggle(key, on)} />
          </div>
        ))}
      </div>
    </SettingBlock>
  );
}
