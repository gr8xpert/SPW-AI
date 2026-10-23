'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { useEditorText } from '../_i18n';
import { unwrap } from './use-template-editor';

const MAX_NOTES = 20;
const MAX_NOTE_CHARS = 200;

interface Note { key: number; text: string }

// The client's brand notes the AI designer follows in every design. The API
// cleans them on save (trim, dedupe, ≤20 × 200 chars) and sends back the result.
export function BrandMemoryDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const api = useApi();
  const t = useEditorText();
  const { toast } = useToast();
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [saving, setSaving] = useState(false);
  const nextKey = useRef(0);

  const toNotes = (list: string[]) => list.map((text) => ({ key: nextKey.current++, text }));

  useEffect(() => {
    if (!open || !api.isReady) return;
    let live = true;
    setNotes(null);
    api.get('/api/dashboard/email-designer/brand-memory')
      .then((r) => { if (live) setNotes(toNotes(unwrap<{ notes: string[] }>(r).notes ?? [])); })
      .catch(() => {
        if (!live) return;
        toast({ title: t.chat.memoryLoadFailed, variant: 'destructive' });
        onOpenChange(false);
      });
    return () => { live = false; };
  }, [open, api.isReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!notes || saving) return;
    setSaving(true);
    try {
      const res = unwrap<{ notes: string[] }>(await api.put('/api/dashboard/email-designer/brand-memory', { notes: notes.map((n) => n.text.trim()).filter(Boolean) }));
      setNotes(toNotes(res.notes ?? []));
      toast({ title: t.chat.memorySaved });
      onOpenChange(false);
    } catch (err) {
      toast({ title: t.chat.memoryFailed, description: (err as Error)?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const edit = (key: number, text: string) => setNotes((l) => l && l.map((n) => (n.key === key ? { ...n, text } : n)));
  const remove = (key: number) => setNotes((l) => l && l.filter((n) => n.key !== key));
  const add = () => setNotes((l) => (l && l.length < MAX_NOTES ? [...l, { key: nextKey.current++, text: '' }] : l));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{t.chat.memoryTitle}</DialogTitle><DialogDescription>{t.chat.memoryDescription}</DialogDescription></DialogHeader>
        {!notes ? (
          <div className="flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <div className="max-h-[60vh] space-y-2 overflow-y-auto" data-testid="brand-memory">
            {notes.length === 0 && <p className="text-sm text-muted-foreground" data-testid="memory-empty">{t.chat.memoryEmpty}</p>}
            {notes.map((n) => (
              <div key={n.key} className="flex gap-2" data-testid="memory-note">
                <Input value={n.text} maxLength={MAX_NOTE_CHARS} placeholder={t.chat.memoryPlaceholder} onChange={(e) => edit(n.key, e.target.value)} data-testid="memory-note-input" />
                <Button size="icon" variant="ghost" onClick={() => remove(n.key)} aria-label={t.chat.memoryRemove} title={t.chat.memoryRemove} data-testid="memory-delete"><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            {notes.length < MAX_NOTES && (
              <Button size="sm" variant="outline" onClick={add} data-testid="memory-add"><Plus className="mr-1 h-4 w-4" />{t.chat.memoryAdd}</Button>
            )}
          </div>
        )}
        <DialogFooter>
          <Button onClick={save} disabled={!notes || saving} data-testid="memory-save">
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}{t.chat.memorySave}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
