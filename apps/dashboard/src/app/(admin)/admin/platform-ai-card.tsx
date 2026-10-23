'use client';

import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useApi } from '@/hooks/use-api';

interface PlatformAiStatus {
  active: 'anthropic' | 'openrouter' | 'none';
  anthropic: {
    configured: boolean;
    model: string;
    month: string;
    spentUsd: number;
    budgetUsd: number;
    paused: 'budget' | 'credits' | 'auth' | 'workspace' | null;
  };
  openrouterConfigured: boolean;
}

const PAUSED: Record<NonNullable<PlatformAiStatus['anthropic']['paused']>, string> = {
  budget: 'Monthly budget reached — back on Anthropic next month',
  credits: 'Anthropic credit used up — retrying within the hour',
  auth: 'Anthropic key rejected — check ANTHROPIC_API_KEY',
  workspace: 'Anthropic key is not linked to a workspace — create the key inside a workspace in the Anthropic Console',
};

// Which account pays for platform AI (templates, translation memory,
// locations/types for clients without a key) and this month's Anthropic spend.
export function PlatformAiCard() {
  const api = useApi();
  const [status, setStatus] = useState<PlatformAiStatus | null>(null);

  useEffect(() => {
    if (!api.isReady) return;
    api
      .get('/api/super-admin/ai/platform')
      .then((res) => setStatus((res as { data: PlatformAiStatus }).data))
      .catch((err) => console.error('Failed to fetch platform AI status:', err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.isReady]);

  if (!status) return null;
  const { anthropic } = status;
  const pct = anthropic.budgetUsd > 0 ? Math.min(100, (anthropic.spentUsd / anthropic.budgetUsd) * 100) : 0;

  return (
    <Card className="animate-fade-in">
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary/70" />
            Platform AI
          </CardTitle>
          <CardDescription>Templates, translation memory, and clients without their own key</CardDescription>
        </div>
        <Badge variant={status.active === 'none' ? 'destructive' : 'secondary'}>
          {status.active === 'anthropic' ? 'Anthropic' : status.active === 'openrouter' ? 'OpenRouter' : 'No key'}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-2">
        {anthropic.configured ? (
          <>
            <div className="flex items-center justify-between text-sm">
              <span>
                Anthropic credit used in {anthropic.month}{' '}
                <span className="text-muted-foreground">({anthropic.model})</span>
              </span>
              <span className="font-mono tabular-nums">
                ${anthropic.spentUsd.toFixed(2)} / ${anthropic.budgetUsd.toFixed(0)}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">
              {anthropic.paused
                ? PAUSED[anthropic.paused]
                : `Estimated from token counts; the Anthropic console has the exact bill.`}
              {!status.openrouterConfigured && ' No OpenRouter platform key is set as a fallback.'}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {status.openrouterConfigured
              ? 'ANTHROPIC_API_KEY is not set, so platform AI runs on the OpenRouter platform key.'
              : 'No platform AI key is set (ANTHROPIC_API_KEY or OPENROUTER_API_KEY): AI Organize and Translation Memory only work for clients with their own key.'}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
