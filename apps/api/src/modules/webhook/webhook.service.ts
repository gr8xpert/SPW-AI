import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import {
  Tenant,
  WebhookDelivery,
  WebhookDeliveryChannel,
  WebhookEvent,
} from '../../database/entities';
import { validateWebhookTarget } from './webhook-target';

export const WEBHOOK_QUEUE = 'webhook-dispatch';

export interface WebhookJobData {
  deliveryId: number;
}

export interface EmitOptions {
  // 'main' (default) uses tenant.webhookUrl. 'inquiry' uses
  // tenant.inquiryWebhookUrl — the dedicated lead-capture URL.
  channel?: WebhookDeliveryChannel;
}

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    @InjectRepository(WebhookDelivery)
    private readonly deliveryRepo: Repository<WebhookDelivery>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectQueue(WEBHOOK_QUEUE)
    private readonly queue: Queue<WebhookJobData>,
  ) {}

  // Emit an event for a tenant. Creates a delivery row + enqueues a job.
  // No-ops (with status='skipped') if the tenant has no URL configured for the
  // channel or the URL fails the SSRF pre-flight — we still record the row so
  // the dashboard can surface "tried to deliver, dropped because no URL".
  async emit(
    tenantId: number,
    event: WebhookEvent,
    payload: Record<string, unknown>,
    options: EmitOptions = {},
  ): Promise<WebhookDelivery> {
    const channel: WebhookDeliveryChannel = options.channel ?? 'main';
    const tenant = await this.tenantRepo.findOne({
      where: { id: tenantId },
      select: ['id', 'webhookUrl', 'webhookSecret', 'inquiryWebhookUrl'],
    });

    // Resolve the target URL for the channel. Inquiry channel uses the
    // dedicated column; main uses the legacy webhookUrl. Both share
    // webhookSecret for signing (same tenant trust boundary).
    const targetUrl =
      channel === 'inquiry' ? tenant?.inquiryWebhookUrl : tenant?.webhookUrl;

    if (!tenant || !targetUrl) {
      const delivery = this.deliveryRepo.create({
        tenantId,
        event,
        channel,
        targetUrl: '',
        payload,
        status: 'skipped',
        lastError: `no ${channel} webhookUrl configured`,
      });
      return this.deliveryRepo.save(delivery);
    }

    const check = validateWebhookTarget(targetUrl);
    if (!check.ok) {
      this.logger.warn(
        `webhook target rejected for tenant ${tenantId} (${channel}): ${check.reason}`,
      );
      const delivery = this.deliveryRepo.create({
        tenantId,
        event,
        channel,
        targetUrl,
        payload,
        status: 'skipped',
        lastError: `ssrf_block:${check.reason}`,
      });
      return this.deliveryRepo.save(delivery);
    }

    const delivery = await this.deliveryRepo.save(
      this.deliveryRepo.create({
        tenantId,
        event,
        channel,
        targetUrl,
        payload,
        status: 'pending',
      }),
    );

    // BullMQ handles retry scheduling. `attempts` is the total run count
    // including the first. Backoff is exponential with a 5-min cap; good
    // enough for a flaky downstream without tying up a worker for hours.
    await this.queue.add(
      event,
      { deliveryId: delivery.id },
      {
        attempts: 5,
        backoff: { type: 'exponential', delay: 2_000 },
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );

    return delivery;
  }
}
