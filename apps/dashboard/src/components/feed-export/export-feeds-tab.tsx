'use client';

import { useEffect, useState } from 'react';
import { Loader2, Pencil, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/i18n/i18n-provider';
import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api';
import { API_URL, errorText, unwrap } from './idealista-api';
import { ExportFeedEditor } from './export-feed-editor';
import {
  FORMAT_FILES,
  NEW_FEED,
  settingsOf,
  type ExportFeedRow,
  type ExportFeedSettings,
} from './export-feeds-api';
import type { ExportStatus } from './export-status';
import { useFeedExportText } from './_i18n';

// Feed Export -> Feeds: the client's extra portal feeds, as a list like the
// old CRM's "Export Feed" screen. Each row opens its settings below the list.

export function ExportFeedsTab({ ready, onStatus }: { ready: boolean; onStatus?: (s: ExportStatus) => void }) {
  const t = useFeedExportText();
  const { locale } = useLanguage();
  const { toast } = useToast();
  const [feeds, setFeeds] = useState<ExportFeedRow[] | null>(null);
  const [tenantSlug, setTenantSlug] = useState('');
  const [failed, setFailed] = useState(false);
  // 'new' = a feed being added; a number = that feed open.
  const [open, setOpen] = useState<number | 'new' | null>(null);
  const [edit, setEdit] = useState<ExportFeedSettings>(NEW_FEED);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const body = unwrap<{ tenantSlug: string; feeds: ExportFeedRow[] }>(await apiGet('/api/dashboard/feed-export/feeds'));
      setFeeds(body.feeds);
      setTenantSlug(body.tenantSlug);
      setFailed(false);
      return body.feeds;
    } catch {
      setFailed(true);
      return null;
    }
  };

  useEffect(() => {
    if (ready) load();
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!feeds || !onStatus) return;
    const on = feeds.filter((f) => f.isEnabled);
    onStatus(!on.length ? 'off' : on.some((f) => f.skippedCount) ? 'warn' : 'on');
  }, [feeds]); // eslint-disable-line react-hooks/exhaustive-deps

  const row = typeof open === 'number' ? feeds?.find((f) => f.id === open) ?? null : null;
  // A feed moved over from the old Kyero XML tab keeps the URL portals already have.
  const feedUrl = (f: ExportFeedRow) =>
    f.feedKey.startsWith('sk_export_')
      ? `${API_URL}/api/feed/${tenantSlug}/properties.xml?key=${encodeURIComponent(f.feedKey)}`
      : `${API_URL}/api/feed/${tenantSlug}/x/${f.feedKey}/${FORMAT_FILES[f.format]}`;

  const openFeed = (f: ExportFeedRow) => {
    setOpen(f.id);
    setEdit(settingsOf(f));
  };

  const startNew = () => {
    setOpen('new');
    setEdit({ ...NEW_FEED });
  };

  const save = async () => {
    if (!edit.title.trim()) {
      toast({ title: t.feeds.needTitle, variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const saved = unwrap<ExportFeedRow>(
        open === 'new'
          ? await apiPost('/api/dashboard/feed-export/feeds', edit)
          : await apiPut(`/api/dashboard/feed-export/feeds/${open}`, edit),
      );
      toast({ title: open === 'new' ? t.feeds.created : t.page.settingsSaved(saved.title) });
      await load();
      setOpen(saved.id);
      setEdit(settingsOf(saved));
    } catch (err) {
      toast({ title: t.page.saveFailed, description: errorText(err, ''), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!row || !window.confirm(t.feeds.deleteConfirm(row.title))) return;
    try {
      await apiDelete(`/api/dashboard/feed-export/feeds/${row.id}`);
      toast({ title: t.feeds.deleted });
      setOpen(null);
      load();
    } catch (err) {
      toast({ title: t.common.somethingWrong, description: errorText(err, ''), variant: 'destructive' });
    }
  };

  const regenerate = async () => {
    if (!row || !window.confirm(t.idealista.newUrlWarning)) return;
    try {
      await apiPost(`/api/dashboard/feed-export/feeds/${row.id}/regenerate-key`);
      toast({ title: t.idealista.newUrlCreated, description: t.page.oldUrlDead(row.title) });
      load();
    } catch (err) {
      toast({ title: t.idealista.newUrlFailed, description: errorText(err, ''), variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <CardTitle>{t.feeds.title}</CardTitle>
              <CardDescription>{t.feeds.description}</CardDescription>
            </div>
            <Button className="shadow-sm" onClick={startNew}>
              <Plus className="h-4 w-4 mr-2" />
              {t.feeds.newFeed}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {failed ? (
            <p className="text-sm text-destructive">{t.feeds.loadFailed}</p>
          ) : !feeds ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : feeds.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.feeds.noFeeds}</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.feeds.feedType}</TableHead>
                    <TableHead>{t.feeds.feedTitle}</TableHead>
                    <TableHead className="text-right">{t.common.listings}</TableHead>
                    <TableHead>{t.feeds.status}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {feeds.map((f) => (
                    <TableRow key={f.id} className={`cursor-pointer ${open === f.id ? 'bg-muted/60' : ''}`} onClick={() => openFeed(f)}>
                      <TableCell className="whitespace-nowrap">{f.formatLabel}</TableCell>
                      <TableCell className="font-medium break-words">{f.title}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {f.propertyCount.toLocaleString(locale)}
                        {!!f.skippedCount && <span className="text-amber-600"> (+{f.skippedCount} {t.common.leftOut})</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant={f.isEnabled ? 'default' : 'secondary'}>{f.isEnabled ? t.common.on : t.common.off}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" aria-label={t.feeds.edit} onClick={(e) => { e.stopPropagation(); openFeed(f); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {open !== null && (open === 'new' || row) && (
        <ExportFeedEditor
          key={open}
          row={row}
          settings={edit}
          onChange={setEdit}
          onSave={save}
          onDelete={remove}
          onRegenerate={regenerate}
          onClose={() => setOpen(null)}
          onRan={load}
          saving={saving}
          feedUrl={row ? feedUrl(row) : ''}
        />
      )}
    </div>
  );
}
