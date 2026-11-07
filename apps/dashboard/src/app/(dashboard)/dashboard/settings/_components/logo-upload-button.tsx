'use client';

import { useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { useSettingsText } from '../_i18n';

const unwrap = <T,>(res: unknown): T => ((res as { data?: T } | null)?.data ?? res) as T;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// Upload or remove the logo right away; the URL field stays for logos hosted elsewhere.
export function LogoUploadButton({ logoUrl, onChange }: { logoUrl: string; onChange: (url: string) => void }) {
  const api = useApi();
  const { toast } = useToast();
  const b = useSettingsText().general.brochure;
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const fail = (description?: string) => toast({ title: b.logoFailed, description, variant: 'destructive' });

  const upload = async (file: File) => {
    if (busy) return;
    try {
      if (file.size > MAX_UPLOAD_BYTES || !TYPES.includes(file.type)) {
        fail(b.logoFileRule);
        return;
      }
      setBusy(true);
      const fd = new FormData();
      fd.append('file', file);
      onChange(unwrap<{ logoUrl: string }>(await api.post('/api/dashboard/brand-logo', fd)).logoUrl);
      toast({ title: b.logoSaved });
    } catch (err) {
      fail((err as Error)?.message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api.delete('/api/dashboard/brand-logo');
      onChange('');
      toast({ title: b.logoRemoved });
    } catch (err) {
      fail((err as Error)?.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" data-testid="settings-logo-file" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
      <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={busy} data-testid="settings-logo-upload">
        {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-1 h-4 w-4" />}{b.logoUpload}
      </Button>
      {logoUrl && <Button type="button" size="sm" variant="ghost" onClick={remove} disabled={busy} data-testid="settings-logo-remove"><Trash2 className="mr-1 h-4 w-4" />{b.logoRemove}</Button>}
    </div>
  );
}
