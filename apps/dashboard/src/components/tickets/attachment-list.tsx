'use client';

import { FileText } from 'lucide-react';
import type { Attachment } from './attachment-dropzone';

export const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp)$/i;
export const VIDEO_EXT = /\.(mp4|mov|webm)$/i;

// Attachments on a ticket message: images as thumbnails, videos playable
// inline, anything else (PDF) as a link. Shared by every ticket screen.
export function AttachmentList({ attachments }: { attachments?: Attachment[] | null }) {
  if (!attachments || attachments.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {attachments.map((att, i) =>
        IMAGE_EXT.test(att.url || '') ? (
          <a key={i} href={att.url} target="_blank" rel="noopener noreferrer" className="block">
            <img src={att.url} alt={att.name} className="max-w-[200px] max-h-[150px] rounded border object-cover" />
          </a>
        ) : VIDEO_EXT.test(att.url || '') ? (
          <video
            key={i}
            src={att.url}
            controls
            preload="metadata"
            title={att.name}
            className="max-w-[320px] max-h-[200px] rounded border bg-black"
          />
        ) : (
          <a key={i} href={att.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 bg-background rounded px-2 py-1 text-xs border hover:bg-muted">
            <FileText className="h-3 w-3" />
            {att.name}
          </a>
        ),
      )}
    </div>
  );
}
