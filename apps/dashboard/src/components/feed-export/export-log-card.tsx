'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTenantQueryScope } from '@/hooks/use-tenant-query-scope';
import { useLanguage } from '@/i18n/i18n-provider';
import { apiGet } from '@/lib/api';
import { unwrap } from './idealista-api';
import { useFeedExportText } from './_i18n';

// One row per export run: when a portal read the feed and how many listings
// it got. Each feed reads its own rows, so a busy feed can't push another's out.

interface ExportLog {
  id: number;
  propertiesCount: number;
  requesterIp: string | null;
  responseTimeMs: number | null;
  accessedAt: string;
}

const LOG_DAYS = 30;

export function ExportLogTable({ format, apiKeyId }: { format: 'xml' | 'json' | 'idealista'; apiKeyId?: number }) {
  const t = useFeedExportText();
  const { locale } = useLanguage();
  const { scope, ready } = useTenantQueryScope();
  const { data, isPending, isError, isFetching, refetch } = useQuery({
    queryKey: ['feed-export-logs', ...scope, format, apiKeyId ?? null],
    queryFn: async () =>
      unwrap<ExportLog[]>(
        await apiGet('/api/dashboard/feed-export/logs', {
          params: { format, days: LOG_DAYS, ...(apiKeyId ? { apiKeyId } : {}) },
        }),
      ),
    enabled: ready,
  });
  const logs = data ?? [];

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          {t.rmLog.refresh}
        </Button>
      </div>
      {isPending ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : isError ? (
        <div className="text-center py-8 text-destructive text-sm">{t.url.logFailed}</div>
      ) : logs.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">{t.url.noDownloads}</div>
      ) : (
        <div className="max-h-[420px] overflow-y-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.url.date}</TableHead>
                <TableHead>{t.url.logEntry}</TableHead>
                <TableHead>{t.url.ipAddress}</TableHead>
                <TableHead>{t.url.responseTime}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="whitespace-nowrap">{new Date(log.accessedAt).toLocaleString(locale)}</TableCell>
                  <TableCell>{t.url.exported(log.propertiesCount.toLocaleString(locale))}</TableCell>
                  <TableCell className="font-mono text-sm">{log.requesterIp}</TableCell>
                  <TableCell>{log.responseTimeMs === null ? '' : t.url.ms(log.responseTimeMs)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

export function ExportLogCard({ feedName, format }: { feedName: string; format: 'xml' | 'json' | 'idealista' }) {
  const t = useFeedExportText();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.url.logTitle}</CardTitle>
        <CardDescription>{t.url.logDescription(feedName)}</CardDescription>
      </CardHeader>
      <CardContent>
        <ExportLogTable format={format} />
      </CardContent>
    </Card>
  );
}
