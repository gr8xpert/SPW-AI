'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Check, Copy, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { apiGet, apiPost } from '@/lib/api';
import { useAddToWebsiteText } from './_i18n';

const WIDGET_URL = (process.env.NEXT_PUBLIC_WIDGET_URL || 'https://spw-ai.com/widget').replace(/\/$/, '');
const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');
const PREVIEW_WIDTH = 1280;

type Kind = 'search' | 'listing' | 'detail' | 'map' | 'wishlist' | 'carousel';

// Labels: t.blocks[kind]. The carousel design names (Website Design →
// Carousel) are t.carouselDesigns; sort and listing-type labels are
// t.sorts[value || 'default'] and t.listingTypes[value || 'any'].
const BLOCKS: Array<{ kind: Kind; block: string; shortcode: string; filters: boolean; templates: number }> = [
  { kind: 'search', block: 'site-search', shortcode: '[spm_search]', filters: false, templates: 7 },
  { kind: 'listing', block: 'site-listing', shortcode: '[spm_listing]', filters: true, templates: 17 },
  { kind: 'map', block: 'site-map', shortcode: '[spm_map]', filters: true, templates: 3 },
  { kind: 'detail', block: 'site-detail', shortcode: '[spm_detail]', filters: false, templates: 2 },
  { kind: 'wishlist', block: 'wishlist_grid', shortcode: '[spm_wishlist]', filters: false, templates: 0 },
  { kind: 'carousel', block: 'site-carousel', shortcode: '[spm_carousel]', filters: true, templates: 6 },
];

const SORTS = ['', 'newest', 'oldest', 'updated', 'price_desc', 'price_asc', 'ref'];
const LISTING_TYPES = ['', 'sale', 'rent', 'holiday', 'new-development'];

// Dashboard endpoints return names as they are stored: a plain string, or one
// value per language ({ en: "Villa", es: "Villa" }).
type MaybeI18n = string | Record<string, string> | null | undefined;
interface Named { id: number; name: MaybeI18n; level?: string; category?: string; parentId?: number | null }

function text(value: MaybeI18n): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') return value.en || Object.values(value).find((v) => typeof v === 'string' && v) || '';
  return '';
}

export default function AddToWebsitePage() {
  const { data: session } = useSession();
  const t = useAddToWebsiteText();
  const [kind, setKind] = useState<Kind>('listing');
  const [template, setTemplate] = useState('');
  const [locations, setLocations] = useState<Named[]>([]);
  const [types, setTypes] = useState<Named[]>([]);
  const [features, setFeatures] = useState<Named[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState('');
  // Super Admin add-on: off = map blocks don't show on the website.
  const [mapSearch, setMapSearch] = useState(true);
  const [f, setF] = useState({ location: '', type: '', for: '', beds: '', baths: '', under: '', over: '', features: [] as number[], sort: '', limit: '', refs: '', fixed: false, own: false, autoplay: false });

  useEffect(() => {
    if (!session?.accessToken) return;
    const list = <T,>(url: string) => apiGet<{ data: T[] | { data: T[] } }>(url).then((r) => (Array.isArray(r.data) ? r.data : ((r.data as { data: T[] })?.data ?? []))).catch(() => [] as T[]);
    list<Named>('/api/dashboard/locations').then(setLocations);
    list<Named>('/api/dashboard/property-types').then(setTypes);
    list<Named>('/api/dashboard/features').then(setFeatures);
    apiPost<{ data: { token: string } }>('/api/dashboard/tenant/preview-token').then((r) => setToken(r.data?.token ?? null)).catch(() => {});
    apiGet<{ data: { mapSearch?: boolean } }>('/api/dashboard/tenant').then((r) => setMapSearch(r.data?.mapSearch !== false)).catch(() => {});
  }, [session?.accessToken]);

  const current = BLOCKS.find((b) => b.kind === kind)!;

  // The attributes the snippet carries, in the order a person would write them.
  const attrs = useMemo(() => {
    const out: Record<string, string> = {};
    if (current.filters) {
      if (f.location) out.location = f.location;
      if (f.type) out.type = f.type;
      if (f.features.length) out.features = f.features.join(',');
      if (f.for) out.for = f.for;
      if (f.beds) out.beds = f.beds;
      if (f.baths) out.baths = f.baths;
      if (f.over) out.over = f.over;
      if (f.under) out.under = f.under;
      if (f.sort) out.sort = f.sort;
      if (f.limit) out.limit = f.limit;
      // Hand-picked: exactly these properties, in this order.
      const refs = f.refs.split(/[\s,;]+/).filter(Boolean);
      if (refs.length) out.ref = refs.join(',');
      // A carousel always searches on its own, so the switches don't apply.
      if (kind === 'carousel') {
        if (f.autoplay) out.autoplay = 'yes';
      } else {
        if (f.fixed) out.fixed = 'yes';
        // A map always draws the page's search; it has no search of its own.
        if (f.own && kind !== 'map') out.standalone = 'yes';
      }
    }
    return out;
  }, [current.filters, f, kind]);

  const blockName = template || current.block;
  const html = useMemo(() => {
    const parts = [`<div data-spm-widget="${blockName}"`, ...Object.entries(attrs).map(([k, v]) => `     data-spm-${k}="${v}"`)];
    return parts.join('\n') + '></div>';
  }, [blockName, attrs]);

  const shortcode = useMemo(() => {
    const opts = Object.entries(attrs).map(([k, v]) => `${k === 'standalone' ? 'own-search' : k}="${v}"`);
    if (template) opts.unshift(`template="${template.replace(/^\w+-template-/, '')}"`);
    const name = current.shortcode.replace(/\]$/, '');
    return opts.length ? `${name} ${opts.join(' ')}]` : `${name}]`;
  }, [attrs, template, current.shortcode]);

  const scriptTag = `<script src="${WIDGET_URL}/spm-widget.umd.js"></script>`;
  const configTag = `<script>
  window.RealtySoftConfig = {
    apiUrl: "${API_URL}",
    apiKey: "YOUR_API_KEY",          // Settings → API Keys in this dashboard
    propertyPageSlug: "property"     // the page that shows one property
  };
</script>`;

  const previewSrc = token
    ? `${WIDGET_URL}/preview.html?v=${Math.floor(Date.now() / 36e5)}#${new URLSearchParams({ t: template || defaultTemplate(kind), k: token, api: API_URL, a: JSON.stringify(attrs) }).toString()}`
    : '';

  const copy = (what: string, text: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(what);
      setTimeout(() => setCopied(''), 1500);
    });
  };

  const CopyBox = ({ id, text, note }: { id: string; text: string; note?: string }) => (
    <div className="space-y-2">
      {note && <p className="text-sm text-muted-foreground">{note}</p>}
      <div className="relative">
        <pre className="overflow-x-auto rounded-md bg-slate-900 p-3 pr-12 text-xs text-slate-100"><code>{text}</code></pre>
        <Button size="icon" variant="secondary" className="absolute right-2 top-2 h-7 w-7" onClick={() => copy(id, text)} aria-label={t.copy}>
          {copied === id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t.title}</h1>
        <p className="text-muted-foreground">{t.description}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">{t.step1}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {BLOCKS.map((b) => (
                  <Button key={b.kind} size="sm" variant={kind === b.kind ? 'default' : 'outline'} data-testid={`kind-${b.kind}`}
                    onClick={() => { setKind(b.kind); setTemplate(''); }}>
                    {t.blocks[b.kind]}
                  </Button>
                ))}
              </div>
              {kind === 'map' && !mapSearch && (
                <p data-testid="map-off" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
                  {t.mapOff}
                </p>
              )}
              {current.templates > 1 && (
                <div className="space-y-1">
                  <Label>{t.design}</Label>
                  <Select value={template || 'dashboard'} onValueChange={(v) => setTemplate(v === 'dashboard' ? '' : v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dashboard">{t.designFromSettings}</SelectItem>
                      {Array.from({ length: current.templates }, (_, i) => `${current.kind}-template-${String(i + 1).padStart(2, '0')}`).map((id, i) => (
                        <SelectItem key={id} value={id}>{t.designN(i + 1)}{kind === 'carousel' ? ` — ${t.carouselDesigns[i]}` : ''}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </CardContent>
          </Card>

          {current.filters && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t.step2}</CardTitle>
                <CardDescription>{t.step2Description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Picker label={t.location} any={t.any} value={f.location} rows={locations} onChange={(v) => setF({ ...f, location: v })} testid="filter-location" />
                  <Picker label={t.propertyType} any={t.any} value={f.type} rows={types} onChange={(v) => setF({ ...f, type: v })} testid="filter-type" />
                  <div className="space-y-1">
                    <Label>{t.for}</Label>
                    <Select value={f.for || 'any'} onValueChange={(v) => setF({ ...f, for: v === 'any' ? '' : v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{LISTING_TYPES.map((v) => <SelectItem key={v || 'any'} value={v || 'any'}>{t.listingTypes[v || 'any']}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>{t.sort}</Label>
                    <Select value={f.sort || 'default'} onValueChange={(v) => setF({ ...f, sort: v === 'default' ? '' : v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{SORTS.map((v) => <SelectItem key={v || 'default'} value={v || 'default'}>{t.sorts[v || 'default']}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <Num label={t.bedsMin} value={f.beds} onChange={(v) => setF({ ...f, beds: v })} />
                  <Num label={t.bathsMin} value={f.baths} onChange={(v) => setF({ ...f, baths: v })} />
                  <Num label={t.priceFrom} value={f.over} onChange={(v) => setF({ ...f, over: v })} placeholder="200000" />
                  <Num label={t.priceTo} value={f.under} onChange={(v) => setF({ ...f, under: v })} placeholder="500000" />
                  <Num label={t.howMany} value={f.limit} onChange={(v) => setF({ ...f, limit: v })} placeholder="6" />
                </div>
                <div className="space-y-1">
                  <Label>{t.refs}</Label>
                  <Input value={f.refs} placeholder="R1234, R2345, R3456" onChange={(e) => setF({ ...f, refs: e.target.value })} data-testid="filter-refs" />
                  <p className="text-xs text-muted-foreground">{t.refsHelp}</p>
                </div>
                {features.length > 0 && (
                  <div className="space-y-1">
                    <Label>{t.features}</Label>
                    <div className="flex max-h-28 flex-wrap gap-2 overflow-y-auto rounded border p-2">
                      {features.map((ft) => {
                        const on = f.features.includes(ft.id);
                        return (
                          <button key={ft.id} type="button"
                            className={`rounded-full border px-3 py-1 text-xs ${on ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted'}`}
                            onClick={() => setF({ ...f, features: on ? f.features.filter((x) => x !== ft.id) : [...f.features, ft.id] })}>
                            {text(ft.name)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {kind === 'carousel' ? (
                  <div className="space-y-2 pt-1">
                    <label className="flex items-center gap-3 text-sm">
                      <Switch checked={f.autoplay} onCheckedChange={(v) => setF({ ...f, autoplay: v })} />
                      {t.autoplay}
                    </label>
                    <p className="text-xs text-muted-foreground">{t.carouselNote}</p>
                  </div>
                ) : (
                  <div className="space-y-2 pt-1">
                    <label className="flex items-center gap-3 text-sm">
                      <Switch checked={f.fixed} onCheckedChange={(v) => setF({ ...f, fixed: v })} />
                      {t.fixed}
                    </label>
                    {kind !== 'map' && (
                      <label className="flex items-center gap-3 text-sm">
                        <Switch checked={f.own} onCheckedChange={(v) => setF({ ...f, own: v })} />
                        {t.standalone}
                      </label>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">{t.preview}</CardTitle></CardHeader>
            <CardContent>
              {previewSrc ? <Preview src={previewSrc} title={t.preview} /> : <div className="flex h-40 items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t.step3}</CardTitle>
              <CardDescription>{t.step3Description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="wordpress">
                <TabsList className="flex-wrap">
                  <TabsTrigger value="wordpress" data-testid="tab-wordpress">WordPress</TabsTrigger>
                  <TabsTrigger value="html">{t.anyWebsite}</TabsTrigger>
                  <TabsTrigger value="wix">Wix</TabsTrigger>
                  <TabsTrigger value="squarespace">Squarespace</TabsTrigger>
                  <TabsTrigger value="react">React / Next.js</TabsTrigger>
                </TabsList>

                <TabsContent value="wordpress" className="space-y-3 pt-3">
                  <CopyBox id="wp" text={shortcode} note={t.wpNote} />
                  <p className="text-xs text-muted-foreground">{t.wpNoPlugin}</p>
                </TabsContent>

                <TabsContent value="html" className="space-y-3 pt-3">
                  <CopyBox id="html-1" text={configTag} note={t.html1} />
                  <CopyBox id="html-2" text={html} note={t.html2} />
                  <CopyBox id="html-3" text={scriptTag} note={t.html3} />
                </TabsContent>

                <TabsContent value="wix" className="space-y-3 pt-3">
                  <p className="text-sm text-muted-foreground">{t.wixBefore}<b>{t.wixMenu}</b>{t.wixAfter}</p>
                  <CopyBox id="wix" text={`${configTag}\n${html}\n${scriptTag}`} />
                  <p className="text-xs text-muted-foreground">{t.wixPagesBefore}<code>?ref=</code>{t.wixPagesAfter}</p>
                </TabsContent>

                <TabsContent value="squarespace" className="space-y-3 pt-3">
                  <p className="text-sm text-muted-foreground">{t.sqBefore}<b>{t.sqBlock}</b>{t.sqAfter}</p>
                  <CopyBox id="sq" text={`${configTag}\n${html}\n${scriptTag}`} />
                </TabsContent>

                <TabsContent value="react" className="space-y-3 pt-3">
                  <p className="text-sm text-muted-foreground">{t.nextIntro}</p>
                  <CopyBox id="react" note={t.next1} text={`"use client";
import Script from "next/script";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

export function Spm() {
  const pathname = usePathname();
  const router = useRouter();
  const first = useRef(pathname);
  // A <Link> to another page: draw that page's blocks.
  useEffect(() => {
    if (pathname === first.current) return;
    first.current = pathname;
    requestAnimationFrame(() => (window as any).RealtySoft?.refresh?.());
  }, [pathname]);
  // Cards and Search use the Next.js router instead of a full reload.
  useEffect(() => {
    const go = (e: Event) => {
      const url = new URL((e as CustomEvent).detail.url, location.href);
      if (url.origin !== location.origin) return;
      e.preventDefault();
      router.push(url.pathname + url.search);
    };
    document.addEventListener("spm:navigate", go);
    return () => document.removeEventListener("spm:navigate", go);
  }, [router]);
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: 'window.RealtySoftConfig = { apiUrl: "${API_URL}", apiKey: "' + process.env.NEXT_PUBLIC_SPM_KEY + '", propertyPageSlug: "property", dataPath: false };' }} />
      <Script src="${WIDGET_URL}/spm-widget.umd.js" strategy="afterInteractive" />
    </>
  );
}`} />
                  <CopyBox id="react-2" note={t.next2} text={html} />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>

      <Guides />
    </div>
  );
}

function defaultTemplate(kind: Kind): string {
  if (kind === 'wishlist') return 'listing-template-01';
  return `${kind}-template-01`;
}

function Num({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input inputMode="numeric" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ''))} />
    </div>
  );
}

/** A list of the client's own locations / types, showing what each one is. */
function Picker({ label, any, value, rows, onChange, testid }: { label: string; any: string; value: string; rows: Named[]; onChange: (v: string) => void; testid?: string }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Select value={value || 'any'} onValueChange={(v) => onChange(v === 'any' ? '' : v)}>
        <SelectTrigger data-testid={testid}><SelectValue placeholder={any} /></SelectTrigger>
        <SelectContent className="max-h-72">
          <SelectItem value="any">{any}</SelectItem>
          {rows.map((r) => (
            <SelectItem key={r.id} value={String(r.id)}>
              {text(r.name)}{r.level || r.category ? ` — ${r.level || r.category}` : ''} (#{r.id})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function Preview({ src, title }: { src: string; title: string }) {
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [scale, setScale] = useState(0.4);
  const [height, setHeight] = useState(700);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / PREVIEW_WIDTH));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return;
      const h = Number((e.data as { height?: number })?.height);
      if (Number.isFinite(h) && h > 0) setHeight(Math.min(h, 1600));
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  return (
    <div ref={box} className="w-full overflow-hidden rounded border bg-white" style={{ height: height * scale }}>
      <iframe key={src} ref={frame} src={src} title={title} sandbox="allow-scripts allow-same-origin"
        className="origin-top-left border-0" style={{ width: PREVIEW_WIDTH, height, transform: `scale(${scale})` }} />
    </div>
  );
}

function Guides() {
  const t = useAddToWebsiteText();
  const rows = (['wordpress', 'next', 'wix', 'squarespace'] as const).map((id) => ({ id, ...t.guides[id] }));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t.guidesTitle}</CardTitle>
        <CardDescription>{t.guidesDescription}</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2 pr-4 font-medium">{t.colWebsite}</th>
              <th className="py-2 pr-4 font-medium">{t.colHow}</th>
              <th className="py-2 font-medium">{t.colSeo}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b align-top last:border-0">
                <td className="py-2 pr-4 font-medium">{r.platform}</td>
                <td className="py-2 pr-4 text-muted-foreground">{r.steps}</td>
                <td className="py-2 text-muted-foreground">{r.seo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
