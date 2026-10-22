'use client';

import { useRef } from 'react';
import { ExternalLink, FileText, Image as ImageIcon, Loader2, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/utils';
import { useBuyerText } from '../../_i18n/use-buyer-text';
import { useBuyerFiles, useDeleteBuyerFile, useUploadBuyerFile } from '../../use-buyer-follow-up';

const ACCEPT = 'image/jpeg,image/png,image/gif,image/webp,application/pdf';
const MAX_MB = 20;

function size(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function FilesTab({ buyerId }: { buyerId: number }) {
  const t = useBuyerText();
  const f = t.files;
  const { toast } = useToast();
  const input = useRef<HTMLInputElement>(null);
  const files = useBuyerFiles(buyerId);
  const upload = useUploadBuyerFile(buyerId);
  const remove = useDeleteBuyerFile();

  const pick = async (list: FileList | null) => {
    for (const file of Array.from(list ?? [])) {
      if (!ACCEPT.split(',').includes(file.type)) {
        toast({ title: f.wrongType, description: file.name, variant: 'destructive' });
        continue;
      }
      if (file.size > MAX_MB * 1024 * 1024) {
        toast({ title: f.failed, description: `${file.name}: > ${MAX_MB} MB`, variant: 'destructive' });
        continue;
      }
      try {
        await upload.mutateAsync(file);
      } catch (err) {
        toast({ title: f.failed, description: (err as Error).message, variant: 'destructive' });
      }
    }
    if (input.current) input.current.value = '';
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
        <div>
          <CardTitle className="text-base">{f.tab}</CardTitle>
          <CardDescription>{f.help}</CardDescription>
        </div>
        <input ref={input} type="file" accept={ACCEPT} multiple hidden onChange={(e) => pick(e.target.files)} />
        <Button size="sm" onClick={() => input.current?.click()} disabled={upload.isPending}>
          {upload.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
          {upload.isPending ? f.uploading : f.upload}
        </Button>
      </CardHeader>
      <CardContent>
        {files.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : !files.data?.length ? (
          <p className="text-sm text-muted-foreground">{f.empty}</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {files.data.map((file) => {
              const Icon = file.mimeType.startsWith('image/') ? ImageIcon : FileText;
              return (
                <li key={file.id} className="flex items-center gap-3 p-3">
                  <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {size(file.size)} · {formatDate(file.createdAt)}
                      {file.uploadedByUser?.name ? ` · ${f.by} ${file.uploadedByUser.name}` : ''}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" asChild>
                    <a href={file.url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-1 h-3.5 w-3.5" />
                      {f.open}
                    </a>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title={f.delete}
                    onClick={() => {
                      if (window.confirm(f.confirmDelete(file.name))) remove.mutate(file.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
