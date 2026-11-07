'use client';

import { useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useApi } from '@/hooks/use-api';
import { useEditorText } from '../_i18n';
import { errorNotice } from './designer-chat';
import { unwrap } from './use-template-editor';

interface Direction { label: string; why: string; subject: string; html: string }

// Three different designs for one brief, side by side. Nothing is saved until
// the client loads one into the editor.
export function DirectionsDialog({ open, onOpenChange, onPick }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onPick: (d: { subject: string; html: string }) => void;
}) {
  const api = useApi();
  const t = useEditorText();
  const [brief, setBrief] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [list, setList] = useState<Direction[] | null>(null);
  const [rendered, setRendered] = useState<Record<number, string | false>>({});

  const generate = async () => {
    const text = brief.trim();
    if (!text || busy) return;
    setBusy(true);
    setError('');
    setList(null);
    setRendered({});
    try {
      const res = unwrap<{ directions: Direction[] }>(await api.post('/api/dashboard/email-designer/directions', { brief: text }));
      setList(res.directions);
      res.directions.forEach((d, i) => {
        api.post('/api/dashboard/email-templates/render-preview', { subject: d.subject, bodyHtml: d.html })
          .then((p) => setRendered((r) => ({ ...r, [i]: unwrap<{ html: string }>(p).html })))
          .catch(() => setRendered((r) => ({ ...r, [i]: false })));
      });
    } catch (err) {
      setError(errorNotice(err, t).text);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl" data-testid="directions-dialog">
        <DialogHeader><DialogTitle>{t.directions.title}</DialogTitle><DialogDescription>{t.directions.description}</DialogDescription></DialogHeader>
        <div className="flex items-end gap-2">
          <Textarea value={brief} onChange={(e) => setBrief(e.target.value)} placeholder={t.directions.placeholder} rows={2} maxLength={1000} className="min-h-[44px] flex-1 resize-none" data-testid="directions-brief" />
          <Button onClick={generate} disabled={busy || !brief.trim()} data-testid="directions-generate">
            {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}{list ? t.directions.again : t.directions.generate}
          </Button>
        </div>
        {busy && <p className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="directions-busy"><Loader2 className="h-4 w-4 animate-spin" />{t.directions.working}</p>}
        {error && <p className="text-sm text-destructive" role="alert" data-testid="directions-error">{error}</p>}
        {list && (
          <div className="grid max-h-[60vh] grid-cols-1 justify-items-center gap-4 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
            {list.map((d, i) => {
              const html = rendered[i];
              return (
                <div key={`${d.label}-${i}`} className="w-[258px] space-y-2 rounded-md border p-2" data-testid="direction">
                  <div className="relative h-[340px] w-[240px] overflow-hidden rounded bg-white">
                    {typeof html === 'string'
                      ? <iframe title={d.label} sandbox="" srcDoc={html} tabIndex={-1} className="pointer-events-none" style={{ width: 660, height: 940, transform: 'scale(0.3636)', transformOrigin: 'top left', border: 0 }} />
                      : html === false
                        ? <p className="p-3 text-xs text-muted-foreground">{d.subject}</p>
                        : <Loader2 className="absolute left-1/2 top-1/2 h-4 w-4 animate-spin" />}
                  </div>
                  <p className="text-sm font-medium">{d.label}</p>
                  {d.why && <p className="text-xs text-muted-foreground">{d.why}</p>}
                  <Button size="sm" className="w-full" onClick={() => onPick({ subject: d.subject, html: d.html })} data-testid="direction-use">{t.chat.useLayout}</Button>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
