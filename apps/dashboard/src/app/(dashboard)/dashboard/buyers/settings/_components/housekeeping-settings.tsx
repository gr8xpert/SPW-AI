'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GitMerge, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useApi } from '@/hooks/use-api';
import { useTenantQueryScope } from '@/hooks/use-tenant-query-scope';
import { useToast } from '@/hooks/use-toast';
import { useBuyerText } from '../../_i18n/use-buyer-text';
import { buyerKeys, one } from '../../use-buyers';
import { ExportButton } from '../../_components/export-button';
import { dashboardLocale } from '@/i18n/i18n-provider';

interface DuplicateBuyer {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  agent: string | null;
  stage: string | null;
  createdAt: string;
}
interface Group {
  ids: number[];
  reasons: string[];
  buyers: DuplicateBuyer[];
}

// Settings → Housekeeping (managers): duplicates to merge, CSV export.
export function HousekeepingSettings({ canEdit }: { canEdit: boolean }) {
  const t = useBuyerText().housekeeping;
  const api = useApi();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { scope, ready } = useTenantQueryScope();
  const dup = useQuery({
    queryKey: ['buyers', 'duplicates', ...scope] as const,
    queryFn: async () => one<{ groups: Group[] }>(await api.get('/api/dashboard/buyers/duplicates')),
    enabled: ready && api.isReady && canEdit,
  });
  const merge = useMutation({
    mutationFn: async ({ keep, source }: { keep: number; source: number }) => one(await api.post(`/api/dashboard/buyers/${keep}/merge`, { sourceId: source })),
    onSuccess: () => {
      toast({ title: t.merged });
      void queryClient.invalidateQueries({ queryKey: buyerKeys.all });
    },
    onError: (e: Error) => toast({ title: t.failed, description: e.message, variant: 'destructive' }),
  });

  if (!canEdit) return null;
  const groups = dup.data?.groups ?? [];

  return (
    <div className="max-w-4xl space-y-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 pb-3">
          <div>
            <CardTitle className="text-base">{t.exportTitle}</CardTitle>
            <CardDescription>{t.exportHint}</CardDescription>
          </div>
          <ExportButton filters={{}} />
        </CardHeader>
      </Card>

      <Card data-testid="duplicates">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t.duplicates}</CardTitle>
          <CardDescription>{t.duplicatesHint}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {dup.isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : !groups.length ? (
            <p className="text-sm text-muted-foreground">{t.none}</p>
          ) : (
            groups.map((g) => {
              const keep = g.buyers[0];
              return (
                <div key={g.ids.join('-')} className="rounded-md border" data-group={g.ids.join('-')}>
                  <div className="flex flex-wrap gap-1 border-b bg-muted/40 px-3 py-1.5">
                    {g.reasons.map((r) => <Badge key={r} variant="outline" className="text-[10px]">{t.reasons[r] ?? r}</Badge>)}
                  </div>
                  {g.buyers.map((b) => (
                    <div key={b.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-sm">
                      <Link href={`/dashboard/buyers/${b.id}`} className="min-w-[160px] font-medium text-primary hover:underline">{b.name}</Link>
                      <span className="text-muted-foreground">{b.email ?? '—'}</span>
                      <span className="text-muted-foreground">{b.phone ?? ''}</span>
                      <span className="text-xs text-muted-foreground">{[b.stage, b.agent, new Date(b.createdAt).toLocaleDateString(dashboardLocale())].filter(Boolean).join(' · ')}</span>
                      <span className="ml-auto">
                        {b.id === keep.id ? (
                          <Badge variant="secondary">{t.keep}</Badge>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={merge.isPending}
                            data-testid={`merge-${b.id}`}
                            onClick={() => window.confirm(t.confirmMerge(b.name, keep.name)) && merge.mutate({ keep: keep.id, source: b.id })}
                          >
                            <GitMerge className="mr-1 h-4 w-4" />
                            {t.mergeInto(keep.name)}
                          </Button>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
