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

type Kind = 'search' | 'listing' | 'detail' | 'map';
type SiteTemplates = Partial<Record<Kind, string>>;

const WIDGET_URL = (process.env.NEXT_PUBLIC_WIDGET_URL || 'https://spw-ai.com/widget').replace(/\/$/, '');
const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');
const PREVIEW_WIDTH = 1280;

const KINDS: Array<{ kind: Kind; tab: string; intro: string; snippet: string; templates: Array<{ id: string; name: string }> }> = [
  {
    kind: 'search',
    tab: 'Search box',
    intro: 'The search form above your property results and on your homepage.',
    snippet: '<div data-spm-widget="site-search"></div>',
    templates: [
      ['01', 'Compact horizontal'],
      ['02', 'Single row with more filters'],
      ['03', 'With reference search'],
      ['04', 'Capsule'],
      ['05', 'Card panel'],
      ['06', 'Minimal hero'],
    ].map(([n, name]) => ({ id: `search-template-${n}`, name })),
  },
  {
    kind: 'listing',
    tab: 'Property results',
    intro: 'How each property card looks in your search results.',
    snippet: '<div data-spm-widget="site-listing"></div>',
    templates: [
      ['01', 'Classic card'],
      ['02', 'Photo overlay'],
      ['03', 'Blend bottom'],
      ['04', 'Compact padded'],
      ['05', 'Showcase'],
      ['06', 'Elegant round action'],
      ['07', 'Immersive panel'],
      ['08', 'Country style'],
      ['09', 'Rustic icons'],
      ['10', 'Metro band'],
      ['11', 'Classic card (variant)'],
      ['12', 'Location first'],
    ].map(([n, name]) => ({ id: `listing-template-${n}`, name })),
  },
  {
    kind: 'map',
    tab: 'Map search',
    intro: 'Search on a map. Shown on any page that has the map search block.',
    snippet: '<div data-spm-widget="site-map"></div>',
    templates: [
      ['01', 'Area chips and full-width map'],
      ['02', 'Area search with map or list'],
      ['03', 'Map beside the results list'],
    ].map(([n, name]) => ({ id: `map-template-${n}`, name })),
  },
  {
    kind: 'detail',
    tab: 'Property page',
    intro: 'The page a visitor sees after clicking a property.',
    snippet: '<div data-spm-widget="site-detail"></div>',
    templates: [{ id: 'detail-template-01', name: 'Standard property page' }],
  },
];

const COLOR_PRESETS = ['#2563eb', '#0f766e', '#15803d', '#b45309', '#c89a3c', '#b91c1c', '#7c3aed', '#1e293b'];
const isHex = (v: string) => /^#[0-9a-f]{6}$/i.test(v);

function previewUrl(template: string, token: string, color: string) {
  const hash = new URLSearchParams({ t: template, k: token, api: API_URL });
  if (isHex(color)) hash.set('color', color);
  return `${WIDGET_URL}/preview.html#${hash.toString()}`;
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
  const [token, setToken] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState(false);
  const [templates, setTemplates] = useState<SiteTemplates>({});
  const [savedColor, setSavedColor] = useState('#2563eb');
  const [color, setColor] = useState('#2563eb');
  const [saving, setSaving] = useState<string | null>(null);
  const [enlarged, setEnlarged] = useState<{ id: string; name: string } | null>(null);
  // Previews wait for the saved colour, so they don't load twice.
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  // Previews follow the colour field after a short pause, not every keystroke.
  const [previewColor, setPreviewColor] = useState('#2563eb');
  useEffect(() => {
    const t = setTimeout(() => setPreviewColor(color), 500);
    return () => clearTimeout(t);
  }, [color]);
  // Changes whenever something is saved, so previews reload with it.
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!session?.accessToken) return;
    apiGet<{ data: { settings?: { siteTemplates?: SiteTemplates; primaryColor?: string } } }>('/api/dashboard/tenant')
      .then((res) => {
        const s = res.data?.settings;
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
        toast({ title: 'Design updated', description: 'Your website shows the new design within a minute.' });
      } catch (err) {
        toast({ title: 'Could not save', description: (err as Error).message, variant: 'destructive' });
      } finally {
        setSaving(null);
      }
    },
    [templates, toast],
  );

  const saveColor = async () => {
    if (!isHex(color)) return;
    setSaving('color');
    try {
      await apiPut('/api/dashboard/tenant/settings', { primaryColor: color });
      setSavedColor(color);
      setRevision((r) => r + 1);
      toast({ title: 'Brand colour saved', description: 'Buttons, prices and highlights on your website now use it.' });
    } catch (err) {
      toast({ title: 'Could not save', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setSaving(null);
    }
  };

  const current = (kind: Kind) => templates[kind] || `${kind}-template-01`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Website Design</h1>
        <p className="text-muted-foreground">
          Pick how property search and listings look on your website. The previews use your own properties. Your
          website follows your choice automatically &mdash; no need to edit pages.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Palette className="h-5 w-5" /> Brand colour
          </CardTitle>
          <CardDescription>Used for buttons, prices, map markers and highlights. The previews below show it straight away.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <input
            type="color"
            value={isHex(color) ? color : '#2563eb'}
            onChange={(e) => setColor(e.target.value)}
            className="h-10 w-14 cursor-pointer rounded border"
            aria-label="Brand colour"
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
            Save colour
          </Button>
          {!isHex(color) && <span className="text-sm text-destructive">Use a colour like #2563eb</span>}
        </CardContent>
      </Card>

      {tokenError && (
        <Card className="border-destructive/40">
          <CardContent className="py-4 text-sm text-destructive">
            Previews could not be loaded. Check that the website widget is enabled for your account, then reload the page.
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="listing">
        <TabsList className="flex-wrap">
          {KINDS.map((k) => (
            <TabsTrigger key={k.kind} value={k.kind} data-testid={`tab-${k.kind}`}>
              {k.tab}
            </TabsTrigger>
          ))}
        </TabsList>

        {KINDS.map((k) => (
          <TabsContent key={k.kind} value={k.kind} className="space-y-4">
            <p className="text-sm text-muted-foreground">{k.intro}</p>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {k.templates.map((tpl) => {
                const active = current(k.kind) === tpl.id;
                return (
                  <Card key={tpl.id} data-testid={`template-${tpl.id}`} className={active ? 'border-primary ring-2 ring-primary/30' : ''}>
                    <CardContent className="space-y-3 p-3">
                      {token && settingsLoaded ? (
                        <TemplatePreview
                          // A new colour means a new frame: changing only the URL hash wouldn't reload it.
                          key={`${tpl.id}-${revision}-${previewColor}`}
                          src={previewUrl(tpl.id, token, previewColor)}
                          maxHeight={k.kind === 'detail' ? 1400 : 900}
                          title={tpl.name}
                        />
                      ) : (
                        <div className="flex h-40 items-center justify-center rounded-md border text-muted-foreground">
                          {tokenError ? 'No preview' : <Loader2 className="h-5 w-5 animate-spin" />}
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate font-medium">{tpl.name}</div>
                          <div className="text-xs text-muted-foreground">{tpl.id.replace(/-/g, ' ')}</div>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button variant="ghost" size="icon" title="View larger" onClick={() => setEnlarged(tpl)} disabled={!token}>
                            <Maximize2 className="h-4 w-4" />
                          </Button>
                          {active ? (
                            <Button size="sm" variant="secondary" disabled data-testid="in-use">
                              <Check className="mr-1 h-4 w-4" /> In use
                            </Button>
                          ) : (
                            <Button size="sm" onClick={() => choose(k.kind, tpl.id)} disabled={saving !== null} data-testid="use-this">
                              {saving === tpl.id ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                              Use this
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
                <div className="font-medium">Where does this show?</div>
                <p className="text-muted-foreground">
                  WordPress: the pages created by the SPM plugin follow your choice automatically. Other websites: paste{' '}
                  <code className="rounded bg-background px-1 py-0.5 text-xs">{k.snippet}</code> where it should appear.
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
              {enlarged?.name}
              {enlarged && token && (
                <a href={previewUrl(enlarged.id, token, color)} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground" title="Open in a new tab">
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </DialogTitle>
          </DialogHeader>
          {enlarged && token && (
            <div className="max-h-[75vh] overflow-y-auto">
              <TemplatePreview key={previewColor} src={previewUrl(enlarged.id, token, previewColor)} maxHeight={4000} title={enlarged.name} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
