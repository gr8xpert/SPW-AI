import { stageOf, type TimelineStage, type TimelineState } from '../tracking/timeline';

// Merging buyer B (source) into A (kept): every row of B moves to A, except
// suggestions of a property A already has — then the one further along the
// timeline stays and the other is dropped (its events are moved first).
// Pure: decides, the service runs the SQL.

const RANK: Record<TimelineStage, number> = {
  suggested: 0,
  sent: 1,
  opened: 2,
  clicked: 3,
  rejected: 4,
  liked: 5,
  viewing: 6,
  offer: 7,
};

export interface MergeSuggestion extends TimelineState {
  id: number;
  propertyId: number;
}

export interface SuggestionPlan {
  move: number[]; // source suggestion ids that move to the kept buyer as they are
  replace: { keep: number; drop: number }[]; // keep = the further one (either buyer's); drop is deleted after its events move to keep
}

export function timelineRank(s: TimelineState): number {
  return RANK[stageOf(s)];
}

export function planSuggestions(kept: MergeSuggestion[], source: MergeSuggestion[]): SuggestionPlan {
  const byProperty = new Map(kept.map((s) => [s.propertyId, s]));
  const plan: SuggestionPlan = { move: [], replace: [] };
  for (const s of source) {
    const k = byProperty.get(s.propertyId);
    if (!k) plan.move.push(s.id);
    else if (timelineRank(s) > timelineRank(k)) plan.replace.push({ keep: s.id, drop: k.id });
    else plan.replace.push({ keep: k.id, drop: s.id });
  }
  return plan;
}

// Related agents of the kept buyer after the merge: the union, minus the
// kept buyer's main agent.
export function mergeAgents(keptAgent: number | null, kept: number[], source: number[], sourceAgent: number | null): number[] {
  const all = new Set([...kept, ...source, ...(sourceAgent ? [sourceAgent] : [])]);
  if (keptAgent) all.delete(keptAgent);
  return [...all].sort((a, b) => a - b);
}
