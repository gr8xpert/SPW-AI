'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { apiPost } from '@/lib/api';
import { errorText, unwrap } from './idealista-api';
import { useFeedExportText, type FeedExportText } from './_i18n';

// "Push Now" on the URL feeds (idealista, Kyero XML, JSON). The reader fetches
// these itself, so the run generates the feed and logs it; nothing is sent,
// and the result says so.

export function runErrorText(err: unknown, t: FeedExportText): string {
  const status = (err as { response?: { status?: number } })?.response?.status;
  if (status === 409) return t.run.alreadyRunning;
  if (status === 429) return t.run.tooSoon;
  return errorText(err, t.common.somethingWrong);
}

export function FeedRunButton(props: {
  url: string;
  // Omitted for the JSON feed, which has no one portal behind it.
  portal?: string;
  enabled: boolean;
  onDone?: () => void;
}) {
  const t = useFeedExportText();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    try {
      const r = unwrap<{ listings: number; skipped: number }>(await apiPost(props.url));
      toast({
        title: t.run.generated,
        description: `${t.run.generatedText(r.listings, r.skipped)} ${props.portal ? t.run.next(props.portal) : t.run.nextJson}`,
      });
      queryClient.invalidateQueries({ queryKey: ['feed-export-logs'] });
      props.onDone?.();
    } catch (err) {
      toast({ title: t.run.failed, description: runErrorText(err, t), variant: 'destructive' });
    } finally {
      setRunning(false);
    }
  };

  return (
    <Button variant="outline" onClick={run} disabled={running || !props.enabled}>
      {running ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
      {t.rightmove.pushNow}
    </Button>
  );
}

// The line under the card title: why the button is off, or what it can't do.
export function FeedRunNote({ portal, enabled }: { portal?: string; enabled: boolean }) {
  const t = useFeedExportText();
  return (
    <p className="text-xs text-muted-foreground mt-1">
      {!enabled ? t.run.offHint : portal ? t.run.note(portal) : t.run.noteJson}
    </p>
  );
}
