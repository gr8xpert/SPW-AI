'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApi } from '@/hooks/use-api';
import { useLanguage } from '@/i18n/i18n-provider';
import { useAiChatText } from '../_i18n';
import { useAiChatTranscriptText } from '../_i18n/transcript';

interface TranscriptMessage {
  id: number;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  toolName: string | null;
  createdAt: string;
}

interface Transcript {
  id: number;
  propertyReference: string | null;
  createdAt: string;
  messages: TranscriptMessage[];
}

// **bold** as the website chat shows it (text nodes only).
function boldText(text: string) {
  return text.split(/(\*\*[^*\n]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? <strong key={i}>{part.slice(2, -2)}</strong> : part,
  );
}

// One website chat, as the visitor and the assistant wrote it. Lookups the
// assistant made are shown as small notes between the messages.
export function ConversationDialog({ id, onClose }: { id: number | null; onClose: () => void }) {
  const api = useApi();
  const t = useAiChatText();
  const x = useAiChatTranscriptText();
  const { locale } = useLanguage();
  const [data, setData] = useState<Transcript | null | 'error'>(null);

  useEffect(() => {
    if (!api.isReady || id === null) return;
    let live = true;
    setData(null);
    api
      .get(`/api/dashboard/ai-chat/conversations/${id}`)
      .then((res) => { if (live) setData(((res as { data?: Transcript })?.data ?? res) as Transcript); })
      .catch(() => { if (live) setData('error'); });
    return () => { live = false; };
  }, [api.isReady, id]); // eslint-disable-line react-hooks/exhaustive-deps

  const time = (d: string) => new Date(d).toLocaleString(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <Dialog open={id !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{id !== null ? x.title(id) : ''}</DialogTitle>
          <DialogDescription>
            {data && data !== 'error' ? (
              <>
                {time(data.createdAt)}
                {data.propertyReference ? ` · ${x.viewing(data.propertyReference)}` : ''}
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        {data === null ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {x.loading}
          </div>
        ) : data === 'error' ? (
          <p className="py-10 text-center text-sm text-destructive">{x.loadFailed}</p>
        ) : (
          <div className="space-y-3 py-2">
            {data.messages.map((msg) =>
              msg.role === 'tool' ? (
                <p key={msg.id} className="flex items-center gap-1.5 pl-1 text-xs text-muted-foreground">
                  <Wrench className="h-3 w-3" />
                  {x.usedTool(t.tools[msg.toolName ?? ''] || msg.toolName || '')}
                </p>
              ) : msg.role === 'system' ? null : (
                <div key={msg.id} className={cn('flex flex-col', msg.role === 'user' ? 'items-end' : 'items-start')}>
                  <div
                    className={cn(
                      'max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2 text-sm',
                      msg.role === 'user' ? 'rounded-br-sm bg-primary text-primary-foreground' : 'rounded-bl-sm bg-muted',
                    )}
                  >
                    {boldText(msg.content)}
                  </div>
                  <span className="mt-0.5 px-1 text-[11px] text-muted-foreground">
                    {msg.role === 'user' ? x.visitor : x.assistant} · {time(msg.createdAt)}
                  </span>
                </div>
              ),
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
