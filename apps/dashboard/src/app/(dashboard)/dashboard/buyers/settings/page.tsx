'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LockedRouteGuard } from '@/components/locked-route-guard';
import { useBuyerText } from '../_i18n/use-buyer-text';
import { BuyersNav } from '../_components/buyers-nav';
import { GeneralSettings } from './_components/general-settings';
import { StagesSettings } from './_components/stages-settings';
import { QuestionsSettings } from './_components/questions-settings';
import { MatchWeightsSettings } from './_components/match-weights-settings';
import { UrlPatternSettings } from './_components/url-pattern-settings';
import { PageUrlSettings } from './_components/page-url-settings';
import { AlertSettings, NearMissSettings } from './_components/alerts-settings';
import { HousekeepingSettings } from './_components/housekeeping-settings';
import { MetaSettingsCard } from './_components/meta-settings';
import { CalendarSettings } from './_components/calendar-settings';
import { useCalendarText } from '../_i18n/calendar';

const MANAGER_ROLES = new Set(['admin', 'webmaster', 'super_admin']);
const TABS = ['general', 'stages', 'questions', 'weights', 'alerts', 'housekeeping', 'meta', 'calendar'] as const;
const MANAGER_TABS = new Set<string>(['housekeeping', 'meta']);
type Tab = (typeof TABS)[number];

function BuyerSettingsInner() {
  const t = useBuyerText();
  const s = t.settingsPage;
  const cal = useCalendarText();
  const { data: session } = useSession();
  const canEdit = MANAGER_ROLES.has(String(session?.user?.role ?? ''));
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const param = searchParams.get('tab') as Tab | null;
  const tab: Tab = param && TABS.includes(param) ? param : 'general';

  return (
    <div className="space-y-6">
      <div className="page-header animate-fade-in">
        <div>
          <h1 className="page-title">{s.title}</h1>
          <p className="page-description mt-1">{s.description}</p>
        </div>
      </div>
      <BuyersNav />
      {!canEdit ? <p className="max-w-3xl rounded-md border bg-muted/40 p-3 text-sm">{s.adminsOnly}</p> : null}
      <Tabs
        value={tab}
        onValueChange={(v) => {
          const next = new URLSearchParams(searchParams.toString());
          if (v === 'general') next.delete('tab');
          else next.set('tab', v);
          const qs = next.toString();
          router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
        }}
      >
        <TabsList>
          {TABS.filter((k) => !MANAGER_TABS.has(k) || canEdit).map((k) => (
            <TabsTrigger key={k} value={k}>
              {k === 'calendar' ? cal.tab : s.tabs[k]}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="general" className="mt-4">
          <div className="space-y-6">
            <GeneralSettings canEdit={canEdit} />
            <UrlPatternSettings canEdit={canEdit} />
            <PageUrlSettings canEdit={canEdit} />
          </div>
        </TabsContent>
        <TabsContent value="stages" className="mt-4">
          <StagesSettings canEdit={canEdit} />
        </TabsContent>
        <TabsContent value="questions" className="mt-4">
          <QuestionsSettings canEdit={canEdit} />
        </TabsContent>
        <TabsContent value="weights" className="mt-4">
          <MatchWeightsSettings canEdit={canEdit} />
        </TabsContent>
        <TabsContent value="calendar" className="mt-4">
          <CalendarSettings canEdit={canEdit} />
        </TabsContent>
        <TabsContent value="meta" className="mt-4">
          <MetaSettingsCard canEdit={canEdit} />
        </TabsContent>
        <TabsContent value="housekeeping" className="mt-4">
          <HousekeepingSettings canEdit={canEdit} />
        </TabsContent>
        <TabsContent value="alerts" className="mt-4">
          <div className="space-y-6">
            <AlertSettings canEdit={canEdit} />
            <NearMissSettings canEdit={canEdit} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function BuyerSettingsPage() {
  const t = useBuyerText();
  return (
    <LockedRouteGuard addon="buyerMatch" featureName={t.featureName} description={t.featureDescription}>
      <BuyerSettingsInner />
    </LockedRouteGuard>
  );
}
