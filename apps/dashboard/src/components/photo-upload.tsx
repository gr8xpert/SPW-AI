'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useApi } from '@/hooks/use-api';
import { cn } from '@/lib/utils';

// A round photo with Upload / Change / Remove. The file goes to the
// dashboard upload route (R2, WebP); `onChange` gets its address, or '' when
// removed. Used for agents and buyers.
export function PhotoUpload({
  value,
  onChange,
  initials,
  className,
  layout = 'column',
}: {
  value: string;
  onChange: (url: string) => void;
  initials?: string;
  className?: string;
  // 'row' = photo on the left, buttons beside it (a form's full-width row).
  layout?: 'column' | 'row';
}) {
  const { toast } = useToast();
  // useApi sends FormData as multipart; the axios client forces JSON and the
  // file never reached the server.
  const api = useApi();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File) => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      toast({ title: 'Choose an image', description: 'The photo must be a JPG, PNG or WebP file.', variant: 'destructive' });
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api.post('/api/dashboard/upload', form);
      const data = (res?.data ?? res) as { url?: string };
      if (!data?.url) throw new Error('The upload returned no address.');
      onChange(data.url);
    } catch (e) {
      toast({ title: 'Photo upload failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const row = layout === 'row';
  return (
    <div className={cn(row ? 'flex items-center gap-4' : 'flex flex-col items-center gap-2', className)}>
      <div
        className={cn(
          'flex shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted font-semibold text-muted-foreground',
          row ? 'h-16 w-16 text-lg' : 'h-24 w-24 text-2xl',
        )}
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className="h-full w-full object-cover" />
        ) : (
          initials
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        data-testid="photo-file"
        onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
      />
      <div className={row ? 'flex flex-col items-start gap-1.5' : 'contents'}>
        <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
          {uploading ? 'Uploading…' : value ? 'Change photo' : 'Upload photo'}
        </Button>
        {value && !uploading && (
          <button type="button" className="text-xs text-muted-foreground underline" onClick={() => onChange('')}>
            Remove photo
          </button>
        )}
        {row && !value && <p className="text-xs text-muted-foreground">JPG, PNG or WebP</p>}
      </div>
    </div>
  );
}
