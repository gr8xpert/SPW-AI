'use client';

import { useEffect, useRef, useState } from 'react';
import { useApi } from '@/hooks/use-api';

export interface Draft { name: string; subject: string; bodyHtml: string }
export interface Preview { subject: string; html: string; warnings: string[] }

/** API responses arrive wrapped as `{ data }`; this returns the inner value. */
export const unwrap = <T,>(res: unknown): T => ((res as { data?: T } | null)?.data ?? res) as T;

/** The checks the API listed when it refused a save (TEMPLATE_INVALID), else []. */
export function templateErrors(err: unknown): string[] {
  const details = (err as { details?: { errors?: unknown } } | null)?.details;
  return Array.isArray(details?.errors) ? (details.errors as unknown[]).map(String) : [];
}

// The template being edited, its saved copy and the live preview. The
// preview is rendered by the API with the real renderer, 400 ms after the
// last change, so what the client sees is what contacts receive.
export function useTemplateEditor(id: number) {
  const api = useApi();
  const [draft, setDraftState] = useState<Draft>({ name: '', subject: '', bodyHtml: '' });
  const [saved, setSaved] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const previewSeq = useRef(0);

  useEffect(() => {
    if (!api.isReady) return;
    let live = true;
    setLoading(true);
    setLoadFailed(false);
    api.get(`/api/dashboard/email-templates/${id}`)
      .then((res) => {
        if (!live) return;
        const t = unwrap<Partial<Draft>>(res);
        const d = { name: t.name ?? '', subject: t.subject ?? '', bodyHtml: t.bodyHtml ?? '' };
        setDraftState(d);
        setSaved(d);
      })
      .catch(() => { if (live) setLoadFailed(true); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [api.isReady, id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!api.isReady || loading || loadFailed) return;
    const seq = ++previewSeq.current;
    const timer = setTimeout(() => {
      setPreviewLoading(true);
      api.post('/api/dashboard/email-templates/render-preview', { subject: draft.subject, bodyHtml: draft.bodyHtml })
        .then((res) => { if (seq === previewSeq.current) { setPreview(unwrap<Preview>(res)); setPreviewFailed(false); } })
        // The last good preview stays; the pane says it is not up to date.
        .catch(() => { if (seq === previewSeq.current) setPreviewFailed(true); })
        .finally(() => { if (seq === previewSeq.current) setPreviewLoading(false); });
    }, 400);
    // A newer change (or leaving) supersedes this request: its spinner must not stick.
    return () => { clearTimeout(timer); setPreviewLoading(false); };
  }, [api.isReady, loading, loadFailed, draft.subject, draft.bodyHtml]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = !!saved && (saved.name !== draft.name || saved.subject !== draft.subject || saved.bodyHtml !== draft.bodyHtml);
  // Subject / body differ from the saved copy (what undo / redo / versions replace; the name is kept).
  const contentDirty = !!saved && (saved.subject !== draft.subject || saved.bodyHtml !== draft.bodyHtml);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const setDraft = (patch: Partial<Draft>) => setDraftState((d) => ({ ...d, ...patch }));

  // Throws the API error (code / details ride on it) and leaves the draft as it is when the API refuses it.
  const save = async (): Promise<boolean> => {
    setSaving(true);
    try {
      const res = await api.put(`/api/dashboard/email-templates/${id}`, { name: draft.name, subject: draft.subject, bodyHtml: draft.bodyHtml });
      const t = unwrap<Partial<Draft>>(res);
      const d = { name: t.name ?? draft.name, subject: t.subject ?? draft.subject, bodyHtml: t.bodyHtml ?? draft.bodyHtml };
      setDraftState(d);
      setSaved(d);
      setReloadKey((k) => k + 1);
      return true;
    } finally {
      setSaving(false);
    }
  };

  // The server already saved this (AI change, restore): editor and saved copy follow.
  const applyServer = (t: { subject: string; bodyHtml: string }) => {
    setDraftState((d) => ({ ...d, subject: t.subject, bodyHtml: t.bodyHtml }));
    setSaved((s) => (s ? { ...s, subject: t.subject, bodyHtml: t.bodyHtml } : s));
    setReloadKey((k) => k + 1);
  };

  return {
    draft, setDraft, loading, loadFailed, saving, dirty, contentDirty, save, applyServer,
    preview, previewLoading, previewFailed, reloadKey, bumpReload: () => setReloadKey((k) => k + 1),
  };
}
