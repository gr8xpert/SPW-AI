'use client';

import { Bookmark, Heart, Save, Star } from 'lucide-react';
import { Input } from '@/components/ui/input';
import type { WidgetSettings } from './use-widget-settings';
import { PurchaseCostsSettings } from './purchase-costs-settings';
import { SiteAgentSettings } from './site-agent-settings';
import { TitlePatternSettings } from './title-pattern-settings';
import { BadgeSettings } from './badge-settings';
import { ChoiceButtons, SettingBlock, SwitchRow } from './widget-ui';
import { useSettingsText } from '../_i18n';

// Widget tab → Listing cards and Property page.

export function WidgetCardsSection({ widget }: { widget: WidgetSettings }) {
  const { wishlistIcon, setWishlistIcon, cardShareIcon, setCardShareIcon, hiddenBadges, setHiddenBadges, titlePatterns, setTitlePatterns, siteLanguages } = widget;
  const t = useSettingsText().cards;
  return (
    <div className="space-y-6">
      <SettingBlock
        title={t.wishlistIcon}
        description={t.wishlistHelp}
      >
        <ChoiceButtons
          value={wishlistIcon}
          onChange={setWishlistIcon}
          options={[
            { value: 'heart', label: t.icons.heart, icon: <Heart className="h-4 w-4" /> },
            { value: 'star', label: t.icons.star, icon: <Star className="h-4 w-4" /> },
            { value: 'bookmark', label: t.icons.bookmark, icon: <Bookmark className="h-4 w-4" /> },
            { value: 'save', label: t.icons.save, icon: <Save className="h-4 w-4" /> },
          ]}
        />
      </SettingBlock>

      <SwitchRow
        id="card-share-icon"
        title={t.shareIcon}
        description={t.shareHelp}
        checked={cardShareIcon}
        onCheckedChange={setCardShareIcon}
      />

      <BadgeSettings hidden={hiddenBadges} onChange={setHiddenBadges} />

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
  const t = useSettingsText().property;
  return (
    <div className="space-y-6">
      <SettingBlock
        title={t.mapDisplay}
        description={t.mapHelp}
      >
        <ChoiceButtons
          value={mapVariation}
          onChange={setMapVariation}
          options={[
            { value: 'auto', ...t.mapOptions.auto },
            { value: '0', ...t.mapOptions.pin },
            { value: '1', ...t.mapOptions.zip },
            { value: '2', ...t.mapOptions.area },
          ]}
        />
      </SettingBlock>

      <div className="grid gap-6 sm:grid-cols-2">
        <SettingBlock
          title={t.similar}
          htmlFor="similar-limit"
          description={t.similarHelp}
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
          title={t.mortgage}
          htmlFor="mortgage-rate"
          description={t.mortgageHelp}
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
