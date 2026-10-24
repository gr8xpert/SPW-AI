import { buildAgentDigest, hasContent, waitingForReply, type AgentDigestData } from './agent-digest';

const from = { name: 'Costa Homes', color: '#123456', website: 'https://costa.example', replyTo: 'info@costa.example' };

describe('waitingForReply', () => {
  const today = '2026-10-22';
  it('the buyer wrote last and nobody answered', () => {
    expect(waitingForReply({ lastBuyer: 10, lastAgent: null, waitingReplyAt: null, today })).toBe(true);
    expect(waitingForReply({ lastBuyer: 10, lastAgent: 9, waitingReplyAt: null, today })).toBe(true);
  });

  it('the agent answered after the buyer', () => {
    expect(waitingForReply({ lastBuyer: 10, lastAgent: 11, waitingReplyAt: null, today })).toBe(false);
    expect(waitingForReply({ lastBuyer: null, lastAgent: null, waitingReplyAt: null, today })).toBe(false);
  });

  it('the Odoo "Waiting for reply" date has come', () => {
    expect(waitingForReply({ lastBuyer: null, lastAgent: null, waitingReplyAt: '2026-10-22', today })).toBe(true);
    expect(waitingForReply({ lastBuyer: null, lastAgent: null, waitingReplyAt: '2026-10-25', today })).toBe(false);
  });
});

const data: AgentDigestData = {
  agentName: 'Alex',
  dashboardUrl: 'https://dashboard.example',
  overdueTasks: [{ title: 'Call back <Ann>', buyer: 'Ann Lee', buyerId: 1, dueAt: '2026-10-20 10:00' }],
  todayTasks: [],
  viewings: [{ time: '11:30', buyer: 'Bo', buyerId: 2, property: 'R1 — Villa', meetingPoint: 'Office' }],
  waiting: [{ buyer: 'Cy', buyerId: 3, since: '2026-10-21' }],
  hot: [{ buyer: 'Di', buyerId: 4, score: 8 }],
  alertsToApprove: 3,
};

describe('buildAgentDigest', () => {
  it('lists every section with links, escaped', () => {
    const mail = buildAgentDigest(from, data);
    expect(mail.subject).toBe('Your day: 1 task, 1 viewing, 1 waiting for a reply, 1 hot buyer');
    expect(mail.html).toContain('Call back &lt;Ann&gt;');
    expect(mail.html).toContain('href="https://dashboard.example/dashboard/buyers/1"');
    expect(mail.html).toContain('11:30');
    expect(mail.html).toContain('3 alerts waiting for your approval');
    expect(mail.text).toContain('Hot buyers');
  });

  it('leaves out empty sections', () => {
    const mail = buildAgentDigest(from, { ...data, viewings: [], hot: [], alertsToApprove: 0 });
    expect(mail.html).not.toContain('Viewings today');
    expect(mail.html).not.toContain('Hot buyers');
    expect(mail.html).not.toContain('alerts waiting');
  });

  it('lists leads not contacted in time and, for managers, the team', () => {
    const mail = buildAgentDigest(from, {
      ...data,
      overdueHours: 24,
      notContacted: [{ buyer: 'Bjorn <N>', buyerId: 9, since: '2026-10-23' }],
      team: [{ agent: 'Alex', overdue: 4 }],
    });
    expect(mail.subject).toBe('Your day: 1 lead not contacted, 1 task, 1 viewing, 1 waiting for a reply, 1 hot buyer');
    expect(mail.html).toContain('Not contacted after 24 hours');
    expect(mail.html).toContain('Bjorn &lt;N&gt;');
    expect(mail.html).toContain('Alex: <strong');
    expect(mail.html).toContain('dashboard/buyers/lead-report?status=overdue');
    expect(mail.text).toContain('Team: leads not contacted yet');
    expect(hasContent({ ...data, overdueTasks: [], todayTasks: [], viewings: [], waiting: [], hot: [], alertsToApprove: 0, team: [{ agent: 'A', overdue: 1 }] })).toBe(true);
  });

  it('knows when there is nothing to send', () => {
    expect(hasContent({ ...data, overdueTasks: [], todayTasks: [], viewings: [], waiting: [], hot: [], alertsToApprove: 0 })).toBe(false);
    expect(hasContent(data)).toBe(true);
  });
});
