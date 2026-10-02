'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, MapPin, RotateCcw, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export interface FillStatus {
  remaining: number;
  filled: number;
  notFound: number;
}

export interface FillProgress {
  checked: number;
  coordsFilled: number;
  postcodesFilled: number;
  byAi: number;
  notFound: number;
  aiFailed: boolean;
  remaining: number;
}

// "Fill missing coordinates & postcodes": the server looks each place up on the
// map (OpenStreetMap), asks the AI about what the map can't find, and checks
// every value against the place's parent. Each call works ~35 s; this keeps
// calling until nothing is left, showing progress, and can be stopped.
export function AutoFillPanel({
  getStatus,
  fill,
  undo,
  onChanged,
  onFinished,
  notify,
}: {
  getStatus: () => Promise<FillStatus>;
  fill: (retry: boolean) => Promise<FillProgress>;
  undo: () => Promise<{ places: number; coords: number; postcodes: number }>;
  onChanged: () => Promise<void>;
  // Filled points reach clients' maps only after a re-apply.
  onFinished: () => void;
  notify: (title: string, description?: string, destructive?: boolean) => void;
}) {
  const [status, setStatus] = useState<FillStatus | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const [undoOpen, setUndoOpen] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const stopRef = useRef(false);

  const refresh = () =>
    getStatus()
      .then(setStatus)
      .catch(() => setStatus(null));

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async (retry: boolean) => {
    setRunning(true);
    stopRef.current = false;
    const total = { coords: 0, postcodes: 0, ai: 0, checked: 0 };
    let aiWarned = false;
    let failed = false;
    try {
      let first = true;
      for (;;) {
        const r = await fill(retry && first);
        first = false;
        total.coords += r.coordsFilled;
        total.postcodes += r.postcodesFilled;
        total.ai += r.byAi;
        total.checked += r.checked;
        setProgress(`${total.checked} checked · ${total.coords} points · ${total.postcodes} postcodes · ${r.remaining} left`);
        if (r.aiFailed && !aiWarned) {
          aiWarned = true;
          notify('The AI could not be reached', 'Places the map could not find are marked "not found" — use Retry not found later.', true);
        }
        if (r.remaining === 0 || r.checked === 0 || stopRef.current) break;
      }
    } catch (e) {
      failed = true;
      notify('Fill stopped', (e as Error)?.message || 'Try again in a minute — what was filled so far is kept.', true);
    } finally {
      setRunning(false);
      setProgress('');
      await Promise.all([refresh(), onChanged()]);
    }
    if (!failed) {
      notify(
        `Filled ${total.coords} point(s) and ${total.postcodes} postcode(s)`,
        `${total.ai} with AI help. Re-apply the template so clients' maps use the new points.`,
      );
      if (total.coords > 0) onFinished();
    }
  };

  const confirmUndo = async () => {
    setUndoing(true);
    try {
      const r = await undo();
      notify('Auto-fill undone', `${r.coords} point(s) and ${r.postcodes} postcode(s) cleared.`);
      setUndoOpen(false);
      await Promise.all([refresh(), onChanged()]);
    } catch (e) {
      notify('Could not undo', (e as Error)?.message || '', true);
    } finally {
      setUndoing(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed p-2 text-xs" data-testid="autofill-panel">
      <MapPin className="h-4 w-4 text-muted-foreground" />
      <span className="text-muted-foreground">
        {running
          ? progress || 'Looking up places…'
          : status
            ? `${status.remaining.toLocaleString()} place(s) missing a point or postcode` +
              (status.filled ? ` · ${status.filled.toLocaleString()} auto-filled` : '') +
              (status.notFound ? ` · ${status.notFound.toLocaleString()} not found` : '')
            : 'Fill missing points and postcodes from the map, then AI.'}
      </span>
      <div className="ml-auto flex flex-wrap gap-2">
        {running ? (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => (stopRef.current = true)}>
            <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Stop after this batch
          </Button>
        ) : (
          <>
            <Button size="sm" className="h-7 text-xs" onClick={() => run(false)} disabled={!status?.remaining} data-testid="autofill-run">
              Fill missing coordinates & postcodes
            </Button>
            {!!status?.notFound && (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => run(true)}>
                <RotateCcw className="mr-1 h-3 w-3" /> Retry not found
              </Button>
            )}
            {!!status?.filled && (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setUndoOpen(true)} data-testid="autofill-undo">
                <Undo2 className="mr-1 h-3 w-3" /> Undo auto-fill
              </Button>
            )}
          </>
        )}
      </div>

      <AlertDialog open={undoOpen} onOpenChange={setUndoOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Undo auto-fill?</AlertDialogTitle>
            <AlertDialogDescription>
              Clears every point and postcode the automatic fill added. Values a person has edited or confirmed since are
              kept. Re-apply the template afterwards so clients&apos; maps follow.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={undoing}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => (e.preventDefault(), confirmUndo())} disabled={undoing}>
              {undoing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Undo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
