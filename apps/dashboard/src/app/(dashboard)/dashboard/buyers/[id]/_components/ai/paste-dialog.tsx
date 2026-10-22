'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useBuyerText } from '../../../_i18n/use-buyer-text';
import type { Buyer } from '../../../use-buyers';
import { useSaveWishlist } from '../../../use-buyer-match';
import { applyChanges, mergeRules, usePasteToWishlist, useSaveRules, type AiProposal } from '../../../use-buyer-ai';
import { AiButton, useAiFailure } from './ai-gate';
import { ProposalReview, reviewAll, type ReviewState } from './proposal-review';

const MAX_PASTE = 6000;

// Saves what the agent kept of a proposal: the ticked wishlist changes
// (through the normal wishlist save) and the ticked rules.
export function useApplyProposal(buyer: Buyer) {
  const saveWishlist = useSaveWishlist(buyer.id);
  const saveRules = useSaveRules(buyer.id);
  const apply = async (p: AiProposal, review: ReviewState) => {
    const changes = p.changes.filter((c) => review.changes.has(c.field));
    const rules = p.rules.filter((r) => review.rules.has(r.id));
    if (changes.length) await saveWishlist.mutateAsync(applyChanges(buyer.wishlist, changes));
    if (rules.length) await saveRules.mutateAsync({ rules: mergeRules(buyer.noteRules, rules) });
    return changes.length + rules.length;
  };
  return { apply, pending: saveWishlist.isPending || saveRules.isPending };
}

// Paste an email / WhatsApp / website enquiry → wishlist changes and rules.
export function PasteDialog({ buyer, open, onOpenChange, initialText = '' }: { buyer: Buyer; open: boolean; onOpenChange: (open: boolean) => void; initialText?: string }) {
  const t = useBuyerText().ai;
  const { toast } = useToast();
  const read = usePasteToWishlist(buyer.id);
  const { apply, pending } = useApplyProposal(buyer);
  const failure = useAiFailure();
  const [text, setText] = useState(initialText);
  const [proposal, setProposal] = useState<AiProposal | null>(null);
  const [review, setReview] = useState<ReviewState>({ changes: new Set(), rules: new Set() });

  useEffect(() => {
    if (open) {
      setText(initialText);
      setProposal(null);
    }
  }, [open, initialText]);

  const ask = async () => {
    try {
      const p = await read.mutateAsync(text.trim());
      setProposal(p);
      setReview(reviewAll(p));
    } catch (err) {
      failure.notify(err);
    }
  };

  const save = async () => {
    if (!proposal) return;
    try {
      await apply(proposal, review);
      toast({ title: t.saved });
      onOpenChange(false);
    } catch (err) {
      failure.notify(err);
    }
  };

  const chosen = review.changes.size + review.rules.size;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl" data-testid="ai-paste-dialog">
        <DialogHeader>
          <DialogTitle>{t.paste.title}</DialogTitle>
          <DialogDescription>{t.paste.description}</DialogDescription>
        </DialogHeader>
        {!proposal ? (
          <Textarea
            rows={8}
            value={text}
            maxLength={MAX_PASTE}
            placeholder={t.paste.placeholder}
            onChange={(e) => setText(e.target.value)}
            data-testid="ai-paste-text"
          />
        ) : (
          <ProposalReview proposal={proposal} value={review} onChange={setReview} />
        )}
        <DialogFooter className="gap-2">
          {!proposal ? (
            <AiButton onClick={ask} pending={read.isPending} disabled={text.trim().length < 3} data-testid="ai-paste-read">
              {read.isPending ? t.paste.reading : t.paste.read}
            </AiButton>
          ) : (
            <>
              <Button variant="outline" onClick={() => setProposal(null)}>{t.paste.again}</Button>
              <Button onClick={save} disabled={!chosen || pending} data-testid="ai-paste-save">
                {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {t.paste.save}
              </Button>
            </>
          )}
        </DialogFooter>
        {failure.dialog}
      </DialogContent>
    </Dialog>
  );
}
