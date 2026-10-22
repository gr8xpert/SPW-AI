'use client';

import { useState } from 'react';
import { Loader2, ThumbsDown, ThumbsUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useBuyerText } from '../../../_i18n/use-buyer-text';
import type { Buyer } from '../../../use-buyers';
import { nameOf, useMatchOptions, useSaveWishlist } from '../../../use-buyer-match';
import {
  applyChanges, mergeRules, useDismissSuggestion, useFeedbackPatterns, useReadComments, useSaveRules,
  type AiProposal, type FeedbackSuggestion, type NoteRule,
} from '../../../use-buyer-ai';
import { AiButton, useAiFailure } from './ai-gate';
import { useApplyProposal } from './paste-dialog';
import { ProposalReview, reviewAll, useRuleWords, type ReviewState } from './proposal-review';

// Learns from feedback: counted patterns in likes and rejects (free), each
// accepted with one click, plus the buyer's comments read by AI.
export function FeedbackCard({ buyer }: { buyer: Buyer }) {
  const text = useBuyerText();
  const t = text.ai.feedback;
  const { toast } = useToast();
  const patterns = useFeedbackPatterns(buyer.id);
  const features = useMatchOptions('features');
  const types = useMatchOptions('property-types');
  const locations = useMatchOptions('locations');
  const ruleWords = useRuleWords();
  const saveWishlist = useSaveWishlist(buyer.id);
  const saveRules = useSaveRules(buyer.id);
  const dismiss = useDismissSuggestion(buyer.id);
  const read = useReadComments(buyer.id);
  const { apply, pending } = useApplyProposal(buyer);
  const failure = useAiFailure();
  const [proposal, setProposal] = useState<AiProposal | null>(null);
  const [review, setReview] = useState<ReviewState>({ changes: new Set(), rules: new Set() });
  const [busyKey, setBusyKey] = useState<string | null>(null);

  if (buyer.erasedAt) return null;
  const data = patterns.data;
  const named = (list: typeof features.data, id: number | undefined) => nameOf(list?.find((x) => x.id === id)?.name) || `#${id}`;

  const fact = (s: FeedbackSuggestion): string => {
    const r = s.rule;
    if (s.kind === 'feature') return t.likedFeature(s.liked, s.likedTotal, named(features.data, s.featureId));
    if (r?.kind === 'floor') return t.rejectedFloor(s.rejected, text.ai.rules.floors[r.value] ?? r.value);
    if (r?.kind === 'type') return t.rejectedType(s.rejected, named(types.data, r.propertyTypeId));
    if (r?.kind === 'place') return t.rejectedPlace(s.rejected, named(locations.data, r.locationId));
    return '';
  };
  const question = (s: FeedbackSuggestion): string =>
    s.kind === 'feature' ? t.addFeature(named(features.data, s.featureId)) : t.addRule(ruleWords({ ...(s.rule as NoteRule), id: '', text: '', strength: 'soft' }));

  const accept = async (s: FeedbackSuggestion) => {
    setBusyKey(s.key);
    try {
      if (s.kind === 'feature' && s.featureId) {
        await saveWishlist.mutateAsync(applyChanges(buyer.wishlist, [{ field: 'featureIds', from: null, to: Array.from(new Set([...(buyer.wishlist?.featureIds ?? []), s.featureId])) }]));
      } else if (s.rule) {
        // Learned from feedback = a soft rule, worded by what was counted.
        const rule = { ...s.rule, id: s.key.slice('rule:'.length), text: fact(s), strength: 'soft' } as NoteRule;
        await saveRules.mutateAsync({ rules: mergeRules(buyer.noteRules, [rule]) });
      }
      toast({ title: text.ai.saved });
    } catch (err) {
      failure.notify(err);
    } finally {
      setBusyKey(null);
    }
  };
  const no = async (s: FeedbackSuggestion) => {
    setBusyKey(s.key);
    try {
      await dismiss.mutateAsync(s.key);
    } catch (err) {
      failure.notify(err);
    } finally {
      setBusyKey(null);
    }
  };
  const readComments = async () => {
    try {
      const p = await read.mutateAsync(undefined);
      setProposal(p);
      setReview(reviewAll(p));
    } catch (err) {
      failure.notify(err);
    }
  };
  const saveProposal = async () => {
    if (!proposal) return;
    try {
      await apply(proposal, review);
      toast({ title: text.ai.saved });
      setProposal(null);
    } catch (err) {
      failure.notify(err);
    }
  };

  return (
    <Card data-testid="ai-feedback">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t.title}</CardTitle>
        <CardDescription>
          {t.description} {data && (data.liked || data.rejected) ? t.counted(data.liked, data.rejected) : null}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {patterns.isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : !data?.suggestions.length ? (
          <p className="text-sm text-muted-foreground">{t.none}</p>
        ) : (
          <ul className="space-y-3">
            {data.suggestions.map((s) => (
              <li key={s.key} className="flex flex-col gap-2 rounded-md border p-3 text-sm sm:flex-row sm:items-center" data-feedback={s.key}>
                <div className="min-w-0 flex-1">
                  <p className="flex items-start gap-1.5 text-muted-foreground">
                    {s.kind === 'feature' ? <ThumbsUp className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <ThumbsDown className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                    {fact(s)}
                  </p>
                  <p className="font-medium">{question(s)}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" onClick={() => accept(s)} disabled={busyKey !== null} data-testid="feedback-accept">
                    {busyKey === s.key ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {t.accept}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => no(s)} disabled={busyKey !== null} data-testid="feedback-dismiss">
                    {t.dismiss}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {proposal ? (
          <div className="space-y-3 rounded-md border p-3" data-testid="feedback-comments">
            <p className="text-sm font-medium">{t.commentsTitle}</p>
            <ProposalReview proposal={proposal} value={review} onChange={setReview} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setProposal(null)}>{text.ai.close}</Button>
              {proposal.changes.length || proposal.rules.length ? (
                <Button size="sm" onClick={saveProposal} disabled={pending || !(review.changes.size + review.rules.size)} data-testid="feedback-comments-save">
                  {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {t.save}
                </Button>
              ) : null}
            </div>
          </div>
        ) : data?.comments ? (
          <AiButton size="sm" variant="outline" className="h-auto min-h-9 whitespace-normal text-left" onClick={readComments} pending={read.isPending} data-testid="feedback-read-comments">
            {t.readComments(data.comments)}
          </AiButton>
        ) : null}
        {failure.dialog}
      </CardContent>
    </Card>
  );
}
