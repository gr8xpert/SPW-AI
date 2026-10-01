'use client';

import { AlertTriangle, Check, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface AiProposal {
  action: 'same' | 'new' | 'dismiss' | null;
  nodeId?: number;
  target?: string;
  reason?: string;
  km?: number | null;
  flagged?: boolean;
  at: string;
}

// What the AI review thinks an unknown feed name is, with how far the
// suggested place is from the listings, and Accept / Ask again.
export function AiSuggestion({
  proposal,
  busy,
  onAccept,
  onAsk,
}: {
  proposal: AiProposal | null | undefined;
  busy: boolean;
  onAccept: () => void;
  onAsk: () => void;
}) {
  if (!proposal) {
    return (
      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onAsk} disabled={busy}>
        {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Sparkles className="mr-1 h-3 w-3" />} Ask AI
      </Button>
    );
  }
  const what =
    proposal.action === 'same'
      ? `Same place as ${proposal.target?.split(' › ').slice(-1)[0] ?? ''}`
      : proposal.action === 'new'
        ? `New town in ${proposal.target?.split(' › ').slice(-1)[0] ?? ''}`
        : proposal.action === 'dismiss'
          ? 'Not a place — dismiss'
          : 'AI not sure';
  return (
    <div className="min-w-[220px] max-w-[320px] space-y-1" data-testid="ai-suggestion">
      <p className="text-sm font-medium">{what}</p>
      {proposal.target && proposal.action !== 'dismiss' && (
        <p className="truncate text-xs text-muted-foreground" title={proposal.target}>
          {proposal.target}
        </p>
      )}
      {proposal.reason && <p className="text-xs italic text-muted-foreground">{proposal.reason}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {proposal.action && proposal.action !== 'dismiss' && (
          proposal.km == null ? (
            <span className="text-xs text-muted-foreground">no GPS to check</span>
          ) : proposal.flagged ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600">
              <AlertTriangle className="h-3 w-3" /> {proposal.km} km from the listings
            </span>
          ) : (
            <span className="text-xs text-green-700">{proposal.km} km from the listings</span>
          )
        )}
        {proposal.action && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onAccept} disabled={busy} data-testid="ai-accept">
            {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Check className="mr-1 h-3 w-3" />} Accept
          </Button>
        )}
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onAsk} disabled={busy}>
          Ask again
        </Button>
      </div>
    </div>
  );
}
