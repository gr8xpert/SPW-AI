'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useLeadReportText } from '../_i18n';
import { CALL_OUTCOMES, useLogActivity, type CallOutcome } from '../use-lead-report';

// Log a call (outcome + optional note) or a note on a lead, from its row.
export function LogDialog({
  leadId,
  name,
  mode,
  onOpenChange,
}: {
  leadId: number;
  name: string;
  mode: 'call' | 'note' | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useLeadReportText();
  const { toast } = useToast();
  const log = useLogActivity();
  const [outcome, setOutcome] = useState<CallOutcome | null>(null);
  const [text, setText] = useState('');

  const close = () => {
    setOutcome(null);
    setText('');
    onOpenChange(false);
  };

  const canSave = mode === 'call' ? !!outcome : !!text.trim();
  const save = async () => {
    if (!mode || !canSave) return;
    try {
      await log.mutateAsync({ id: leadId, type: mode, outcome: mode === 'call' ? outcome! : undefined, description: text.trim() || undefined });
      toast({ title: mode === 'call' ? t.callSaved : t.noteSaved });
      close();
    } catch (err) {
      toast({ title: t.saveFailed, description: (err as Error).message, variant: 'destructive' });
    }
  };

  return (
    <Dialog open={!!mode} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-md" data-testid="lead-report-log-dialog">
        <DialogHeader>
          <DialogTitle>{mode === 'call' ? t.callTitle(name) : t.noteTitle(name)}</DialogTitle>
        </DialogHeader>
        {mode === 'call' ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{t.howWent}</p>
            <div className="grid grid-cols-2 gap-2">
              {CALL_OUTCOMES.map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => setOutcome(o)}
                  aria-pressed={outcome === o}
                  data-testid={`outcome-${o}`}
                  className={cn(
                    'rounded-md border px-3 py-2 text-sm transition-colors',
                    outcome === o ? 'border-primary bg-primary/10 font-medium text-primary' : 'hover:bg-muted',
                  )}
                >
                  {t.outcomes[o]}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <Textarea
          rows={3}
          maxLength={5000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={mode === 'call' ? t.callNote : t.notePlaceholder}
          data-testid="lead-report-log-text"
        />
        <DialogFooter>
          <Button variant="outline" onClick={close}>{t.cancel}</Button>
          <Button onClick={save} disabled={!canSave || log.isPending} data-testid="lead-report-log-save">
            {log.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
