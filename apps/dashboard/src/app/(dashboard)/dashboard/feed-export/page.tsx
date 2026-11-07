'use client';

import { useState, useEffect } from 'react';
import { FileJson, Loader2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { IdealistaCard } from '@/components/feed-export/idealista-card';
import { RightmoveCard } from '@/components/feed-export/rightmove-card';
import { API_URL } from '@/components/feed-export/idealista-api';
import { StatusDot, type ExportStatus } from '@/components/feed-export/export-status';
import { ExportLogCard } from '@/components/feed-export/export-log-card';
import { ExportFeedsTab } from '@/components/feed-export/export-feeds-tab';
import { FeedRunButton, FeedRunNote } from '@/components/feed-export/feed-run-button';
import {
  FeedKeyCard,
  FeedSettingsCard,
  FeedUrlCard,
  type UrlFeedSettings,
} from '@/components/feed-export/url-feed-parts';
import { LockedRouteGuard } from '@/components/locked-route-guard';
import { useFeedExportText } from '@/components/feed-export/_i18n';

type ListingScope = UrlFeedSettings['listingScope'];

// GET /api/dashboard/feed-export: `json` is the JSON feed's own settings and
// key. Kyero XML lives in the Feeds tab (one row per feed).
interface ExportConfig {
  tenantSlug?: string;
  json: {
    enabled: boolean;
    includeUnpublished: boolean;
    includeSold: boolean;
    listingScope: ListingScope;
    propertyIds?: number[];
    apiKey: string;
    propertyCount: number;
  };
}

// The old "kyero" tab moved into Feeds; a saved ?tab=kyero link lands there.
const TABS = ['feeds', 'idealista', 'rightmove', 'json'] as const;
type Tab = (typeof TABS)[number];

// The open tab lives in ?tab= so a refresh or a shared link lands on it.
// Read from window rather than useSearchParams (no Suspense boundary needed).
function tabFromUrl(): Tab {
  if (typeof window === 'undefined') return 'feeds';
  const t = new URLSearchParams(window.location.search).get('tab');
  return (TABS as readonly string[]).includes(t || '') ? (t as Tab) : 'feeds';
}

function jsonSettings(c: ExportConfig): UrlFeedSettings {
  return {
    enabled: !!c.json?.enabled,
    includeUnpublished: !!c.json?.includeUnpublished,
    includeSold: !!c.json?.includeSold,
    listingScope: c.json?.listingScope || 'all',
    propertyIds: c.json?.propertyIds || [],
  };
}

function FeedExportPageInner() {
  const [tab, setTab] = useState<Tab>('feeds');
  const [config, setConfig] = useState<ExportConfig | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Partial<Record<Tab, ExportStatus>>>({});
  const [edits, setEdits] = useState<UrlFeedSettings | null>(null);

  const api = useApi();
  const { toast } = useToast();
  const t = useFeedExportText();

  useEffect(() => setTab(tabFromUrl()), []);

  const changeTab = (v: string) => {
    setTab(v as Tab);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', v);
    window.history.replaceState(null, '', url.toString());
  };

  // 'counts' refreshes the numbers and leaves the form alone.
  const fetchConfig = async (only?: 'counts') => {
    try {
      const res = await api.get('/api/dashboard/feed-export');
      const body: ExportConfig | null = res?.data || res;
      setConfig(body);
      if (body && only !== 'counts') setEdits(jsonSettings(body));
    } catch {
      setConfig(null);
    }
  };

  // Wait for the session to hydrate before firing. With `[]` deps and no guard
  // these ran on mount, before `useApi` had an access token, so both requests
  // went out with no Authorization header and 401'd — and never re-ran once the
  // token arrived. Gating on `api.isReady` re-runs the effect at hydration.
  useEffect(() => {
    if (!api.isReady) return;
    fetchConfig();
  }, [api.isReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!edits) return;
    setSaving(true);
    try {
      await api.put('/api/dashboard/feed-export/json', {
        enabled: edits.enabled,
        includeUnpublished: edits.includeUnpublished,
        includeSold: edits.includeSold,
        listingScope: edits.listingScope,
        propertyIds: edits.propertyIds,
      });
      toast({ title: t.page.settingsSaved('JSON') });
      fetchConfig();
    } catch (e: any) {
      toast({ title: t.page.saveFailed, description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const regenerateKey = async () => {
    try {
      await api.post('/api/dashboard/feed-export/json/regenerate-key');
      toast({ title: t.page.keyRegenerated('JSON'), description: t.page.oldUrlDead('JSON') });
      fetchConfig();
    } catch (e: any) {
      toast({ title: t.page.regenerateFailed, description: e.message, variant: 'destructive' });
    }
  };

  const copyToClipboard = (text: string, type: string, description: string) => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    toast({ title: t.page.copied, description });
    setTimeout(() => setCopied(null), 2000);
  };

  const reportStatus = (which: Tab) => (s: ExportStatus) =>
    setStatus((prev) => (prev[which] === s ? prev : { ...prev, [which]: s }));

  const tenantSlug = config?.tenantSlug || 'my-agency';
  // Integrations may only be able to fetch a URL, so the key goes in it.
  const feedUrl = (key: string) =>
    `${API_URL}/api/feed/${tenantSlug}/properties.json${key ? `?key=${encodeURIComponent(key)}` : ''}`;

  // Dots follow the saved config, not unsaved switch flips.
  const jsonOn = !!config?.json?.enabled;
  const dots: Partial<Record<Tab, ExportStatus>> = config ? { ...status, json: jsonOn ? 'on' : 'off' } : status;
  const key = config?.json?.apiKey || '';

  // Inactive tabs stay mounted (hidden) so each card loads once, reports its
  // dot, and keeps unsaved edits when the user switches tabs.
  const contentCls = 'space-y-6 mt-6 data-[state=inactive]:hidden';

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t.page.title}</h1>
          <p className="page-description mt-1">{t.page.description}</p>
        </div>
      </div>

      {api.isLoading && !config ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Tabs value={tab} onValueChange={changeTab}>
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="feeds"><StatusDot status={dots.feeds} />{t.feeds.title}</TabsTrigger>
            <TabsTrigger value="idealista"><StatusDot status={dots.idealista} />idealista</TabsTrigger>
            <TabsTrigger value="rightmove"><StatusDot status={dots.rightmove} />Rightmove</TabsTrigger>
            <TabsTrigger value="json"><StatusDot status={dots.json} />JSON</TabsTrigger>
          </TabsList>

          <TabsContent value="feeds" forceMount className={contentCls}>
            <ExportFeedsTab ready={api.isReady} onStatus={reportStatus('feeds')} />
          </TabsContent>

          <TabsContent value="idealista" forceMount className={contentCls}>
            <IdealistaCard onStatus={reportStatus('idealista')} />
            <ExportLogCard feedName="idealista" format="idealista" />
          </TabsContent>

          <TabsContent value="rightmove" forceMount className={contentCls}>
            <RightmoveCard onStatus={reportStatus('rightmove')} />
          </TabsContent>

          <TabsContent value="json" forceMount className={contentCls}>
            <FeedUrlCard
              icon={<FileJson className="h-5 w-5" />}
              title={t.page.jsonFeed}
              description={t.page.jsonDescription}
              shownUrl={feedUrl(showKey ? key : key ? '***' : '')}
              url={feedUrl(key)}
              propertyCount={config?.json?.propertyCount ?? 0}
              enabled={jsonOn}
              note={<FeedRunNote enabled={jsonOn} />}
              action={
                <FeedRunButton url="/api/dashboard/feed-export/json/run" enabled={jsonOn} onDone={() => fetchConfig('counts')} />
              }
              copied={copied === 'JSON URL'}
              onCopy={() => copyToClipboard(feedUrl(key), 'JSON URL', t.page.urlCopied('JSON'))}
            />
            {edits && (
              <FeedSettingsCard
                feedName="JSON"
                settings={edits}
                onChange={setEdits}
                onSave={save}
                saving={saving}
              />
            )}
            <FeedKeyCard
              feedName="JSON"
              apiKey={key}
              plainUrl={feedUrl('')}
              showKey={showKey}
              onToggleShow={() => setShowKey(!showKey)}
              copied={copied === 'JSON key'}
              onCopy={() => copyToClipboard(key, 'JSON key', t.page.keyCopied('JSON'))}
              onRegenerate={regenerateKey}
            />
            <ExportLogCard feedName="JSON" format="json" />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

export default function FeedExportPage() {
  const t = useFeedExportText();
  return (
    <LockedRouteGuard addon="feedExport" featureName={t.page.title}>
      <FeedExportPageInner />
    </LockedRouteGuard>
  );
}
