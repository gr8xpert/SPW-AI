'use client';

import { formatHM } from '@/lib/time';
import { formatMoney } from '@/lib/utils';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, RefreshCw, RotateCcw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface XeroLog {
  id: number;
  tenantId: number;
  stripeSessionId: string | null;
  status: 'pending' | 'sent' | 'confirmed' | 'failed';
  hours: number;
  amountEur: number;
  currency: string;
  xeroInvoiceId: string | null;
  error: string | null;
  attempts: number;
  lastAttemptAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface XeroLogList {
  data: XeroLog[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const statusBadge = (s: XeroLog['status']): 'default' | 'secondary' | 'destructive' | 'outline' => {
  if (s === 'confirmed') return 'default';
  if (s === 'sent') return 'secondary';
  if (s === 'failed') return 'destructive';
  return 'outline';
};

export default function XeroSyncPage() {
  const api = useApi();
  const { toast } = useToast();

  const [rows, setRows] = useState<XeroLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>('all');
  const [retrying, setRetrying] = useState<number | null>(null);

  // Plain function, not useCallback. Wrapping it froze the closure on the
  // first render — before the session hydrates — so the request went out with
  // no Authorization header and 401'd every time, leaving the table
  // permanently empty. Same trap as the locations page.
  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status !== 'all') params.append('status', status);
      params.append('limit', '100');
      const response = await api.get(`/api/super-admin/xero-sync?${params.toString()}`);
      const body = (response as unknown as XeroLogList | { data: XeroLog[] }) ?? { data: [] };
      // Response is unwrapped by useApi (interceptor returns .data)
      setRows((body as XeroLogList).data ?? []);
    } catch (err) {
      console.error('Failed to load Xero sync log', err);
      toast({ title: 'Failed to load Xero sync log', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!api.isReady) return;
    fetchLogs();
  }, [api.isReady, status]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRetry = async (id: number) => {
    setRetrying(id);
    try {
      await api.post(`/api/super-admin/xero-sync/${id}/retry`);
      toast({
        title: 'Retry queued',
        description: `Row #${id} re-sent to n8n.`,
      });
      await fetchLogs();
    } catch (err: any) {
      toast({
        title: 'Retry failed',
        description: err?.message || 'Server error',
        variant: 'destructive',
      });
    } finally {
      setRetrying(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div className="flex items-center gap-4">
          <Link href="/admin">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="page-title">Xero Invoice Sync</h1>
            <p className="page-description mt-1">
              Log of credit-purchase invoices sent to Xero via n8n. Auto-retry runs every 10 minutes.
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={fetchLogs} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent syncs</CardTitle>
          <CardDescription>
            One row per Stripe checkout session. &quot;Confirmed&quot; means n8n reported the Xero invoice id back.
          </CardDescription>
          <div className="pt-2">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No sync rows yet. They appear after a client buys credits via Stripe.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Xero Invoice</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead className="w-[110px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>#{r.id}</TableCell>
                    <TableCell>
                      <Link href={`/admin/clients/${r.tenantId}`} className="hover:underline">
                        #{r.tenantId}
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatHM(r.hours)} · {formatMoney(r.amountEur, r.currency)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusBadge(r.status)}>{r.status}</Badge>
                    </TableCell>
                    <TableCell>{r.attempts}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {r.xeroInvoiceId ?? '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}
                    </TableCell>
                    <TableCell className="max-w-[240px]">
                      {r.error ? (
                        <span className="text-xs text-muted-foreground truncate block" title={r.error}>
                          {r.error}
                        </span>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>
                      {r.status !== 'confirmed' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRetry(r.id)}
                          disabled={retrying === r.id}
                        >
                          {retrying === r.id ? (
                            <RefreshCw className="h-3 w-3 animate-spin" />
                          ) : (
                            <RotateCcw className="h-3 w-3" />
                          )}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
