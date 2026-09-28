import { Module } from '@nestjs/common';
import { SiteCheckinService } from './site-checkin.service';
import { WebsiteHealthService } from './website-health.service';
import { WeeklyReportService } from './weekly-report.service';
import { PlatformMonitorService } from './platform-monitor.service';
import { WebsiteHealthController, SuperAdminWebsiteHealthController } from './website-health.controller';

@Module({
  controllers: [WebsiteHealthController, SuperAdminWebsiteHealthController],
  providers: [SiteCheckinService, WebsiteHealthService, WeeklyReportService, PlatformMonitorService],
  exports: [SiteCheckinService, WebsiteHealthService],
})
export class WebsiteHealthModule {}
