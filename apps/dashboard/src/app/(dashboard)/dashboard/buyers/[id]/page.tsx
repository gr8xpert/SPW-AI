'use client';

import Link from 'next/link';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LockedRouteGuard } from '@/components/locked-route-guard';
import { useBuyerText } from '../_i18n/use-buyer-text';
import { useBuyer, type ApiError } from '../use-buyers';
import { BuyerHeader } from './_components/buyer-header';
import { DetailsTab } from './_components/details-tab';
import { ContactsTab } from './_components/contacts-tab';
import { NotesTab } from './_components/notes-visit-tabs';
import { TripsTab } from './_components/trips-tab';
import { ActivityTab } from './_components/activity-tab';
import { TasksTab } from './_components/tasks-tab';
import { FilesTab } from './_components/files-tab';
import { WishlistTab } from './_components/wishlist-tab';
import { MatchedTab } from './_components/matched-tab';
import { SuggestedTab } from './_components/suggested-tab';
import { HistoryTab } from './_components/history-tab';
import { NearMissesTab } from './_components/near-misses-tab';
import { BuyerPageCard } from './_components/buyer-page-card';
import { SummaryCard } from './_components/ai/summary-card';
import { FeedbackCard } from './_components/ai/feedback-card';

const TABS = ['details', 'wishlist', 'matched', 'nearMisses', 'suggested', 'contacts', 'notes', 'visit', 'tasks', 'files', 'activity', 'history'] as const;
type Tab = (typeof TABS)[number];

function BuyerPageInner() {
  const t = useBuyerText();
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab') as Tab | null;
  const tab: Tab = tabParam && TABS.includes(tabParam) ? tabParam : 'details';
  const buyer = useBuyer(id);

  const back = (
    <Button variant="ghost" size="sm" asChild className="-ml-2">
      <Link href="/dashboard/buyers">
        <ArrowLeft className="mr-1 h-4 w-4" />
        {t.record.back}
      </Link>
    </Button>
  );

  if (buyer.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (buyer.isError || !buyer.data) {
    const notFound = (buyer.error as ApiError | null)?.status === 404;
    return (
      <div className="space-y-4">
        {back}
        <Card>
          <CardContent className="flex items-center justify-between p-6 text-sm">
            <span>{notFound ? t.record.notFound : t.loadFailed}</span>
            {!notFound ? (
              <Button variant="outline" size="sm" onClick={() => buyer.refetch()}>
                {t.retry}
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </div>
    );
  }

  const b = buyer.data;
  const tabName = (k: Tab): string =>
    k === 'tasks' || k === 'files' || k === 'wishlist' || k === 'matched' || k === 'nearMisses' || k === 'suggested' || k === 'history' ? t[k].tab : t.record.tabs[k];
  return (
    <div className="space-y-6">
      {back}
      <BuyerHeader buyer={b} />
      <SummaryCard buyer={b} />
      <Tabs
        value={tab}
        onValueChange={(v) => {
          const next = new URLSearchParams(searchParams.toString());
          if (v === 'details') next.delete('tab');
          else next.set('tab', v);
          const qs = next.toString();
          router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
        }}
      >
        <TabsList className="flex h-auto flex-wrap justify-start">
          {TABS.map((k) => (
            <TabsTrigger key={k} value={k}>
              {tabName(k)}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="details" className="mt-4">
          <DetailsTab buyer={b} />
        </TabsContent>
        <TabsContent value="wishlist" className="mt-4">
          <WishlistTab buyer={b} />
        </TabsContent>
        <TabsContent value="matched" className="mt-4">
          <MatchedTab buyer={b} />
        </TabsContent>
        <TabsContent value="nearMisses" className="mt-4">
          <NearMissesTab buyer={b} />
        </TabsContent>
        <TabsContent value="suggested" className="mt-4">
          <div className="space-y-4">
            <BuyerPageCard buyerId={b.id} />
            <FeedbackCard buyer={b} />
            <SuggestedTab buyer={b} />
          </div>
        </TabsContent>
        <TabsContent value="contacts" className="mt-4">
          <ContactsTab buyer={b} />
        </TabsContent>
        <TabsContent value="notes" className="mt-4">
          <NotesTab buyer={b} />
        </TabsContent>
        <TabsContent value="visit" className="mt-4">
          <TripsTab buyer={b} />
        </TabsContent>
        <TabsContent value="tasks" className="mt-4">
          <TasksTab buyer={b} />
        </TabsContent>
        <TabsContent value="files" className="mt-4">
          <FilesTab buyerId={b.id} />
        </TabsContent>
        <TabsContent value="activity" className="mt-4">
          <ActivityTab buyerId={b.id} />
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <HistoryTab buyerId={b.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function BuyerPage() {
  const t = useBuyerText();
  return (
    <LockedRouteGuard addon="buyerMatch" featureName={t.featureName} description={t.featureDescription}>
      <BuyerPageInner />
    </LockedRouteGuard>
  );
}
