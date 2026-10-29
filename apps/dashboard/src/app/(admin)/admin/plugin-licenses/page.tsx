'use client';

import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Plus, RefreshCw, Search } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { IssueDialog } from './issue-dialog';
import { LicenseDetailDialog } from './license-detail';
import { StatusBadge } from './status-badge';
import { LicenseRow, LicenseSummary, PluginPlan, StatusFilter, daysUntil, unwrap } from './types';

const FILTERS: { id: StatusFilter; label: string; count?: keyof LicenseSummary }[] = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active', count: 'active' },
  { id: 'expiring', label: 'Expiring in 30 days', count: 'expiring' },
  { id: 'expired', label: 'Expired', count: 'expired' },
  { id: 'revoked', label: 'Revoked', count: 'revoked' },
];

interface ListResponse {
  items: LicenseRow[];
  total: number;
  page: number;
  pageSize: number;
  summary: LicenseSummary;
}

// Licence keys for SPM AI Translator for Polylang. Clients pay on realtysoft.eu (one checkout for
// several packages), a super admin confirms the payment and issues the key here.
export default function PluginLicensesPage() {
  const api = useApi();
  const { toast } = useToast();
  const [data, setData] = useState<ListResponse | null>(null);
  const [plans, setPlans] = useState<PluginPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const [issueOpen, setIssueOpen] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ q: query, status: filter, page: String(page) });
      setData(unwrap<ListResponse>(await api.get(`/api/super-admin/plugin-licenses?${params}`)));
    } catch (e: any) {
      toast({ title: 'Could not load licences', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.get, query, filter, page]);

  useEffect(() => {
    // Wait for the session token, as on the other admin pages.
    if (!api.isReady) return;
    fetchList();
  }, [api.isReady, fetchList]);

  useEffect(() => {
    if (!api.isReady) return;
    api.get('/api/super-admin/plugin-licenses/plans').then((r) => setPlans(unwrap<PluginPlan[]>(r))).catch(() => setPlans([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.isReady]);

  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      setQuery(q.trim());
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const summary = data?.summary;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Plugin Licences</h1>
          <p className="page-description mt-1">SPM AI Translator for Polylang: issue keys after payment, and manage sites and renewals</p>
        </div>
        <Button className="shadow-sm" onClick={() => setIssueOpen(true)} disabled={!plans.length}>
          <Plus className="mr-2 h-4 w-4" />
          Issue key
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Tile label="Active licences" value={summary?.active} />
        <Tile label="Expiring in 30 days" value={summary?.expiring} warn={!!summary?.expiring} />
        <Tile label="Expired" value={summary?.expired} />
        <Tile label="Revoked" value={summary?.revoked} />
        <Tile label="Activated sites" value={summary?.sites} />
      </div>

      <Card>
        <CardHeader className="space-y-4">
          <div>
            <CardTitle>Licences</CardTitle>
            <CardDescription>Search by email, client name, note, or the last 4 characters of a key.</CardDescription>
          </div>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="relative md:w-80">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search licences" aria-label="Search licences" />
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
              {FILTERS.map((f) => (
                <Button
                  key={f.id}
                  size="sm"
                  variant={filter === f.id ? 'default' : 'outline'}
                  aria-pressed={filter === f.id}
                  onClick={() => {
                    setFilter(f.id);
                    setPage(1);
                  }}
                >
                  {f.label}
                  {f.count && summary ? <span className="ml-1.5 opacity-70">{summary[f.count]}</span> : null}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading && !data ? (
            <div className="flex h-32 items-center justify-center"><RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : !data?.items.length ? (
            <div className="flex h-32 flex-col items-center justify-center text-muted-foreground">
              <KeyRound className="mb-2 h-8 w-8" />
              <p className="text-sm">{query || filter !== 'all' ? 'No licences match.' : 'No licences yet. Issue the first key when a client has paid.'}</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Sites</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Key</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((l) => {
                    const left = daysUntil(l.expiresAt);
                    return (
                      <TableRow key={l.id} className="cursor-pointer" onClick={() => setOpenId(l.id)}>
                        <TableCell>
                          <button type="button" className="text-left" onClick={() => setOpenId(l.id)}>
                            <p className="font-medium">{l.customerName || l.email}</p>
                            <p className="text-xs text-muted-foreground">{l.customerName ? l.email : l.notes ?? ''}</p>
                          </button>
                        </TableCell>
                        <TableCell>
                          <p>{l.planLabel}</p>
                          {l.credits && <p className="text-xs text-muted-foreground">{l.credits.words_used.toLocaleString('en-GB')} / {l.credits.words_allowed.toLocaleString('en-GB')} words</p>}
                        </TableCell>
                        <TableCell><StatusBadge status={l.status} /></TableCell>
                        <TableCell className="font-mono">{l.sitesUsed} / {l.sitesAllowed}</TableCell>
                        <TableCell>
                          <p>{l.expiresAt ? new Date(l.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</p>
                          {left !== null && l.status === 'active' && (
                            <p className={cn('text-xs', left <= 30 ? 'text-destructive' : 'text-muted-foreground')}>in {left} days</p>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-muted-foreground">…{l.last4}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {pages > 1 && (
                <div className="mt-4 flex items-center justify-end gap-2 text-sm">
                  <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
                  <span className="text-muted-foreground">Page {page} of {pages}</span>
                  <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <IssueDialog open={issueOpen} onOpenChange={setIssueOpen} plans={plans} onIssued={fetchList} />
      <LicenseDetailDialog licenseId={openId} plans={plans} onClose={() => setOpenId(null)} onChanged={fetchList} />
    </div>
  );
}

function Tile({ label, value, warn }: { label: string; value?: number; warn?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn('mt-1 text-2xl font-semibold', warn && 'text-destructive')}>{value ?? '—'}</p>
      </CardContent>
    </Card>
  );
}
