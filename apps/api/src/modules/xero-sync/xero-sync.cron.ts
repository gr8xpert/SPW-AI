import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { XeroSyncService } from './xero-sync.service';

// Rescans xero_invoice_log for rows stuck in pending/failed and retries
// them. Keeps the retry window narrow (25 rows per pass, capped by
// XERO_SYNC_MAX_RETRIES per row) so a persistently down n8n doesn't cause
// runaway load on this side.
@Injectable()
export class XeroSyncCron {
  private readonly logger = new Logger(XeroSyncCron.name);

  constructor(private readonly xeroSyncService: XeroSyncService) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async retry(): Promise<void> {
    try {
      const { retried } = await this.xeroSyncService.retryStuck();
      if (retried > 0) {
        this.logger.log(`Xero sync retry pass: ${retried} rows re-sent to n8n`);
      }
    } catch (err) {
      this.logger.warn(`Xero sync retry pass failed: ${(err as Error).message}`);
    }
  }
}
