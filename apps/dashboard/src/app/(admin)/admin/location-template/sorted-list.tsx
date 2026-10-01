'use client';

import { useEffect, useState } from 'react';
import { Loader2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface SortedEntry {
  id: number;
  name: string;
  subName: string | null;
  provider: string;
  occurrences: number;
  placedUnder: string;
  target: string;
  resolution: {
    kind: 'alias' | 'new' | 'dismiss';
    aliasAdded?: boolean;
    createdNode?: boolean;
    by: 'person' | 'ai';
    at: string;
  } | null;
}

// Names already sorted (by a person or by AI after an import), newest first,
// each with Undo: it reverses exactly what was changed and puts the name back
// in the open list.
export function SortedList({
  load,
  reloadKey,
  onUndo,
}: {
  load: () => Promise<SortedEntry[]>;
  reloadKey: number;
  onUndo: (id: number, name: string) => Promise<void>;
}) {
  const [rows, setRows] = useState<SortedEntry[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    setError('');
    load()
      .then((r) => live && setRows(r))
      .catch((e) => live && setError((e as Error).message || 'Could not load sorted names'));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  if (error) return <p className="py-8 text-center text-sm text-red-600">{error}</p>;
  if (rows == null) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (rows.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">Nothing sorted yet.</p>;

  const what = (r: SortedEntry) => {
    const place = r.target.split(' › ').slice(-2).join(' › ');
    if (r.resolution?.kind === 'alias') return `Same place as ${place}${r.resolution.aliasAdded ? '' : ' (spelling was already there)'}`;
    if (r.resolution?.kind === 'new') return `${r.resolution.createdNode ? 'New town' : 'Linked to'} ${place}`;
    return 'Dismissed — not a place';
  };

  return (
    <div className="overflow-x-auto" data-testid="sorted-list">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Place</TableHead>
            <TableHead>What was done</TableHead>
            <TableHead className="text-right">Listings</TableHead>
            <TableHead>By</TableHead>
            <TableHead>When</TableHead>
            <TableHead className="text-right">Undo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell>
                <p className="font-medium">{r.name}</p>
                <p className="text-xs text-muted-foreground">{r.placedUnder}</p>
              </TableCell>
              <TableCell className="text-sm">
                {what(r)}
                {r.resolution?.kind !== 'dismiss' && r.target && (
                  <p className="truncate text-xs text-muted-foreground" title={r.target}>{r.target}</p>
                )}
              </TableCell>
              <TableCell className="text-right">{r.occurrences}</TableCell>
              <TableCell className="text-sm">{r.resolution?.by === 'ai' ? 'AI (import)' : 'Super Admin'}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {r.resolution ? new Date(r.resolution.at).toLocaleString() : ''}
              </TableCell>
              <TableCell className="text-right">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy != null}
                  data-testid="undo"
                  onClick={async () => {
                    setBusy(r.id);
                    try {
                      await onUndo(r.id, r.name);
                      setRows((prev) => (prev || []).filter((x) => x.id !== r.id));
                    } catch {
                      // The page already showed why; the row stays so it can be retried.
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  {busy === r.id ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Undo2 className="mr-1 h-3 w-3" />} Undo
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
