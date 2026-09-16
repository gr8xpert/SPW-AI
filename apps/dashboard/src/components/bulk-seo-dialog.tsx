'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Sparkles, Loader2 } from 'lucide-react';
import { apiGet, apiPost } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useBulkJob } from '@/hooks/use-bulk-job';

const LANG_NAMES: Record<string, string> = {
  en: 'English', es: 'Spanish', de: 'German', fr: 'French',
  nl: 'Dutch', pt: 'Portuguese', it: 'Italian', ru: 'Russian',
  sv: 'Swedish', no: 'Norwegian', da: 'Danish', pl: 'Polish',
  cs: 'Czech', fi: 'Finnish', ar: 'Arabic', zh: 'Chinese',
  ja: 'Japanese', ko: 'Korean',
};

// Catalog-wide AI SEO. The per-property button on the edit screen covers one
// listing at a time; this is the same generator driven from a background job so
// a few thousand properties can be filled in one go.
export function BulkSeoDialog({ tenantLanguages }: { tenantLanguages: string[] }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [languages, setLanguages] = useState<string[]>(tenantLanguages);
  const [overwrite, setOverwrite] = useState(false);
  const [includeSchema, setIncludeSchema] = useState(false);
  const [includeSlug, setIncludeSlug] = useState(false);
  const [propertyCount, setPropertyCount] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);

  // Progress is read from the server, so it survives a refresh or leaving the
  // page — and the Start button stays disabled while a run is in flight.
  const { running, progress, track } = useBulkJob({
    activeUrl: '/api/dashboard/ai-seo/jobs/active',
    statusUrl: (jobId) => `/api/dashboard/ai-seo/job/${jobId}`,
    onFinished: (s) => {
      const skipped = s.skipped ?? 0;
      const generated = s.completed - s.failed - skipped;
      toast({
        title: s.failed > 0 ? 'Bulk SEO finished with errors' : 'Bulk SEO complete',
        description: `${generated} generated, ${skipped} already had SEO, ${s.failed} failed out of ${s.total}.`,
        variant: s.failed > 0 ? 'destructive' : 'default',
      });
    },
  });

  useEffect(() => {
    setLanguages(tenantLanguages);
  }, [tenantLanguages]);

  // The run covers the whole catalog, not the page's current filters, so ask
  // for the unfiltered total rather than reusing the list query's count.
  useEffect(() => {
    if (!open || propertyCount !== null) return;
    apiGet<{ meta?: { total?: number } }>('/api/dashboard/properties?limit=1')
      .then((res) => setPropertyCount(res?.meta?.total ?? null))
      .catch(() => setPropertyCount(null));
  }, [open, propertyCount]);

  const toggleLanguage = (lang: string) => {
    setLanguages((prev) =>
      prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang],
    );
  };

  // What the run costs in OpenRouter calls. Worth showing before the click —
  // at catalog scale this is the difference between cents and real money.
  const estimatedCalls =
    propertyCount === null
      ? null
      : propertyCount * languages.length + (includeSchema ? propertyCount : 0);

  const start = async () => {
    if (languages.length === 0) {
      toast({ title: 'Pick at least one language', variant: 'destructive' });
      return;
    }

    setStarting(true);
    try {
      const res = await apiPost<any>('/api/dashboard/ai-seo/properties/bulk', {
        targetLanguages: languages,
        overwrite,
        includeSchema,
        includeSlug,
      });
      const body = res?.data ?? res;
      const jobId = body?.jobId;
      if (!jobId) throw new Error('No job ID returned');

      track(jobId);
      setOpen(false);
      toast(
        body.alreadyRunning
          ? {
              title: 'Bulk SEO is already running',
              description: 'Showing the progress of the run in flight — no second run was started.',
            }
          : {
              title: 'Bulk SEO started',
              description:
                'Running in the background. You can leave this page — progress shows on the button.',
            },
      );
    } catch (err) {
      toast({
        title: 'Bulk SEO failed to start',
        description: (err as Error).message || 'Unexpected error',
        variant: 'destructive',
      });
    } finally {
      setStarting(false);
    }
  };

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} disabled={running}>
        {running ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            SEO {progress}%
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4 mr-2" />
            Bulk SEO
          </>
        )}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Generate SEO with AI</DialogTitle>
            <DialogDescription>
              Fills page title, meta title, meta description and keywords across your whole
              catalog. Runs in the background on your OpenRouter credit.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <Label>Languages</Label>
              <div className="flex flex-wrap gap-2">
                {tenantLanguages.map((lang) => {
                  const active = languages.includes(lang);
                  return (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => toggleLanguage(lang)}
                      className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                        active
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-input text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      {LANG_NAMES[lang] || lang.toUpperCase()}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <Checkbox
                  id="seo-overwrite"
                  checked={overwrite}
                  onCheckedChange={(v) => setOverwrite(v === true)}
                />
                <div className="grid gap-0.5 leading-none">
                  <Label htmlFor="seo-overwrite" className="cursor-pointer">
                    Overwrite existing SEO
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Off: properties that already have SEO in a language are skipped, and cost
                    nothing. On: everything is regenerated, including anything written by hand.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <Checkbox
                  id="seo-schema"
                  checked={includeSchema}
                  onCheckedChange={(v) => setIncludeSchema(v === true)}
                />
                <div className="grid gap-0.5 leading-none">
                  <Label htmlFor="seo-schema" className="cursor-pointer">
                    Generate JSON-LD schema
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Adds one extra AI call per property. Only needed if you want custom schema
                    instead of the one built automatically from the property&apos;s fields.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <Checkbox
                  id="seo-slug"
                  checked={includeSlug}
                  onCheckedChange={(v) => setIncludeSlug(v === true)}
                />
                <div className="grid gap-0.5 leading-none">
                  <Label htmlFor="seo-slug" className="cursor-pointer">
                    Fill empty slugs
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Only writes a slug where there isn&apos;t one. Existing slugs are live URLs
                    and are never rewritten.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
              {propertyCount === null ? (
                <span className="text-muted-foreground">Counting properties…</span>
              ) : (
                <>
                  <span className="font-medium">{propertyCount.toLocaleString()}</span> properties
                  {' · up to '}
                  <span className="font-medium">{estimatedCalls?.toLocaleString()}</span> AI calls
                  {!overwrite && (
                    <span className="text-muted-foreground">
                      {' '}
                      — fewer in practice, since properties that already have SEO are skipped
                    </span>
                  )}
                </>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={start} disabled={languages.length === 0 || starting || running}>
              <Sparkles className="h-4 w-4 mr-2" />
              Start
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
