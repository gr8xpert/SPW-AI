import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { PlatformMonitorService } from './platform-monitor.service';
import { renderWeeklyReport, WeeklyReportData } from './weekly-report.service';
import { normaliseSiteUrl } from './site-checkin.service';
import { ago } from './website-health.service';

describe('PlatformMonitorService', () => {
  let dir: string;
  let dbUp = true;
  let sent: Array<{ to: string; subject: string }> = [];
  let monitor: PlatformMonitorService;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'spw-monitor-'));
    process.env.MONITOR_STATE_FILE = join(dir, 'state.json');
    dbUp = true;
    sent = [];
    const db: any = {
      query: async (sql: string) => {
        if (sql.startsWith('SELECT email')) return [{ email: 'owner@spw-ai.com' }];
        if (!dbUp) throw new Error('connect ECONNREFUSED');
        return [{ 1: 1 }];
      },
    };
    const lock: any = { withLock: async (_k: string, _t: number, fn: () => Promise<unknown>) => ({ acquired: true, result: await fn() }) };
    const mailer: any = { send: async (m: any) => void sent.push(m) };
    const config: any = { get: (k: string) => ({ DASHBOARD_URL: 'http://localhost:3000', WIDGET_URL: 'http://localhost:5174' } as any)[k] };
    monitor = new PlatformMonitorService(db, lock, mailer, config);
  });

  afterEach(() => {
    delete process.env.MONITOR_STATE_FILE;
    rmSync(dir, { recursive: true, force: true });
  });

  it('alerts only after two failed checks in a row, once, then on recovery', async () => {
    await monitor.runChecks();
    expect(sent).toHaveLength(0);

    dbUp = false;
    let s = await monitor.runChecks();
    expect(s.checks.database.ok).toBe(false);
    expect(sent).toHaveLength(0); // first failure: could be a restart

    s = await monitor.runChecks();
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe('SPW problem: Database');

    await monitor.runChecks();
    expect(sent).toHaveLength(1); // no repeat while still down

    dbUp = true;
    s = await monitor.runChecks();
    expect(s.checks.database.ok).toBe(true);
    expect(sent).toHaveLength(2);
    expect(sent[1].subject).toBe('SPW recovered: Database');
  });
});

describe('weekly report email', () => {
  const data: WeeklyReportData = {
    tenantId: 1,
    company: 'Cristi <Homes>',
    color: '#0f766e',
    period: { from: '2026-09-07T07:00:00Z', to: '2026-09-14T07:00:00Z' },
    views: { now: 120, before: 100 },
    searches: { now: 40, before: 0 },
    enquiries: { now: 3, before: 6 },
    topProperties: [{ reference: 'R1', title: 'Villa <b>Sea</b>', views: 30 }],
    feed: { runs: 7, failed: 1, created: 12, updated: 40, removed: 5 },
    published: 1229,
    attention: [{ id: 'x', area: 'leads', status: 'warning', title: '2 enquiries waiting over 2 days', detail: 'Answer them.' }],
  };

  it('shows the numbers, trends and what needs attention, escaped', () => {
    const { subject, html, text } = renderWeeklyReport(data, 'https://dashboard.spw-ai.com');
    expect(subject).toBe('Your week on the website: 120 property views, 3 enquiries');
    expect(html).toContain('▲ 20% vs last week');
    expect(html).toContain('▼ 50% vs last week');
    expect(html).toContain('new this week');
    expect(html).toContain('Cristi &lt;Homes&gt;');
    expect(html).not.toContain('<b>Sea</b>');
    expect(html).toContain('1 import(s) failed');
    expect(html).toContain('2 enquiries waiting over 2 days');
    expect(html).toContain('https://dashboard.spw-ai.com/dashboard/settings');
    expect(text).toContain('Property views: 120 (▲ 20% vs last week)');
  });
});

describe('helpers', () => {
  it('normalises site URLs and refuses anything else', () => {
    expect(normaliseSiteUrl('https://WWW.Client.es/')).toBe('https://www.client.es');
    expect(normaliseSiteUrl('https://client.es/blog/')).toBe('https://client.es/blog');
    expect(normaliseSiteUrl('javascript:alert(1)')).toBeNull();
    expect(normaliseSiteUrl('not a url')).toBeNull();
  });

  it('says how long ago in words', () => {
    expect(ago(30_000)).toBe('just now');
    expect(ago(5 * 60_000)).toBe('5 minutes ago');
    expect(ago(3 * 3600_000)).toBe('3 hours ago');
    expect(ago(4 * 86_400_000)).toBe('4 days ago');
    expect(ago(Infinity)).toBe('never');
  });
});
