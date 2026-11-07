'use client';

import { useRef, useState, type ReactNode } from 'react';
import { Check, Copy, ExternalLink, FileUp, Loader2, RefreshCw, Save, Trash2, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/i18n/i18n-provider';
import { apiPost } from '@/lib/api';
import { IdealistaListingPicker } from './idealista-listing-picker';
import { errorText, unwrap } from './idealista-api';
import { ExportLogTable } from './export-log-card';
import { FeedRunButton, FeedRunNote } from './feed-run-button';
import {
  FEED_FORMATS,
  FEED_LANGUAGES,
  FORMAT_LABELS,
  type ExportFeedRow,
  type ExportFeedSettings,
  referencesInFile,
} from './export-feeds-api';
import { useFeedExportText } from './_i18n';

function Row({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

// One extra feed's settings. `row` is null while the feed is new (not saved).
export function ExportFeedEditor(props: {
  row: ExportFeedRow | null;
  settings: ExportFeedSettings;
  onChange: (s: ExportFeedSettings) => void;
  onSave: () => void;
  onDelete: () => void;
  onRegenerate: () => void;
  onClose: () => void;
  onRan: () => void;
  saving: boolean;
  feedUrl: string;
}) {
  const t = useFeedExportText();
  const { locale } = useLanguage();
  const { toast } = useToast();
  const { row, settings } = props;
  const set = (patch: Partial<ExportFeedSettings>) => props.onChange({ ...settings, ...patch });
  const fileInput = useRef<HTMLInputElement>(null);
  const [matching, setMatching] = useState(false);
  const [missing, setMissing] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const portal = FORMAT_LABELS[settings.format];

  const langName = (code: string) => {
    try {
      return new Intl.DisplayNames([locale], { type: 'language' }).of(code) || code;
    } catch {
      return code;
    }
  };
  const toggleLang = (code: string) =>
    set({
      languages: settings.languages.includes(code)
        ? settings.languages.filter((l) => l !== code)
        : [...settings.languages, code],
    });

  // Picks the listings an old feed file carries (from the CRM the client is leaving).
  const fromFile = async (file: File) => {
    setMatching(true);
    try {
      const refs = referencesInFile(await file.text());
      if (!refs.length) {
        toast({ title: t.feeds.noRefsInFile, variant: 'destructive' });
        return;
      }
      const r = unwrap<{ propertyIds: number[]; missing: string[] }>(
        await apiPost('/api/dashboard/feed-export/feeds/match-references', { references: refs }),
      );
      const ids = [...new Set([...settings.propertyIds, ...r.propertyIds])];
      set({ listingScope: 'selected', propertyIds: ids });
      setMissing(r.missing);
      toast({ title: t.feeds.matched(r.propertyIds.length, refs.length), description: t.common.pressSave });
    } catch (err) {
      toast({ title: t.common.somethingWrong, description: errorText(err, ''), variant: 'destructive' });
    } finally {
      setMatching(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const copy = () => {
    navigator.clipboard.writeText(props.feedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <CardTitle className="flex flex-wrap items-center gap-2">
              {row ? row.title : t.feeds.newFeed}
              {row && <Badge variant={row.isEnabled ? 'default' : 'secondary'}>{row.isEnabled ? t.common.on : t.common.off}</Badge>}
            </CardTitle>
            <CardDescription>{t.feeds.formatHints[settings.format]}</CardDescription>
            {row && <FeedRunNote portal={portal} enabled={row.isEnabled} />}
          </div>
          <div className="flex flex-wrap gap-2">
            {row && (
              <FeedRunButton
                url={`/api/dashboard/feed-export/feeds/${row.id}/run`}
                portal={portal}
                enabled={row.isEnabled}
                onDone={props.onRan}
              />
            )}
            <Button className="shadow-sm" onClick={props.onSave} disabled={props.saving}>
              {props.saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              {t.common.save}
            </Button>
            <Button variant="ghost" size="icon" onClick={props.onClose} aria-label={t.feeds.close}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {row && (
          <div className="space-y-2">
            <Label>{t.common.feedUrl}</Label>
            <div className="flex gap-2">
              <Input value={props.feedUrl} readOnly className="font-mono text-sm" />
              <Button variant="outline" size="icon" onClick={copy} aria-label={t.page.copied}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
              <Button variant="outline" size="icon" asChild>
                <a href={props.feedUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /></a>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t.feeds.urlPrivate}</p>
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-muted rounded-md">
              <span className="text-sm">{t.url.propertiesInFeed}</span>
              <Badge variant="secondary">{row.propertyCount.toLocaleString(locale)}</Badge>
            </div>
            {!!row.skippedCount && (
              <details className="rounded-md border p-3 text-sm">
                <summary className="cursor-pointer">{t.feeds.leftOut(row.skippedCount, portal)}</summary>
                <ul className="mt-2 space-y-1 text-muted-foreground">
                  {row.skipped.map((s) => (
                    <li key={s.reference}><span className="font-mono">{s.reference}</span> — {s.reason}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>{t.feeds.feedTitle}</Label>
            <Input value={settings.title} maxLength={120} placeholder="Kyero Own Properties" onChange={(e) => set({ title: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>{t.feeds.feedType}</Label>
            <Select value={settings.format} onValueChange={(v) => set({ format: v as ExportFeedSettings['format'] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FEED_FORMATS.map((f) => <SelectItem key={f} value={f}>{FORMAT_LABELS[f]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-md border divide-y">
          <Row title={t.url.feedOn} hint={t.url.feedOnHint(settings.title || portal)}>
            <Switch checked={settings.isEnabled} onCheckedChange={(v) => set({ isEnabled: v })} />
          </Row>
          <Row title={t.url.includeUnpublished} hint={t.url.includeUnpublishedHint}>
            <Switch checked={settings.includeUnpublished} onCheckedChange={(v) => set({ includeUnpublished: v })} />
          </Row>
          <Row title={t.url.whichListings} hint={t.url.whichListingsHint}>
            <Select value={settings.listingScope} onValueChange={(v) => set({ listingScope: v as ExportFeedSettings['listingScope'] })}>
              <SelectTrigger className="w-full sm:w-[260px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t.url.allListings}</SelectItem>
                <SelectItem value="own">{t.url.ownOnly}</SelectItem>
                <SelectItem value="selected">{t.common.onlyPicked}</SelectItem>
              </SelectContent>
            </Select>
          </Row>
        </div>

        {settings.listingScope === 'selected' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInput}
                type="file"
                accept=".xml,.json,application/xml,text/xml,application/json"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && fromFile(e.target.files[0])}
              />
              <Button variant="outline" onClick={() => fileInput.current?.click()} disabled={matching}>
                {matching ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileUp className="h-4 w-4 mr-2" />}
                {t.feeds.fromFile}
              </Button>
              {settings.propertyIds.length > 0 && (
                <Button variant="ghost" onClick={() => set({ propertyIds: [] })}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  {t.feeds.clearAll}
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{t.feeds.fromFileHint}</p>
            {missing.length > 0 && (
              <details className="rounded-md border border-amber-300 p-3 text-sm">
                <summary className="cursor-pointer text-amber-700">{t.feeds.notFound(missing.length)}</summary>
                <p className="mt-2 font-mono text-xs text-muted-foreground break-words">{missing.join(', ')}</p>
              </details>
            )}
            <IdealistaListingPicker
              allTypes
              portal={settings.title || portal}
              ids={settings.propertyIds}
              onChange={(propertyIds) => set({ propertyIds })}
            />
          </div>
        )}

        <div className="space-y-2">
          <Label>{t.feeds.languages}</Label>
          <p className="text-xs text-muted-foreground">{t.feeds.languagesHint}</p>
          <div className="flex flex-wrap gap-2">
            {FEED_LANGUAGES.map((code) => {
              const at = settings.languages.indexOf(code);
              return (
                <Button
                  key={code}
                  type="button"
                  size="sm"
                  variant={at === -1 ? 'outline' : 'default'}
                  onClick={() => toggleLang(code)}
                >
                  {at !== -1 && <span className="mr-1 text-xs opacity-80">{at + 1}.</span>}
                  {langName(code)}
                </Button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <Label>{t.idealista.pageLink}</Label>
          <Input
            value={settings.propertyUrlPattern}
            maxLength={500}
            placeholder="https://www.example.com/en/property/{segment}"
            onChange={(e) => set({ propertyUrlPattern: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">{t.idealista.pageLinkHelp('{segment}', '{ref}')}</p>
        </div>

        {row && (
          <div className="flex flex-wrap gap-2 border-t pt-4">
            <Button variant="outline" onClick={props.onRegenerate}>
              <RefreshCw className="h-4 w-4 mr-2" />
              {t.idealista.newUrl}
            </Button>
            <Button variant="outline" className="text-destructive" onClick={props.onDelete}>
              <Trash2 className="h-4 w-4 mr-2" />
              {t.feeds.deleteFeed}
            </Button>
          </div>
        )}

        {row && (
          <div className="space-y-2 border-t pt-4">
            <p className="font-medium">{t.url.logTitle}</p>
            <p className="text-sm text-muted-foreground">{t.url.logDescription(row.title)}</p>
            <ExportLogTable format="xml" exportFeedId={row.id} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
