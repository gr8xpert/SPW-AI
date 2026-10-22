import type { SuggestionStatus } from '@spm/shared';

// How far a property sent to a buyer got:
//   Sent → Opened → Clicked → Liked / Rejected → Viewing → Offer
// Kept as timestamps on lead_suggestions; every event is also logged in
// lead_suggestion_events for the full list. Pure, so the email tracker,
// the buyer page and the agent's buttons all move it the same way.

export const TIMELINE_EVENTS = ['sent', 'opened', 'clicked', 'liked', 'rejected', 'cleared', 'viewing', 'offer'] as const;
export type TimelineEvent = (typeof TIMELINE_EVENTS)[number];

export interface TimelineState {
  sentAt: Date | null;
  openedAt: Date | null;
  clickedAt: Date | null;
  likedAt: Date | null;
  rejectedAt: Date | null;
  rejectReason: string | null;
  viewingAt: Date | null;
  offerAt: Date | null;
}

export type TimelineStage = 'suggested' | 'sent' | 'opened' | 'clicked' | 'liked' | 'rejected' | 'viewing' | 'offer';

export function applyEvent(state: TimelineState, event: TimelineEvent, at: Date, reason?: string | null): TimelineState {
  const s = { ...state };
  switch (event) {
    case 'sent':
      s.sentAt = at;
      break;
    case 'opened':
      s.openedAt = s.openedAt ?? at;
      break;
    case 'clicked':
      s.clickedAt = s.clickedAt ?? at;
      s.openedAt = s.openedAt ?? at;
      break;
    case 'liked':
      s.likedAt = at;
      s.rejectedAt = null;
      s.rejectReason = null;
      break;
    case 'rejected':
      s.rejectedAt = at;
      s.rejectReason = reason?.trim() ? reason.trim().slice(0, 255) : null;
      s.likedAt = null;
      break;
    case 'cleared':
      s.likedAt = null;
      s.rejectedAt = null;
      s.rejectReason = null;
      break;
    case 'viewing':
      s.viewingAt = s.viewingAt ?? at;
      s.rejectedAt = null;
      s.rejectReason = null;
      break;
    case 'offer':
      s.offerAt = s.offerAt ?? at;
      s.rejectedAt = null;
      s.rejectReason = null;
      break;
  }
  return s;
}

export function stageOf(s: TimelineState): TimelineStage {
  if (s.offerAt) return 'offer';
  if (s.viewingAt) return 'viewing';
  if (s.likedAt) return 'liked';
  if (s.rejectedAt) return 'rejected';
  if (s.clickedAt) return 'clicked';
  if (s.openedAt) return 'opened';
  if (s.sentAt) return 'sent';
  return 'suggested';
}

// The Phase 1 status after an event. A status the agent set by hand
// (visited) stays; opens and clicks change nothing.
export function statusAfter(status: SuggestionStatus, event: TimelineEvent): SuggestionStatus {
  if (status === 'visited') return status;
  switch (event) {
    case 'sent':
      return status === 'suggested' ? 'sent' : status;
    case 'liked':
    case 'viewing':
    case 'offer':
      return 'interested';
    case 'rejected':
      return 'not_interested';
    case 'cleared':
      return status === 'interested' || status === 'not_interested' ? 'sent' : status;
    default:
      return status;
  }
}
