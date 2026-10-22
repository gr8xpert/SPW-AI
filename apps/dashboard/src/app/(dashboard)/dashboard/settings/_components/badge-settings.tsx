'use client';

import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { SettingBlock } from './widget-ui';

// Widget tab → Listing cards → Badges. Saved as the list switched OFF
// (settings.hiddenBadges), so a new badge shows until a client hides it.

const BADGES: { key: string; label: string; where: string }[] = [
  { key: 'listingType', label: 'Listing type', where: 'For Sale, For Rent, New Development… (cards and property page)' },
  { key: 'keyReady', label: 'Key Ready', where: 'Ready-to-move-in properties (cards and property page)' },
  { key: 'featured', label: 'Featured', where: 'Properties marked Featured (cards)' },
  { key: 'own', label: 'Own', where: 'Your own properties (cards)' },
  { key: 'propertyType', label: 'Property type', where: 'Villa, Apartment… (property page photo)' },
  { key: 'reference', label: 'Reference', where: 'The property reference (property page photo)' },
];

export function BadgeSettings({ hidden, onChange }: { hidden: string[]; onChange: (hidden: string[]) => void }) {
  const toggle = (key: string, on: boolean) =>
    onChange(on ? hidden.filter((k) => k !== key) : [...hidden, key]);
  return (
    <SettingBlock
      title="Badges"
      description="The labels shown over the photo on listing cards and the property page. Switch off the ones your website should not show."
    >
      <div className="grid gap-2 sm:grid-cols-2">
        {BADGES.map((b) => (
          <div key={b.key} className="flex items-start justify-between gap-3 rounded-md border p-3">
            <div className="space-y-0.5">
              <Label htmlFor={`badge-${b.key}`}>{b.label}</Label>
              <p className="text-xs text-muted-foreground">{b.where}</p>
            </div>
            <Switch id={`badge-${b.key}`} checked={!hidden.includes(b.key)} onCheckedChange={(on) => toggle(b.key, on)} />
          </div>
        ))}
      </div>
    </SettingBlock>
  );
}
