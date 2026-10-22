'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Mic, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { MAX_NOTE_MS, startRecording, voiceSupported, type Recording } from '@/lib/voice-recorder';
import { useBuyerText } from '../../../_i18n/use-buyer-text';
import { useAddBuyerActivity, type Buyer } from '../../../use-buyers';
import { useVoiceNote, type AiProposal } from '../../../use-buyer-ai';
import { AiButton, useAiFailure } from './ai-gate';
import { useApplyProposal } from './paste-dialog';
import { ProposalReview, reviewAll, type ReviewState } from './proposal-review';

type Phase = 'idle' | 'recording' | 'working' | 'review';

// Record ~30 s after a call → a note to edit + wishlist changes to tick.
export function VoiceNoteDialog({ buyer, open, onOpenChange }: { buyer: Buyer; open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useBuyerText().ai;
  const { toast } = useToast();
  const upload = useVoiceNote(buyer.id);
  const addNote = useAddBuyerActivity(buyer.id);
  const { apply, pending } = useApplyProposal(buyer);
  const failure = useAiFailure();
  const [phase, setPhase] = useState<Phase>('idle');
  const [seconds, setSeconds] = useState(0);
  const [note, setNote] = useState('');
  const [result, setResult] = useState<(AiProposal & { note: string; transcript: string }) | null>(null);
  const [review, setReview] = useState<ReviewState>({ changes: new Set(), rules: new Set() });
  const [problem, setProblem] = useState<string | null>(null);
  const rec = useRef<Recording | null>(null);

  useEffect(() => {
    if (!open) {
      rec.current?.cancel();
      rec.current = null;
      setPhase('idle');
      setResult(null);
      setProblem(null);
    }
  }, [open]);
  useEffect(() => {
    if (phase !== 'recording') return;
    const started = Date.now();
    const tick = setInterval(() => setSeconds(Math.min(MAX_NOTE_MS / 1000, Math.floor((Date.now() - started) / 1000))), 250);
    return () => clearInterval(tick);
  }, [phase]);

  const start = async () => {
    setProblem(null);
    if (!voiceSupported()) {
      setProblem(t.voice.unsupported);
      return;
    }
    let r: Recording;
    try {
      r = await startRecording();
    } catch {
      setProblem(t.voice.micBlocked);
      return;
    }
    rec.current = r;
    setSeconds(0);
    setPhase('recording');
    let wav: Blob;
    try {
      wav = await r.done;
    } catch {
      return; // cancelled
    }
    rec.current = null;
    setPhase('working');
    try {
      const out = await upload.mutateAsync(wav);
      setResult(out);
      setNote(out.note);
      setReview(reviewAll(out));
      setPhase('review');
    } catch (err) {
      setPhase('idle');
      if ((err as { code?: string }).code === 'TOO_SHORT') setProblem(t.voice.tooShort);
      else failure.notify(err);
    }
  };

  const save = async () => {
    if (!result) return;
    try {
      if (note.trim()) await addNote.mutateAsync({ type: 'note', description: note.trim().slice(0, 5000), via: 'voice' });
      await apply(result, review);
      toast({ title: t.saved });
      onOpenChange(false);
    } catch (err) {
      failure.notify(err);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl" data-testid="ai-voice-dialog">
        <DialogHeader>
          <DialogTitle>{t.voice.title}</DialogTitle>
          <DialogDescription>{t.voice.description}</DialogDescription>
        </DialogHeader>

        {phase === 'review' && result ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="voice-note-text">{t.voice.note}</Label>
              <Textarea id="voice-note-text" rows={5} value={note} maxLength={5000} onChange={(e) => setNote(e.target.value)} data-testid="ai-voice-note" />
              {result.transcript ? (
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer">{t.voice.transcript}</summary>
                  <p className="mt-1 whitespace-pre-line">{result.transcript}</p>
                </details>
              ) : null}
            </div>
            <ProposalReview proposal={result} value={review} onChange={setReview} />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-4">
            {phase === 'recording' ? (
              <>
                <span className="flex h-14 w-14 animate-pulse items-center justify-center rounded-full bg-red-600 text-white"><Mic className="h-6 w-6" /></span>
                <p className="text-sm" data-testid="ai-voice-timer">{t.voice.recording(seconds)}</p>
                <Button variant="outline" onClick={() => rec.current?.stop()} data-testid="ai-voice-stop">
                  <Square className="mr-2 h-4 w-4" />
                  {t.voice.stop}
                </Button>
              </>
            ) : phase === 'working' ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t.voice.working}</p>
            ) : (
              <AiButton onClick={start} icon={<Mic className="mr-2 h-4 w-4" />} data-testid="ai-voice-start">
                {t.voice.start}
              </AiButton>
            )}
            {problem ? <p className="text-center text-sm text-destructive" data-testid="ai-voice-problem">{problem}</p> : null}
          </div>
        )}

        {phase === 'review' ? (
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setResult(null); setPhase('idle'); }}>{t.voice.retry}</Button>
            <Button onClick={save} disabled={pending || addNote.isPending || (!note.trim() && !review.changes.size && !review.rules.size)} data-testid="ai-voice-save">
              {pending || addNote.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t.voice.save}
            </Button>
          </DialogFooter>
        ) : null}
        {failure.dialog}
      </DialogContent>
    </Dialog>
  );
}
