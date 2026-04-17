import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { Tenant, WebhookDelivery, WebhookEvent } from '../../database/entities';
import { validateWebhookTarget } from './webhook-target';

export const WEBHOOK_QUEUE = 'webhook-dispatch';

export interface WebhookJobData {
  deliveryId: number;
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
  // No-ops (with status='skipped') if the tenant has no webhookUrl or the URL
  // fails the SSRF pre-flight — we still record the row so the dashboard can
  // surface "tried to deliver, dropped because no URL configured".
  async emit(
    tenantId: number,
    event: WebhookEvent,
    payload: Record<string, unknown>,
  ): Promise<WebhookDelivery> {
    const tenant = await this.tenantRepo.findOne({
      where: { id: tenantId },
      select: ['id', 'webhookUrl', 'webhookSecret'],
    });

    if (!tenant || !tenant.webhookUrl) {
      const delivery = this.deliveryRepo.create({
        tenantId,
        event,
        targetUrl: '',
        payload,
        status: 'skipped',
        lastError: 'no webhookUrl configured',
      });
      return this.deliveryRepo.save(delivery);
    }

    const check = validateWebhookTarget(tenant.webhookUrl);
    if (!check.ok) {
      this.logger.warn(
        `webhook target rejected for tenant ${tenantId}: ${check.reason}`,
      );
      const delivery = this.deliveryRepo.create({
        tenantId,
        event,
        targetUrl: tenant.webhookUrl,
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
        targetUrl: tenant.webhookUrl,
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
