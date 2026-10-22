import type { JobsOptions } from 'bullmq';

// The Buyer Match queue. Everything that runs later or on a timer goes
// through it (pm2 runs 2 API processes, so nothing is kept in memory):
//   feedback-notice  one email per buyer per 10 minutes about their likes/rejects
//   alert-scan       (milestone H) new listings and price drops → alerts
//   alert-digest     (milestone H) the daily email of approved alerts
export const BUYER_MATCH_QUEUE = 'buyer-match';
export const FEEDBACK_NOTICE_JOB = 'feedback-notice';
export const ALERT_SCAN_JOB = 'alert-scan';
export const ALERT_DIGEST_JOB = 'alert-digest';
// Milestone I: reminders before viewings, the agent's daily email.
export const VIEWING_REMINDERS_JOB = 'viewing-reminders';
export const AGENT_DIGEST_JOB = 'agent-digest';
export const META_LEADS_JOB = 'meta-leads';
export const NOTICE_WINDOW_MS = 10 * 60_000;

export interface FeedbackNoticeData {
  tenantId: number;
  leadId: number;
  // The window's reactions: from (inclusive) … until (exclusive), ms.
  from: number;
  until: number;
}

// One job per buyer and window: the job id dedupes, so every reaction in the
// window adds the same job and only the first add counts. Window ids are
// unique, so removing finished jobs never lets a window run twice.
export function feedbackNoticeJob(tenantId: number, leadId: number, now: number): { data: FeedbackNoticeData; opts: JobsOptions } {
  const from = Math.floor(now / NOTICE_WINDOW_MS) * NOTICE_WINDOW_MS;
  const until = from + NOTICE_WINDOW_MS;
  return {
    data: { tenantId, leadId, from, until },
    opts: {
      jobId: `fb-${leadId}-${from}`,
      delay: Math.max(0, until - now) + 5_000,
      attempts: 3,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: true,
      removeOnFail: 100,
    },
  };
}
