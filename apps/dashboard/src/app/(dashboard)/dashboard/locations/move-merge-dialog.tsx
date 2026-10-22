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
import { useLocationsText, nameOf } from './_i18n';

export interface PickableLocation {
  id: number;
  parentId: number | null;
  name: string;
  path: string;
  level: string;
}

// "Move to…" and "Merge into…" for one location. Move puts it (with everything
// inside it) under another place; Merge folds its listings and places into
// another location and removes it. Either way the next feed import keeps the
// client's arrangement (the API remembers where the feed put it).
export function MoveMergeDialog({
  mode,
  source,
  locations,
  onClose,
  onConfirm,
}: {
  mode: 'move' | 'merge' | null;
  source: PickableLocation | null;
  locations: PickableLocation[];
  onClose: () => void;
  onConfirm: (targetId: number | null) => Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [targetId, setTargetId] = useState<number | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const t = useLocationsText();
  const mm = t.moveMerge;

  // A place can't go inside itself or one of its own sub-places.
  const options = useMemo(() => {
    if (!source) return [];
    const inside = new Set<number>([source.id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const l of locations) {
        if (l.parentId != null && inside.has(l.parentId) && !inside.has(l.id)) {
          inside.add(l.id);
          grew = true;
        }
      }
    }
    const q = query.trim().toLowerCase();
    return locations
      .filter((l) => !inside.has(l.id) && (mode !== 'move' || l.id !== source.parentId))
      .filter((l) => !q || l.path.toLowerCase().includes(q))
      .slice(0, 200);
  }, [source, locations, query, mode]);

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
    } finally {
      setBusy(false);
    }
  };

  const target = targetId != null ? locations.find((l) => l.id === targetId) : null;

  return (
    <Dialog open={!!mode && !!source} onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === 'merge' ? mm.mergeTitle(source?.name ?? '') : mm.moveTitle(source?.name ?? '')}
          </DialogTitle>
          <DialogDescription>
            {mode === 'merge'
              ? mm.mergeText
              : mm.moveText}
          </DialogDescription>
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
              data-testid="move-merge-search"
            />
          </div>
          <div className="max-h-72 overflow-y-auto rounded-md border">
            {mode === 'move' && !query && (
              <button
                className={cn('block w-full px-3 py-2 text-left text-sm hover:bg-muted', targetId === null && 'bg-primary/10')}
                onClick={() => setTargetId(null)}
              >
                {mm.topLevel}
              </button>
            )}
            {options.map((l) => (
              <button
                key={l.id}
                className={cn('block w-full px-3 py-2 text-left hover:bg-muted', targetId === l.id && 'bg-primary/10')}
                onClick={() => setTargetId(l.id)}
                data-testid="move-merge-option"
              >
                <span className="text-sm font-medium">{l.name}</span>{' '}
                <span className="text-xs capitalize text-muted-foreground">{nameOf(t.levels, l.level)}</span>
                <span className="block truncate text-xs text-muted-foreground">{l.path}</span>
              </button>
            ))}
            {!options.length && <p className="px-3 py-6 text-center text-sm text-muted-foreground">{mm.noMatch}</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={busy}>
            {t.cancel}
          </Button>
          <Button onClick={confirm} disabled={busy || targetId === undefined} data-testid="move-merge-confirm">
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === 'merge' ? mm.mergeInto(target?.name ?? '…') : target ? mm.moveInto(target.name) : targetId === null ? mm.moveToTop : mm.move}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
