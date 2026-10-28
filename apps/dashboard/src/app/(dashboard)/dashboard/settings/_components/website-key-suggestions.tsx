'use client';

import { Loader2, Sparkles } from 'lucide-react';
import type { ApiKeyScope } from '@spm/shared';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useWebsiteKeysText } from './website-keys-text';
import { useSuggestKeys, type KeySuggestion } from './use-website-keys';

// "Suggest keys with AI": websites worth having from how the client's stock
// splits. "Use this" opens the editor filled in; nothing is saved until then.
export function WebsiteKeySuggestions({
  chips,
  onUse,
}: {
  chips: (scope: ApiKeyScope) => string[];
  onUse: (suggestion: KeySuggestion) => void;
}) {
  const t = useWebsiteKeysText();
  const { toast } = useToast();
  const suggest = useSuggestKeys();

  return (
    <div className="space-y-3 rounded-lg border border-dashed p-4" data-testid="wk-suggestions">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{t.suggestTitle}</p>
          <p className="text-xs text-muted-foreground">{t.suggestHint}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={suggest.isPending}
          onClick={() => suggest.mutate(undefined, { onError: (err) => toast({ title: t.failed, description: err.message, variant: 'destructive' }) })}
        >
          {suggest.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          {suggest.isPending ? t.suggesting : t.suggest}
        </Button>
      </div>
      {suggest.data && suggest.data.length === 0 && <p className="text-sm text-muted-foreground">{t.noSuggestions}</p>}
      {suggest.data?.map((sg, i) => (
        <div key={i} className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted/40 p-3">
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium">{sg.name}</p>
            <div className="flex flex-wrap gap-1.5">
              {chips(sg.scope).map((c, j) => (
                <span key={j} className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{c}</span>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{sg.why}</p>
          </div>
          <Button size="sm" onClick={() => onUse(sg)}>{t.useIt}</Button>
        </div>
      ))}
    </div>
  );
}
