'use client';

import { useEffect, useRef, useState } from 'react';
import { History, Redo2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useApi } from '@/hooks/use-api';
import { useLanguage } from '@/i18n/i18n-provider';
import { useToast } from '@/hooks/use-toast';
import { useEditorText } from '../_i18n';
import { unwrap } from './use-template-editor';

interface VersionRow { id: number; source: string; subject: string; bytes: number; createdAt: string }
interface Content { subject: string; bodyHtml: string }

// Undo / redo step through the saved versions (the version lands in the
// editor unsaved); the list restores one, which saves at once.
export function HistoryMenu({ templateId, reloadKey, dirty = false, current, disabled = false, onLoad, onRestored }: {
  templateId: number;
  reloadKey: number;
  /** Subject / body differ from the saved copy. */
  dirty?: boolean;
  /** What the editor shows now, to tell own edits from the version the last step loaded. */
  current: Content;
  /** Undo / redo / restore are off while the AI designer works on the template. */
  disabled?: boolean;
  onLoad: (v: Content) => void;
  onRestored: (t: Content) => void;
}) {
  const api = useApi();
  const t = useEditorText();
  const { locale } = useLanguage();
  const { toast } = useToast();
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [pos, setPos] = useState(0); // 0 = newest version
  const [busy, setBusy] = useState(false);
  // The version the last undo / redo step put in the editor: still showing it is not "unsaved edits".
  const lastLoaded = useRef<Content | null>(null);
  const hasOwnEdits = dirty && !(lastLoaded.current && lastLoaded.current.subject === current.subject && lastLoaded.current.bodyHtml === current.bodyHtml);

  useEffect(() => {
    if (!api.isReady) return;
    let live = true;
    api.get(`/api/dashboard/email-templates/${templateId}/versions`)
      .then((res) => { if (live) { setVersions(unwrap<VersionRow[]>(res) ?? []); setPos(0); lastLoaded.current = null; } })
      .catch(() => {});
    return () => { live = false; };
  }, [api.isReady, templateId, reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = async (next: number) => {
    const v = versions[next];
    if (!v || busy || disabled) return;
    // The loaded version replaces the draft: don't drop unsaved edits silently.
    if (hasOwnEdits && !confirm(t.history.confirmStep)) return;
    setBusy(true);
    try {
      const full = unwrap<Content>(await api.get(`/api/dashboard/email-templates/${templateId}/versions/${v.id}`));
      setPos(next);
      lastLoaded.current = { subject: full.subject, bodyHtml: full.bodyHtml };
      onLoad({ subject: full.subject, bodyHtml: full.bodyHtml });
    } catch {
      toast({ title: t.history.loadFailed, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const restore = async (id: number) => {
    if (busy || disabled || (hasOwnEdits && !confirm(t.history.confirmRestore))) return;
    setBusy(true);
    try {
      const tpl = unwrap<Content>(await api.post(`/api/dashboard/email-templates/${templateId}/versions/${id}/restore`, {}));
      onRestored({ subject: tpl.subject, bodyHtml: tpl.bodyHtml });
      toast({ title: t.history.restored });
    } catch (err) {
      toast({ title: t.history.loadFailed, description: (err as Error)?.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const time = (d: string) => new Date(d).toLocaleString(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="flex items-center gap-1">
      <Button size="sm" variant="ghost" onClick={() => go(pos + 1)} disabled={busy || disabled || pos + 1 >= versions.length} aria-label={t.history.undo} title={t.history.undo} data-testid="history-undo"><Undo2 className="h-4 w-4" /></Button>
      <Button size="sm" variant="ghost" onClick={() => go(pos - 1)} disabled={busy || disabled || pos === 0} aria-label={t.history.redo} title={t.history.redo} data-testid="history-redo"><Redo2 className="h-4 w-4" /></Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button size="sm" variant="outline" data-testid="history-button"><History className="mr-1 h-4 w-4" />{t.history.button}</Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-96 w-80 overflow-y-auto">
          <DropdownMenuLabel>{t.history.button}</DropdownMenuLabel>
          {versions.length === 0 && <p className="px-2 py-1.5 text-sm text-muted-foreground">{t.history.empty}</p>}
          {versions.map((v, i) => (
            <DropdownMenuItem key={v.id} className="flex items-center justify-between gap-2" onSelect={(e) => e.preventDefault()} data-testid="history-item" data-source={v.source}>
              <span className="min-w-0">
                <span className="block truncate text-sm">{t.history.source[v.source] ?? v.source}{i === 0 ? ' · ✓' : ''}</span>
                <span className="block text-xs text-muted-foreground">{time(v.createdAt)} · {Math.max(1, Math.round(v.bytes / 1024))} KB</span>
              </span>
              {i > 0 && <Button size="sm" variant="secondary" disabled={busy || disabled} onClick={() => restore(v.id)} data-testid="history-restore">{t.history.restore}</Button>}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
