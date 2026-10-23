'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useApi } from '@/hooks/use-api';
import { useLanguage } from '@/i18n/i18n-provider';
import { useCampaignsText } from '../../_i18n';
import { useCampaignsMoreText } from '../../_i18n/more';

interface RecipientRow {
  id: number;
  status: string;
  sentAt: string | null;
  openedAt: string | null;
  clickedAt: string | null;
  unsubscribedAt: string | null;
  errorMessage: string | null;
  contact: { id: number; email: string; name: string | null } | null;
}

interface RecipientPage {
  data: RecipientRow[];
  meta: { total: number; page: number; limit: number; pages: number };
}

const FILTERS = ['sent', 'opened', 'clicked', 'failed', 'unsubscribed', 'pending'] as const;

export function CampaignRecipients({ campaignId, refreshKey }: { campaignId: number; refreshKey: number }) {
  const api = useApi();
  const t = useCampaignsText();
  const m = useCampaignsMoreText();
  const { locale } = useLanguage();
  const [status, setStatus] = useState<string>('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<RecipientPage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!api.isReady) return;
    let live = true;
    setLoading(true);
    const q = new URLSearchParams({ page: String(page), limit: '25', ...(status ? { status } : {}) });
    api
      .get(`/api/dashboard/campaigns/${campaignId}/recipients?${q}`)
      .then((res) => { if (live) setResult(res as RecipientPage); })
      .catch(() => { if (live) setResult(null); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [api.isReady, campaignId, status, page, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const when = (d: string | null) =>
    d ? new Date(d).toLocaleString(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

  const pick = (s: string) => { setStatus(s); setPage(1); };
  const rows = result?.data ?? [];
  const meta = result?.meta;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.detail.recipientsCount(meta?.total ?? 0)}</CardTitle>
        <CardDescription>{t.detail.recipientsDescription}</CardDescription>
        <div className="flex flex-wrap gap-2 pt-2">
          <button type="button" onClick={() => pick('')}>
            <Badge variant={status === '' ? 'default' : 'outline'}>{m.filterAll}</Badge>
          </button>
          {FILTERS.map((f) => (
            <button key={f} type="button" onClick={() => pick(f)}>
              <Badge variant={status === f ? 'default' : 'outline'}>{m.filters[f]}</Badge>
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {loading && !result ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{m.noRecipients}</p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.detail.colContact}</TableHead>
                  <TableHead>{t.common.status}</TableHead>
                  <TableHead>{m.colSent}</TableHead>
                  <TableHead>{t.detail.colOpened}</TableHead>
                  <TableHead>{t.detail.colClicked}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <p className="font-medium">{r.contact?.name || r.contact?.email || '—'}</p>
                      {r.contact?.name && <p className="text-sm text-muted-foreground">{r.contact.email}</p>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.status === 'sent' ? 'success' : r.status === 'pending' ? 'secondary' : 'destructive'}>
                        {t.detail.recipientStatus[r.status] ?? r.status}
                      </Badge>
                      {r.unsubscribedAt && <Badge variant="outline" className="ml-1">{m.filters.unsubscribed}</Badge>}
                      {r.errorMessage && r.status !== 'sent' && (
                        <p className="mt-1 max-w-[260px] truncate text-xs text-muted-foreground" title={r.errorMessage}>{r.errorMessage}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{when(r.sentAt)}</TableCell>
                    <TableCell className="text-sm">{when(r.openedAt)}</TableCell>
                    <TableCell className="text-sm">{when(r.clickedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {meta && meta.pages > 1 && (
              <div className="mt-4 flex items-center justify-end gap-2">
                <span className="text-sm text-muted-foreground">{meta.page} / {meta.pages}</span>
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={page >= meta.pages} onClick={() => setPage((p) => p + 1)} aria-label="Next">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
