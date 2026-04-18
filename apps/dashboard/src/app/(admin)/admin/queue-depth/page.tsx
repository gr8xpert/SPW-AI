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
import { apiGet } from '@/lib/api';

// 6C — BullMQ queue-depth observability. Mirrors the 5S rate-limits
// page UX (manual Refresh, banded status, worst-first order). No
// auto-poll: a stuck tab must not hammer Redis on a 30s loop in
// production.

interface QueueRow {
  name: string;
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  paused: boolean;
  status: 'ok' | 'warning' | 'critical';
}
interface QueueResponse {
  data: QueueRow[];
}

export default function QueueDepthPage() {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<QueueResponse>('/api/super-admin/queue-depth');
      setRows(res.data);
      setRefreshedAt(new Date());
    } catch (err) {
      setError((err as Error).message || 'Failed to load queue depth');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const statusClass = (s: QueueRow['status']) =>
    s === 'critical'
      ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
      : s === 'warning'
      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
      : 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300';

  const renderCount = (n: number) => (n < 0 ? '—' : n.toLocaleString());

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Queue Depth</h1>
          <p className="text-muted-foreground">
            BullMQ backlogs per tracked queue. Worst-first so a stuck
            queue surfaces above the healthy ones.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {refreshedAt && (
            <span className="text-xs text-muted-foreground">
              Refreshed {refreshedAt.toLocaleTimeString()}
            </span>
          )}
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw
              className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Per-queue backlog</CardTitle>
          <CardDescription>
            Warning band: waiting ≥ 100 or failed ≥ 10. Critical: waiting
            ≥ 500, failed ≥ 50, or queue paused. A dash (—) means the
            queue couldn&apos;t be read — investigate Redis connectivity.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          ) : loading && rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No queues configured.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 pr-3 font-medium">Queue</th>
                    <th className="py-2 pr-3 font-medium text-right">
                      Waiting
                    </th>
                    <th className="py-2 pr-3 font-medium text-right">
                      Active
                    </th>
                    <th className="py-2 pr-3 font-medium text-right">
                      Delayed
                    </th>
                    <th className="py-2 pr-3 font-medium text-right">
                      Failed
                    </th>
                    <th className="py-2 pr-3 font-medium">Paused</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.name} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-mono">{r.name}</td>
                      <td className="py-2 pr-3 text-right font-mono">
                        {renderCount(r.waiting)}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono">
                        {renderCount(r.active)}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono">
                        {renderCount(r.delayed)}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono">
                        {renderCount(r.failed)}
                      </td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground">
                        {r.paused ? 'yes' : '—'}
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
