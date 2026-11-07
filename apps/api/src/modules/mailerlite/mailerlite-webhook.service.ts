import { Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Contact, MailerliteConnection } from '../../database/entities';
import { realEmail } from '../lead/buyer/real-email';
import { verifyMailerLiteSignature } from './mailerlite-signature';

export const WEBHOOK_EVENTS = ['subscriber.unsubscribed', 'subscriber.bounced', 'subscriber.spam_reported'];

const MAX_EVENTS = 1000;
const IN_CHUNK = 500;

type LeftKind = 'unsubscribed' | 'bounced';

const KIND_OF_EVENT: Record<string, LeftKind> = {
  'subscriber.unsubscribed': 'unsubscribed',
  'subscriber.spam_reported': 'unsubscribed',
  'subscriber.bounced': 'bounced',
};

// One event's kind and email, from any shape MailerLite documents: fields at
// the top with `event`, or `type` with a `subscriber` object.
function readEvent(raw: unknown): { kind: LeftKind; email: string } | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as { event?: unknown; type?: unknown; email?: unknown; subscriber?: { email?: unknown } | null };
  const name = typeof e.event === 'string' ? e.event : e.type;
  const kind = typeof name === 'string' ? KIND_OF_EVENT[name] : undefined;
  const value = typeof e.email === 'string' ? e.email : e.subscriber?.email;
  const email = typeof value === 'string' ? realEmail(value.trim().toLowerCase()) : null;
  return kind && email && email.length <= 255 ? { kind, email } : null;
}

export function readEvents(payload: unknown): { kind: LeftKind; email: string }[] {
  const list = (payload as { events?: unknown } | null)?.events;
  const events: unknown[] = Array.isArray(list) ? list : [payload];
  return events
    .slice(0, MAX_EVENTS)
    .map(readEvent)
    .filter((e): e is { kind: LeftKind; email: string } => !!e);
}

@Injectable()
export class MailerLiteWebhookService {
  private readonly logger = new Logger(MailerLiteWebhookService.name);

  constructor(
    @InjectRepository(MailerliteConnection) private readonly connections: Repository<MailerliteConnection>,
    @InjectRepository(Contact) private readonly contacts: Repository<Contact>,
  ) {}

  // The token picks the client, the signature proves it came from MailerLite.
  // Only what was signed is read. A database failure answers 500, so MailerLite
  // sends the event again rather than an unsubscribe being lost.
  async handle(token: string, signature: string | undefined, rawBody: Buffer | undefined): Promise<{ ok: true; handled: number }> {
    if (!/^[0-9a-f]{48}$/.test(token)) throw new NotFoundException();
    const connection = await this.connections
      .createQueryBuilder('c')
      .addSelect('c.webhookSecret')
      .where('c.hookToken = :token', { token })
      .getOne();
    if (!connection) throw new NotFoundException();
    if (!verifyMailerLiteSignature(signature, rawBody, connection.webhookSecret)) {
      throw new UnauthorizedException({ code: 'BAD_SIGNATURE', message: 'Bad signature' });
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody!.toString('utf8'));
    } catch {
      return { ok: true, handled: 0 };
    }

    const events = readEvents(payload);
    const handled = await this.markLeft(connection.tenantId, events);
    await this.connections.update({ id: connection.id }, { lastEventAt: new Date() });
    if (handled) this.logger.log(`MailerLite: ${handled} contact(s) of tenant ${connection.tenantId} marked as left`);
    return { ok: true, handled };
  }

  // Same state as our own unsubscribe link; a bounce also counts as a bounce.
  // Only people still subscribed change, so a repeated event does nothing.
  async markLeft(tenantId: number, events: { kind: LeftKind; email: string }[]): Promise<number> {
    let changed = 0;
    for (const kind of ['unsubscribed', 'bounced'] as const) {
      const emails = [...new Set(events.filter((e) => e.kind === kind).map((e) => e.email))];
      for (let i = 0; i < emails.length; i += IN_CHUNK) {
        const result = await this.contacts.update(
          { tenantId, email: In(emails.slice(i, i + IN_CHUNK)), subscribed: true },
          {
            subscribed: false,
            unsubscribedAt: new Date(),
            ...(kind === 'bounced' ? { bounceCount: () => 'bounceCount + 1' } : {}),
          },
        );
        changed += result.affected ?? 0;
      }
    }
    return changed;
  }
}
