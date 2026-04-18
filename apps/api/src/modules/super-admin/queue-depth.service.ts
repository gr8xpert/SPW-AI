import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { WEBHOOK_QUEUE } from '../webhook/webhook.service';

// 6C — platform queue-depth observability. Reports per-queue backlog so
// ops can see stuck workers / webhook backpressure before customers feel
// it. Each of the 4 tracked queues is injected as a BullMQ Queue handle;
// we read counters at request time (no subscriptions, no cached state).
// Health-probe queue is deliberately skipped — it drains instantly and
// would be constant noise in the UI.

export interface QueueDepthRow {
  name: string;
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  paused: boolean;
  status: 'ok' | 'warning' | 'critical';
}

// Thresholds hardcoded. If we start seeing real queue pressure we can
// promote these to env-configurable; for now any tuning knob is
// premature — we need data first.
const WARNING_WAITING = 100;
const WARNING_FAILED = 10;
const CRITICAL_WAITING = 500;
const CRITICAL_FAILED = 50;

@Injectable()
export class QueueDepthService {
  private readonly logger = new Logger(QueueDepthService.name);

  constructor(
    @InjectQueue(WEBHOOK_QUEUE) private readonly webhookQueue: Queue,
    @InjectQueue('email-campaign') private readonly emailQueue: Queue,
    @InjectQueue('feed-import') private readonly feedQueue: Queue,
    @InjectQueue('migration') private readonly migrationQueue: Queue,
  ) {}

  async getSnapshot(): Promise<QueueDepthRow[]> {
    const queues: Array<{ name: string; queue: Queue }> = [
      { name: WEBHOOK_QUEUE, queue: this.webhookQueue },
      { name: 'email-campaign', queue: this.emailQueue },
      { name: 'feed-import', queue: this.feedQueue },
      { name: 'migration', queue: this.migrationQueue },
    ];

    // Parallel reads — each queue is independent and a stuck queue
    // shouldn't block the snapshot from another. A per-queue failure
    // yields a sentinel row rather than poisoning the whole endpoint.
    const rows = await Promise.all(queues.map(({ name, queue }) => this.readQueue(name, queue)));

    // Worst-first ordering — ops usually want "what's broken" before
    // "what's healthy". Critical > warning > ok; ties broken by
    // waiting count so the bigger backlog bubbles up.
    const severity = (r: QueueDepthRow) =>
      r.status === 'critical' ? 0 : r.status === 'warning' ? 1 : 2;
    rows.sort((a, b) => {
      if (severity(a) !== severity(b)) return severity(a) - severity(b);
      return b.waiting - a.waiting;
    });

    return rows;
  }

  private async readQueue(name: string, queue: Queue): Promise<QueueDepthRow> {
    try {
      const [counts, paused] = await Promise.all([
        queue.getJobCounts('waiting', 'active', 'delayed', 'failed'),
        queue.isPaused(),
      ]);
      const waiting = counts.waiting ?? 0;
      const active = counts.active ?? 0;
      const delayed = counts.delayed ?? 0;
      const failed = counts.failed ?? 0;
      return {
        name,
        waiting,
        active,
        delayed,
        failed,
        paused,
        status: this.classify(waiting, failed, paused),
      };
    } catch (err) {
      this.logger.warn(
        `queue-depth read failed for ${name}: ${(err as Error).message}`,
      );
      // Sentinel row — UI can show '-' and dashboard still renders the
      // healthy queues alongside the broken one.
      return {
        name,
        waiting: -1,
        active: -1,
        delayed: -1,
        failed: -1,
        paused: false,
        status: 'critical',
      };
    }
  }

  private classify(
    waiting: number,
    failed: number,
    paused: boolean,
  ): 'ok' | 'warning' | 'critical' {
    if (paused) return 'critical'; // A paused production queue is never "ok"
    if (waiting >= CRITICAL_WAITING || failed >= CRITICAL_FAILED) return 'critical';
    if (waiting >= WARNING_WAITING || failed >= WARNING_FAILED) return 'warning';
    return 'ok';
  }
}
