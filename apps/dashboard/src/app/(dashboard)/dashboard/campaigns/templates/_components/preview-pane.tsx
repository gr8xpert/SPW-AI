'use client';

import { useState } from 'react';
import { Loader2, Monitor, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Preview } from './use-template-editor';
import { useEditorText } from '../_i18n';

export function PreviewPane({ preview, loading, failed = false }: { preview: Preview | null; loading: boolean; failed?: boolean }) {
  const t = useEditorText();
  const [phone, setPhone] = useState(false);
  const warnings = (preview?.warnings ?? []).map((w) =>
    w.startsWith('UNKNOWN:') ? t.warnings.unknown(w.slice(8)) : w === 'NO_UNSUBSCRIBE' ? t.warnings.noUnsubscribe : t.invalid[w] ?? w,
  );
  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm"><span className="text-muted-foreground">{t.previewSubject}: </span>{preview?.subject}</p>
        <div className="flex items-center gap-1">
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <Button size="sm" variant={phone ? 'ghost' : 'secondary'} onClick={() => setPhone(false)} aria-label={t.desktop}><Monitor className="h-4 w-4" /></Button>
          <Button size="sm" variant={phone ? 'secondary' : 'ghost'} onClick={() => setPhone(true)} aria-label={t.phone}><Smartphone className="h-4 w-4" /></Button>
        </div>
      </div>
      {failed && (
        <p data-testid="preview-failed" role="status" className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-1.5 text-xs text-destructive">{t.previewFailed}</p>
      )}
      {warnings.length > 0 && (
        <div data-testid="preview-warnings" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          <p className="font-medium">{t.warnings.title}</p>
          <ul className="list-disc pl-4">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </div>
      )}
      <div className="flex flex-1 justify-center overflow-auto rounded-md border bg-muted/40 p-3">
        {/* sandbox="" : no scripts, no forms, no same-origin access */}
        <iframe
          title="preview"
          data-testid="template-preview"
          sandbox=""
          srcDoc={preview?.html ?? ''}
          className="h-[calc(100vh-300px)] min-h-[480px] rounded bg-white shadow-sm transition-[width]"
          style={{ width: phone ? 390 : 680, maxWidth: '100%' }}
        />
      </div>
      <p className="text-xs text-muted-foreground">{t.previewNote}</p>
    </div>
  );
}
