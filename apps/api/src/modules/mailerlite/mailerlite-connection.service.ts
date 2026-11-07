import { BadGatewayException, BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { MailerliteConnection } from '../../database/entities';
import { MailerLiteAuthError, MailerLiteError, MailerLiteRateLimitError } from './mailerlite.client';
import { MailerLiteSyncService } from './mailerlite-sync.service';
import { WEBHOOK_EVENTS } from './mailerlite-webhook.service';

export const MAILERLITE_QUEUE = 'mailerlite-sync';
export const SYNC_JOB = 'sync';
// A queued or running sync that hasn't moved for this long is stuck (a crash).
const STUCK_MS = 30 * 60 * 1000;
const WEBHOOK_NAME = 'SPM: unsubscribes and bounces';

export interface MailerLiteStatus {
  connected: boolean;
  keyLast4: string | null;
  consent: { at: Date; by: string | null } | null;
  state: MailerliteConnection['state'] | null;
  syncing: boolean;
  needsAttention: boolean;
  lastSyncAt: Date | null;
  counts: { added: number; updated: number; unchanged: number; skipped: number; failed: number };
  // What to tell the client; the dashboard words it in their language.
  notice: 'bad_key' | 'unreachable' | 'some_groups_missing' | null;
}

const NO_COUNTS = { added: 0, updated: 0, unchanged: 0, skipped: 0, failed: 0 };

@Injectable()
export class MailerLiteConnectionService {
  private readonly logger = new Logger(MailerLiteConnectionService.name);

  constructor(
    @InjectRepository(MailerliteConnection) private readonly connections: Repository<MailerliteConnection>,
    @InjectQueue(MAILERLITE_QUEUE) private readonly queue: Queue,
    private readonly sync: MailerLiteSyncService,
    private readonly config: ConfigService,
  ) {}

  private load(tenantId: number, secrets = false): Promise<MailerliteConnection | null> {
    const qb = this.connections.createQueryBuilder('c').where('c.tenantId = :tenantId', { tenantId });
    if (secrets) qb.addSelect('c.apiKey');
    return qb.getOne();
  }

  // Secrets never leave the API; the dashboard gets the key's last 4 at most.
  async status(tenantId: number): Promise<MailerLiteStatus> {
    const c = await this.load(tenantId, true);
    if (!c?.apiKey || !c.enabled) {
      return { connected: false, keyLast4: null, consent: null, state: null, syncing: false, needsAttention: false, lastSyncAt: null, counts: NO_COUNTS, notice: null };
    }
    return {
      connected: true,
      keyLast4: c.apiKey.slice(-4),
      consent: c.consentAt ? { at: c.consentAt, by: c.consentByEmail } : null,
      state: c.state,
      syncing: c.state === 'queued' || c.state === 'running',
      needsAttention: c.state === 'needs_attention',
      lastSyncAt: c.lastSyncAt,
      counts: { added: c.countAdded, updated: c.countUpdated, unchanged: c.countUnchanged, skipped: c.countSkipped, failed: c.countFailed },
      notice: c.state === 'needs_attention' ? 'bad_key' : c.state === 'failed' ? 'unreachable' : c.lastError ? 'some_groups_missing' : null,
    };
  }

  // Checks the key, then sets up the webhook: without it unsubscribes wouldn't
  // come back, so a connection that can't have one isn't made.
  async connect(tenantId: number, rawKey: string): Promise<MailerLiteStatus> {
    const apiKey = rawKey.trim();
    const apiUrl = (this.config.get<string>('API_URL') || '').replace(/\/+$/, '');
    if (!/^https?:\/\//.test(apiUrl)) {
      throw new BadGatewayException({ code: 'MAILERLITE_ERROR', message: 'MailerLite can not be connected right now. Please contact support.' });
    }

    const client = this.sync.client(apiKey);
    const hookToken = randomBytes(24).toString('hex');
    let hook: { id: string; secret: string };
    try {
      await client.testKey();
      hook = await client.createWebhook({ name: WEBHOOK_NAME, url: `${apiUrl}/api/webhooks/mailerlite/${hookToken}`, events: WEBHOOK_EVENTS });
    } catch (err) {
      throw this.connectError(err);
    }

    try {
      const old = await this.load(tenantId, true);
      if (old?.apiKey && old.webhookId) await this.removeWebhook(old.apiKey, old.webhookId);

      // A new account: nothing carries over, consent is asked again.
      const fields = {
        tenantId,
        apiKey,
        webhookSecret: hook.secret,
        hookToken,
        webhookId: hook.id,
        groupIds: null,
        languageField: null,
        enabled: true,
        consentAt: null,
        consentByUserId: null,
        consentByEmail: null,
        state: 'idle' as const,
        lastError: null,
        runStartedAt: null,
        runSince: null,
        runCursor: 0,
        heartbeatAt: null,
        countAdded: 0,
        countUpdated: 0,
        countUnchanged: 0,
        countSkipped: 0,
        countFailed: 0,
        lastSyncAt: null,
        lastSyncStartedAt: null,
        lastFullSyncAt: null,
      };
      if (old) await this.connections.update({ id: old.id }, fields);
      else await this.connections.insert(fields);
    } catch (err) {
      await this.removeWebhook(apiKey, hook.id);
      throw err;
    }
    return this.status(tenantId);
  }

  private connectError(err: unknown): Error {
    if (err instanceof MailerLiteAuthError) {
      return new BadRequestException({ code: 'BAD_KEY', message: 'MailerLite did not accept this API key. Please check it and try again.' });
    }
    if (err instanceof MailerLiteRateLimitError) {
      return new BadGatewayException({ code: 'MAILERLITE_BUSY', message: 'MailerLite is busy. Please try again in a minute.' });
    }
    const status = err instanceof MailerLiteError ? err.status : 0;
    this.logger.warn(`MailerLite connect failed (${status}): ${(err as Error).message}`);
    return new BadGatewayException({ code: 'MAILERLITE_ERROR', message: 'We could not reach MailerLite. Please try again in a few minutes.' });
  }

  private async removeWebhook(apiKey: string, webhookId: string): Promise<void> {
    await this.sync
      .client(apiKey)
      .deleteWebhook(webhookId)
      .catch((err) => this.logger.warn(`MailerLite webhook not removed: ${(err as Error).message}`));
  }

  // Contacts and groups stay in the client's MailerLite account. The consent
  // record stays on the row until the next connect.
  async disconnect(tenantId: number): Promise<MailerLiteStatus> {
    const c = await this.load(tenantId, true);
    if (!c) return this.status(tenantId);
    if (c.apiKey && c.webhookId) await this.removeWebhook(c.apiKey, c.webhookId);
    await this.connections.update(
      { id: c.id },
      {
        apiKey: null,
        webhookSecret: null,
        hookToken: null,
        webhookId: null,
        groupIds: null,
        languageField: null,
        enabled: false,
        state: 'idle',
        lastError: null,
        runStartedAt: null,
        runSince: null,
        runCursor: 0,
      },
    );
    return this.status(tenantId);
  }

  // Confirming is also the go-ahead for the first sync.
  async confirmConsent(tenantId: number, user: { sub: number; email: string }): Promise<MailerLiteStatus> {
    const c = await this.load(tenantId);
    if (!c?.enabled) throw new NotFoundException({ code: 'NOT_CONNECTED', message: 'Connect MailerLite first' });
    await this.connections.update(
      { id: c.id },
      { consentAt: new Date(), consentByUserId: user.sub, consentByEmail: user.email.slice(0, 255) },
    );
    await this.enqueue(tenantId);
    return this.status(tenantId);
  }

  async syncNow(tenantId: number): Promise<MailerLiteStatus> {
    const c = await this.load(tenantId);
    if (!c?.enabled) throw new NotFoundException({ code: 'NOT_CONNECTED', message: 'Connect MailerLite first' });
    if (!c.consentAt) throw new BadRequestException({ code: 'NO_CONSENT', message: 'Please confirm that these contacts agreed to receive marketing email first.' });
    if (c.state === 'needs_attention') throw new BadRequestException({ code: 'BAD_KEY', message: 'MailerLite no longer accepts your API key. Please connect again with a new key.' });
    await this.enqueue(tenantId);
    return this.status(tenantId);
  }

  // Queues a run unless one is on its way: the state only changes if nobody
  // changed it since it was read, so two clicks give one job.
  async enqueue(tenantId: number): Promise<boolean> {
    const c = await this.load(tenantId);
    if (!c?.enabled || !c.consentAt || c.state === 'needs_attention') return false;
    const busy = c.state === 'queued' || c.state === 'running';
    const stuck = !c.heartbeatAt || Date.now() - new Date(c.heartbeatAt).getTime() > STUCK_MS;
    if (busy && !stuck) return false;

    const claimed = await this.connections.update({ id: c.id, state: c.state }, { state: 'queued', heartbeatAt: new Date() });
    if (!claimed.affected) return false;
    try {
      await this.addJob(tenantId, 0);
    } catch (err) {
      await this.connections.update({ id: c.id }, { state: c.state });
      throw err;
    }
    return true;
  }

  // Colons aren't allowed in BullMQ job ids.
  async addJob(tenantId: number, delayMs: number): Promise<void> {
    await this.queue.add(SYNC_JOB, { tenantId }, { jobId: `ml-${tenantId}-${Date.now()}`, delay: delayMs });
  }
}
