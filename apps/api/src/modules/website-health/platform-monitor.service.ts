import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as fs from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { SystemMailerService } from '../mail/system-mailer.service';
import { RedisLockService } from '../../common/redis/redis-lock.service';
import { escapeHtml } from '../../common/security/escape-html';

export interface PlatformCheck {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
  failingSince: string | null;
  alerted: boolean;
}

export interface MonitorState {
  checkedAt: string | null;
  checks: Record<string, PlatformCheck & { failCount: number }>;
}

const LOCK_KEY = 'cron:platform-monitor';
const LOCK_TTL_MS = 4 * 60_000;
// Alert after this many failed checks in a row (5 minutes apart), so a
// restart during a deploy doesn't send an email.
const FAILS_BEFORE_ALERT = 2;
const MIN_FREE_DISK_BYTES = 3 * 1024 ** 3;

// Watches the platform from inside the API every 5 minutes: database, Redis,
// the dashboard, the widget bundle and free disk space. Emails super admins
// (and MONITOR_ALERT_EMAILS) when something breaks and again when it
// recovers. It can't report the API itself being down — an external uptime
// monitor on /api/health covers that.
@Injectable()
export class PlatformMonitorService {
  private readonly logger = new Logger(PlatformMonitorService.name);
  // Shared by the PM2 instances (same machine); whichever holds the lock runs.
  private readonly stateFile = process.env.MONITOR_STATE_FILE || join(tmpdir(), 'spw-platform-monitor.json');

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly lock: RedisLockService,
    private readonly mailer: SystemMailerService,
    private readonly config: ConfigService,
  ) {}

  @Cron('*/5 * * * *')
  async tick(): Promise<void> {
    if (this.config.get<string>('MONITOR_ENABLED') === 'false') return;
    await this.lock.withLock(LOCK_KEY, LOCK_TTL_MS, () => this.runChecks());
  }

  state(): MonitorState {
    try {
      if (fs.existsSync(this.stateFile)) return JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
    } catch {
      /* start fresh */
    }
    return { checkedAt: null, checks: {} };
  }

  async runChecks(now = new Date()): Promise<MonitorState> {
    const dashboard = (this.config.get<string>('DASHBOARD_URL') || '').replace(/\/$/, '');
    const widget = (this.config.get<string>('WIDGET_URL') || 'https://spw-ai.com/widget').replace(/\/$/, '');
    const results: Array<{ id: string; label: string; ok: boolean; detail: string }> = [];

    results.push(await this.check('database', 'Database', async () => {
      await this.db.query('SELECT 1');
      return 'answering';
    }));
    results.push(await this.check('redis', 'Redis (queues, locks)', async () => {
      const probe = await this.lock.withLock('monitor:probe', 5_000, async () => true);
      if (!probe.acquired) throw new Error('could not take a lock');
      return 'answering';
    }));
    if (dashboard && !/localhost/.test(dashboard)) {
      results.push(await this.check('dashboard', 'Client dashboard', () => this.http(`${dashboard}/login`)));
    }
    if (!/localhost/.test(widget)) {
      results.push(await this.check('widget', 'Website widget file', () => this.http(`${widget}/spm-widget.umd.js`)));
    }
    // fs.statfsSync needs Node 18.15+.
    if (typeof (fs as any).statfsSync === 'function') results.push(await this.check('disk', 'Free disk space', async () => {
      const s = (fs as any).statfsSync(process.cwd());
      const free = Number(s.bavail) * Number(s.bsize);
      const gb = (free / 1024 ** 3).toFixed(1);
      if (free < MIN_FREE_DISK_BYTES) throw new Error(`only ${gb} GB free`);
      return `${gb} GB free`;
    }));

    const prev = this.state();
    const next: MonitorState = { checkedAt: now.toISOString(), checks: {} };
    const broke: PlatformCheck[] = [];
    const recovered: PlatformCheck[] = [];
    for (const r of results) {
      const before = prev.checks[r.id];
      const failCount = r.ok ? 0 : (before?.failCount ?? 0) + 1;
      const failingSince = r.ok ? null : before?.failingSince ?? now.toISOString();
      const alerted = !r.ok && !!before?.alerted;
      const row = { ...r, failCount, failingSince, alerted };
      if (!r.ok && failCount >= FAILS_BEFORE_ALERT && !alerted) {
        row.alerted = true;
        broke.push(row);
      }
      if (r.ok && before?.alerted) recovered.push({ ...row, failingSince: before.failingSince });
      next.checks[r.id] = row;
    }
    try {
      fs.writeFileSync(this.stateFile, JSON.stringify(next));
    } catch (err) {
      this.logger.warn(`monitor state not saved: ${(err as Error).message}`);
    }
    if (broke.length) await this.alert('problem', broke);
    if (recovered.length) await this.alert('recovered', recovered);
    return next;
  }

  private async check(id: string, label: string, fn: () => Promise<string>) {
    try {
      return { id, label, ok: true, detail: await fn() };
    } catch (err) {
      return { id, label, ok: false, detail: (err as Error).message.slice(0, 300) };
    }
  }

  private async http(url: string): Promise<string> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15_000);
    try {
      const t0 = Date.now();
      const r = await fetch(url, { signal: ctrl.signal, redirect: 'manual' });
      await r.arrayBuffer();
      if (r.status >= 400) throw new Error(`${url} answered ${r.status}`);
      return `${r.status} in ${Date.now() - t0} ms`;
    } catch (err) {
      throw new Error((err as Error).name === 'AbortError' ? `${url} did not answer within 15 s` : (err as Error).message);
    } finally {
      clearTimeout(timer);
    }
  }

  private async recipients(): Promise<string[]> {
    const extra = (this.config.get<string>('MONITOR_ALERT_EMAILS') || '').split(',').map((s) => s.trim()).filter(Boolean);
    const admins: any[] = await this.db.query(`SELECT email FROM users WHERE role = 'super_admin' AND isActive = 1 AND email NOT LIKE '%@smoke.test' LIMIT 10`);
    return [...new Set([...extra, ...admins.map((a) => a.email)])].filter((e) => /^[^@\s]+@[^@\s]+$/.test(e));
  }

  private async alert(kind: 'problem' | 'recovered', checks: PlatformCheck[]): Promise<void> {
    const to = await this.recipients();
    const list = checks.map((c) => `${c.label}: ${c.detail}`);
    const subject = kind === 'problem' ? `SPW problem: ${checks.map((c) => c.label).join(', ')}` : `SPW recovered: ${checks.map((c) => c.label).join(', ')}`;
    const intro = kind === 'problem' ? 'These checks are failing (checked twice, 5 minutes apart):' : 'These checks are working again:';
    const html = `<p>${escapeHtml(intro)}</p><ul>${list.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul><p style="color:#64748b;font-size:12px">SPW platform monitor · ${escapeHtml(new Date().toISOString())}</p>`;
    this.logger.warn(`${subject} — ${list.join('; ')}`);
    for (const address of to) {
      await this.mailer.send({ to: address, subject, html, text: `${intro}\n${list.map((l) => `- ${l}`).join('\n')}` }).catch((err: Error) => this.logger.warn(`alert mail failed: ${err.message}`));
    }
  }
}
