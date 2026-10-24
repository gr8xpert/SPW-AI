import { agentSummaries, cleanEnquiry, followUp, isAttempt, type ReportActivity } from './lead-report';

const now = new Date('2026-10-24T12:00:00Z');
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);
const act = (type: string, h: number, extra: Partial<ReportActivity> = {}): ReportActivity => ({
  type, userId: 5, createdAt: hoursAgo(h), description: null, metadata: null, ...extra,
});

describe('followUp', () => {
  it('is not contacted, then overdue after the hours', () => {
    expect(followUp({ createdAt: hoursAgo(3) }, [], now, 24).status).toBe('not_contacted');
    expect(followUp({ createdAt: hoursAgo(25) }, [], now, 24).status).toBe('overdue');
  });

  it('ignores website and system entries as contact', () => {
    const f = followUp({ createdAt: hoursAgo(30) }, [act('enquiry', 30, { userId: null, description: 'Hi' }), act('assignment', 29)], now, 24);
    expect(f.status).toBe('overdue');
    expect(f.enquiry).toBe('Hi');
  });

  it('counts tries and follows the last call outcome', () => {
    const acts = [act('call', 20, { metadata: { outcome: 'no_answer' } }), act('call', 10, { metadata: { outcome: 'call_back' } })];
    const f = followUp({ createdAt: hoursAgo(22) }, acts, now, 24);
    expect(f).toMatchObject({ status: 'call_back', calls: 2, lastOutcome: 'call_back', firstContactHours: 2 });
    expect(followUp({ createdAt: hoursAgo(22) }, [act('whatsapp', 5)], now, 24).status).toBe('tried');
    expect(followUp({ createdAt: hoursAgo(22) }, [act('call', 5, { metadata: { outcome: 'wrong_number' } })], now, 24).status).toBe('wrong_number');
  });

  it('is reached on an answered call, an old call without outcome or a viewing', () => {
    expect(followUp({ createdAt: hoursAgo(40) }, [act('call', 30, { metadata: { outcome: 'answered' } }), act('call', 2, { metadata: { outcome: 'no_answer' } })], now, 24).status).toBe('reached');
    expect(followUp({ createdAt: hoursAgo(40) }, [act('call', 30)], now, 24).status).toBe('reached');
    expect(followUp({ createdAt: hoursAgo(40) }, [act('viewing_planned', 30)], now, 24).status).toBe('reached');
  });

  it('splits WhatsApp and email selections and keeps the latest note', () => {
    const acts = [
      act('suggestion_sent', 9, { metadata: { channel: 'whatsapp' } }),
      act('suggestion_sent', 8, { metadata: { channel: 'email' } }),
      act('note', 7, { description: 'first' }),
      act('call', 6, { description: 'call back tomorrow', metadata: { outcome: 'no_answer' } }),
      act('whatsapp', 5, { description: 'Hello' }),
    ];
    const f = followUp({ createdAt: hoursAgo(10) }, acts, now, 24);
    expect(f).toMatchObject({ whatsapps: 2, emails: 1, calls: 1 });
    expect(f.lastNote?.text).toBe('call back tomorrow');
  });
});

describe('cleanEnquiry', () => {
  it('drops the Facebook campaign lines', () => {
    expect(cleanEnquiry('Campaign: Spring\nAd: Villa\nBudget: €400.000 – €500.000\nTimetable: Zo snel mogelijk')).toBe('Budget: €400.000 – €500.000\nTimetable: Zo snel mogelijk');
    expect(cleanEnquiry('Campaign: Spring')).toBe('Campaign: Spring');
  });
});

describe('isAttempt', () => {
  it('needs an agent', () => {
    expect(isAttempt(act('call', 1))).toBe(true);
    expect(isAttempt(act('call', 1, { userId: null }))).toBe(false);
    expect(isAttempt(act('note', 1))).toBe(false);
  });
});

describe('agentSummaries', () => {
  it('counts leads per main agent and actions per doer', () => {
    const rows = agentSummaries(
      [
        { agentId: 1, createdAt: hoursAgo(50), firstContactAt: hoursAgo(48), reached: true, won: false },
        { agentId: 1, createdAt: hoursAgo(50), firstContactAt: hoursAgo(46), reached: false, won: false },
        { agentId: 1, createdAt: hoursAgo(30), firstContactAt: null, reached: false, won: false },
        { agentId: 1, createdAt: hoursAgo(1), firstContactAt: null, reached: false, won: false },
        { agentId: null, createdAt: hoursAgo(5), firstContactAt: null, reached: false, won: false },
      ],
      [{ userId: 1, calls: 3, whatsapps: 1, emails: 0, viewings: 1 }, { userId: 2, calls: 1, whatsapps: 0, emails: 0, viewings: 0 }],
      now,
      24,
    );
    expect(rows[0]).toMatchObject({ agentId: 1, leads: 4, contacted: 2, notContacted: 2, overdue: 1, reached: 1, calls: 3, medianFirstContactHours: 3 });
    expect(rows.find((r) => r.agentId === null)).toMatchObject({ leads: 1, notContacted: 1, overdue: 0 });
    expect(rows.find((r) => r.agentId === 2)).toMatchObject({ leads: 0, calls: 1 });
  });
});
