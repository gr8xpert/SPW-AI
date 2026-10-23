'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useApi } from '@/hooks/use-api';
import { useEditorText } from '../_i18n';
import { unwrap } from './use-template-editor';

interface Layout { name: string; subject: string; html: string }

// Starter designs from the API. Each is rendered once through the real
// preview renderer (sample contact + listings) and shown as a scaled-down
// thumbnail; picking one loads it into the editor unsaved.
export function LayoutPicker({ open, onOpenChange, onPick }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onPick: (l: { subject: string; html: string }) => void;
}) {
  const api = useApi();
  const t = useEditorText();
  const [layouts, setLayouts] = useState<Layout[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [rendered, setRendered] = useState<Record<string, string | false>>({});
  const loading = useRef(false);

  useEffect(() => {
    if (!open || !api.isReady || layouts || loading.current) return;
    loading.current = true;
    setFailed(false);
    api.get('/api/dashboard/email-designer/layouts')
      .then((res) => {
        const list = unwrap<Layout[]>(res) ?? [];
        setLayouts(list);
        for (const l of list) {
          api.post('/api/dashboard/email-templates/render-preview', { subject: l.subject, bodyHtml: l.html })
            .then((p) => setRendered((r) => ({ ...r, [l.name]: unwrap<{ html: string }>(p).html })))
            .catch(() => setRendered((r) => ({ ...r, [l.name]: false })));
        }
      })
      .catch(() => setFailed(true))
      .finally(() => { loading.current = false; });
  }, [open, api.isReady, layouts]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl" data-testid="layout-picker">
        <DialogHeader><DialogTitle>{t.chat.layoutsTitle}</DialogTitle><DialogDescription>{t.chat.layoutsDescription}</DialogDescription></DialogHeader>
        {!layouts && !failed && <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>}
        {failed && <p className="py-6 text-center text-sm text-destructive" data-testid="layouts-failed">{t.chat.layoutsFailed}</p>}
        <div className="grid max-h-[70vh] grid-cols-1 justify-items-center gap-4 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
          {layouts?.map((l) => {
            const html = rendered[l.name];
            const label = t.chat.layoutNames[l.name] ?? l.name;
            return (
              <div key={l.name} className="w-[258px] space-y-2 rounded-md border p-2" data-testid={`layout-${l.name}`}>
                <div className="relative h-[304px] w-[240px] overflow-hidden rounded bg-white">
                  {typeof html === 'string'
                    ? <iframe title={label} sandbox="" srcDoc={html} tabIndex={-1} className="pointer-events-none" style={{ width: 600, height: 760, transform: 'scale(0.4)', transformOrigin: 'top left', border: 0 }} />
                    : html === false
                      ? <p className="p-3 text-xs text-muted-foreground">{l.subject}</p>
                      : <Loader2 className="absolute left-1/2 top-1/2 h-4 w-4 animate-spin" />}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{label}</span>
                  <Button size="sm" onClick={() => onPick({ subject: l.subject, html: l.html })} data-testid={`layout-apply-${l.name}`}>{t.chat.useLayout}</Button>
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
