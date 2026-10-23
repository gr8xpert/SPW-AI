'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Check, ExternalLink, Loader2, Maximize2, Palette } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { apiGet, apiPost, apiPut } from '@/lib/api';
import { templateName, useWebsiteDesignText } from './_i18n';

type Kind = 'search' | 'listing' | 'detail' | 'map' | 'carousel';
type SiteTemplates = Partial<Record<Kind, string>>;

const WIDGET_URL = (process.env.NEXT_PUBLIC_WIDGET_URL || 'https://spw-ai.com/widget').replace(/\/$/, '');
const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');
const PREVIEW_WIDTH = 1280;

// Tab names, intros and design names are in the page text (by kind and id).
// `wp` = the page text has its own WordPress note for this block (the
// plugin's pages don't carry it).
const range = (kind: Kind, count: number) =>
  Array.from({ length: count }, (_, i) => ({ id: `${kind}-template-${String(i + 1).padStart(2, '0')}` }));
const KINDS: Array<{ kind: Kind; snippet: string; wp?: boolean; templates: Array<{ id: string }> }> = [
  { kind: 'search', snippet: '<div data-spm-widget="site-search"></div>', templates: range('search', 7) },
  { kind: 'listing', snippet: '<div data-spm-widget="site-listing"></div>', templates: range('listing', 17) },
  { kind: 'map', snippet: '<div data-spm-widget="site-map"></div>', templates: range('map', 3) },
  { kind: 'detail', snippet: '<div data-spm-widget="site-detail"></div>', templates: range('detail', 2) },
  {
    kind: 'carousel',
    snippet: '<div data-spm-widget="site-carousel" data-spm-featured="yes"></div>',
    wp: true,
    templates: range('carousel', 6),
  },
];

const COLOR_PRESETS = ['#2563eb', '#0f766e', '#15803d', '#b45309', '#c89a3c', '#b91c1c', '#7c3aed', '#1e293b'];
const isHex = (v: string) => /^#[0-9a-f]{6}$/i.test(v);

// preview.html is served without cache headers, so a browser may keep an old
// copy for days after a widget release (10-05: new carousel designs showed
// "Preview unavailable"). A query that changes every hour fetches it again.
function previewRevision() {
  return Math.floor(Date.now() / 36e5);
}

function previewUrl(template: string, token: string, color: string) {
  const hash = new URLSearchParams({ t: template, k: token, api: API_URL });
  if (isHex(color)) hash.set('color', color);
  return `${WIDGET_URL}/preview.html?v=${previewRevision()}#${hash.toString()}`;
}

// A desktop-width render of the template, scaled down to fit its card.
function TemplatePreview({ src, maxHeight, title }: { src: string; maxHeight: number; title: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [scale, setScale] = useState(0.3);
  const [contentHeight, setContentHeight] = useState(700);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const ro = new ResizeObserver(() => setScale(box.clientWidth / PREVIEW_WIDTH));
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frameRef.current?.contentWindow) return;
      const h = Number((e.data as { height?: number })?.height);
      if (Number.isFinite(h) && h > 0) setContentHeight(Math.min(h, 4000));
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const shown = Math.min(contentHeight, maxHeight);
  return (
    <div ref={boxRef} className="relative w-full overflow-hidden rounded-md border bg-white" style={{ height: shown * scale }}>
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      )}
      <iframe
        ref={frameRef}
        src={src}
        title={title}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
        style={{ width: PREVIEW_WIDTH, height: shown, transform: `scale(${scale})` }}
        sandbox="allow-scripts allow-same-origin"
      />
    </div>
  );
}

export default function WebsiteDesignPage() {
  const { data: session } = useSession();
  const { toast } = useToast();
  const t = useWebsiteDesignText();
  const [token, setToken] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState(false);
  const [templates, setTemplates] = useState<SiteTemplates>({});
  const [savedColor, setSavedColor] = useState('#2563eb');
  const [color, setColor] = useState('#2563eb');
  const [saving, setSaving] = useState<string | null>(null);
  const [enlarged, setEnlarged] = useState<{ id: string } | null>(null);
  // Previews wait for the saved colour, so they don't load twice.
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  // Super Admin add-on: off = map blocks don't show on the website.
  const [mapSearch, setMapSearch] = useState(true);
  // Previews follow the colour field after a short pause, not every keystroke.
  const [previewColor, setPreviewColor] = useState('#2563eb');
  useEffect(() => {
    const timer = setTimeout(() => setPreviewColor(color), 500);
    return () => clearTimeout(timer);
  }, [color]);
  // Changes whenever something is saved, so previews reload with it.
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!session?.accessToken) return;
    apiGet<{ data: { settings?: { siteTemplates?: SiteTemplates; primaryColor?: string }; mapSearch?: boolean } }>('/api/dashboard/tenant')
      .then((res) => {
        const s = res.data?.settings;
        setMapSearch(res.data?.mapSearch !== false);
        if (s?.siteTemplates) setTemplates(s.siteTemplates);
        if (s?.primaryColor && isHex(s.primaryColor)) {
          setSavedColor(s.primaryColor);
          setColor(s.primaryColor);
          setPreviewColor(s.primaryColor);
        }
      })
      .catch(() => {})
      .finally(() => setSettingsLoaded(true));
    apiPost<{ data: { token: string } }>('/api/dashboard/tenant/preview-token')
      .then((res) => setToken(res.data?.token ?? null))
      .catch(() => setTokenError(true));
  }, [session?.accessToken]);

  const choose = useCallback(
    async (kind: Kind, id: string) => {
      setSaving(id);
      const next = { ...templates, [kind]: id };
      try {
        await apiPut('/api/dashboard/tenant/settings', { siteTemplates: next });
        setTemplates(next);
        toast({ title: t.designUpdated, description: t.designUpdatedText });
      } catch (err) {
        toast({ title: t.couldNotSave, description: (err as Error).message, variant: 'destructive' });
      } finally {
        setSaving(null);
      }
    },
    [templates, toast, t],
  );

  const saveColor = async () => {
    if (!isHex(color)) return;
    setSaving('color');
    try {
      await apiPut('/api/dashboard/tenant/settings', { primaryColor: color });
      setSavedColor(color);
      setRevision((r) => r + 1);
      toast({ title: t.colourSaved, description: t.colourSavedText });
    } catch (err) {
      toast({ title: t.couldNotSave, description: (err as Error).message, variant: 'destructive' });
    } finally {
      setSaving(null);
    }
  };

  const current = (kind: Kind) => templates[kind] || `${kind}-template-01`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t.title}</h1>
        <p className="text-muted-foreground">{t.description}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Palette className="h-5 w-5" /> {t.brandColour}
          </CardTitle>
          <CardDescription>{t.brandColourDescription}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <input
            type="color"
            value={isHex(color) ? color : '#2563eb'}
            onChange={(e) => setColor(e.target.value)}
            className="h-10 w-14 cursor-pointer rounded border"
            aria-label={t.brandColour}
          />
          <Input value={color} onChange={(e) => setColor(e.target.value.trim())} className="w-28 font-mono" data-testid="brand-color-input" />
          <div className="flex gap-2">
            {COLOR_PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                className={`h-8 w-8 rounded-full border-2 transition-transform hover:scale-110 ${color.toLowerCase() === c ? 'scale-110 border-foreground' : 'border-transparent'}`}
                style={{ backgroundColor: c }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
          <Button onClick={saveColor} disabled={!isHex(color) || color.toLowerCase() === savedColor.toLowerCase() || saving === 'color'}>
            {saving === 'color' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t.saveColour}
          </Button>
          {!isHex(color) && <span className="text-sm text-destructive">{t.colourHint}</span>}
        </CardContent>
      </Card>

      {tokenError && (
        <Card className="border-destructive/40">
          <CardContent className="py-4 text-sm text-destructive">
            {t.previewsFailed}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="listing">
        <TabsList className="flex-wrap">
          {KINDS.map((k) => (
            <TabsTrigger key={k.kind} value={k.kind} data-testid={`tab-${k.kind}`}>
              {t.kinds[k.kind].tab}
            </TabsTrigger>
          ))}
        </TabsList>

        {KINDS.map((k) => (
          <TabsContent key={k.kind} value={k.kind} className="space-y-4">
            <p className="text-sm text-muted-foreground">{t.kinds[k.kind].intro}</p>
            {k.kind === 'map' && !mapSearch && (
              <p data-testid="map-off" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
                {t.mapOff}
              </p>
            )}
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {k.templates.map((tpl) => {
                const active = current(k.kind) === tpl.id;
                const name = templateName(t, tpl.id);
                return (
                  <Card key={tpl.id} data-testid={`template-${tpl.id}`} className={active ? 'border-primary ring-2 ring-primary/30' : ''}>
                    <CardContent className="space-y-3 p-3">
                      {token && settingsLoaded ? (
                        <TemplatePreview
                          // A new colour means a new frame: changing only the URL hash wouldn't reload it.
                          key={`${tpl.id}-${revision}-${previewColor}`}
                          src={previewUrl(tpl.id, token, previewColor)}
                          maxHeight={k.kind === 'detail' ? 1400 : 900}
                          title={name}
                        />
                      ) : (
                        <div className="flex h-40 items-center justify-center rounded-md border text-muted-foreground">
                          {tokenError ? t.noPreview : <Loader2 className="h-5 w-5 animate-spin" />}
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate font-medium">{name}</div>
                          <div className="text-xs text-muted-foreground">{tpl.id.replace(/-/g, ' ')}</div>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button variant="ghost" size="icon" title={t.viewLarger} onClick={() => setEnlarged(tpl)} disabled={!token}>
                            <Maximize2 className="h-4 w-4" />
                          </Button>
                          {active ? (
                            <Button size="sm" variant="secondary" disabled data-testid="in-use">
                              <Check className="mr-1 h-4 w-4" /> {t.inUse}
                            </Button>
                          ) : (
                            <Button size="sm" onClick={() => choose(k.kind, tpl.id)} disabled={saving !== null} data-testid="use-this">
                              {saving === tpl.id ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                              {t.useThis}
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
            <Card className="bg-muted/40">
              <CardContent className="space-y-1 py-4 text-sm">
                <div className="font-medium">{t.whereTitle}</div>
                <p className="text-muted-foreground">
                  {k.wp ? t.carouselWp : t.wpDefault} {t.otherSitesBefore}{' '}
                  <code className="rounded bg-background px-1 py-0.5 text-xs">{k.snippet}</code> {t.otherSitesAfter}
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      <Dialog open={!!enlarged} onOpenChange={(open) => !open && setEnlarged(null)}>
        <DialogContent className="max-w-6xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {enlarged && templateName(t, enlarged.id)}
              {enlarged && token && (
                <a href={previewUrl(enlarged.id, token, color)} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground" title={t.openInNewTab}>
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </DialogTitle>
          </DialogHeader>
          {enlarged && token && (
            <div className="max-h-[75vh] overflow-y-auto">
              <TemplatePreview key={previewColor} src={previewUrl(enlarged.id, token, previewColor)} maxHeight={4000} title={templateName(t, enlarged.id)} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
