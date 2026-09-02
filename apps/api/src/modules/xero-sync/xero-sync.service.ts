import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Tenant, XeroInvoiceLog } from '../../database/entities';

interface EnqueueXeroInvoiceInput {
  tenantId: number;
  stripeSessionId: string | null;
  hours: number;
  amountEur: number;
  currency: string;
}

// Bridge from the Stripe credit-purchase flow to the external Xero
// invoicing workflow that lives in n8n. Deliberately thin:
//   1. Row into xero_invoice_log
//   2. POST payload to n8n webhook
//   3. n8n does the OAuth dance, calls Xero, then calls us back at
//      /api/internal/xero/invoice-created with the invoice id
//
// n8n owns Xero credentials, token refresh, contact matching, VAT rate
// selection, and multi-currency handling. Our side only cares about
// idempotency + a durable retry log.
@Injectable()
export class XeroSyncService {
  private readonly logger = new Logger(XeroSyncService.name);

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(XeroInvoiceLog)
    private readonly logRepository: Repository<XeroInvoiceLog>,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
  ) {}

  // Called from the Stripe webhook after credits have been granted.
  // Fire-and-forget: never blocks or throws to the caller because Xero
  // sync being down must not prevent credit delivery.
  async enqueueCreditPurchaseInvoice(input: EnqueueXeroInvoiceInput): Promise<void> {
    // Idempotency: if we already have a row for this Stripe session, don't
    // create a duplicate. This can happen if Stripe replays the webhook
    // (network hiccup) — the processed_stripe_events table upstream should
    // catch it first, but belt + braces.
    if (input.stripeSessionId) {
      const existing = await this.logRepository.findOne({
        where: { stripeSessionId: input.stripeSessionId },
      });
      if (existing) {
        this.logger.log(
          `Skipping Xero enqueue: session ${input.stripeSessionId} already logged (${existing.status})`,
        );
        return;
      }
    }

    const tenant = await this.tenantRepository.findOne({
      where: { id: input.tenantId },
      select: ['id', 'name', 'ownerEmail', 'xeroContactId'],
    });

    const log = this.logRepository.create({
      tenantId: input.tenantId,
      stripeSessionId: input.stripeSessionId,
      status: 'pending',
      hours: input.hours,
      amountEur: input.amountEur,
      currency: input.currency,
      xeroInvoiceId: null,
      error: null,
      attempts: 0,
      lastAttemptAt: null,
      requestBody: this.buildPayload(tenant, input),
    });
    const saved = await this.logRepository.save(log);

    await this.sendToN8n(saved);
  }

  // Called by the callback controller when n8n reports back with a Xero
  // invoice id. Marks the log row 'confirmed' + records the invoice id
  // for accounting drilldown.
  async recordConfirmation(input: {
    stripeSessionId: string;
    xeroInvoiceId: string;
    invoiceUrl?: string;
  }): Promise<XeroInvoiceLog | null> {
    const row = await this.logRepository.findOne({
      where: { stripeSessionId: input.stripeSessionId },
    });
    if (!row) {
      this.logger.warn(
        `Xero confirmation for unknown session ${input.stripeSessionId} — dropping`,
      );
      return null;
    }
    row.xeroInvoiceId = input.xeroInvoiceId;
    row.status = 'confirmed';
    row.error = null;
    return this.logRepository.save(row);
  }

  // Manual retry endpoint driver: bumps attempts + re-POSTs to n8n.
  async retry(logId: number): Promise<XeroInvoiceLog> {
    const row = await this.logRepository.findOne({ where: { id: logId } });
    if (!row) throw new Error(`XeroInvoiceLog #${logId} not found`);
    if (row.status === 'confirmed') return row;
    await this.sendToN8n(row);
    return row;
  }

  // Called by the cron. Picks up rows stuck in 'pending' > 5 min or
  // 'failed' with attempts < XERO_SYNC_MAX_RETRIES and retries them.
  async retryStuck(): Promise<{ retried: number }> {
    const maxRetries = Number(this.config.get<string>('XERO_SYNC_MAX_RETRIES') ?? 5);
    const staleBefore = new Date(Date.now() - 5 * 60 * 1000);

    const candidates = await this.logRepository.find({
      where: [
        // Stuck-in-pending: probably lost the initial POST response
        { status: 'pending', createdAt: LessThan(staleBefore) },
        // Explicitly failed: normal retry loop until max
        { status: 'failed' },
      ],
      take: 25,
      order: { updatedAt: 'ASC' },
    });

    let retried = 0;
    for (const row of candidates) {
      if (row.attempts >= maxRetries) continue;
      try {
        await this.sendToN8n(row);
        retried++;
      } catch (err) {
        // sendToN8n already logs; nothing more to do here.
        void err;
      }
    }
    return { retried };
  }

  // Build the payload we send to n8n. Keeping it flat + typed so the n8n
  // workflow can consume it with a simple JSON node — no extraction step.
  private buildPayload(
    tenant: Pick<Tenant, 'id' | 'name' | 'ownerEmail' | 'xeroContactId'> | null,
    input: EnqueueXeroInvoiceInput,
  ): Record<string, unknown> {
    return {
      tenantId: input.tenantId,
      tenantName: tenant?.name ?? `Tenant ${input.tenantId}`,
      contactEmail: tenant?.ownerEmail ?? null,
      xeroContactId: tenant?.xeroContactId ?? null,
      hours: input.hours,
      amountEur: input.amountEur,
      currency: input.currency,
      stripeSessionId: input.stripeSessionId,
      // Include a human-readable description so operators auditing Xero
      // can see the SPM-side context without querying our DB.
      description: `SPM: ${input.hours} support-hour credits`,
      timestamp: new Date().toISOString(),
    };
  }

  private async sendToN8n(row: XeroInvoiceLog): Promise<void> {
    const url = this.config.get<string>('XERO_N8N_WEBHOOK_URL');
    const secret = this.config.get<string>('XERO_N8N_SECRET');
    if (!url) {
      this.logger.warn(
        `XERO_N8N_WEBHOOK_URL not set — leaving log #${row.id} in 'pending' state for later`,
      );
      return;
    }

    row.attempts = (row.attempts ?? 0) + 1;
    row.lastAttemptAt = new Date();

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
        },
        body: JSON.stringify(row.requestBody),
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      if (!response.ok) {
        const bodyText = await response.text().catch(() => '');
        row.status = 'failed';
        row.error = `n8n POST ${response.status}: ${bodyText.slice(0, 400)}`;
        this.logger.warn(
          `Xero enqueue failed for log #${row.id} tenant=${row.tenantId}: ${row.error}`,
        );
      } else {
        row.status = 'sent';
        row.error = null;
        this.logger.log(
          `Xero enqueue sent for log #${row.id} tenant=${row.tenantId} (awaiting n8n callback)`,
        );
      }
    } catch (err) {
      row.status = 'failed';
      row.error = (err as Error).message.slice(0, 400);
      this.logger.warn(
        `Xero enqueue exception for log #${row.id}: ${row.error}`,
      );
    } finally {
      await this.logRepository.save(row);
    }
  }
}
