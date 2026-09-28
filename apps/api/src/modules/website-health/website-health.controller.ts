import { Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { UserRole } from '@spm/shared';
import { JwtAuthGuard, TenantGuard, RolesGuard } from '../../common/guards';
import { CurrentTenant, CurrentUser } from '../../common/decorators';
import { JwtPayload } from '@spm/shared';
import { WeeklyReportService, renderWeeklyReport } from './weekly-report.service';
import { ConfigService } from '@nestjs/config';
import { Roles } from '../../common/decorators/roles.decorator';
import { WebsiteHealthService } from './website-health.service';
import { PlatformMonitorService } from './platform-monitor.service';

@Controller('api/dashboard/website-health')
@UseGuards(JwtAuthGuard, TenantGuard)
export class WebsiteHealthController {
  constructor(
    private readonly health: WebsiteHealthService,
    private readonly weekly: WeeklyReportService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  report(@CurrentTenant() tenantId: number) {
    return this.health.report(tenantId);
  }

  // Settings → Notifications: what this week's email looks like and who gets it.
  @Get('weekly-report')
  async weeklyPreview(@CurrentTenant() tenantId: number) {
    const data = await this.weekly.build(tenantId);
    const dashboard = (this.config.get<string>('DASHBOARD_URL') || 'https://dashboard.spw-ai.com').replace(/\/$/, '');
    const { subject, html } = renderWeeklyReport(data, dashboard);
    return { subject, html, recipients: await this.weekly.recipients(tenantId) };
  }

  // "Send me this week's report now".
  @Post('weekly-report/send-to-me')
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async sendToMe(@CurrentTenant() tenantId: number, @CurrentUser() user: JwtPayload) {
    const data = await this.weekly.build(tenantId);
    await this.weekly.send(user.email, data);
    return { sentTo: user.email };
  }
}

// Every client at a glance, worst first — so a broken feed or a site that
// stopped connecting is seen before the client notices.
@Controller('api/super-admin/website-health')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class SuperAdminWebsiteHealthController {
  constructor(
    private readonly health: WebsiteHealthService,
    private readonly monitor: PlatformMonitorService,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  // The platform monitor's latest results (database, Redis, dashboard, widget, disk).
  @Get('platform')
  platform() {
    return this.monitor.state();
  }

  // Run the platform checks now (and send any alert they trigger).
  @Post('platform/check')
  @HttpCode(200)
  checkNow() {
    return this.monitor.runChecks();
  }

  @Get()
  async overview() {
    const tenants: Array<{ id: number; name: string; slug: string }> = await this.db.query(
      `SELECT t.id, t.name, t.slug FROM tenants t
        WHERE t.isActive = 1
          AND (t.tier >= 2
               OR EXISTS (SELECT 1 FROM properties p WHERE p.tenantId = t.id)
               OR EXISTS (SELECT 1 FROM feed_configs f WHERE f.tenantId = t.id))
        ORDER BY t.name`,
    );
    const rows = [];
    for (const t of tenants) {
      const r = await this.health.report(t.id);
      const problems = r.checks.filter((c) => c.status === 'error' || c.status === 'warning');
      const plugin = r.sites.find((s) => s.source === 'plugin');
      rows.push({
        tenantId: t.id,
        name: t.name,
        overall: r.overall,
        problems: problems.map((c) => ({ status: c.status, title: c.title })),
        published: r.listings.published,
        views7d: r.activity.views7d,
        leadsWaiting: r.leads.waiting,
        website: plugin ? { url: plugin.siteUrl, lastSeenAt: plugin.lastSeenAt, pluginVersion: plugin.pluginVersion } : null,
        feeds: r.feeds.map((f) => ({ name: f.name, status: f.status, lastSyncAt: f.lastSyncAt })),
      });
    }
    const order = { error: 0, warning: 1, info: 2, ok: 3 } as const;
    rows.sort((a, b) => order[a.overall] - order[b.overall] || a.name.localeCompare(b.name));
    return rows;
  }
}
