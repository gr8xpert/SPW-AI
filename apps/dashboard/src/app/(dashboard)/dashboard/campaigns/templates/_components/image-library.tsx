'use client';

import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { useEditorText } from '../_i18n';
import { unwrap } from './use-template-editor';

interface Img { id: number; url: string; width: number; height: number; bytes: number; pinned: boolean }
interface Library { images: Img[]; usedBytes: number; limitBytes: number; limitCount?: number }
const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export const imageTag = (url: string) => `<img src="${url}" alt="" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0">`;

export function ImageLibrary({ open, onOpenChange, onPick }: { open: boolean; onOpenChange: (o: boolean) => void; onPick: (url: string) => void }) {
  const api = useApi();
  const t = useEditorText();
  const { toast } = useToast();
  const [lib, setLib] = useState<Library | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [broken, setBroken] = useState<Set<number>>(() => new Set()); // thumbnails that did not load
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => api.get('/api/dashboard/email-images')
    .then((res) => setLib(unwrap<Library>(res)))
    .catch(() => toast({ title: t.images.loadFailed, variant: 'destructive' }));
  useEffect(() => { if (open && api.isReady) void load(); }, [open, api.isReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Codes the API sends (IMAGE_*), plus the 413 multer sends for a file over the size limit.
  const message = (err: unknown) => {
    const { code, status } = (err ?? {}) as { code?: string; status?: number };
    if (code === 'IMAGE_IN_USE') return t.images.inUse;
    if (code === 'IMAGE_LIMIT') return t.images.full;
    if (code === 'IMAGE_TOO_BIG' || status === 413) return t.images.tooBig;
    if (code === 'IMAGE_TYPE' || code === 'IMAGE_INVALID') return t.images.badType;
    if (code === 'IMAGE_MISSING') return t.images.missing;
    return t.images.failed;
  };

  const upload = async (file: File) => {
    if (busy) return;
    // Checked here first so a wrong file never travels; the API checks again.
    const local = file.size > MAX_UPLOAD_BYTES ? t.images.tooBig : !TYPES.includes(file.type) ? t.images.badType : '';
    if (local) {
      toast({ title: local, variant: 'destructive' });
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const img = unwrap<Img>(await api.post('/api/dashboard/email-images', fd));
      // Same as "Use": the new image goes in and the library closes.
      onPick(img.url);
      onOpenChange(false);
      void load();
    } catch (err) {
      toast({ title: message(err), variant: 'destructive' });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const remove = async (id: number) => {
    if (deleting !== null || !confirm(t.images.confirmRemove)) return;
    setDeleting(id);
    try {
      await api.delete(`/api/dashboard/email-images/${id}`);
      await load();
    } catch (err) {
      toast({ title: message(err), variant: 'destructive' });
    } finally {
      setDeleting(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t.images.title}</DialogTitle>
          <DialogDescription>{t.images.description}</DialogDescription>
          <p className="text-xs text-muted-foreground" data-testid="image-alt-hint">{t.images.altHint}</p>
        </DialogHeader>
        <div className="flex items-center justify-between gap-2">
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" data-testid="image-file" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
          <Button size="sm" onClick={() => fileRef.current?.click()} disabled={busy} data-testid="image-upload">
            {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-1 h-4 w-4" />}{busy ? t.images.uploading : t.images.upload}
          </Button>
          {lib && (
            <span className="text-right text-xs text-muted-foreground" data-testid="image-usage">
              {t.images.usage(mb(lib.usedBytes), mb(lib.limitBytes))}
              {lib.limitCount ? ` · ${t.images.count(lib.images.length, lib.limitCount)}` : ''}
            </span>
          )}
        </div>
        {lib && lib.images.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{t.images.empty}</p>}
        <div className="grid max-h-[60vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
          {lib?.images.map((img) => (
            <div key={img.id} className="group relative overflow-hidden rounded-md border" data-testid="library-image">
              {broken.has(img.id) ? (
                <div className="flex h-32 w-full items-center justify-center break-all bg-muted p-2 text-center text-xs text-muted-foreground" data-testid="library-image-broken">{img.url.split('/').pop()}</div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={img.url} alt="" className="h-32 w-full object-cover" onError={() => setBroken((b) => new Set(b).add(img.id))} />
              )}
              <div className="flex items-center justify-between gap-1 p-1.5">
                <span className="text-xs text-muted-foreground">{img.width}×{img.height}</span>
                <span className="flex gap-1">
                  <Button size="sm" variant="secondary" onClick={() => { onPick(img.url); onOpenChange(false); }} data-testid="image-insert">{t.images.pick}</Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(img.id)} disabled={deleting !== null} aria-label={t.images.remove} title={t.images.remove} data-testid="image-delete">{deleting === img.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</Button>
                </span>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
