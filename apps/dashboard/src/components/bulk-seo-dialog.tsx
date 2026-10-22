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
import { useLanguage } from '@/i18n/i18n-provider';
import { useSharedText } from '@/i18n/shared';

// A language code's name in the dashboard language ("Spanish", "Spaans"…),
// or the code itself when the browser doesn't know it.
function languageName(code: string, locale: string): string {
  try {
    const name = new Intl.DisplayNames([locale], { type: 'language' }).of(code);
    if (name && name !== code) return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
  } catch {
    // unknown code or no Intl.DisplayNames
  }
  return code.toUpperCase();
}

// Fills {properties} and {calls} in the estimate line with bold numbers.
function withBold(template: string, values: Record<string, string>) {
  return template.split(/(\{\w+\})/).map((part, i) => {
    const key = part.match(/^\{(\w+)\}$/)?.[1];
    return key && key in values ? (
      <span key={i} className="font-medium">{values[key]}</span>
    ) : (
      part
    );
  });
}

// Catalog-wide AI SEO. The per-property button on the edit screen covers one
// listing at a time; this is the same generator driven from a background job so
// a few thousand properties can be filled in one go.
export function BulkSeoDialog({ tenantLanguages }: { tenantLanguages: string[] }) {
  const { toast } = useToast();
  const t = useSharedText().bulkSeo;
  const { locale } = useLanguage();
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
        title: s.failed > 0 ? t.finishedWithErrors : t.complete,
        description: t.summary(generated, skipped, s.failed, s.total),
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
      toast({ title: t.pickLanguage, variant: 'destructive' });
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
      if (!jobId) throw new Error(t.noJobId);

      track(jobId);
      setOpen(false);
      toast(
        body.alreadyRunning
          ? {
              title: t.alreadyRunning,
              description: t.alreadyRunningText,
            }
          : {
              title: t.started,
              description: t.startedText,
            },
      );
    } catch (err) {
      toast({
        title: t.startFailed,
        description: (err as Error).message || t.unexpectedError,
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
            {t.running(progress)}
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4 mr-2" />
            {t.button}
          </>
        )}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{t.title}</DialogTitle>
            <DialogDescription>{t.description}</DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <Label>{t.languages}</Label>
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
                      {languageName(lang, locale)}
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
                    {t.overwrite}
                  </Label>
                  <p className="text-xs text-muted-foreground">{t.overwriteHelp}</p>
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
                    {t.schema}
                  </Label>
                  <p className="text-xs text-muted-foreground">{t.schemaHelp}</p>
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
                    {t.slug}
                  </Label>
                  <p className="text-xs text-muted-foreground">{t.slugHelp}</p>
                </div>
              </div>
            </div>

            <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
              {propertyCount === null ? (
                <span className="text-muted-foreground">{t.counting}</span>
              ) : (
                <>
                  {withBold(t.estimate(propertyCount), {
                    properties: propertyCount.toLocaleString(locale),
                    calls: (estimatedCalls ?? 0).toLocaleString(locale),
                  })}
                  {!overwrite && (
                    <span className="text-muted-foreground">
                      {' '}
                      {t.fewerInPractice}
                    </span>
                  )}
                </>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t.cancel}
            </Button>
            <Button onClick={start} disabled={languages.length === 0 || starting || running}>
              <Sparkles className="h-4 w-4 mr-2" />
              {t.start}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
