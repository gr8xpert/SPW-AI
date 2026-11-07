import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { MailerLiteWebhookService, readEvents } from './mailerlite-webhook.service';
import { verifyMailerLiteSignature } from './mailerlite-signature';

const SECRET = 'webhook-secret';
const TOKEN_A = 'a'.repeat(48);
const TOKEN_B = 'b'.repeat(48);

const sign = (raw: Buffer | string, secret = SECRET) => createHmac('sha256', secret).update(raw).digest('hex');

interface FakeContact {
  tenantId: number;
  email: string;
  subscribed: boolean;
  unsubscribedAt: Date | null;
  bounceCount: number;
}

function setup() {
  const contacts: FakeContact[] = [
    { tenantId: 1, email: 'anna@example.com', subscribed: true, unsubscribedAt: null, bounceCount: 0 },
    { tenantId: 1, email: 'ben@example.com', subscribed: true, unsubscribedAt: null, bounceCount: 0 },
    { tenantId: 2, email: 'anna@example.com', subscribed: true, unsubscribedAt: null, bounceCount: 0 },
  ];
  const rows: Record<string, { id: number; tenantId: number; webhookSecret: string }> = {
    [TOKEN_A]: { id: 11, tenantId: 1, webhookSecret: SECRET },
    [TOKEN_B]: { id: 12, tenantId: 2, webhookSecret: 'other-secret' },
  };
  const connections = {
    createQueryBuilder: () => {
      let token = '';
      const qb = {
        addSelect: () => qb,
        where: (_: string, p: { token: string }) => {
          token = p.token;
          return qb;
        },
        getOne: async () => rows[token] ?? null,
      };
      return qb;
    },
    update: jest.fn(async () => ({ affected: 1 })),
  };
  const contactRepo = {
    update: jest.fn(async (where: { tenantId: number; email: { value: string[] }; subscribed: boolean }, patch: Record<string, unknown>) => {
      let affected = 0;
      for (const c of contacts) {
        if (c.tenantId === where.tenantId && c.subscribed === where.subscribed && where.email.value.includes(c.email)) {
          c.subscribed = patch.subscribed as boolean;
          c.unsubscribedAt = patch.unsubscribedAt as Date;
          if (patch.bounceCount) c.bounceCount++;
          affected++;
        }
      }
      return { affected };
    }),
  };
  const service = new MailerLiteWebhookService(connections as never, contactRepo as never);
  return { service, contacts, contactRepo, connections };
}

describe('verifyMailerLiteSignature', () => {
  const raw = Buffer.from('{"email":"a@b.c", "event":"x"}');

  it('accepts the hex HMAC of the raw bytes, in either case', () => {
    expect(verifyMailerLiteSignature(sign(raw), raw, SECRET)).toBe(true);
    expect(verifyMailerLiteSignature(sign(raw).toUpperCase(), raw, SECRET)).toBe(true);
  });

  it('refuses a wrong secret, a changed body, a malformed or missing header, no secret', () => {
    expect(verifyMailerLiteSignature(sign(raw, 'other'), raw, SECRET)).toBe(false);
    expect(verifyMailerLiteSignature(sign(raw), Buffer.from('{"email":"a@b.c","event":"x"}'), SECRET)).toBe(false);
    expect(verifyMailerLiteSignature('zz', raw, SECRET)).toBe(false);
    expect(verifyMailerLiteSignature(undefined, raw, SECRET)).toBe(false);
    expect(verifyMailerLiteSignature(sign(raw), undefined, SECRET)).toBe(false);
    expect(verifyMailerLiteSignature(sign(raw), raw, null)).toBe(false);
  });
});

describe('readEvents', () => {
  it('reads a single event, a type + subscriber one, and a batch', () => {
    expect(readEvents({ email: 'A@b.c', event: 'subscriber.bounced' })).toEqual([{ kind: 'bounced', email: 'a@b.c' }]);
    expect(readEvents({ type: 'subscriber.spam_reported', subscriber: { email: 'x@y.z' } })).toEqual([{ kind: 'unsubscribed', email: 'x@y.z' }]);
    expect(
      readEvents({
        events: [
          { type: 'subscriber.unsubscribed', subscriber: { email: 'one@x.y' } },
          { type: 'subscriber.updated', subscriber: { email: 'two@x.y' } },
          { event: 'subscriber.bounced', email: 'three@x.y' },
          'junk',
        ],
        total: 4,
      }),
    ).toEqual([
      { kind: 'unsubscribed', email: 'one@x.y' },
      { kind: 'bounced', email: 'three@x.y' },
    ]);
  });

  it('ignores made-up addresses and rubbish', () => {
    expect(readEvents({ email: 'x@no-email.invalid', event: 'subscriber.bounced' })).toEqual([]);
    expect(readEvents(null)).toEqual([]);
    expect(readEvents({ event: 'subscriber.bounced', email: 42 })).toEqual([]);
  });
});

describe('MailerLiteWebhookService.handle', () => {
  it('marks an unsubscribe from the signed raw body', async () => {
    const { service, contacts } = setup();
    const raw = Buffer.from('{ "email": "anna@example.com",  "event": "subscriber.unsubscribed" }');
    await expect(service.handle(TOKEN_A, sign(raw), raw)).resolves.toEqual({ ok: true, handled: 1 });
    expect(contacts[0].subscribed).toBe(false);
    expect(contacts[0].unsubscribedAt).toBeInstanceOf(Date);
    expect(contacts[0].bounceCount).toBe(0);
  });

  it('marks a bounce with a bounce count, spam as unsubscribed', async () => {
    const { service, contacts } = setup();
    const bounce = Buffer.from(JSON.stringify({ email: 'anna@example.com', event: 'subscriber.bounced' }));
    await service.handle(TOKEN_A, sign(bounce), bounce);
    expect(contacts[0]).toMatchObject({ subscribed: false, bounceCount: 1 });

    const spam = Buffer.from(JSON.stringify({ email: 'ben@example.com', event: 'subscriber.spam_reported' }));
    await service.handle(TOKEN_A, sign(spam), spam);
    expect(contacts[1]).toMatchObject({ subscribed: false, bounceCount: 0 });
  });

  it('handles the batched shape', async () => {
    const { service, contacts } = setup();
    const raw = Buffer.from(
      JSON.stringify({
        events: [
          { type: 'subscriber.unsubscribed', subscriber: { email: 'anna@example.com' } },
          { type: 'subscriber.bounced', subscriber: { email: 'ben@example.com' } },
        ],
        total: 2,
      }),
    );
    await expect(service.handle(TOKEN_A, sign(raw), raw)).resolves.toEqual({ ok: true, handled: 2 });
    expect(contacts[0].subscribed).toBe(false);
    expect(contacts[1]).toMatchObject({ subscribed: false, bounceCount: 1 });
  });

  it('a bad signature is 401 and changes nothing', async () => {
    const { service, contacts, contactRepo, connections } = setup();
    const raw = Buffer.from(JSON.stringify({ email: 'anna@example.com', event: 'subscriber.unsubscribed' }));
    await expect(service.handle(TOKEN_A, sign(raw, 'wrong'), raw)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.handle(TOKEN_A, undefined, raw)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.handle(TOKEN_A, sign(raw), undefined)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(contacts[0].subscribed).toBe(true);
    expect(contactRepo.update).not.toHaveBeenCalled();
    expect(connections.update).not.toHaveBeenCalled();
  });

  it('checks the bytes that arrived: a re-spaced body with the same data fails', async () => {
    const { service } = setup();
    const signed = '{"email":"anna@example.com","event":"subscriber.unsubscribed"}';
    const respaced = Buffer.from('{"email": "anna@example.com", "event": "subscriber.unsubscribed"}');
    await expect(service.handle(TOKEN_A, sign(signed), respaced)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('an unknown or malformed token is 404', async () => {
    const { service } = setup();
    const raw = Buffer.from('{}');
    await expect(service.handle('c'.repeat(48), sign(raw), raw)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.handle('../../etc', sign(raw), raw)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('an unknown email, an unrelated event and non-JSON still answer 200', async () => {
    const { service } = setup();
    const unknown = Buffer.from(JSON.stringify({ email: 'nobody@example.com', event: 'subscriber.unsubscribed' }));
    await expect(service.handle(TOKEN_A, sign(unknown), unknown)).resolves.toEqual({ ok: true, handled: 0 });
    const other = Buffer.from(JSON.stringify({ email: 'anna@example.com', event: 'subscriber.updated' }));
    await expect(service.handle(TOKEN_A, sign(other), other)).resolves.toEqual({ ok: true, handled: 0 });
    const notJson = Buffer.from('not json');
    await expect(service.handle(TOKEN_A, sign(notJson), notJson)).resolves.toEqual({ ok: true, handled: 0 });
  });

  it('a repeated event does nothing the second time', async () => {
    const { service, contacts } = setup();
    const raw = Buffer.from(JSON.stringify({ email: 'anna@example.com', event: 'subscriber.bounced' }));
    await service.handle(TOKEN_A, sign(raw), raw);
    await expect(service.handle(TOKEN_A, sign(raw), raw)).resolves.toEqual({ ok: true, handled: 0 });
    expect(contacts[0].bounceCount).toBe(1);
  });

  it("only touches the token's client: the same email at another client is left alone", async () => {
    const { service, contacts } = setup();
    const raw = Buffer.from(JSON.stringify({ email: 'anna@example.com', event: 'subscriber.unsubscribed' }));
    await service.handle(TOKEN_A, sign(raw), raw);
    expect(contacts.find((c) => c.tenantId === 1 && c.email === 'anna@example.com')!.subscribed).toBe(false);
    expect(contacts.find((c) => c.tenantId === 2)!.subscribed).toBe(true);
  });

  it("a client's secret doesn't open another client's token", async () => {
    const { service, contacts } = setup();
    const raw = Buffer.from(JSON.stringify({ email: 'anna@example.com', event: 'subscriber.unsubscribed' }));
    await expect(service.handle(TOKEN_B, sign(raw, SECRET), raw)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(contacts.every((c) => c.subscribed)).toBe(true);
  });
});
