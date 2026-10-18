'use client';

import { Bookmark, Heart, Save, Star } from 'lucide-react';
import { Input } from '@/components/ui/input';
import type { WidgetSettings } from './use-widget-settings';
import { PurchaseCostsSettings } from './purchase-costs-settings';
import { SiteAgentSettings } from './site-agent-settings';
import { TitlePatternSettings } from './title-pattern-settings';
import { ChoiceButtons, SettingBlock, SwitchRow } from './widget-ui';

// Widget tab → Listing cards and Property page.

export function WidgetCardsSection({ widget }: { widget: WidgetSettings }) {
  const { wishlistIcon, setWishlistIcon, cardShareIcon, setCardShareIcon, titlePatterns, setTitlePatterns, siteLanguages } = widget;
  return (
    <div className="space-y-6">
      <SettingBlock
        title="Wishlist / Favorites Icon"
        description="The icon used for saving properties across the website (listing cards, property page, wishlist)."
      >
        <ChoiceButtons
          value={wishlistIcon}
          onChange={setWishlistIcon}
          options={[
            { value: 'heart', label: 'Heart', icon: <Heart className="h-4 w-4" /> },
            { value: 'star', label: 'Star', icon: <Star className="h-4 w-4" /> },
            { value: 'bookmark', label: 'Bookmark', icon: <Bookmark className="h-4 w-4" /> },
            { value: 'save', label: 'Save', icon: <Save className="h-4 w-4" /> },
          ]}
        />
      </SettingBlock>

      <SwitchRow
        id="card-share-icon"
        title="Share icon on listing cards"
        description="Adds a share icon beside the wishlist heart on every listing card and carousel. Visitors can send the property by WhatsApp, Facebook, X or email, or copy its link. On phones it opens the phone's own share menu."
        checked={cardShareIcon}
        onCheckedChange={setCardShareIcon}
      />

      <TitlePatternSettings value={titlePatterns} onChange={setTitlePatterns} languages={siteLanguages} />
    </div>
  );
}

export function WidgetPropertyPageSection({ widget }: { widget: WidgetSettings }) {
  const {
    mapVariation,
    setMapVariation,
    similarPropertiesLimit,
    setSimilarPropertiesLimit,
    mortgageInterestRate,
    setMortgageInterestRate,
    purchaseCosts,
    setPurchaseCosts,
    siteAgent,
    setSiteAgent,
  } = widget;
  return (
    <div className="space-y-6">
      <SettingBlock
        title="Property Map Display"
        description={'How the property location is shown on the property page map. "Auto" uses the best available data.'}
      >
        <ChoiceButtons
          value={mapVariation}
          onChange={setMapVariation}
          options={[
            { value: 'auto', label: 'Auto (Best Available)', desc: 'Pin → Zip → Location' },
            { value: '0', label: 'Pin + Circle', desc: 'Approximate marker with radius' },
            { value: '1', label: 'Zip Code Area', desc: 'Boundary around postal code' },
            { value: '2', label: 'Location Area', desc: 'Boundary around municipality' },
          ]}
        />
      </SettingBlock>

      <div className="grid gap-6 sm:grid-cols-2">
        <SettingBlock
          title="Similar Properties"
          htmlFor="similar-limit"
          description="How many similar properties the property page shows. 0 hides the section."
        >
          <Input
            id="similar-limit"
            type="number"
            min={0}
            max={20}
            value={similarPropertiesLimit}
            onChange={(e) => setSimilarPropertiesLimit(Number(e.target.value))}
            className="w-28"
          />
        </SettingBlock>
        <SettingBlock
          title="Mortgage Interest Rate (%)"
          htmlFor="mortgage-rate"
          description="The rate the mortgage calculator starts with; visitors can change it. Empty = 3.5%."
        >
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
        </SettingBlock>
      </div>

      <PurchaseCostsSettings value={purchaseCosts} onChange={setPurchaseCosts} />

      <SiteAgentSettings value={siteAgent} onChange={setSiteAgent} />
    </div>
  );
}
