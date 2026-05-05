'use client';

import { useEffect, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { useApi } from '@/hooks/use-api';

interface HeadroomRow {
  tenantId: number;
  tenantName: string;
  tenantSlug: string;
  planName: string | null;
  ratePerMinute: number;
  currentUsage: number;
  headroomPercent: number;
  status: 'ok' | 'warning' | 'critical';
}

export default function RateLimitsPage() {
  const api = useApi();
  const [rows, setRows] = useState<HeadroomRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/api/super-admin/rate-limit-headroom');
      const body = res?.data || res;
      setRows(Array.isArray(body) ? body : body?.data || []);
      setRefreshedAt(new Date());
    } catch (err) {
      setError((err as Error).message || 'Failed to load headroom');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const statusClass = (s: HeadroomRow['status']) =>
    s === 'critical'
      ? 'bg-primary/20 text-primary font-semibold'
      : s === 'warning'
      ? 'bg-secondary text-primary/80'
      : 'bg-secondary/50 text-primary/60';

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Rate Limits</h1>
          <p className="page-description mt-1">
            Current per-client headroom against their plan&apos;s
            per-minute ceiling. Sorted busiest-first.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {refreshedAt && (
            <span className="text-xs text-muted-foreground">
              Refreshed {refreshedAt.toLocaleTimeString()}
            </span>
          )}
          <Button variant="outline" className="shadow-sm" onClick={load} disabled={loading}>
            <RefreshCw
              className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Per-client usage</CardTitle>
          <CardDescription>
            Usage is summed across every throttler key tagged with the
            client&apos;s API key hash in the last 60 seconds. Counts reset
            when the client&apos;s bucket TTL expires.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="text-sm text-primary/70">{error}</p>
          ) : loading && rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Loading\u2026</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No active clients.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 pr-3 font-medium">Client</th>
                    <th className="py-2 pr-3 font-medium">Plan</th>
                    <th className="py-2 pr-3 font-medium text-right">
                      Usage
                    </th>
                    <th className="py-2 pr-3 font-medium text-right">
                      Limit
                    </th>
                    <th className="py-2 pr-3 font-medium text-right">
                      Headroom
                    </th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.tenantId} className="border-b last:border-0">
                      <td className="py-2 pr-3">
                        <div className="flex flex-col">
                          <span className="font-medium">{r.tenantName}</span>
                          <span className="text-xs text-muted-foreground font-mono">
                            {r.tenantSlug}
                          </span>
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground">
                        {r.planName ?? '\u2014'}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono">
                        {r.currentUsage}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono">
                        {r.ratePerMinute}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono">
                        {r.headroomPercent.toFixed(1)}%
                      </td>
                      <td className="py-2 pr-3">
                        <span
                          className={
                            'text-xs font-medium rounded px-2 py-1 ' +
                            statusClass(r.status)
                          }
                        >
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
