import type { BuyerWishlist, NoteRule, NoteRuleBody } from '@spm/shared';
import type { FloorFacts } from './note-rules';
import { ruleKey } from './note-rules';

// Learns from feedback, by counting: what the buyer's liked properties share
// and their rejected ones have in common. Pure, no AI, no cost. Each pattern
// becomes a one-click suggestion (a wishlist feature, or a soft rule).

const MIN_COUNT = 2;
const FEATURE_SHARE = 0.6;
const MAX_SUGGESTIONS = 5;

export type Verdict = 'liked' | 'rejected';

export interface FeedbackProperty {
  id: number;
  verdict: Verdict;
  features: number[] | null;
  floor: FloorFacts;
  propertyTypeId: number | null;
  townId: number | null;
}

export interface FeedbackSuggestion {
  // feature:<id> or rule:<rule key> — also what a dismissal remembers.
  key: string;
  kind: 'feature' | 'rule';
  featureId?: number;
  rule?: NoteRuleBody;
  // How many liked / rejected properties have it, of how many.
  liked: number;
  likedTotal: number;
  rejected: number;
  rejectedTotal: number;
}

// A suggested property's feedback: the newest of like / reject wins, then
// the agent's status, then a viewing's interest (1–5).
export function classifyFeedback(
  s: { likedAt: Date | null; rejectedAt: Date | null; status: string },
  viewingInterest: number | null,
): Verdict | null {
  if (s.likedAt || s.rejectedAt) {
    if (!s.rejectedAt) return 'liked';
    if (!s.likedAt) return 'rejected';
    return +new Date(s.likedAt) > +new Date(s.rejectedAt) ? 'liked' : 'rejected';
  }
  if (s.status === 'interested') return 'liked';
  if (s.status === 'not_interested') return 'rejected';
  if (viewingInterest != null) {
    if (viewingInterest >= 4) return 'liked';
    if (viewingInterest <= 2) return 'rejected';
  }
  return null;
}

export function feedbackPatterns(
  props: FeedbackProperty[],
  wishlist: BuyerWishlist | null,
  rules: NoteRule[],
  dismissed: string[],
): FeedbackSuggestion[] {
  const liked = props.filter((p) => p.verdict === 'liked');
  const rejected = props.filter((p) => p.verdict === 'rejected');
  const skip = new Set([...dismissed, ...rules.map((r) => `rule:${r.id}`)]);
  const out: FeedbackSuggestion[] = [];
  const count = (list: FeedbackProperty[], has: (p: FeedbackProperty) => boolean) => list.filter(has).length;

  // Rejected again and again, never liked → a rule to avoid it.
  const avoid = (rule: NoteRuleBody, has: (p: FeedbackProperty) => boolean) => {
    const key = `rule:${ruleKey(rule)}`;
    const r = count(rejected, has);
    if (skip.has(key) || r < MIN_COUNT || count(liked, has) > 0) return;
    out.push({ key, kind: 'rule', rule, liked: 0, likedTotal: liked.length, rejected: r, rejectedTotal: rejected.length });
  };
  avoid({ kind: 'floor', mode: 'avoid', value: 'ground' }, (p) => p.floor.ground === true);
  avoid({ kind: 'floor', mode: 'avoid', value: 'top' }, (p) => p.floor.top === true);
  for (const typeId of new Set(rejected.map((p) => p.propertyTypeId).filter((x): x is number => x != null))) {
    avoid({ kind: 'type', mode: 'avoid', propertyTypeId: typeId }, (p) => p.propertyTypeId === typeId);
  }
  const wished = wishlist?.locationIds ?? [];
  for (const townId of new Set(rejected.map((p) => p.townId).filter((x): x is number => x != null))) {
    // Avoiding the only place they search would leave nothing.
    if (wished.length === 1 && wished[0] === townId) continue;
    avoid({ kind: 'place', mode: 'avoid', locationId: townId }, (p) => p.townId === townId);
  }

  // Most liked properties have it, it isn't wished yet → add the feature.
  const likedWithData = liked.filter((p) => Array.isArray(p.features));
  const have = new Set(wishlist?.featureIds ?? []);
  const featureIds = new Set(likedWithData.flatMap((p) => p.features ?? []));
  for (const f of featureIds) {
    const key = `feature:${f}`;
    if (have.has(f) || skip.has(key) || rules.some((r) => r.kind === 'feature' && r.featureId === f)) continue;
    const n = count(likedWithData, (p) => (p.features ?? []).includes(f));
    if (n < MIN_COUNT || n / likedWithData.length < FEATURE_SHARE) continue;
    out.push({ key, kind: 'feature', featureId: f, liked: n, likedTotal: liked.length, rejected: count(rejected, (p) => (p.features ?? []).includes(f)), rejectedTotal: rejected.length });
  }

  const strength = (s: FeedbackSuggestion) => (s.kind === 'rule' ? s.rejected : s.liked);
  return out.sort((a, b) => strength(b) - strength(a)).slice(0, MAX_SUGGESTIONS);
}
