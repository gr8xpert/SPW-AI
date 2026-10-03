import { UnauthorizedException } from '@nestjs/common';
import {
  CreditBalance,
  CreditTransaction,
  ProcessedStripeEvent,
  SubscriptionPayment,
  Tenant,
} from '../../database/entities';
import { signStripePayload } from './stripe-signature';
import { StripeWebhookService } from './stripe-webhook.service';

const SECRET = 'whsec_test_secret';

// In-memory stand-in for the bits of MySQL the webhook relies on:
//  - processed_stripe_events.eventId is a PRIMARY KEY, so a second insert of
//    the same id fails (that is the dedup guarantee under concurrency);
//  - dataSource.transaction() commits the staged writes only if the callback
//    resolves, and releases the PK "claim" if it throws.
function makeDb(seed: { tenants?: any[]; balances?: any[]; payments?: any[] } = {}) {
  const processed = new Map<string, string>(); // committed
  const claimed = new Set<string>(); // PK held by an open or committed tx
  const tenants = new Map<number, any>((seed.tenants ?? []).map((t) => [t.id, { ...t }]));
  const balances = new Map<number, any>((seed.balances ?? []).map((b) => [b.tenantId, { ...b }]));
  const ledger: any[] = [];
  const payments: any[] = [...(seed.payments ?? [])];

  const claim = (eventId: string, eventType: string) => {
    if (claimed.has(eventId)) {
      const err: any = new Error(`Duplicate entry '${eventId}' for key 'PRIMARY'`);
      err.code = 'ER_DUP_ENTRY';
      throw err;
    }
    claimed.add(eventId);
    return { eventId, eventType };
  };

  const processedRepo = {
    findOne: jest.fn(async ({ where }: any) =>
      processed.has(where.eventId) ? { eventId: where.eventId } : null,
    ),
    insert: jest.fn(async ({ eventId, eventType }: any) => {
      claim(eventId, eventType);
      processed.set(eventId, eventType);
    }),
  };

  const findLatestPayment = (subId: string) =>
    [...payments].reverse().find((p) => p.stripeSubscriptionId === subId) ?? null;

  const dataSource = {
    transaction: jest.fn(async (cb: (m: any) => Promise<any>) => {
      const stagedProcessed: any[] = [];
      const stagedLedger: any[] = [];
      const stagedPayments: any[] = [];
      const stagedSaves: Array<() => void> = [];
      const manager = {
        insert: jest.fn(async (entity: any, row: any) => {
          if (entity === ProcessedStripeEvent) stagedProcessed.push(claim(row.eventId, row.eventType));
          else if (entity === CreditTransaction) stagedLedger.push(row);
          else if (entity === SubscriptionPayment) stagedPayments.push(row);
        }),
        findOne: jest.fn(async (entity: any, { where }: any) => {
          if (entity === Tenant) {
            const t = tenants.get(where.id);
            return t ? { ...t } : null;
          }
          if (entity === CreditBalance) {
            const b = balances.get(where.tenantId);
            return b ? { ...b } : null;
          }
          if (entity === SubscriptionPayment) return findLatestPayment(where.stripeSubscriptionId);
          if (entity === CreditTransaction) {
            return (
              [...ledger, ...stagedLedger].find((r) =>
                Object.entries(where).every(([k, v]) => r[k] === v),
              ) ?? null
            );
          }
          return null;
        }),
        create: jest.fn((entity: any, data: any) => ({ __entity: entity, ...data })),
        save: jest.fn(async (row: any) => {
          const copy = { ...row };
          if (copy.__entity === CreditBalance || ('balance' in copy && 'tenantId' in copy)) {
            delete copy.__entity;
            stagedSaves.push(() => balances.set(copy.tenantId, copy));
          } else {
            stagedSaves.push(() => tenants.set(copy.id, copy));
          }
          return row;
        }),
      };
      try {
        const result = await cb(manager);
        stagedProcessed.forEach((p) => processed.set(p.eventId, p.eventType));
        ledger.push(...stagedLedger);
        payments.push(...stagedPayments);
        stagedSaves.forEach((apply) => apply());
        return result;
      } catch (err) {
        stagedProcessed.forEach((p) => claimed.delete(p.eventId));
        throw err;
      }
    }),
  };

  return { processed, tenants, balances, ledger, payments, processedRepo, dataSource };
}

function makeService(db: ReturnType<typeof makeDb>, env: Record<string, string | undefined> = {}) {
  const config = {
    get: jest.fn((k: string) => (k in env ? env[k] : k === 'STRIPE_WEBHOOK_SECRET' ? SECRET : undefined)),
  };
  const xeroSyncService = { enqueueCreditPurchaseInvoice: jest.fn().mockResolvedValue(undefined) };
  const svc = new StripeWebhookService(
    config as any,
    db.processedRepo as any,
    {} as any,
    {} as any,
    db.dataSource as any,
    xeroSyncService as any,
  );
  return { svc, xeroSyncService, config };
}

function signed(event: any) {
  const rawBody = JSON.stringify(event);
  return { rawBody, signatureHeader: signStripePayload(rawBody, SECRET) };
}

function creditCheckout(id: string, over: any = {}) {
  return {
    id,
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_1',
        mode: 'payment',
        payment_status: 'paid',
        payment_intent: 'pi_1',
        amount_total: 25000,
        currency: 'eur',
        metadata: { tenantId: '7', hours: '5' },
        ...over,
      },
    },
  };
}

describe('StripeWebhookService', () => {
  describe('authentication', () => {
    it('rejects every event when STRIPE_WEBHOOK_SECRET is not configured', async () => {
      const db = makeDb({ tenants: [{ id: 7 }] });
      const { svc } = makeService(db, { STRIPE_WEBHOOK_SECRET: undefined });
      await expect(svc.process(signed(creditCheckout('evt_1')))).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(db.ledger).toHaveLength(0);
    });

    it('rejects a bad signature without touching the database', async () => {
      const db = makeDb({ tenants: [{ id: 7 }] });
      const { svc } = makeService(db);
      const { rawBody } = signed(creditCheckout('evt_1'));
      await expect(
        svc.process({ rawBody, signatureHeader: signStripePayload(rawBody, 'whsec_wrong') }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(svc.process({ rawBody, signatureHeader: undefined })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(db.processedRepo.findOne).not.toHaveBeenCalled();
      expect(db.ledger).toHaveLength(0);
    });

    it('rejects a body that was tampered with after signing (e.g. hours bumped)', async () => {
      const db = makeDb({ tenants: [{ id: 7 }] });
      const { svc } = makeService(db);
      const { signatureHeader } = signed(creditCheckout('evt_1'));
      const tampered = JSON.stringify(creditCheckout('evt_1', { metadata: { tenantId: '7', hours: '500' } }));
      await expect(svc.process({ rawBody: tampered, signatureHeader })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(db.ledger).toHaveLength(0);
    });
  });

  describe('checkout.session.completed — credit package (one-time)', () => {
    it('credits the tenant from metadata with the exact hours and logs a purchase row', async () => {
      const db = makeDb({ tenants: [{ id: 7 }], balances: [{ tenantId: 7, balance: '10.00' }] });
      const { svc, xeroSyncService } = makeService(db);

      const res = await svc.process(signed(creditCheckout('evt_1')));

      expect(res).toEqual({
        processed: true,
        eventId: 'evt_1',
        eventType: 'checkout.session.completed',
        outcome: 'applied',
        tenantId: 7,
      });
      expect(db.balances.get(7).balance).toBe(15);
      expect(db.ledger).toEqual([
        expect.objectContaining({
          tenantId: 7,
          type: 'purchase',
          amount: 5,
          balanceAfter: 15,
          paymentReference: 'pi_1',
          createdBy: null,
        }),
      ]);
      expect(db.processed.has('evt_1')).toBe(true);
      expect(xeroSyncService.enqueueCreditPurchaseInvoice).toHaveBeenCalledWith({
        tenantId: 7,
        stripeSessionId: 'cs_test_1',
        hours: 5,
        amountEur: 250,
        currency: 'EUR',
      });
    });

    it('creates the balance from zero for a tenant without one, and supports fractional hours', async () => {
      const db = makeDb({ tenants: [{ id: 8 }] });
      const { svc } = makeService(db);

      await svc.process(signed(creditCheckout('evt_1', { metadata: { tenantId: '8', hours: '2.5' } })));

      expect(db.balances.get(8).balance).toBe(2.5);
      expect(db.ledger[0]).toMatchObject({ tenantId: 8, amount: 2.5, balanceAfter: 2.5 });
    });

    it('only touches the tenant named in metadata', async () => {
      const db = makeDb({
        tenants: [{ id: 7 }, { id: 9 }],
        balances: [{ tenantId: 7, balance: 1 }, { tenantId: 9, balance: 1 }],
      });
      const { svc } = makeService(db);

      await svc.process(signed(creditCheckout('evt_1', { metadata: { tenantId: '9', hours: '3' } })));

      expect(db.balances.get(9).balance).toBe(4);
      expect(db.balances.get(7).balance).toBe(1);
    });

    it('falls back to the session id as paymentReference when there is no payment_intent', async () => {
      const db = makeDb({ tenants: [{ id: 7 }] });
      const { svc } = makeService(db);
      await svc.process(signed(creditCheckout('evt_1', { payment_intent: null })));
      expect(db.ledger[0].paymentReference).toBe('cs_test_1');
    });

    it('treats a mode-less session with metadata.hours as a credit purchase', async () => {
      const db = makeDb({ tenants: [{ id: 7 }] });
      const { svc } = makeService(db);
      await svc.process(signed(creditCheckout('evt_1', { mode: undefined })));
      expect(db.balances.get(7).balance).toBe(5);
    });

    it.each([
      ['no metadata at all', { metadata: undefined }],
      ['no tenantId', { metadata: { hours: '5' } }],
      ['non-numeric tenantId', { metadata: { tenantId: 'abc', hours: '5' } }],
      ['tenantId 0', { metadata: { tenantId: '0', hours: '5' } }],
      ['no hours', { metadata: { tenantId: '7' } }],
      ['non-numeric hours', { metadata: { tenantId: '7', hours: 'lots' } }],
      ['zero hours', { metadata: { tenantId: '7', hours: '0' } }],
      ['negative hours', { metadata: { tenantId: '7', hours: '-5' } }],
    ])('does not crash or credit anyone with %s', async (_label, over) => {
      const db = makeDb({ tenants: [{ id: 7 }], balances: [{ tenantId: 7, balance: 10 }] });
      const { svc, xeroSyncService } = makeService(db);

      const res = await svc.process(signed(creditCheckout('evt_1', over)));

      expect(res.processed).toBe(true);
      expect(['no-tenant', 'ignored']).toContain(res.outcome);
      expect(db.ledger).toHaveLength(0);
      expect(db.balances.get(7).balance).toBe(10);
      expect(xeroSyncService.enqueueCreditPurchaseInvoice).not.toHaveBeenCalled();
      // Still marked processed, so a Stripe retry does not re-run it.
      expect(db.processed.has('evt_1')).toBe(true);
    });

    it('does not credit an unknown tenant id', async () => {
      const db = makeDb({ tenants: [{ id: 7 }] });
      const { svc } = makeService(db);
      const res = await svc.process(
        signed(creditCheckout('evt_1', { metadata: { tenantId: '404', hours: '5' } })),
      );
      expect(res.outcome).toBe('no-tenant');
      expect(db.ledger).toHaveLength(0);
      expect(db.balances.size).toBe(0);
    });

    it('still credits when the Xero enqueue rejects (fire-and-forget)', async () => {
      const db = makeDb({ tenants: [{ id: 7 }] });
      const { svc, xeroSyncService } = makeService(db);
      xeroSyncService.enqueueCreditPurchaseInvoice.mockRejectedValue(new Error('n8n down'));

      const res = await svc.process(signed(creditCheckout('evt_1')));

      expect(res.outcome).toBe('applied');
      expect(db.balances.get(7).balance).toBe(5);
    });

  });

  // Delayed methods (SEPA Debit, bank transfer...) complete checkout with
  // payment_status 'unpaid'; the money is confirmed later by
  // checkout.session.async_payment_succeeded or _failed.
  describe('delayed payments', () => {
    const asyncEvent = (id: string, type: string, over: any = {}) => ({
      ...creditCheckout(id, { payment_status: type.endsWith('succeeded') ? 'paid' : 'unpaid', ...over }),
      type,
    });

    it('does not credit an unpaid checkout and does not send a Xero invoice', async () => {
      const db = makeDb({ tenants: [{ id: 7 }] });
      const { svc, xeroSyncService } = makeService(db);
      const res = await svc.process(signed(creditCheckout('evt_1', { payment_status: 'unpaid' })));
      expect(res.outcome).toBe('awaiting-payment');
      expect(db.balances.has(7)).toBe(false);
      expect(db.ledger).toHaveLength(0);
      expect(xeroSyncService.enqueueCreditPurchaseInvoice).not.toHaveBeenCalled();
      expect(db.processed.has('evt_1')).toBe(true);
    });

    it('credits once when async_payment_succeeded follows the unpaid checkout', async () => {
      const db = makeDb({ tenants: [{ id: 7 }] });
      const { svc, xeroSyncService } = makeService(db);
      await svc.process(signed(creditCheckout('evt_1', { payment_status: 'unpaid' })));
      const res = await svc.process(signed(asyncEvent('evt_2', 'checkout.session.async_payment_succeeded')));
      expect(res).toMatchObject({ outcome: 'applied', tenantId: 7 });
      expect(db.balances.get(7).balance).toBe(5);
      expect(db.ledger).toHaveLength(1);
      expect(xeroSyncService.enqueueCreditPurchaseInvoice).toHaveBeenCalledTimes(1);
    });

    it('grants nothing when async_payment_failed follows the unpaid checkout', async () => {
      const db = makeDb({ tenants: [{ id: 7 }] });
      const { svc } = makeService(db);
      await svc.process(signed(creditCheckout('evt_1', { payment_status: 'unpaid' })));
      const res = await svc.process(signed(asyncEvent('evt_2', 'checkout.session.async_payment_failed')));
      expect(res.outcome).toBe('payment-failed');
      expect(db.balances.has(7)).toBe(false);
      expect(db.ledger).toHaveLength(0);
    });

    it('does not activate a plan on an unpaid subscription checkout, then does once paid', async () => {
      const db = makeDb({ tenants: [{ id: 7, planId: 1, subscriptionStatus: 'expired' }] });
      const { svc } = makeService(db);
      const sub = (id: string, type: string, payment_status: string) => ({
        id,
        type,
        data: {
          object: {
            id: 'cs_sub_1',
            mode: 'subscription',
            payment_status,
            subscription: 'sub_1',
            customer: 'cus_1',
            amount_total: 4900,
            currency: 'eur',
            metadata: { tenantId: '7', planId: '3', billingCycle: 'monthly' },
          },
        },
      });

      await svc.process(signed(sub('evt_1', 'checkout.session.completed', 'unpaid')));
      expect(db.tenants.get(7).planId).toBe(1);
      expect(db.payments).toHaveLength(0);

      await svc.process(signed(sub('evt_2', 'checkout.session.async_payment_succeeded', 'paid')));
      expect(db.tenants.get(7)).toMatchObject({ planId: 3, subscriptionStatus: 'active' });
      expect(db.payments).toHaveLength(1);
    });

    it('still credits a checkout with no payment_status (older fixtures, e2e smoke test)', async () => {
      const db = makeDb({ tenants: [{ id: 7 }] });
      const { svc } = makeService(db);
      const res = await svc.process(signed(creditCheckout('evt_1', { payment_status: undefined })));
      expect(res.outcome).toBe('applied');
      expect(db.balances.get(7).balance).toBe(5);
    });
  });

  describe('idempotency', () => {
    it('applies the same event id only once when Stripe redelivers it', async () => {
      const db = makeDb({ tenants: [{ id: 7 }] });
      const { svc, xeroSyncService } = makeService(db);
      const payload = signed(creditCheckout('evt_dup'));

      const first = await svc.process(payload);
      const second = await svc.process(signed(creditCheckout('evt_dup')));

      expect(first.outcome).toBe('applied');
      expect(second).toEqual({
        processed: true,
        eventId: 'evt_dup',
        eventType: 'checkout.session.completed',
        outcome: 'replay',
      });
      expect(db.balances.get(7).balance).toBe(5);
      expect(db.ledger).toHaveLength(1);
      expect(xeroSyncService.enqueueCreditPurchaseInvoice).toHaveBeenCalledTimes(1);
      expect(db.dataSource.transaction).toHaveBeenCalledTimes(1);
    });

    // Two deliveries racing past the findOne() pre-check: the PK insert inside
    // the transaction is what stops the double credit. The loser throws (-> 5xx
    // to Stripe, which retries later and then hits the 'replay' path).
    it('credits once when two deliveries of the same event race', async () => {
      const db = makeDb({ tenants: [{ id: 7 }] });
      const { svc } = makeService(db);

      const results = await Promise.allSettled([
        svc.process(signed(creditCheckout('evt_race'))),
        svc.process(signed(creditCheckout('evt_race'))),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
      expect(db.ledger).toHaveLength(1);
      expect(db.balances.get(7).balance).toBe(5);

      // Stripe's retry afterwards is a clean replay.
      await expect(svc.process(signed(creditCheckout('evt_race')))).resolves.toMatchObject({
        outcome: 'replay',
      });
    });

    it('does not mark the event processed if the handler fails, so a retry can still apply it', async () => {
      const db = makeDb({ tenants: [{ id: 7 }] });
      const { svc } = makeService(db);
      const realTx = db.dataSource.transaction.getMockImplementation()!;
      db.dataSource.transaction.mockImplementationOnce(async (cb: any) =>
        realTx(async (m: any) => {
          m.save.mockRejectedValueOnce(new Error('deadlock'));
          return cb(m);
        }),
      );

      await expect(svc.process(signed(creditCheckout('evt_retry')))).rejects.toThrow('deadlock');
      expect(db.processed.has('evt_retry')).toBe(false);
      expect(db.ledger).toHaveLength(0);

      const retry = await svc.process(signed(creditCheckout('evt_retry')));
      expect(retry.outcome).toBe('applied');
      expect(db.balances.get(7).balance).toBe(5);
    });

    it('two different events for the same tenant both credit', async () => {
      const db = makeDb({ tenants: [{ id: 7 }] });
      const { svc } = makeService(db);
      await svc.process(signed(creditCheckout('evt_a')));
      await svc.process(signed(creditCheckout('evt_b', { payment_intent: 'pi_2' })));
      expect(db.balances.get(7).balance).toBe(10);
    });

    // Event-id dedup alone would let two different events for one payment
    // (e.g. completed 'paid' + async_payment_succeeded) both credit.
    it('credits a payment_intent only once even across different event ids', async () => {
      const db = makeDb({ tenants: [{ id: 7 }] });
      const { svc, xeroSyncService } = makeService(db);
      await svc.process(signed(creditCheckout('evt_a')));
      const second = await svc.process(signed(creditCheckout('evt_b')));
      expect(second.outcome).toBe('replay');
      expect(db.ledger.map((l) => l.paymentReference)).toEqual(['pi_1']);
      expect(db.balances.get(7).balance).toBe(5);
      expect(xeroSyncService.enqueueCreditPurchaseInvoice).toHaveBeenCalledTimes(1);
    });
  });

  describe('unknown / malformed events', () => {
    it('ignores unhandled event types safely and records them so retries are no-ops', async () => {
      const db = makeDb({ tenants: [{ id: 7 }] });
      const { svc } = makeService(db);

      const res = await svc.process(
        signed({ id: 'evt_x', type: 'charge.refunded', data: { object: { metadata: { tenantId: '7', hours: '5' } } } }),
      );

      expect(res).toEqual({ processed: true, eventId: 'evt_x', eventType: 'charge.refunded', outcome: 'ignored' });
      expect(db.dataSource.transaction).not.toHaveBeenCalled();
      expect(db.processed.get('evt_x')).toBe('charge.refunded');
      expect(db.ledger).toHaveLength(0);
    });

    it('swallows a duplicate-insert race when recording an ignored event', async () => {
      const db = makeDb();
      const { svc } = makeService(db);
      db.processedRepo.insert.mockRejectedValueOnce(new Error('ER_DUP_ENTRY'));
      await expect(
        svc.process(signed({ id: 'evt_x', type: 'customer.created', data: { object: {} } })),
      ).resolves.toMatchObject({ outcome: 'ignored' });
    });

    it('ignores an event with no id or type without touching the database', async () => {
      const db = makeDb();
      const { svc } = makeService(db);
      const res = await svc.process(signed({ type: 'checkout.session.completed' }));
      expect(res).toMatchObject({ processed: false, outcome: 'ignored' });
      expect(db.processedRepo.findOne).not.toHaveBeenCalled();
    });

    it('ignores a handled event type with no data.object (but marks it processed)', async () => {
      const db = makeDb();
      const { svc } = makeService(db);
      const res = await svc.process(signed({ id: 'evt_1', type: 'checkout.session.completed', data: {} }));
      expect(res.outcome).toBe('ignored');
      expect(db.processed.has('evt_1')).toBe(true);
    });

    it('rejects a validly signed but non-JSON body', async () => {
      const db = makeDb();
      const { svc } = makeService(db);
      const rawBody = 'not json';
      await expect(
        svc.process({ rawBody, signatureHeader: signStripePayload(rawBody, SECRET) }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('ignores a checkout session that is neither payment nor subscription', async () => {
      const db = makeDb({ tenants: [{ id: 7 }] });
      const { svc } = makeService(db);
      const res = await svc.process(signed(creditCheckout('evt_1', { mode: 'setup', metadata: { tenantId: '7' } })));
      expect(res.outcome).toBe('ignored');
      expect(db.ledger).toHaveLength(0);
    });
  });

  describe('checkout.session.completed — plan subscription', () => {
    const subCheckout = (over: any = {}) => ({
      id: 'evt_sub',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_sub',
          mode: 'subscription',
          subscription: 'sub_1',
          customer: 'cus_1',
          payment_intent: null,
          amount_total: 4900,
          currency: 'eur',
          metadata: { tenantId: '7', planId: '3', billingCycle: 'yearly' },
          ...over,
        },
      },
    });

    it('records the payment and moves the tenant onto the paid plan', async () => {
      const db = makeDb({ tenants: [{ id: 7, planId: 1, subscriptionStatus: 'grace', graceEndsAt: new Date() }] });
      const { svc } = makeService(db);

      const res = await svc.process(signed(subCheckout()));

      expect(res).toMatchObject({ outcome: 'applied', tenantId: 7 });
      expect(db.payments).toEqual([
        expect.objectContaining({
          tenantId: 7,
          planId: 3,
          type: 'new',
          amount: 49,
          currency: 'EUR',
          billingCycle: 'yearly',
          stripeSubscriptionId: 'sub_1',
          stripeCustomerId: 'cus_1',
          status: 'completed',
        }),
      ]);
      expect(db.tenants.get(7)).toMatchObject({
        planId: 3,
        billingCycle: 'yearly',
        billingSource: 'stripe',
        subscriptionStatus: 'active',
        graceEndsAt: null,
      });
      expect(db.ledger).toHaveLength(0); // never grants credit hours
    });

    it('does nothing without tenantId / planId in metadata', async () => {
      const db = makeDb({ tenants: [{ id: 7, planId: 1 }] });
      const { svc } = makeService(db);
      const res = await svc.process(signed(subCheckout({ metadata: { planId: '3' } })));
      expect(res.outcome).toBe('no-tenant');
      expect(db.payments).toHaveLength(0);
      expect(db.tenants.get(7).planId).toBe(1);
    });
  });

  describe('subscription lifecycle events', () => {
    const subEvent = (id: string, type: string, sub: any) => ({ id, type, data: { object: sub } });

    it('customer.subscription.updated syncs status, cycle, period end and plan for the metadata tenant', async () => {
      const db = makeDb({ tenants: [{ id: 7, planId: 1, graceEndsAt: new Date() }] });
      const { svc } = makeService(db);

      const res = await svc.process(
        signed(
          subEvent('evt_1', 'customer.subscription.updated', {
            id: 'sub_1',
            status: 'active',
            current_period_end: 1_800_000_000,
            items: { data: [{ price: { recurring: { interval: 'month' } } }] },
            metadata: { tenantId: '7', planId: '4' },
          }),
        ),
      );

      expect(res).toMatchObject({ outcome: 'applied', tenantId: 7 });
      expect(db.tenants.get(7)).toMatchObject({
        planId: 4,
        billingCycle: 'monthly',
        billingSource: 'stripe',
        subscriptionStatus: 'active',
        graceEndsAt: null,
        expiresAt: new Date(1_800_000_000 * 1000),
      });
    });

    it.each([
      ['past_due', 'grace'],
      ['unpaid', 'grace'],
      ['canceled', 'expired'],
      ['incomplete_expired', 'expired'],
      ['trialing', 'active'],
    ])('maps Stripe status %s -> %s', async (stripeStatus, expected) => {
      const db = makeDb({ tenants: [{ id: 7, subscriptionStatus: 'active' }] });
      const { svc } = makeService(db);
      await svc.process(
        signed(subEvent('evt_1', 'customer.subscription.updated', { id: 'sub_1', status: stripeStatus, metadata: { tenantId: '7' } })),
      );
      expect(db.tenants.get(7).subscriptionStatus).toBe(expected);
    });

    it('resolves the tenant from an earlier payment when subscription metadata has no tenantId', async () => {
      const db = makeDb({
        tenants: [{ id: 7, subscriptionStatus: 'active' }],
        payments: [{ tenantId: 7, stripeSubscriptionId: 'sub_1', planId: 3 }],
      });
      const { svc } = makeService(db);
      const res = await svc.process(
        signed(subEvent('evt_1', 'customer.subscription.updated', { id: 'sub_1', status: 'past_due', metadata: {} })),
      );
      expect(res).toMatchObject({ outcome: 'applied', tenantId: 7 });
      expect(db.tenants.get(7).subscriptionStatus).toBe('grace');
    });

    it('returns no-tenant (and changes nothing) for a subscription it cannot map', async () => {
      const db = makeDb({ tenants: [{ id: 7, subscriptionStatus: 'active' }] });
      const { svc } = makeService(db);
      const res = await svc.process(
        signed(subEvent('evt_1', 'customer.subscription.updated', { id: 'sub_unknown', status: 'canceled' })),
      );
      expect(res.outcome).toBe('no-tenant');
      expect(db.tenants.get(7).subscriptionStatus).toBe('active');
    });

    it('customer.subscription.deleted expires the tenant at canceled_at', async () => {
      const db = makeDb({ tenants: [{ id: 7, subscriptionStatus: 'active' }] });
      const { svc } = makeService(db);
      await svc.process(
        signed(subEvent('evt_1', 'customer.subscription.deleted', { id: 'sub_1', canceled_at: 1_790_000_000, metadata: { tenantId: '7' } })),
      );
      expect(db.tenants.get(7)).toMatchObject({
        subscriptionStatus: 'expired',
        expiresAt: new Date(1_790_000_000 * 1000),
      });
    });

    // RISK: Stripe does not guarantee delivery order and the handler has no
    // "event.created is older than what we applied" check. A late
    // subscription.updated(active) arriving after subscription.deleted
    // re-activates the tenant.
    it('a late "updated: active" after "deleted" re-activates the tenant (documents current behaviour)', async () => {
      const db = makeDb({ tenants: [{ id: 7, subscriptionStatus: 'active' }] });
      const { svc } = makeService(db);
      await svc.process(signed(subEvent('evt_del', 'customer.subscription.deleted', { id: 'sub_1', metadata: { tenantId: '7' } })));
      await svc.process(
        signed(subEvent('evt_old', 'customer.subscription.updated', { id: 'sub_1', status: 'active', metadata: { tenantId: '7' } })),
      );
      expect(db.tenants.get(7).subscriptionStatus).toBe('active');
    });
  });

  describe('invoices', () => {
    const invoice = (id: string, type: string, over: any = {}) => ({
      id,
      type,
      data: {
        object: {
          subscription: 'sub_1',
          customer: 'cus_1',
          payment_intent: 'pi_inv',
          amount_paid: 4900,
          amount_due: 4900,
          currency: 'eur',
          ...over,
        },
      },
    });

    it('invoice.paid records a renewal for the subscription owner and re-activates', async () => {
      const db = makeDb({
        tenants: [{ id: 7, planId: 3, billingCycle: 'monthly', subscriptionStatus: 'grace', graceEndsAt: new Date() }],
        payments: [{ tenantId: 7, stripeSubscriptionId: 'sub_1', planId: 3 }],
      });
      const { svc } = makeService(db);

      const res = await svc.process(signed(invoice('evt_1', 'invoice.paid')));

      expect(res).toMatchObject({ outcome: 'applied', tenantId: 7 });
      expect(db.payments[1]).toMatchObject({
        tenantId: 7,
        planId: 3,
        type: 'renewal',
        amount: 49,
        currency: 'EUR',
        status: 'completed',
      });
      expect(db.tenants.get(7)).toMatchObject({ subscriptionStatus: 'active', graceEndsAt: null });
    });

    it('invoice.payment_failed puts the tenant in grace for STRIPE_GRACE_DAYS', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-10-03T00:00:00Z'));
      try {
        const db = makeDb({
          tenants: [{ id: 7, planId: 3, subscriptionStatus: 'active' }],
          payments: [{ tenantId: 7, stripeSubscriptionId: 'sub_1', planId: 3 }],
        });
        const { svc } = makeService(db, { STRIPE_GRACE_DAYS: '3' });

        await svc.process(signed(invoice('evt_1', 'invoice.payment_failed')));

        expect(db.payments[1]).toMatchObject({ status: 'failed', type: 'renewal' });
        expect(db.tenants.get(7)).toMatchObject({
          subscriptionStatus: 'grace',
          graceEndsAt: new Date('2026-10-06T00:00:00Z'),
        });
      } finally {
        jest.useRealTimers();
      }
    });

    it.each(['invoice.paid', 'invoice.payment_failed'])(
      '%s for an unknown subscription changes nothing',
      async (type) => {
        const db = makeDb({ tenants: [{ id: 7, subscriptionStatus: 'active' }] });
        const { svc } = makeService(db);
        const res = await svc.process(signed(invoice('evt_1', type, { subscription: 'sub_other' })));
        expect(res.outcome).toBe('no-tenant');
        expect(db.payments).toHaveLength(0);
      },
    );

    it('invoice.paid without a subscription (one-off invoice) is ignored', async () => {
      const db = makeDb();
      const { svc } = makeService(db);
      const res = await svc.process(signed(invoice('evt_1', 'invoice.paid', { subscription: null })));
      expect(res.outcome).toBe('ignored');
      expect(db.payments).toHaveLength(0);
    });
  });
});
