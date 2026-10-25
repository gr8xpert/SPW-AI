// Lead Report (pure): how far the agency got with each lead — like the
// Google Sheet clients kept by hand (called once, no answer, notes …), but
// read from the activity timeline. The service runs the SQL.
import { conversion } from '../reports/reports';

export type CallOutcome = 'answered' | 'no_answer' | 'wrong_number' | 'call_back';

// An agent reaching out: a call (any outcome), WhatsApp, email, text, a sent
// selection, a meeting or a viewing. Website/system entries have no userId.
export const ATTEMPT_TYPES = ['call', 'whatsapp', 'email', 'sms', 'suggestion_sent', 'meeting', 'viewing', 'viewing_planned', 'viewing_done'] as const;

// Spoke with the person: an answered call (calls logged before outcomes
// existed count as answered), a meeting or a viewing.
const REACHED_TYPES = new Set(['meeting', 'viewing', 'viewing_planned', 'viewing_done']);

// Agent-written text shown as the latest note.
const NOTE_TYPES = new Set(['note', 'call', 'email', 'sms', 'meeting', 'offer']);

// SQL for the same rules, on a lead_activities alias.
export const attemptSql = (a = 'a') => `${a}.userId IS NOT NULL AND ${a}.type IN (${ATTEMPT_TYPES.map((t) => `'${t}'`).join(',')})`;
export const reachedSql = (a = 'a') =>
  `${a}.userId IS NOT NULL AND (${a}.type IN (${[...REACHED_TYPES].map((t) => `'${t}'`).join(',')}) OR (${a}.type = 'call' AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(${a}.metadata, '$.outcome')), 'answered') = 'answered'))`;

export type FollowUpStatus = 'overdue' | 'not_contacted' | 'tried' | 'call_back' | 'wrong_number' | 'reached';
export const FOLLOW_UP_STATUSES: FollowUpStatus[] = ['overdue', 'not_contacted', 'tried', 'call_back', 'wrong_number', 'reached'];

export interface ReportActivity {
  type: string;
  userId: number | null;
  createdAt: Date;
  description: string | null;
  metadata: Record<string, unknown> | null;
}

export interface FollowUp {
  status: FollowUpStatus;
  calls: number;
  whatsapps: number;
  emails: number;
  lastOutcome: CallOutcome | null;
  firstContactAt: Date | null;
  lastContactAt: Date | null;
  // Hours from the lead coming in to the first attempt.
  firstContactHours: number | null;
  lastNote: { text: string; at: Date; type: string } | null;
  // What the person sent us first (website form, Facebook form answers).
  enquiry: string | null;
}

const isWhatsApp = (a: ReportActivity) => a.type === 'whatsapp' || (a.type === 'suggestion_sent' && a.metadata?.channel === 'whatsapp');
const outcomeOf = (a: ReportActivity): CallOutcome => (a.metadata?.outcome as CallOutcome) || 'answered';

export function isAttempt(a: ReportActivity): boolean {
  return a.userId !== null && (ATTEMPT_TYPES as readonly string[]).includes(a.type);
}

export function isReached(a: ReportActivity): boolean {
  if (a.userId === null) return false;
  return REACHED_TYPES.has(a.type) || (a.type === 'call' && outcomeOf(a) === 'answered');
}

// One lead's follow-up, from its activities (any order).
export function followUp(lead: { createdAt: Date }, activities: ReportActivity[], now: Date, overdueHours: number): FollowUp {
  const acts = [...activities].sort((x, y) => +new Date(x.createdAt) - +new Date(y.createdAt));
  const attempts = acts.filter(isAttempt);
  const calls = acts.filter((a) => a.userId !== null && a.type === 'call');
  const lastCall = calls[calls.length - 1];
  const lastOutcome = lastCall ? outcomeOf(lastCall) : null;
  const reached = acts.some(isReached);

  let status: FollowUpStatus;
  if (!attempts.length) status = +now - +new Date(lead.createdAt) >= overdueHours * 3_600_000 ? 'overdue' : 'not_contacted';
  else if (reached) status = 'reached';
  // Not reached yet: what the last call said decides the colour.
  else if (lastOutcome === 'wrong_number') status = 'wrong_number';
  else if (lastOutcome === 'call_back') status = 'call_back';
  else status = 'tried';

  const first = attempts[0] ? new Date(attempts[0].createdAt) : null;
  const note = [...acts].reverse().find((a) => a.userId !== null && NOTE_TYPES.has(a.type) && (a.description ?? '').trim());
  const enquiry = acts.find((a) => (a.type === 'enquiry' || a.type === 'wishlist_form') && (a.description ?? '').trim());
  return {
    status,
    calls: calls.length,
    whatsapps: acts.filter((a) => a.userId !== null && isWhatsApp(a)).length,
    emails: acts.filter((a) => a.userId !== null && (a.type === 'email' || (a.type === 'suggestion_sent' && !isWhatsApp(a)))).length,
    lastOutcome,
    firstContactAt: first,
    lastContactAt: attempts.length ? new Date(attempts[attempts.length - 1].createdAt) : null,
    firstContactHours: first ? Math.max(0, Math.round(((+first - +new Date(lead.createdAt)) / 3_600_000) * 10) / 10) : null,
    lastNote: note ? { text: note.description!.trim(), at: new Date(note.createdAt), type: note.type } : null,
    enquiry: enquiry ? cleanEnquiry(enquiry.description!) : null,
  };
}

// Facebook forms start with "Facebook lead form: …", "Campaign: …" and "Ad: …"
// lines; the answers are what an agent wants to read.
export function cleanEnquiry(text: string): string {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const answers = lines.filter((l) => !/^(Campaign|Ad|Form|Platform):/i.test(l) && !/^(Facebook|Instagram) lead form\b/i.test(l));
  return (answers.length ? answers : lines).join('\n').slice(0, 1000);
}

export interface AgentSummaryInput {
  agentId: number | null;
  createdAt: Date;
  firstContactAt: Date | null;
  reached: boolean;
  won: boolean;
  lost: boolean;
  // Won amount (else deal value) of a won lead.
  wonValue: number;
}

export interface AgentSummary {
  agentId: number | null;
  leads: number;
  notContacted: number;
  overdue: number;
  contacted: number;
  reached: number;
  won: number;
  lost: number;
  wonValue: number;
  // Won of the leads that ended (won + lost), in %.
  conversion: number | null;
  // Median hours to the first attempt, of the leads that had one.
  medianFirstContactHours: number | null;
  calls: number;
  whatsapps: number;
  emails: number;
  viewings: number;
}

export function median(values: number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

// Lead counts per main agent; activity counts per agent who did them.
export function agentSummaries(
  leads: AgentSummaryInput[],
  actions: { userId: number | null; calls: number; whatsapps: number; emails: number; viewings: number }[],
  now: Date,
  overdueHours: number,
): AgentSummary[] {
  const by = new Map<number | null, AgentSummary>();
  const row = (agentId: number | null) => {
    let r = by.get(agentId);
    if (!r) {
      r = { agentId, leads: 0, notContacted: 0, overdue: 0, contacted: 0, reached: 0, won: 0, lost: 0, wonValue: 0, conversion: null, medianFirstContactHours: null, calls: 0, whatsapps: 0, emails: 0, viewings: 0 };
      by.set(agentId, r);
    }
    return r;
  };
  const hours = new Map<number | null, number[]>();
  for (const l of leads) {
    const r = row(l.agentId);
    r.leads++;
    if (l.firstContactAt) {
      r.contacted++;
      hours.set(l.agentId, [...(hours.get(l.agentId) ?? []), Math.max(0, (+new Date(l.firstContactAt) - +new Date(l.createdAt)) / 3_600_000)]);
    } else {
      r.notContacted++;
      if (+now - +new Date(l.createdAt) >= overdueHours * 3_600_000) r.overdue++;
    }
    if (l.reached) r.reached++;
    if (l.won) {
      r.won++;
      r.wonValue += l.wonValue;
    }
    if (l.lost) r.lost++;
  }
  for (const a of actions) {
    const r = row(a.userId);
    r.calls += Number(a.calls);
    r.whatsapps += Number(a.whatsapps);
    r.emails += Number(a.emails);
    r.viewings += Number(a.viewings);
  }
  for (const [id, h] of hours) {
    const m = median(h);
    row(id).medianFirstContactHours = m === null ? null : Math.round(m * 10) / 10;
  }
  for (const r of by.values()) {
    r.wonValue = Math.round(r.wonValue);
    r.conversion = conversion(r.won, r.lost);
  }
  return [...by.values()].sort((a, b) => b.leads - a.leads || (a.agentId ?? 0) - (b.agentId ?? 0));
}
