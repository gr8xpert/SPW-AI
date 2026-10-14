'use client';

import { useState, useEffect } from 'react';
import { FileJson, FileCode, Loader2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { IdealistaCard } from '@/components/feed-export/idealista-card';
import { RightmoveCard } from '@/components/feed-export/rightmove-card';
import { API_URL } from '@/components/feed-export/idealista-api';
import { StatusDot, type ExportStatus } from '@/components/feed-export/export-status';
import {
  AccessLogCard,
  FeedKeyCard,
  FeedSettingsCard,
  FeedUrlCard,
  type ExportLog,
  type UrlFeedSettings,
} from '@/components/feed-export/url-feed-parts';
import { LockedRouteGuard } from '@/components/locked-route-guard';

// GET /api/dashboard/feed-export: the top-level fields are the Kyero XML
// feed's; `json` is the JSON feed's own settings and key.
interface ExportConfig {
  isEnabled: boolean;
  includeUnpublished: boolean;
  listingScope?: 'all' | 'own';
  cacheTtl: number;
  apiKey: string;
  tenantSlug?: string;
  propertyCount?: number;
  skippedCount?: number;
  skipped?: Array<{ reference: string; reason: string }>;
  json: {
    enabled: boolean;
    includeUnpublished: boolean;
    includeSold: boolean;
    listingScope: 'all' | 'own';
    apiKey: string;
    propertyCount: number;
  };
}

type UrlFeed = 'kyero' | 'json';

const TABS = ['idealista', 'rightmove', 'kyero', 'json'] as const;
type Tab = (typeof TABS)[number];

// The open tab lives in ?tab= so a refresh or a shared link lands on it.
// Read from window rather than useSearchParams (no Suspense boundary needed).
function tabFromUrl(): Tab {
  if (typeof window === 'undefined') return 'idealista';
  const t = new URLSearchParams(window.location.search).get('tab');
  return (TABS as readonly string[]).includes(t || '') ? (t as Tab) : 'idealista';
}

function kyeroSettings(c: ExportConfig): UrlFeedSettings {
  return {
    enabled: !!c.isEnabled,
    includeUnpublished: !!c.includeUnpublished,
    includeSold: false,
    listingScope: c.listingScope === 'own' ? 'own' : 'all',
    cacheTtl: c.cacheTtl || 3600,
  };
}

function jsonSettings(c: ExportConfig): UrlFeedSettings {
  return {
    enabled: !!c.json?.enabled,
    includeUnpublished: !!c.json?.includeUnpublished,
    includeSold: !!c.json?.includeSold,
    listingScope: c.json?.listingScope === 'own' ? 'own' : 'all',
  };
}

function FeedExportPageInner() {
  const [tab, setTab] = useState<Tab>('idealista');
  const [config, setConfig] = useState<ExportConfig | null>(null);
  const [logs, setLogs] = useState<ExportLog[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [showKey, setShowKey] = useState<UrlFeed | null>(null);
  const [saving, setSaving] = useState<UrlFeed | null>(null);
  const [status, setStatus] = useState<Partial<Record<Tab, ExportStatus>>>({});
  const [edits, setEdits] = useState<Record<UrlFeed, UrlFeedSettings> | null>(null);

  const api = useApi();
  const { toast } = useToast();

  useEffect(() => setTab(tabFromUrl()), []);

  const changeTab = (v: string) => {
    setTab(v as Tab);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', v);
    window.history.replaceState(null, '', url.toString());
  };

  // `only` refreshes one feed's form and leaves unsaved edits on the other.
  const fetchConfig = async (only?: UrlFeed) => {
    try {
      const res = await api.get('/api/dashboard/feed-export');
      const body: ExportConfig | null = res?.data || res;
      setConfig(body);
      if (body) {
        setEdits((prev) => {
          const fresh = { kyero: kyeroSettings(body), json: jsonSettings(body) };
          if (!prev || !only) return fresh;
          return { ...prev, [only]: fresh[only] };
        });
      }
    } catch {
      setConfig(null);
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await api.get('/api/dashboard/feed-export/logs?days=7');
      const body = res?.data || res;
      setLogs(Array.isArray(body) ? body : body.data || []);
    } catch {
      setLogs([]);
    }
  };

  // Wait for the session to hydrate before firing. With `[]` deps and no guard
  // these ran on mount, before `useApi` had an access token, so both requests
  // went out with no Authorization header and 401'd — and never re-ran once the
  // token arrived. Gating on `api.isReady` re-runs the effect at hydration.
  useEffect(() => {
    if (!api.isReady) return;
    fetchConfig();
    fetchLogs();
  }, [api.isReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (feed: UrlFeed) => {
    if (!edits) return;
    const s = edits[feed];
    setSaving(feed);
    try {
      if (feed === 'kyero') {
        await api.put('/api/dashboard/feed-export', {
          isEnabled: s.enabled,
          includeUnpublished: s.includeUnpublished,
          listingScope: s.listingScope,
          cacheTtl: s.cacheTtl,
        });
      } else {
        await api.put('/api/dashboard/feed-export/json', {
          enabled: s.enabled,
          includeUnpublished: s.includeUnpublished,
          includeSold: s.includeSold,
          listingScope: s.listingScope,
        });
      }
      toast({ title: `${feed === 'kyero' ? 'Kyero XML' : 'JSON'} settings saved` });
      fetchConfig(feed);
    } catch (e: any) {
      toast({ title: 'Failed to save', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(null);
    }
  };

  const regenerateKey = async (feed: UrlFeed) => {
    const name = feed === 'kyero' ? 'Kyero XML' : 'JSON';
    try {
      await api.post(feed === 'kyero' ? '/api/dashboard/feed-export/regenerate-key' : '/api/dashboard/feed-export/json/regenerate-key');
      toast({ title: `${name} key regenerated`, description: `The old ${name} URL no longer works.` });
      fetchConfig(feed);
    } catch (e: any) {
      toast({ title: 'Failed to regenerate', description: e.message, variant: 'destructive' });
    }
  };

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    toast({ title: 'Copied to clipboard', description: `${type} copied.` });
    setTimeout(() => setCopied(null), 2000);
  };

  const reportStatus = (t: Tab) => (s: ExportStatus) =>
    setStatus((prev) => (prev[t] === s ? prev : { ...prev, [t]: s }));

  const tenantSlug = config?.tenantSlug || 'my-agency';
  // Portals (Kyero etc.) can only fetch a URL, so the key goes in it.
  const feedUrl = (file: string, key: string) =>
    `${API_URL}/api/feed/${tenantSlug}/${file}${key ? `?key=${encodeURIComponent(key)}` : ''}`;

  // Dots follow the saved config, not unsaved switch flips.
  const kyeroOn = !!config?.isEnabled;
  const jsonOn = !!config?.json?.enabled;
  const dots: Partial<Record<Tab, ExportStatus>> = config
    ? { ...status, kyero: !kyeroOn ? 'off' : config.skippedCount ? 'warn' : 'on', json: jsonOn ? 'on' : 'off' }
    : status;

  const urlFeedTab = (feed: UrlFeed) => {
    const isKyero = feed === 'kyero';
    const name = isKyero ? 'Kyero XML' : 'JSON';
    const file = isKyero ? 'properties.xml' : 'properties.json';
    const key = (isKyero ? config?.apiKey : config?.json?.apiKey) || '';
    const shownKey = showKey === feed ? key : key ? '***' : '';
    return (
      <>
        <FeedUrlCard
          icon={isKyero ? <FileCode className="h-5 w-5" /> : <FileJson className="h-5 w-5" />}
          title={isKyero ? 'Kyero XML' : 'JSON feed'}
          description={isKyero
            ? 'Kyero XML v3 — give this URL to Kyero or any portal that reads Kyero XML'
            : 'Your listings as JSON, for custom integrations and developers'}
          shownUrl={feedUrl(file, shownKey)}
          url={feedUrl(file, key)}
          propertyCount={(isKyero ? config?.propertyCount : config?.json?.propertyCount) ?? 0}
          enabled={isKyero ? kyeroOn : jsonOn}
          copied={copied === `${name} URL`}
          onCopy={() => copyToClipboard(feedUrl(file, key), `${name} URL`)}
        >
          {isKyero && !!config?.skippedCount && (
            <details className="rounded-md border p-3 text-sm">
              <summary className="cursor-pointer">{config.skippedCount} listing(s) left out of the Kyero feed</summary>
              <ul className="mt-2 space-y-1 text-muted-foreground">
                {(config.skipped || []).map((s) => (
                  <li key={s.reference}><span className="font-mono">{s.reference}</span> — {s.reason}</li>
                ))}
              </ul>
            </details>
          )}
        </FeedUrlCard>
        {edits && (
          <FeedSettingsCard
            feedName={name}
            settings={edits[feed]}
            onChange={(s) => setEdits({ ...edits, [feed]: s })}
            onSave={() => save(feed)}
            saving={saving === feed}
          />
        )}
        <FeedKeyCard
          feedName={name}
          apiKey={key}
          plainUrl={feedUrl(file, '')}
          showKey={showKey === feed}
          onToggleShow={() => setShowKey(showKey === feed ? null : feed)}
          copied={copied === `${name} key`}
          onCopy={() => copyToClipboard(key, `${name} key`)}
          onRegenerate={() => regenerateKey(feed)}
        />
        <AccessLogCard feedName={name} logs={logs.filter((l) => l.format === (isKyero ? 'xml' : 'json'))} />
      </>
    );
  };

  // Inactive tabs stay mounted (hidden) so each card loads once, reports its
  // dot, and keeps unsaved edits when the user switches tabs.
  const contentCls = 'space-y-6 mt-6 data-[state=inactive]:hidden';

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Feed Export</h1>
          <p className="page-description mt-1">Send your properties to portals — each tab is one portal or feed</p>
        </div>
      </div>

      {api.isLoading && !config ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Tabs value={tab} onValueChange={changeTab}>
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="idealista"><StatusDot status={dots.idealista} />idealista</TabsTrigger>
            <TabsTrigger value="rightmove"><StatusDot status={dots.rightmove} />Rightmove</TabsTrigger>
            <TabsTrigger value="kyero"><StatusDot status={dots.kyero} />Kyero XML</TabsTrigger>
            <TabsTrigger value="json"><StatusDot status={dots.json} />JSON</TabsTrigger>
          </TabsList>

          <TabsContent value="idealista" forceMount className={contentCls}>
            <IdealistaCard onStatus={reportStatus('idealista')} />
          </TabsContent>

          <TabsContent value="rightmove" forceMount className={contentCls}>
            <RightmoveCard onStatus={reportStatus('rightmove')} />
          </TabsContent>

          <TabsContent value="kyero" forceMount className={contentCls}>
            {urlFeedTab('kyero')}
          </TabsContent>

          <TabsContent value="json" forceMount className={contentCls}>
            {urlFeedTab('json')}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

export default function FeedExportPage() {
  return (
    <LockedRouteGuard addon="feedExport" featureName="Feed Export">
      <FeedExportPageInner />
    </LockedRouteGuard>
  );
}
