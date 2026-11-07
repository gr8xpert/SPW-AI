import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, MoreThan, MoreThanOrEqual, Repository } from 'typeorm';
import { Contact, MailerliteConnection } from '../../database/entities';
import {
  BATCH_MAX,
  BatchRequest,
  BatchResponse,
  DEFAULT_MAILERLITE_API,
  MailerLiteAuthError,
  MailerLiteClient,
  MailerLiteClientOptions,
  MailerLiteError,
  MailerLiteRateLimitError,
  MailerLiteSubscriber,
} from './mailerlite.client';
import {
  ContactRow,
  GROUP_SEARCH,
  LANGUAGE_FIELD,
  MAIN_GROUP,
  contactTags,
  fieldsMatch,
  groupsToLeave,
  hasLeft,
  planContact,
  subscriberFields,
  tagGroupName,
} from './mailerlite-contacts';
import { MailerLiteWebhookService } from './mailerlite-webhook.service';

export const PAGE_SIZE = BATCH_MAX;
// One job works this long, then the next piece is queued: other clients get a
// turn, and a restart never has to wait for a run that takes hours.
export const SLICE_MS = 170_000;
const FULL_SYNC_EVERY_MS = 7 * 24 * 60 * 60 * 1000;

export const BAD_KEY_MESSAGE = 'MailerLite no longer accepts your API key. Please connect again with a new key.';
export const FAILED_MESSAGE = 'The sync could not finish because MailerLite could not be reached. It carries on from where it stopped next time.';
const NO_GROUP_MESSAGE = 'Some tags have no group in MailerLite because the group could not be created. Your account may have reached its limit of groups.';

export type SliceResult = { kind: 'done' } | { kind: 'stopped' } | { kind: 'continue'; delayMs: number };

interface Counts {
  added: number;
  updated: number;
  unchanged: number;
  skipped: number;
  failed: number;
}

// Group ids by name, for one piece of a run: read from MailerLite first, so a
// group the client deleted is created again and one they made is reused.
class GroupBook {
  private readonly ids = new Map<string, string>();
  private readonly refused = new Set<string>();

  constructor(private readonly client: MailerLiteClient) {}

  get someRefused(): boolean {
    return this.refused.size > 0;
  }

  async load(): Promise<void> {
    for (const g of await this.client.listGroups(GROUP_SEARCH)) this.ids.set(g.name.toLowerCase(), g.id);
  }

  async idFor(name: string): Promise<string | null> {
    const key = name.toLowerCase();
    const known = this.ids.get(key);
    if (known) return known;
    if (this.refused.has(key)) return null;
    try {
      const created = await this.client.createGroup(name);
      this.ids.set(key, created.id);
      return created.id;
    } catch (err) {
      if (err instanceof MailerLiteError && !(err instanceof MailerLiteAuthError) && !(err instanceof MailerLiteRateLimitError) && err.status >= 400 && err.status < 500) {
        this.refused.add(key);
        return null;
      }
      throw err;
    }
  }

  toJSON(): Record<string, string> {
    return Object.fromEntries(this.ids);
  }
}

@Injectable()
export class MailerLiteSyncService {
  private readonly logger = new Logger(MailerLiteSyncService.name);

  constructor(
    @InjectRepository(MailerliteConnection) private readonly connections: Repository<MailerliteConnection>,
    @InjectRepository(Contact) private readonly contacts: Repository<Contact>,
    private readonly webhook: MailerLiteWebhookService,
    private readonly config: ConfigService,
  ) {}

  // Set by the server's .env only (tests point it at a fake).
  baseUrl(): string {
    return this.config.get<string>('MAILERLITE_API_URL') || DEFAULT_MAILERLITE_API;
  }

  client(apiKey: string, overrides: Partial<MailerLiteClientOptions> = {}): MailerLiteClient {
    return new MailerLiteClient({ baseUrl: this.baseUrl(), apiKey, ...overrides });
  }

  private async load(tenantId: number): Promise<MailerliteConnection | null> {
    return this.connections
      .createQueryBuilder('c')
      .addSelect('c.apiKey')
      .where('c.tenantId = :tenantId', { tenantId })
      .getOne();
  }

  // One piece of a run. Safe to repeat: pages are upserts and the cursor only
  // moves after a page is done.
  async runSlice(tenantId: number, clock: () => number = Date.now): Promise<SliceResult> {
    const conn = await this.load(tenantId);
    if (!conn?.apiKey || !conn.enabled || !conn.consentAt || (conn.state !== 'queued' && conn.state !== 'running')) {
      return { kind: 'stopped' };
    }

    try {
      await this.begin(conn, clock);
      const client = this.client(conn.apiKey);
      const book = new GroupBook(client);
      await book.load();
      const mainGroup = await book.idFor(MAIN_GROUP);
      if (!mainGroup) throw new MailerLiteError(`The group "${MAIN_GROUP}" could not be created`, 422);
      if (!conn.languageField) conn.languageField = await this.languageField(client);

      const deadline = clock() + SLICE_MS;
      while (clock() < deadline) {
        const rows = await this.nextPage(conn);
        if (!rows.length) return await this.finish(conn, book, clock);

        const page = await this.syncPage(conn, client, book, mainGroup, rows);
        conn.runCursor = rows[rows.length - 1].id;
        this.addCounts(conn, page.counts);
        await this.connections.update({ id: conn.id }, this.progress(conn, book, clock));

        if (!(await this.stillConnected(conn))) return { kind: 'stopped' };
      }
      return { kind: 'continue', delayMs: 0 };
    } catch (err) {
      if (err instanceof MailerLiteAuthError) {
        await this.connections.update({ id: conn.id }, { state: 'needs_attention', lastError: BAD_KEY_MESSAGE, heartbeatAt: new Date(clock()) });
        this.logger.warn(`MailerLite key of tenant ${tenantId} refused; waiting for a new key`);
        return { kind: 'stopped' };
      }
      if (err instanceof MailerLiteRateLimitError) {
        await this.connections.update({ id: conn.id }, { heartbeatAt: new Date(clock()) });
        return { kind: 'continue', delayMs: err.retryAfterS * 1000 + 1000 };
      }
      throw err;
    }
  }

  // All tries used up. The cursor stays, so the next run carries on.
  async markFailed(tenantId: number, reason: string): Promise<void> {
    this.logger.warn(`MailerLite sync of tenant ${tenantId} failed: ${reason}`);
    await this.connections.update({ tenantId, state: 'running' }, { state: 'failed', lastError: FAILED_MESSAGE });
    await this.connections.update({ tenantId, state: 'queued' }, { state: 'failed', lastError: FAILED_MESSAGE });
  }

  private async begin(conn: MailerliteConnection, clock: () => number): Promise<void> {
    const now = new Date(clock());
    if (conn.runStartedAt) {
      conn.state = 'running';
      await this.connections.update({ id: conn.id }, { state: 'running', heartbeatAt: now });
      return;
    }
    // Only what changed since the last run, with a full pass once a week to
    // catch anything else (a group the client emptied, a change made in SQL).
    const fullDue = !conn.lastFullSyncAt || clock() - new Date(conn.lastFullSyncAt).getTime() > FULL_SYNC_EVERY_MS;
    const patch = {
      state: 'running' as const,
      lastError: null,
      runStartedAt: now,
      runSince: fullDue ? null : conn.lastSyncStartedAt,
      runCursor: 0,
      heartbeatAt: now,
      countAdded: 0,
      countUpdated: 0,
      countUnchanged: 0,
      countSkipped: 0,
      countFailed: 0,
    };
    Object.assign(conn, patch);
    await this.connections.update({ id: conn.id }, patch);
  }

  private async languageField(client: MailerLiteClient): Promise<string | null> {
    try {
      return await client.ensureTextField(LANGUAGE_FIELD);
    } catch (err) {
      // The language is a nicety: without the field the contacts still go.
      if (err instanceof MailerLiteAuthError || err instanceof MailerLiteRateLimitError) throw err;
      this.logger.warn(`MailerLite language field not available: ${(err as Error).message}`);
      return null;
    }
  }

  // A page of contacts, only the columns needed.
  private nextPage(conn: MailerliteConnection): Promise<ContactRow[]> {
    const where: FindOptionsWhere<Contact> = { tenantId: conn.tenantId, id: MoreThan(conn.runCursor) };
    if (conn.runSince) where.updatedAt = MoreThanOrEqual(conn.runSince);
    return this.contacts.find({
      where,
      select: ['id', 'email', 'name', 'subscribed', 'unsubscribedAt', 'bounceCount', 'tags', 'preferences'],
      order: { id: 'ASC' },
      take: PAGE_SIZE,
    });
  }

  private async syncPage(
    conn: MailerliteConnection,
    client: MailerLiteClient,
    book: GroupBook,
    mainGroup: string,
    rows: ContactRow[],
  ): Promise<{ counts: Counts }> {
    const counts: Counts = { added: 0, updated: 0, unchanged: 0, skipped: 0, failed: 0 };
    const planned = rows.map((row) => ({ row, plan: planContact(row) }));
    const toLookUp = planned.filter((p) => p.plan.kind !== 'skip');
    counts.skipped += planned.length - toLookUp.length;

    // What MailerLite knows first: nobody who left is ever sent again, whatever
    // the upsert would do, and contacts that didn't change cost no import.
    const answers = await client.batch(
      toLookUp.map((p) => ({ method: 'GET' as const, path: `api/subscribers/${encodeURIComponent((p.plan as { email: string }).email)}?include=groups` })),
    );

    // A lookup the batch couldn't answer is asked again on its own, so a batch
    // quirk at MailerLite costs speed and never skips a contact.
    for (let i = 0; i < answers.length; i++) {
      if (answers[i].code !== 404 && (answers[i].code < 200 || answers[i].code >= 300)) {
        answers[i] = await client.lookup((toLookUp[i].plan as { email: string }).email);
      }
    }

    const upserts: Record<string, unknown>[] = [];
    const upsertIsNew: boolean[] = [];
    const others: BatchRequest[] = [];
    const leftThere: { kind: 'unsubscribed' | 'bounced'; email: string }[] = [];

    for (let i = 0; i < toLookUp.length; i++) {
      const { row, plan } = toLookUp[i];
      const email = (plan as { email: string }).email;
      const answer = answers[i];
      if (answer.code !== 404 && (answer.code < 200 || answer.code >= 300)) {
        counts.failed++;
        continue;
      }
      const existing = answer.code === 404 ? null : ((answer.body?.data ?? null) as MailerLiteSubscriber | null);

      if (plan.kind === 'leave') {
        if (existing?.id && !hasLeft(existing)) {
          others.push({ method: 'PUT', path: `api/subscribers/${encodeURIComponent(existing.id)}`, body: { status: 'unsubscribed' } });
          counts.updated++;
        } else {
          counts.skipped++;
        }
        continue;
      }

      if (existing && hasLeft(existing)) {
        // They left in MailerLite but SPM never heard (a webhook that didn't
        // get through). Leaving wins: SPM catches up, MailerLite is untouched.
        leftThere.push({ kind: existing.status === 'bounced' ? 'bounced' : 'unsubscribed', email });
        counts.skipped++;
        continue;
      }

      const tags = conn.groupMode === 'contacts_only' ? [] : contactTags(row);
      const groupNames = tags.map(tagGroupName);
      const wantedIds = [mainGroup];
      for (const groupName of groupNames) {
        const id = await book.idFor(groupName);
        if (id) wantedIds.push(id);
      }
      const fields = subscriberFields(row, conn.languageField);

      const stale = existing ? groupsToLeave(existing, groupNames) : [];
      for (const groupId of stale) {
        others.push({ method: 'DELETE', path: `api/subscribers/${encodeURIComponent(existing!.id)}/groups/${encodeURIComponent(groupId)}` });
      }

      const inAllGroups = !!existing?.groups && wantedIds.every((id) => existing.groups!.some((g) => g.id === id));
      if (existing && inAllGroups && fieldsMatch(fields, existing.fields)) {
        if (stale.length) counts.updated++;
        else counts.unchanged++;
        continue;
      }
      // Never a status and never resubscribe: new people become active by
      // MailerLite's default, people who are there keep the status they have.
      upserts.push({ email, ...(Object.keys(fields).length ? { fields } : {}), groups: wantedIds });
      upsertIsNew.push(!existing);
    }

    if (leftThere.length) await this.webhook.markLeft(conn.tenantId, leftThere);

    for (let i = 0; i < others.length; i += BATCH_MAX) {
      const results = await client.batch(others.slice(i, i + BATCH_MAX));
      this.logFailures(conn.tenantId, results);
    }

    const results: BatchResponse[] = [];
    for (const body of upserts) results.push(await client.upsert(body));
    this.logFailures(conn.tenantId, results);
    results.forEach((res, i) => {
      if (res.code >= 400) counts.failed++;
      else if (upsertIsNew[i]) counts.added++;
      else counts.updated++;
    });

    return { counts };
  }

  private logFailures(tenantId: number, results: BatchResponse[]): void {
    const failed = results.filter((r) => r.code >= 400 && r.code !== 404);
    if (failed.length) {
      this.logger.warn(`MailerLite refused ${failed.length} call(s) for tenant ${tenantId}: ${failed[0].code} ${String(failed[0].body?.message ?? '').slice(0, 200)}`);
    }
  }

  private addCounts(conn: MailerliteConnection, c: Counts): void {
    conn.countAdded += c.added;
    conn.countUpdated += c.updated;
    conn.countUnchanged += c.unchanged;
    conn.countSkipped += c.skipped;
    conn.countFailed += c.failed;
  }

  private progress(conn: MailerliteConnection, book: GroupBook, clock: () => number) {
    return {
      runCursor: conn.runCursor,
      countAdded: conn.countAdded,
      countUpdated: conn.countUpdated,
      countUnchanged: conn.countUnchanged,
      countSkipped: conn.countSkipped,
      countFailed: conn.countFailed,
      groupIds: book.toJSON(),
      languageField: conn.languageField,
      heartbeatAt: new Date(clock()),
      lastError: book.someRefused ? NO_GROUP_MESSAGE : null,
    };
  }

  // Disconnected or connected to another account while this piece ran.
  private async stillConnected(conn: MailerliteConnection): Promise<boolean> {
    const fresh = await this.connections.findOne({ where: { id: conn.id }, select: ['id', 'enabled', 'webhookId'] });
    return !!fresh?.enabled && fresh.webhookId === conn.webhookId;
  }

  private async finish(conn: MailerliteConnection, book: GroupBook, clock: () => number): Promise<SliceResult> {
    const startedAt = conn.runStartedAt;
    await this.connections.update(
      { id: conn.id },
      {
        ...this.progress(conn, book, clock),
        state: 'idle',
        runStartedAt: null,
        runSince: null,
        runCursor: 0,
        lastSyncAt: new Date(clock()),
        lastSyncStartedAt: startedAt,
        ...(conn.runSince ? {} : { lastFullSyncAt: startedAt }),
      },
    );
    return { kind: 'done' };
  }
}
