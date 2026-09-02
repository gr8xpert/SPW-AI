'use client';

import { useRef, useState, DragEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Paperclip, UploadCloud, X, FileText, Image as ImageIcon } from 'lucide-react';

export interface Attachment {
  name: string;
  url: string;
  size: number;
}

interface AttachmentDropzoneProps {
  attachments: Attachment[];
  onAdd: (files: Attachment[]) => void;
  onRemove: (index: number) => void;
  onUpload: (files: FileList) => Promise<Attachment[]>;
  isUploading: boolean;
  accept?: string;
  // Compact mode: smaller drop zone, meant for reply forms in tight dialogs.
  compact?: boolean;
  disabled?: boolean;
}

// Drag-and-drop attachment picker with visible multi-select hint. Wraps the
// existing per-caller upload helper so all three ticket surfaces (customer
// create, customer reply, webmaster reply) share one interaction pattern
// without duplicating the DOM.
export function AttachmentDropzone({
  attachments,
  onAdd,
  onRemove,
  onUpload,
  isUploading,
  accept = 'image/*,.pdf',
  compact = false,
  disabled = false,
}: AttachmentDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const uploaded = await onUpload(files);
    if (uploaded.length > 0) onAdd(uploaded);
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };
  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };
  const onDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (disabled || isUploading) return;
    await handleFiles(e.dataTransfer.files);
  };

  const zoneClass = [
    'flex flex-col items-center justify-center gap-1.5 rounded-md border border-dashed transition-colors cursor-pointer text-center',
    compact ? 'px-3 py-3 text-xs' : 'px-4 py-6 text-sm',
    isDragging ? 'border-primary bg-primary/5' : 'border-border/70 bg-muted/30 hover:bg-muted/50',
    disabled || isUploading ? 'opacity-70 cursor-not-allowed' : '',
  ].join(' ');

  return (
    <div className="space-y-2">
      <div
        className={zoneClass}
        onClick={() => !disabled && !isUploading && inputRef.current?.click()}
        onDragOver={onDragOver}
        onDragEnter={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !disabled && !isUploading) inputRef.current?.click(); }}
      >
        {isUploading ? (
          <Loader2 className={compact ? 'h-4 w-4 animate-spin text-muted-foreground' : 'h-5 w-5 animate-spin text-muted-foreground'} />
        ) : (
          <UploadCloud className={compact ? 'h-4 w-4 text-muted-foreground' : 'h-6 w-6 text-muted-foreground'} />
        )}
        <div className="text-muted-foreground">
          <span className="font-medium text-foreground">Drop files here</span>
          {' or '}
          <span className="text-primary underline underline-offset-2">browse</span>
        </div>
        <div className="text-[11px] text-muted-foreground">
          Select multiple files (hold Ctrl/Cmd to pick more than one)
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={accept}
          className="hidden"
          disabled={disabled || isUploading}
          onChange={async (e) => {
            await handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachments.map((att, i) => (
            <div key={`${att.url}-${i}`} className="flex items-center gap-1 bg-muted rounded px-2 py-1 text-xs">
              {/\.(jpg|jpeg|png|gif|webp)$/i.test(att.name) ? <ImageIcon className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
              <span className="max-w-[140px] truncate" title={att.name}>{att.name}</span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onRemove(i); }}
                className="ml-1 hover:text-destructive"
                aria-label={`Remove ${att.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Small helper: renders just an "Attach" button + hidden multi-input, for
// callers who don't want the full drop zone (e.g. inline in compact reply
// footers). Uses the same upload flow.
export function AttachmentPickerButton({
  onAdd,
  onUpload,
  isUploading,
  accept = 'image/*,.pdf',
  disabled = false,
  label = 'Attach',
}: {
  onAdd: (files: Attachment[]) => void;
  onUpload: (files: FileList) => Promise<Attachment[]>;
  isUploading: boolean;
  accept?: string;
  disabled?: boolean;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={accept}
        className="hidden"
        disabled={disabled || isUploading}
        onChange={async (e) => {
          if (e.target.files?.length) {
            const uploaded = await onUpload(e.target.files);
            if (uploaded.length > 0) onAdd(uploaded);
          }
          e.target.value = '';
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || isUploading}
      >
        {isUploading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Paperclip className="h-3 w-3 mr-1" />}
        {label}
      </Button>
    </>
  );
}
