'use client';

import { useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { useEditorText, type EditorText } from '../_i18n';
import { unwrap } from './use-template-editor';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// Codes the API sends, plus the 413 for a file over the size limit.
export function logoError(err: unknown, t: EditorText): string {
  const { code, status } = (err ?? {}) as { code?: string; status?: number };
  if (code === 'IMAGE_LIMIT') return t.images.full;
  if (code === 'IMAGE_TOO_BIG' || status === 413) return t.images.tooBig;
  if (code === 'IMAGE_TYPE' || code === 'IMAGE_INVALID') return t.images.badType;
  return t.logo.failed;
}

// The client's logo, from inside the email editor. It is one setting: every
// email using the logo placeholder follows it, as do PDFs and buyer pages.
export function LogoDialog({ open, onOpenChange, logoUrl, onChange }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  logoUrl: string;
  onChange: (url: string) => void;
}) {
  const api = useApi();
  const t = useEditorText();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    if (busy) return;
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
      onChange(unwrap<{ logoUrl: string }>(await api.post('/api/dashboard/brand-logo', fd)).logoUrl);
      toast({ title: t.logo.saved });
    } catch (err) {
      toast({ title: logoError(err, t), variant: 'destructive' });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const remove = async () => {
    if (busy || !confirm(t.logo.confirmRemove)) return;
    setBusy(true);
    try {
      await api.delete('/api/dashboard/brand-logo');
      onChange('');
      toast({ title: t.logo.removed });
    } catch (err) {
      toast({ title: logoError(err, t), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="logo-dialog">
        <DialogHeader><DialogTitle>{t.logo.title}</DialogTitle><DialogDescription>{t.logo.description}</DialogDescription></DialogHeader>
        <div className="flex min-h-24 items-center justify-center rounded-md border bg-muted p-4">
          {logoUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={logoUrl} alt={t.logo.current} className="max-h-20 max-w-full object-contain" data-testid="logo-current" />
            : <p className="text-sm text-muted-foreground" data-testid="logo-none">{t.logo.none}</p>}
        </div>
        <p className="text-xs text-muted-foreground">{t.logo.tip}</p>
        <div className="flex flex-wrap gap-2">
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" data-testid="logo-file" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
          <Button size="sm" onClick={() => fileRef.current?.click()} disabled={busy} data-testid="logo-upload">
            {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-1 h-4 w-4" />}{logoUrl ? t.logo.replace : t.logo.upload}
          </Button>
          {logoUrl && <Button size="sm" variant="outline" onClick={remove} disabled={busy} data-testid="logo-remove"><Trash2 className="mr-1 h-4 w-4" />{t.logo.remove}</Button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
