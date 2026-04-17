import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios, { AxiosError } from 'axios';
import { createHmac } from 'crypto';
import { Tenant, WebhookDelivery } from '../../database/entities';
import { WEBHOOK_QUEUE, WebhookJobData } from './webhook.service';

// Signature format: `t=<unix>,v1=<hex>` (loosely modeled on Stripe's).
// Receivers should reconstruct the signed body as `${timestamp}.${body}` and
// compare the HMAC-SHA256 in constant time. We set a 5-minute-old timestamp
// on each attempt so replays outside that window are rejectable.
const SIGNATURE_HEADER = 'x-spw-signature';
const EVENT_HEADER = 'x-spw-event';
const DELIVERY_HEADER = 'x-spw-delivery-id';
const TIMESTAMP_HEADER = 'x-spw-timestamp';

@Processor(WEBHOOK_QUEUE)
export class WebhookProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookProcessor.name);

  constructor(
    @InjectRepository(WebhookDelivery)
    private readonly deliveryRepo: Repository<WebhookDelivery>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
  ) {
    super();
  }

  async process(job: Job<WebhookJobData>): Promise<void> {
    const { deliveryId } = job.data;

    const delivery = await this.deliveryRepo.findOne({ where: { id: deliveryId } });
    if (!delivery) {
      this.logger.warn(`delivery ${deliveryId} not found — dropping job`);
      return;
    }

    // Tenant could have removed the URL between emit and dispatch.
    const tenant = await this.tenantRepo.findOne({
      where: { id: delivery.tenantId },
      select: ['id', 'webhookUrl', 'webhookSecret'],
    });
    if (!tenant || !tenant.webhookUrl || tenant.webhookUrl !== delivery.targetUrl) {
      await this.deliveryRepo.update(deliveryId, {
        status: 'skipped',
        lastError: 'webhookUrl changed or removed after emit',
      });
      return;
    }

    const body = JSON.stringify({
      event: delivery.event,
      deliveryId: delivery.id,
      createdAt: delivery.createdAt.toISOString(),
      data: delivery.payload,
    });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = sign(timestamp, body, tenant.webhookSecret);

    const attempt = (delivery.attemptCount ?? 0) + 1;

    try {
      const res = await axios.post(tenant.webhookUrl, body, {
        headers: {
          'Content-Type': 'application/json',
          [EVENT_HEADER]: delivery.event,
          [DELIVERY_HEADER]: String(delivery.id),
          [TIMESTAMP_HEADER]: timestamp,
          [SIGNATURE_HEADER]: `t=${timestamp},v1=${signature}`,
          'User-Agent': 'SPW-Webhook/1.0',
        },
        // Hard timeout so a slow endpoint can't tie up the worker. Sized
        // generously enough that normal receivers ACK within budget.
        timeout: 10_000,
        // Accept any 2xx; anything else triggers a retry via the throw below.
        validateStatus: (s) => s >= 200 && s < 300,
        // No redirects — a 30x to a private IP would sneak around SSRF.
        maxRedirects: 0,
      });

      await this.deliveryRepo.update(deliveryId, {
        status: 'delivered',
        attemptCount: attempt,
        lastStatusCode: res.status,
        deliveredAt: new Date(),
        lastError: null,
      });
      this.logger.log(
        `delivered ${delivery.event} id=${deliveryId} (${res.status}) on attempt ${attempt}`,
      );
    } catch (err) {
      const code = axios.isAxiosError(err) ? err.response?.status ?? null : null;
      const message = errorMessage(err);
      const isFinal = attempt >= (job.opts.attempts ?? 1);

      await this.deliveryRepo.update(deliveryId, {
        status: isFinal ? 'failed' : 'pending',
        attemptCount: attempt,
        lastStatusCode: code,
        lastError: message.slice(0, 1000),
      });

      // Re-throw so BullMQ schedules the next attempt per the backoff policy.
      // On the final attempt BullMQ will move the job to failed state and
      // the row stays status='failed'.
      throw err;
    }
  }
}

function sign(timestamp: string, body: string, secret: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

function errorMessage(err: unknown): string {
  if (err instanceof AxiosError) {
    return `${err.code ?? 'http'}: ${err.message}`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}
