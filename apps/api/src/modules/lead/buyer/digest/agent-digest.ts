import { escapeHtml } from '../../../../common/security/escape-html';
import { frame, type FormSender } from '../../form-mail.service';

// The agent's daily email: what needs doing today. English (the dashboard's
// language), the agency's branding, links into the dashboard. Pure.

export interface AgentDigestData {
  agentName: string | null;
  dashboardUrl: string;
  overdueTasks: { title: string; buyer: string; buyerId: number; dueAt: string }[];
  todayTasks: { title: string; buyer: string; buyerId: number; dueAt: string }[];
  viewings: { time: string; buyer: string; buyerId: number; property: string; meetingPoint: string | null }[];
  waiting: { buyer: string; buyerId: number; since: string | null }[];
  hot: { buyer: string; buyerId: number; score: number }[];
  alertsToApprove: number;
  // Lead Report: own leads not contacted within overdueHours; for managers
  // also the team's count per agent.
  overdueHours?: number;
  notContacted?: { buyer: string; buyerId: number; since: string }[];
  team?: { agent: string; overdue: number }[];
}

// Waiting for a reply: the newest contact came from the buyer and nobody
// answered since, or the "waiting for reply" date (Odoo) has come. lastBuyer
// and lastAgent are activity ids (createdAt has second precision, so two
// activities in the same second can't be ordered by time).
export function waitingForReply(args: {
  lastBuyer: number | null;
  lastAgent: number | null;
  waitingReplyAt: string | null;
  today: string;
}): boolean {
  if (args.waitingReplyAt && args.waitingReplyAt.slice(0, 10) <= args.today) return true;
  if (!args.lastBuyer) return false;
  return !args.lastAgent || args.lastAgent < args.lastBuyer;
}

export function hasContent(d: AgentDigestData): boolean {
  return (
    d.overdueTasks.length + d.todayTasks.length + d.viewings.length + d.waiting.length + d.hot.length + d.alertsToApprove +
      (d.notContacted?.length ?? 0) + (d.team?.length ?? 0) > 0
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function buildAgentDigest(from: FormSender, d: AgentDigestData): { subject: string; html: string; text: string } {
  const tasks = d.overdueTasks.length + d.todayTasks.length;
  const notContacted = d.notContacted ?? [];
  const team = d.team ?? [];
  const reportUrl = `${d.dashboardUrl}/dashboard/buyers/lead-report?status=overdue`;
  const notContactedTitle = `Not contacted after ${d.overdueHours ?? 24} hours`;
  const parts = [
    notContacted.length ? `${plural(notContacted.length, 'lead', 'leads')} not contacted` : '',
    tasks ? plural(tasks, 'task', 'tasks') : '',
    d.viewings.length ? plural(d.viewings.length, 'viewing', 'viewings') : '',
    d.waiting.length ? `${d.waiting.length} waiting for a reply` : '',
    d.hot.length ? plural(d.hot.length, 'hot buyer', 'hot buyers') : '',
  ].filter(Boolean);
  const subject = `Your day: ${parts.join(', ') || 'nothing urgent'}`;
  const link = (id: number, label: string) => `<a href="${escapeHtml(`${d.dashboardUrl}/dashboard/buyers/${id}`)}" style="color:${from.color};">${escapeHtml(label)}</a>`;
  const section = (title: string, rows: string[]) =>
    rows.length ? `<h3 style="margin:20px 0 6px;font-size:15px;">${escapeHtml(title)}</h3><ul style="margin:0;padding-left:18px;">${rows.map((r) => `<li style="margin:3px 0;">${r}</li>`).join('')}</ul>` : '';

  const html = frame(
    from,
    'Your day',
    `<p>${escapeHtml(d.agentName ? `Good morning ${d.agentName},` : 'Good morning,')}</p>
    ${section(notContactedTitle, notContacted.map((n) => `${link(n.buyerId, n.buyer)} <span style="color:#b91c1c;">(since ${escapeHtml(n.since)})</span>`))}
    ${section('Team: leads not contacted yet', team.map((m) => `${escapeHtml(m.agent)}: <strong style="color:#b91c1c;">${m.overdue}</strong>`))}
    ${notContacted.length || team.length ? `<p style="margin:6px 0 0;"><a href="${escapeHtml(reportUrl)}" style="color:${from.color};">Open the Lead Report</a></p>` : ''}
    ${section('Overdue tasks', d.overdueTasks.map((t) => `${escapeHtml(t.title)} · ${link(t.buyerId, t.buyer)} <span style="color:#b91c1c;">(${escapeHtml(t.dueAt)})</span>`))}
    ${section('Tasks today', d.todayTasks.map((t) => `${escapeHtml(t.title)} · ${link(t.buyerId, t.buyer)} (${escapeHtml(t.dueAt)})`))}
    ${section('Viewings today', d.viewings.map((v) => `<strong>${escapeHtml(v.time)}</strong> ${escapeHtml(v.property)} with ${link(v.buyerId, v.buyer)}${v.meetingPoint ? ` · ${escapeHtml(v.meetingPoint)}` : ''}`))}
    ${section('Waiting for a reply', d.waiting.map((w) => `${link(w.buyerId, w.buyer)}${w.since ? ` (since ${escapeHtml(w.since)})` : ''}`))}
    ${section('Hot buyers', d.hot.map((h) => `${link(h.buyerId, h.buyer)} (score ${h.score})`))}
    ${d.alertsToApprove ? `<p style="margin-top:20px;"><a href="${escapeHtml(`${d.dashboardUrl}/dashboard/buyers/alerts`)}" style="color:${from.color};font-weight:600;">${escapeHtml(plural(d.alertsToApprove, 'alert waiting for your approval', 'alerts waiting for your approval'))}</a></p>` : ''}
    <p style="margin-top:20px;"><a href="${escapeHtml(`${d.dashboardUrl}/dashboard/buyers/home`)}" style="color:${from.color};font-weight:600;">Open My day</a></p>`,
  );

  const lines = (title: string, rows: string[]) => (rows.length ? ['', title, ...rows.map((r) => `- ${r}`)] : []);
  const text = [
    d.agentName ? `Good morning ${d.agentName},` : 'Good morning,',
    ...lines(notContactedTitle, notContacted.map((n) => `${n.buyer} (since ${n.since})`)),
    ...lines('Team: leads not contacted yet', team.map((m) => `${m.agent}: ${m.overdue}`)),
    ...(notContacted.length || team.length ? [reportUrl] : []),
    ...lines('Overdue tasks', d.overdueTasks.map((t) => `${t.title} · ${t.buyer} (${t.dueAt})`)),
    ...lines('Tasks today', d.todayTasks.map((t) => `${t.title} · ${t.buyer} (${t.dueAt})`)),
    ...lines('Viewings today', d.viewings.map((v) => `${v.time} ${v.property} with ${v.buyer}${v.meetingPoint ? ` · ${v.meetingPoint}` : ''}`)),
    ...lines('Waiting for a reply', d.waiting.map((w) => `${w.buyer}${w.since ? ` (since ${w.since})` : ''}`)),
    ...lines('Hot buyers', d.hot.map((h) => `${h.buyer} (score ${h.score})`)),
    ...(d.alertsToApprove ? ['', plural(d.alertsToApprove, 'alert waiting for your approval', 'alerts waiting for your approval')] : []),
    '',
    `${d.dashboardUrl}/dashboard/buyers/home`,
  ].join('\n');
  return { subject, html, text };
}
