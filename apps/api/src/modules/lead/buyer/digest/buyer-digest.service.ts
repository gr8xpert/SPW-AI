import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { TenantSettings } from '@spm/shared';
import { Tenant, User } from '../../../../database/entities';
import { SystemMailerService } from '../../../mail/system-mailer.service';
import { FormMailService, titleOf, validEmail } from '../../form-mail.service';
import { normalizeBuyerSettings } from '../buyer-settings.service';
import { digestDue, localDayTime } from '../alerts/alert-rules';
import { buildAgentDigest, hasContent, type AgentDigestData } from './agent-digest';
import { BuyerHomeService } from './buyer-home.service';

// The agent's daily email, once per agent per day at the agency's
// agentDigestTime (its time zone). Claimed per agent and day in
// buyer_alert_runs (INSERT IGNORE), so the 2 pm2 processes never both send.
@Injectable()
export class BuyerDigestService {
  private readonly logger = new Logger(BuyerDigestService.name);

  constructor(
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly home: BuyerHomeService,
    private readonly formMail: FormMailService,
    private readonly mailer: SystemMailerService,
    private readonly config: ConfigService,
  ) {}

  async digestAll(now = new Date()): Promise<number> {
    const rows = await this.tenants
      .createQueryBuilder('t')
      .select(['t.id'])
      .where('t.isActive = 1')
      .andWhere("JSON_EXTRACT(t.dashboardAddons, '$.buyerMatch') = true")
      .getMany();
    let sent = 0;
    for (const t of rows) {
      try {
        sent += (await this.digestTenant(t.id, now)).sent;
      } catch (err) {
        this.logger.warn(`Agent digest failed for tenant ${t.id}: ${(err as Error).message}`);
      }
    }
    return sent;
  }

  async digestTenant(tenantId: number, now = new Date(), onlyUserId?: number): Promise<{ due: boolean; sent: number; skipped: number }> {
    const tenant = await this.tenants.findOne({ where: { id: tenantId } });
    if (!tenant) return { due: false, sent: 0, skipped: 0 };
    const settings = (tenant.settings || {}) as TenantSettings;
    const bm = normalizeBuyerSettings(settings.buyerMatch);
    const tz = settings.timezone || 'UTC';
    const { due, day } = digestDue(now, tz, bm.agentDigestTime);
    if (!due) return { due, sent: 0, skipped: 0 };
    const agents = await this.users.find({
      where: { tenantId, isActive: true, canLogin: true, buyerDigest: true, role: In(['admin', 'user']), ...(onlyUserId ? { id: onlyUserId } : {}) },
    });
    const from = this.formMail.sender(tenant);
    const dashboard = (this.config.get<string>('DASHBOARD_URL') || '').replace(/\/$/, '');
    let sent = 0;
    let skipped = 0;
    for (const agent of agents) {
      const to = validEmail(agent.email);
      if (!to) continue;
      const data = await this.home.home(tenantId, agent.id, now, 1);
      const mail: AgentDigestData = {
        agentName: agent.name,
        dashboardUrl: dashboard,
        overdueTasks: data.overdueTasks.map((t) => ({ title: t.title, buyer: t.buyer, buyerId: t.buyerId, dueAt: localDayTime(new Date(t.dueAt), tz).day })),
        todayTasks: data.todayTasks.map((t) => ({ title: t.title, buyer: t.buyer, buyerId: t.buyerId, dueAt: localDayTime(new Date(t.dueAt), tz).time })),
        viewings: data.viewings
          .filter((v) => localDayTime(new Date(v.startsAt), tz).day === day)
          .map((v) => ({
            time: localDayTime(new Date(v.startsAt), tz).time,
            buyer: v.buyer?.name || '—',
            buyerId: v.leadId,
            property: v.property ? `${v.property.reference}${titleOf(v.property.title, 'en') ? ` — ${titleOf(v.property.title, 'en')}` : ''}` : v.title || '',
            meetingPoint: v.meetingPoint,
          })),
        waiting: data.waiting.slice(0, 20),
        hot: data.hot.slice(0, 10),
        alertsToApprove: data.alertsToApprove,
      };
      if (!hasContent(mail)) {
        skipped++;
        continue;
      }
      // Once per agent and day: only the process whose insert lands sends.
      const claim = await this.tenants.manager.query("INSERT IGNORE INTO buyer_alert_runs (tenantId, kind, day) VALUES (?, ?, ?)", [tenantId, `agent:${agent.id}`.slice(0, 20), day]);
      if (!claim.affectedRows) {
        skipped++;
        continue;
      }
      const { subject, html, text } = buildAgentDigest(from, mail);
      const res = await this.mailer.send({ to, subject, html, text, replyTo: from.replyTo, fromName: from.name, fromEmail: from.fromEmail });
      if (res.delivered || res.skippedReason === 'no-transport') sent++;
      else this.logger.warn(`Agent digest to ${to} failed: ${res.error}`);
    }
    return { due, sent, skipped };
  }
}
