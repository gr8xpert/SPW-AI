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

const WIDGET_URL = (process.env.NEXT_PUBLIC_WIDGET_URL || 'https://spw-ai.com/widget').replace(/\/$/, '');
const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');
const PREVIEW_WIDTH = 1280;

type Kind = 'search' | 'listing' | 'detail' | 'map' | 'wishlist';

const BLOCKS: Array<{ kind: Kind; label: string; block: string; shortcode: string; filters: boolean; templates: number }> = [
  { kind: 'search', label: 'Search form', block: 'site-search', shortcode: '[spm_search]', filters: false, templates: 6 },
  { kind: 'listing', label: 'Property results', block: 'site-listing', shortcode: '[spm_listing]', filters: true, templates: 12 },
  { kind: 'map', label: 'Map search', block: 'site-map', shortcode: '[spm_map]', filters: true, templates: 3 },
  { kind: 'detail', label: 'Property page', block: 'site-detail', shortcode: '[spm_detail]', filters: false, templates: 1 },
  { kind: 'wishlist', label: 'Saved properties', block: 'wishlist_grid', shortcode: '[spm_wishlist]', filters: false, templates: 0 },
];

const SORTS = [
  { value: '', label: 'Default' },
  { value: 'newest', label: 'Newest first' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'featured', label: 'Featured first' },
];
const LISTING_TYPES = [
  { value: '', label: 'Any' },
  { value: 'sale', label: 'For sale' },
  { value: 'rent', label: 'For rent' },
  { value: 'holiday', label: 'Holiday rental' },
  { value: 'new-development', label: 'New development' },
];

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
  const [kind, setKind] = useState<Kind>('listing');
  const [template, setTemplate] = useState('');
  const [locations, setLocations] = useState<Named[]>([]);
  const [types, setTypes] = useState<Named[]>([]);
  const [features, setFeatures] = useState<Named[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState('');
  const [f, setF] = useState({ location: '', type: '', for: '', beds: '', baths: '', under: '', over: '', features: [] as number[], sort: '', limit: '', fixed: false, own: false });

  useEffect(() => {
    if (!session?.accessToken) return;
    const list = <T,>(url: string) => apiGet<{ data: T[] | { data: T[] } }>(url).then((r) => (Array.isArray(r.data) ? r.data : ((r.data as { data: T[] })?.data ?? []))).catch(() => [] as T[]);
    list<Named>('/api/dashboard/locations').then(setLocations);
    list<Named>('/api/dashboard/property-types').then(setTypes);
    list<Named>('/api/dashboard/features').then(setFeatures);
    apiPost<{ data: { token: string } }>('/api/dashboard/tenant/preview-token').then((r) => setToken(r.data?.token ?? null)).catch(() => {});
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
      if (f.fixed) out.fixed = 'yes';
      if (f.own) out.standalone = 'yes';
    }
    return out;
  }, [current.filters, f]);

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
    ? `${WIDGET_URL}/preview.html#${new URLSearchParams({ t: template || defaultTemplate(kind), k: token, api: API_URL, a: JSON.stringify(attrs) }).toString()}`
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
        <Button size="icon" variant="secondary" className="absolute right-2 top-2 h-7 w-7" onClick={() => copy(id, text)} aria-label="Copy">
          {copied === id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Add to your website</h1>
        <p className="text-muted-foreground">Choose what to show, set the filters, then copy the code. Works on WordPress, Wix, Squarespace, Webflow, Next.js or any website.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">1. What to show</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {BLOCKS.map((b) => (
                  <Button key={b.kind} size="sm" variant={kind === b.kind ? 'default' : 'outline'} data-testid={`kind-${b.kind}`}
                    onClick={() => { setKind(b.kind); setTemplate(''); }}>
                    {b.label}
                  </Button>
                ))}
              </div>
              {current.templates > 1 && (
                <div className="space-y-1">
                  <Label>Design</Label>
                  <Select value={template || 'dashboard'} onValueChange={(v) => setTemplate(v === 'dashboard' ? '' : v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dashboard">The one chosen in Website Design</SelectItem>
                      {Array.from({ length: current.templates }, (_, i) => `${current.kind === 'listing' ? 'listing' : current.kind}-template-${String(i + 1).padStart(2, '0')}`).map((id, i) => (
                        <SelectItem key={id} value={id}>Design {i + 1}</SelectItem>
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
                <CardTitle className="text-base">2. Filters (optional)</CardTitle>
                <CardDescription>Everything is picked from your own lists, so the code gets the right IDs.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Picker label="Location" value={f.location} rows={locations} onChange={(v) => setF({ ...f, location: v })} testid="filter-location" />
                  <Picker label="Property type" value={f.type} rows={types} onChange={(v) => setF({ ...f, type: v })} testid="filter-type" />
                  <div className="space-y-1">
                    <Label>For</Label>
                    <Select value={f.for || 'any'} onValueChange={(v) => setF({ ...f, for: v === 'any' ? '' : v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{LISTING_TYPES.map((t) => <SelectItem key={t.value || 'any'} value={t.value || 'any'}>{t.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Sort</Label>
                    <Select value={f.sort || 'default'} onValueChange={(v) => setF({ ...f, sort: v === 'default' ? '' : v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{SORTS.map((s) => <SelectItem key={s.value || 'default'} value={s.value || 'default'}>{s.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <Num label="Bedrooms (at least)" value={f.beds} onChange={(v) => setF({ ...f, beds: v })} />
                  <Num label="Bathrooms (at least)" value={f.baths} onChange={(v) => setF({ ...f, baths: v })} />
                  <Num label="Price from" value={f.over} onChange={(v) => setF({ ...f, over: v })} placeholder="200000" />
                  <Num label="Price up to" value={f.under} onChange={(v) => setF({ ...f, under: v })} placeholder="500000" />
                  <Num label="How many to show" value={f.limit} onChange={(v) => setF({ ...f, limit: v })} placeholder="6" />
                </div>
                {features.length > 0 && (
                  <div className="space-y-1">
                    <Label>Features</Label>
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
                <div className="space-y-2 pt-1">
                  <label className="flex items-center gap-3 text-sm">
                    <Switch checked={f.fixed} onCheckedChange={(v) => setF({ ...f, fixed: v })} />
                    Visitors cannot change these filters
                  </label>
                  <label className="flex items-center gap-3 text-sm">
                    <Switch checked={f.own} onCheckedChange={(v) => setF({ ...f, own: v })} />
                    This block searches on its own (for several different lists on one page)
                  </label>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Preview</CardTitle></CardHeader>
            <CardContent>
              {previewSrc ? <Preview src={previewSrc} /> : <div className="flex h-40 items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">3. Copy the code</CardTitle>
              <CardDescription>Pick your website type.</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="wordpress">
                <TabsList className="flex-wrap">
                  <TabsTrigger value="wordpress" data-testid="tab-wordpress">WordPress</TabsTrigger>
                  <TabsTrigger value="html">Any website</TabsTrigger>
                  <TabsTrigger value="wix">Wix</TabsTrigger>
                  <TabsTrigger value="squarespace">Squarespace</TabsTrigger>
                  <TabsTrigger value="react">React / Next.js</TabsTrigger>
                </TabsList>

                <TabsContent value="wordpress" className="space-y-3 pt-3">
                  <CopyBox id="wp" text={shortcode} note="With the SPM plugin installed, paste this into any page, Divi module or Elementor widget." />
                  <p className="text-xs text-muted-foreground">No plugin yet? SPM → Setup in WordPress after installing it. The plugin also gives you tidy property addresses and Google-ready page titles.</p>
                </TabsContent>

                <TabsContent value="html" className="space-y-3 pt-3">
                  <CopyBox id="html-1" text={configTag} note="1. Once per site, in the page header (replace YOUR_API_KEY):" />
                  <CopyBox id="html-2" text={html} note="2. Where the properties should appear:" />
                  <CopyBox id="html-3" text={scriptTag} note="3. Once per page, just before &lt;/body&gt;:" />
                </TabsContent>

                <TabsContent value="wix" className="space-y-3 pt-3">
                  <p className="text-sm text-muted-foreground">Wix: <b>Add → Embed code → Embed HTML</b>, then paste everything below into the box and set the block to full width.</p>
                  <CopyBox id="wix" text={`${configTag}\n${html}\n${scriptTag}`} />
                  <p className="text-xs text-muted-foreground">Property pages: add one page with the Property page block and let it read <code>?ref=</code> from the address.</p>
                </TabsContent>

                <TabsContent value="squarespace" className="space-y-3 pt-3">
                  <p className="text-sm text-muted-foreground">Squarespace: add a <b>Code block</b> and paste this.</p>
                  <CopyBox id="sq" text={`${configTag}\n${html}\n${scriptTag}`} />
                </TabsContent>

                <TabsContent value="react" className="space-y-3 pt-3">
                  <CopyBox id="react" note="React / Next.js component:" text={`export function Properties() {
  useEffect(() => {
    window.RealtySoftConfig = { apiUrl: "${API_URL}", apiKey: process.env.NEXT_PUBLIC_SPM_KEY, propertyPageSlug: "property" };
    const s = document.createElement("script");
    s.src = "${WIDGET_URL}/spm-widget.umd.js";
    document.body.appendChild(s);
    return () => { s.remove(); };
  }, []);

  return (
    ${html.replace(/\n/g, '\n    ')}
  );
}`} />
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
function Picker({ label, value, rows, onChange, testid }: { label: string; value: string; rows: Named[]; onChange: (v: string) => void; testid?: string }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Select value={value || 'any'} onValueChange={(v) => onChange(v === 'any' ? '' : v)}>
        <SelectTrigger data-testid={testid}><SelectValue placeholder="Any" /></SelectTrigger>
        <SelectContent className="max-h-72">
          <SelectItem value="any">Any</SelectItem>
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

function Preview({ src }: { src: string }) {
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
      <iframe key={src} ref={frame} src={src} title="Preview" sandbox="allow-scripts allow-same-origin"
        className="origin-top-left border-0" style={{ width: PREVIEW_WIDTH, height, transform: `scale(${scale})` }} />
    </div>
  );
}

function Guides() {
  const rows: Array<{ platform: string; steps: string; seo: string }> = [
    { platform: 'WordPress (best)', steps: 'Install the SPM plugin, run Setup, then place shortcodes like [spm_listing].', seo: 'Full: tidy property addresses, page titles, Google preview tags and a property sitemap, all from your SEO fields.' },
    { platform: 'Next.js / Node', steps: 'Add the script and the block to a page; use a dynamic route for /property/[ref].', seo: 'Full, if your developer renders the title and description server-side. Ask us for the helper.' },
    { platform: 'Wix', steps: 'Add → Embed code → Embed HTML, paste the snippet. One page per block; property pages read ?ref= from the address.', seo: 'Partial: properties are found and indexed, but Wix does not allow per-property titles in the page source.' },
    { platform: 'Squarespace / Webflow', steps: 'Add a Code block (Squarespace) or an Embed element (Webflow) and paste the snippet.', seo: 'Partial, as with Wix.' },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Setup guides</CardTitle>
        <CardDescription>What each website type needs, and what you get for Google.</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2 pr-4 font-medium">Website</th>
              <th className="py-2 pr-4 font-medium">How to add it</th>
              <th className="py-2 font-medium">Google / SEO</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.platform} className="border-b align-top last:border-0">
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
