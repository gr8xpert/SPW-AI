'use client';

import { useMemo, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { usePropertyTypesText } from './_i18n';

export interface PickableType {
  id: number;
  parentId: number | null;
  name: string;
  path: string;
}

// "Move to…" and "Merge into…" for one property type. Move puts it (with its
// sub-types) under another type; Merge folds its listings and sub-types into
// another type and removes it. Either way the next feed import keeps the
// client's arrangement (the API remembers what the feed calls it).
export function MoveMergeDialog({
  mode,
  source,
  types,
  onClose,
  onConfirm,
}: {
  mode: 'move' | 'merge' | null;
  source: PickableType | null;
  types: PickableType[];
  onClose: () => void;
  onConfirm: (targetId: number | null) => Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [targetId, setTargetId] = useState<number | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const t = usePropertyTypesText();
  const mm = t.moveMerge;

  // A type can't go inside itself or one of its own sub-types.
  const options = useMemo(() => {
    if (!source) return [];
    const inside = new Set<number>([source.id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const row of types) {
        if (row.parentId != null && inside.has(row.parentId) && !inside.has(row.id)) {
          inside.add(row.id);
          grew = true;
        }
      }
    }
    const q = query.trim().toLowerCase();
    return types
      .filter((row) => !inside.has(row.id) && (mode !== 'move' || row.id !== source.parentId))
      .filter((row) => !q || row.path.toLowerCase().includes(q));
  }, [source, types, query, mode]);

  const close = () => {
    setQuery('');
    setTargetId(undefined);
    onClose();
  };

  const confirm = async () => {
    if (targetId === undefined) return;
    setBusy(true);
    try {
      await onConfirm(targetId);
      close();
    } catch {
      // The page has shown the error; the dialog stays open to try again.
    } finally {
      setBusy(false);
    }
  };

  const target = targetId != null ? types.find((row) => row.id === targetId) : null;

  return (
    <Dialog open={!!mode && !!source} onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === 'merge' ? mm.mergeTitle(source?.name ?? '') : mm.moveTitle(source?.name ?? '')}
          </DialogTitle>
          <DialogDescription>{mode === 'merge' ? mm.mergeText : mm.moveText}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              className="pl-9"
              placeholder={mm.searchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              data-testid="type-move-merge-search"
            />
          </div>
          <div className="max-h-72 overflow-y-auto rounded-md border">
            {mode === 'move' && !query && source?.parentId != null && (
              <button
                className={cn('block w-full px-3 py-2 text-left text-sm hover:bg-muted', targetId === null && 'bg-primary/10')}
                onClick={() => setTargetId(null)}
              >
                {mm.topLevel}
              </button>
            )}
            {options.map((row) => (
              <button
                key={row.id}
                className={cn('block w-full px-3 py-2 text-left hover:bg-muted', targetId === row.id && 'bg-primary/10')}
                onClick={() => setTargetId(row.id)}
                data-testid="type-move-merge-option"
              >
                <span className="text-sm font-medium [overflow-wrap:anywhere]">{row.name}</span>
                {row.path !== row.name && <span className="block truncate text-xs text-muted-foreground">{row.path}</span>}
              </button>
            ))}
            {!options.length && <p className="px-3 py-6 text-center text-sm text-muted-foreground">{mm.noMatch}</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={busy}>
            {t.cancel}
          </Button>
          <Button onClick={confirm} disabled={busy || targetId === undefined} data-testid="type-move-merge-confirm">
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === 'merge' ? mm.mergeInto(target?.name ?? '…') : target ? mm.moveInto(target.name) : targetId === null ? mm.moveToTop : mm.move}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
