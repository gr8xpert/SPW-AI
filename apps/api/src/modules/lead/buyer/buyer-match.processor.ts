import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  AGENT_DIGEST_JOB, ALERT_DIGEST_JOB, ALERT_SCAN_JOB, BUYER_MATCH_QUEUE, FEEDBACK_NOTICE_JOB, META_LEADS_JOB, VIEWING_REMINDERS_JOB, type FeedbackNoticeData,
} from './buyer-match.queue';
import { BuyerViewingMailService } from './viewings/buyer-viewing-mail.service';
import { BuyerDigestService } from './digest/buyer-digest.service';
import { BuyerPageMailService } from './page/buyer-page-mail.service';
import { BuyerAlertService } from './alerts/buyer-alert.service';
import { MetaLeadService } from '../meta/meta-lead.service';

// Runs the Buyer Match jobs (see buyer-match.queue.ts). Concurrency 1: the
// jobs are small, and the alert scan must never run twice at once.
@Processor(BUYER_MATCH_QUEUE, { concurrency: 1 })
export class BuyerMatchProcessor extends WorkerHost {
  private readonly logger = new Logger(BuyerMatchProcessor.name);

  constructor(
    private readonly pageMail: BuyerPageMailService,
    private readonly alerts: BuyerAlertService,
    private readonly viewingMail: BuyerViewingMailService,
    private readonly digest: BuyerDigestService,
    private readonly meta: MetaLeadService,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    switch (job.name) {
      case FEEDBACK_NOTICE_JOB: {
        const d = job.data as FeedbackNoticeData;
        const sent = await this.pageMail.feedbackNotice(d.tenantId, d.leadId, new Date(d.from), new Date(d.until));
        return { lines: sent };
      }
      case ALERT_SCAN_JOB:
        return { alerts: await this.alerts.scanAll() };
      case ALERT_DIGEST_JOB:
        return { sent: await this.alerts.digestAll() };
      case VIEWING_REMINDERS_JOB:
        return { sent: await this.viewingMail.sendReminders() };
      case AGENT_DIGEST_JOB:
        return { sent: await this.digest.digestAll() };
      case META_LEADS_JOB:
        return { imported: await this.meta.importAll() };
      default:
        this.logger.warn(`Unknown buyer-match job ${job.name}`);
        return null;
    }
  }
}
