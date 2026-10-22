import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { AGENT_DIGEST_JOB, ALERT_DIGEST_JOB, ALERT_SCAN_JOB, BUYER_MATCH_QUEUE, META_LEADS_JOB, VIEWING_REMINDERS_JOB } from '../buyer-match.queue';

// Every Buyer Match timer: id → (interval, job).
const TIMERS: [string, number, string][] = [
  ['buyer-alert-scan', 10 * 60_000, ALERT_SCAN_JOB],
  ['buyer-alert-digest', 15 * 60_000, ALERT_DIGEST_JOB],
  ['buyer-viewing-reminders', 5 * 60_000, VIEWING_REMINDERS_JOB],
  ['buyer-agent-digest', 15 * 60_000, AGENT_DIGEST_JOB],
  ['buyer-meta-leads', 15 * 60_000, META_LEADS_JOB],
];

// Registers the alert timers in Redis. upsertJobScheduler is idempotent, so
// both pm2 processes can run this at boot; BullMQ hands each tick to one
// worker. BUYER_ALERTS_SCHEDULER=off leaves them out (tests).
@Injectable()
export class BuyerAlertScheduler implements OnModuleInit {
  private readonly logger = new Logger(BuyerAlertScheduler.name);

  constructor(
    @InjectQueue(BUYER_MATCH_QUEUE) private readonly queue: Queue,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.config.get<string>('BUYER_ALERTS_SCHEDULER') === 'off') {
      for (const [id] of TIMERS) await this.queue.removeJobScheduler(id).catch(() => false);
      return;
    }
    try {
      const opts = { removeOnComplete: 50, removeOnFail: 100 };
      for (const [id, every, name] of TIMERS) await this.queue.upsertJobScheduler(id, { every }, { name, opts });
    } catch (err) {
      this.logger.warn(`Could not register the Buyer Match alert timers: ${(err as Error).message}`);
    }
  }
}
