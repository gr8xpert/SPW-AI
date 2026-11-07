'use client';

import { LockedRouteGuard } from '@/components/locked-route-guard';
import { CampaignsNav } from '../_components/campaigns-nav';
import { MailerLiteCard } from '../_components/mailerlite/mailerlite-card';
import { useCampaignsText } from '../_i18n';
import { useMailerLiteText } from '../_components/mailerlite/_i18n';

export default function MailerLitePage() {
  const t = useCampaignsText();
  const m = useMailerLiteText();
  return (
    <LockedRouteGuard addon="emailCampaign" featureName={t.featureName}>
      <div className="space-y-6">
        <div className="page-header animate-fade-in">
          <div>
            <h1 className="page-title">{t.title}</h1>
            <p className="page-description mt-1">{m.description}</p>
          </div>
        </div>
        <CampaignsNav />
        <div className="max-w-3xl">
          <MailerLiteCard />
        </div>
      </div>
    </LockedRouteGuard>
  );
}
