'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ImagePlus, Loader2, Send, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useApi } from '@/hooks/use-api';
import { cn } from '@/lib/utils';
import { AI_SETTINGS_URL } from '@/app/(dashboard)/dashboard/buyers/[id]/_components/ai/ai-gate';
import { useEditorText, type EditorText } from '../_i18n';
import { templateErrors, unwrap } from './use-template-editor';

interface Msg { id: number; role: 'user' | 'assistant'; content: string; versionId: number | null }
interface Status { hasKey: boolean; provider: string | null; model: string | null; modelOk: boolean }
interface TurnResult { reply: string; changed: boolean; versionId: number | null; bodyHtml: string; subject: string; warnings?: string[] }
interface Notice { text: string; detail?: string }

// The API's error code (or HTTP status when there is none, e.g. a proxy
// timeout) → the wording in the dashboard language.
function errorNotice(err: unknown, t: EditorText): Notice {
  const { code, status, message } = (err ?? {}) as { code?: string; status?: number; message?: string };
  const key = code && t.chat.errors[code] ? code
    : status === 409 ? 'DESIGNER_BUSY'
    : status === 429 ? 'DESIGNER_RATE_LIMIT'
    : status === 503 ? 'DESIGNER_UNAVAILABLE'
    : status === 504 || status === 524 ? 'DESIGNER_TIMEOUT'
    : '';
  if (!key) return { text: t.chat.genericError };
  // DESIGNER_FAILED carries the provider's own reason (bad key, no credits…): shown under ours.
  const detail = key === 'DESIGNER_FAILED' && message ? message : undefined;
  return { text: t.chat.errors[key], detail };
}

export interface DesignerChatProps {
  templateId: number;
  dirty: boolean;
  saveFirst: () => Promise<boolean>;
  onDesign: (t: { subject: string; bodyHtml: string }) => void;
  images: string[];
  clearImages: () => void;
  removeImage?: (url: string) => void;
  openImages: () => void;
  onLoadVersion: (versionId: number) => void;
  /** True while a turn runs, so the editor can lock manual edits. */
  onBusyChange?: (busy: boolean) => void;
}

// The AI designer chat. A turn is one POST that returns the finished design
// (up to ~90 s); the AI works on the SAVED template, so unsaved edits are
// saved first.
export function DesignerChat({ templateId, dirty, saveFirst, onDesign, images, clearImages, removeImage, openImages, onLoadVersion, onBusyChange }: DesignerChatProps) {
  const api = useApi();
  const t = useEditorText();
  const [status, setStatus] = useState<Status | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [showDetail, setShowDetail] = useState(false); // the provider's own (English) reason, on request
  const busyRef = useRef(false);
  const templateRef = useRef(templateId);
  templateRef.current = templateId;
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!api.isReady) return;
    let live = true;
    // A failed status check leaves it unknown: the chat stays usable and the API answers NO_AI_KEY itself.
    api.get('/api/dashboard/email-designer/status').then((r) => { if (live) setStatus(unwrap<Status>(r)); }).catch(() => {});
    api.get(`/api/dashboard/email-templates/${templateId}/ai-chat`).then((r) => { if (live) setMsgs(unwrap<Msg[]>(r) ?? []); }).catch(() => {});
    return () => { live = false; };
  }, [api.isReady, templateId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { onBusyChange?.(busy); }, [busy]); // eslint-disable-line react-hooks/exhaustive-deps
  // Unmounting mid-turn must not leave the editor locked.
  useEffect(() => () => onBusyChange?.(false), []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }); }, [msgs, busy, notice]);
  useEffect(() => { setShowDetail(false); }, [notice]);

  const send = async (raw: string) => {
    const message = raw.trim();
    if (!message || busyRef.current || (status && !status.hasKey)) return;
    busyRef.current = true;
    setBusy(true);
    setNotice(null);
    const tempId = -Date.now();
    const forTemplate = templateId;
    try {
      if (dirty) {
        try {
          await saveFirst();
        } catch (err) {
          const errors = templateErrors(err);
          setNotice({ text: t.chat.saveFirstFailed, detail: errors.length ? errors.map((e) => t.invalid[e] ?? e).join(' ') : (err as Error)?.message });
          return;
        }
      }
      const sentImages = images;
      const shown = sentImages.length ? `${message}\n\n${sentImages.map((u) => `[${u.split('/').pop()}]`).join('\n')}` : message;
      setMsgs((m) => [...m, { id: tempId, role: 'user', content: shown, versionId: null }]);
      setText('');
      try {
        const res = unwrap<TurnResult>(
          await api.post(`/api/dashboard/email-templates/${templateId}/ai-chat`, { message, imageUrls: sentImages }),
        );
        if (templateRef.current !== forTemplate) return; // another template is open now
        clearImages();
        setMsgs((m) => [...m, { id: Date.now(), role: 'assistant', content: res.reply, versionId: res.versionId }]);
        if (res.changed) onDesign({ subject: res.subject, bodyHtml: res.bodyHtml });
      } catch (err) {
        if (templateRef.current !== forTemplate) return;
        // Nothing was saved server-side: take the message back so it can be sent again.
        setMsgs((m) => m.filter((x) => x.id !== tempId));
        setText((cur) => cur || message);
        if ((err as { code?: string })?.code === 'NO_AI_KEY') setStatus((s) => ({ provider: null, model: null, modelOk: false, ...s, hasKey: false }));
        setNotice(errorNotice(err, t));
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  // Without a key the history stays readable; only sending is off.
  const noKey = !!status && !status.hasKey;

  return (
    <div className="flex h-[calc(100vh-260px)] min-h-[480px] flex-col rounded-md border" data-testid="designer-chat">
      {noKey && (
        <div className="border-b border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200" data-testid="designer-no-key">
          <p>{t.chat.noKey}</p>
          <Link href={AI_SETTINGS_URL} className="mt-1 inline-block font-medium underline" data-testid="designer-no-key-link">{t.chat.noKeyLink}</Link>
        </div>
      )}
      {!noKey && status && !status.modelOk && status.model && (
        <p className="border-b bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200" data-testid="weak-model">
          {t.chat.weakModel(status.model)} <Link href={AI_SETTINGS_URL} className="font-medium underline">{t.chat.noKeyLink}</Link>
        </p>
      )}
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {msgs.length === 0 && !busy && !noKey && (
          <div className="space-y-2">
            {t.chat.suggestions.map((s) => (
              <button key={s} type="button" onClick={() => void send(s)} className="block w-full rounded-md border px-3 py-2 text-left text-sm hover:bg-muted" data-testid="designer-suggestion">
                <Sparkles className="mr-1 inline h-3.5 w-3.5 text-primary" />{s}
              </button>
            ))}
          </div>
        )}
        {msgs.map((m) => (
          <div key={m.id} className={cn('flex flex-col', m.role === 'user' ? 'items-end' : 'items-start')} data-testid="designer-message" data-role={m.role}>
            <span className="mb-0.5 px-1 text-[11px] text-muted-foreground">{m.role === 'user' ? t.chat.you : t.chat.ai}</span>
            <div className={cn('max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm', m.role === 'user' ? 'rounded-br-sm bg-primary text-primary-foreground' : 'rounded-bl-sm bg-muted')}>{m.content}</div>
            {m.versionId !== null && m.versionId !== undefined && (
              <button type="button" className="mt-0.5 px-1 text-[11px] text-primary underline" onClick={() => onLoadVersion(m.versionId as number)} data-testid="designer-show-version">
                {t.chat.versionSaved} · {t.chat.showVersion}
              </button>
            )}
          </div>
        ))}
        {busy && <p className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="designer-busy"><Loader2 className="h-4 w-4 animate-spin" />{t.chat.designing}</p>}
        {notice && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert" data-testid="designer-error">
            <p>{notice.text}</p>
            {notice.detail && (
              <>
                <button type="button" className="mt-1 text-xs underline opacity-80" aria-expanded={showDetail} onClick={() => setShowDetail((v) => !v)} data-testid="designer-error-details">{t.chat.details}</button>
                {showDetail && <p className="mt-1 break-words text-xs opacity-80" data-testid="designer-error-detail">{notice.detail}</p>}
              </>
            )}
          </div>
        )}
        <div ref={bottom} />
      </div>
      {images.length > 0 && (
        <div className="flex flex-wrap gap-1 border-t px-3 pt-2">
          {images.map((u) => (
            <span key={u} className="flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs" data-testid="designer-image-chip">
              {u.split('/').pop()}
              <button type="button" aria-label={t.chat.removeImage} title={t.chat.removeImage} onClick={() => (removeImage ? removeImage(u) : clearImages())} disabled={busy}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <form className="flex items-end gap-2 border-t p-2" onSubmit={(e) => { e.preventDefault(); void send(text); }}>
        <Button type="button" size="icon" variant="ghost" onClick={openImages} disabled={busy || noKey || images.length >= 5} aria-label={t.chat.attach} title={t.chat.attach} data-testid="designer-attach"><ImagePlus className="h-4 w-4" /></Button>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={t.chat.placeholder} rows={2} maxLength={4000} disabled={noKey} className="min-h-[44px] flex-1 resize-none"
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(text); } }} data-testid="designer-input" />
        <Button type="submit" size="icon" disabled={busy || noKey || !text.trim()} aria-label={t.chat.send} title={t.chat.send} data-testid="designer-send">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </div>
  );
}
