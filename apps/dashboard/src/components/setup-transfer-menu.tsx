'use client';

import { useRef, useState } from 'react';
import { ArrowLeftRight, Download, Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { useSharedText, type SetupKind as Kind } from '@/i18n/shared';

interface ImportReport {
  applied: boolean;
  fileRows: number;
  accountRows: number;
  matched: number;
  changed: number;
  moved: number;
  renamed: number;
  reordered: number;
  coordsSet?: number;
  aliasesSet?: number;
  merged: number;
  keptInPlace: number;
  clashes: number;
  ambiguous: number;
  notInAccount: number;
  notInAccountSample: string[];
  untouched: number;
}

// The API wraps every response as { data }.
const unwrap = <T,>(res: any): T => res?.data ?? res;

/**
 * Copy the Locations or Property Types arrangement from one client to another.
 * Export saves this client's nesting, order, names and translations (plus
 * other spellings and map points for locations) to a file. Import arranges
 * this client's own rows the same way: rows the file has but this client
 * doesn't are never created, and rows only this client has stay as they are.
 */
export function SetupTransferMenu({ kind, onImported }: { kind: Kind; onImported: () => void }) {
  const api = useApi();
  const { toast } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportReport | null>(null);
  const t = useSharedText().setupTransfer;
  const base = `/api/dashboard/${kind}`;

  const exportSetup = async () => {
    setBusy(true);
    try {
      const data = unwrap<any>(await api.get(`${base}/export`));
      const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${kind}-setup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: t.exported, description: t.exportedText(data?.count ?? 0, kind) });
    } catch (e) {
      toast({ title: t.exportFailed, description: e instanceof Error ? e.message : t.tryAgain, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const send = async (f: File, apply: boolean): Promise<ImportReport> => {
    const fd = new FormData();
    fd.append('file', f);
    return unwrap<ImportReport>(await api.post(`${base}/import${apply ? '?apply=true' : ''}`, fd));
  };

  const pickFile = async (f: File | undefined) => {
    if (fileInput.current) fileInput.current.value = '';
    if (!f) return;
    setBusy(true);
    try {
      setPreview(await send(f, false));
      setFile(f);
    } catch (e) {
      toast({ title: t.readFailed, description: e instanceof Error ? e.message : t.tryAgain, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const r = await send(file, true);
      toast({
        title: t.imported,
        description: t.importedText(r.changed, r.merged, kind),
      });
      setPreview(null);
      setFile(null);
      onImported();
    } catch (e) {
      toast({ title: t.importFailed, description: e instanceof Error ? e.message : t.tryAgain, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const rows: Array<[string, number | undefined]> = preview
    ? [
        [t.rows.moved, preview.moved],
        [t.rows.renamed, preview.renamed],
        [t.rows.reordered, preview.reordered],
        [t.rows.aliases, preview.aliasesSet],
        [t.rows.coords, preview.coordsSet],
        [t.rows.merged, preview.merged],
        [t.rows.keptInPlace, preview.keptInPlace],
        [t.rows.clashes, preview.clashes],
        [t.rows.ambiguous, preview.ambiguous],
      ]
    : [];

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ArrowLeftRight className="h-4 w-4 mr-2" />}
            {t.button}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel className="font-normal text-xs text-muted-foreground">
            {t.menuHelp(kind)}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={exportSetup}>
            <Download className="h-4 w-4 mr-2" />
            {t.export}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => fileInput.current?.click()}>
            <Upload className="h-4 w-4 mr-2" />
            {t.import}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => pickFile(e.target.files?.[0])}
      />

      <Dialog open={!!preview} onOpenChange={(open) => { if (!open && !busy) { setPreview(null); setFile(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t.dialogTitle(kind)}</DialogTitle>
            <DialogDescription>
              {preview && t.found(preview.matched, preview.accountRows, preview.changed, kind)}
            </DialogDescription>
          </DialogHeader>
          {preview && (
            <div className="space-y-3 text-sm">
              <ul className="space-y-1">
                {rows
                  .filter(([, n]) => n)
                  .map(([text, n]) => (
                    <li key={text} className="flex justify-between gap-4">
                      <span className="text-muted-foreground">{text}</span>
                      <span className="font-medium tabular-nums">{n}</span>
                    </li>
                  ))}
              </ul>
              <p className="text-muted-foreground">
                {t.untouched(preview.untouched, kind)}
                {preview.notInAccount > 0 && (
                  <> {t.notInAccount(preview.notInAccount, kind)}
                    {preview.notInAccountSample.length > 0 && <> {t.example(preview.notInAccountSample.slice(0, 5).join(', '))}</>}.</>
                )}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => { setPreview(null); setFile(null); }}>{t.cancel}</Button>
            <Button disabled={busy || !preview || (preview.changed === 0 && preview.merged === 0)} onClick={apply}>
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t.apply}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
