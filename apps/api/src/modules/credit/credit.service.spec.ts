import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CreditBalance, CreditTransaction } from '../../database/entities';
import { CreditService } from './credit.service';

// Plain-object mocks, matching the other specs in this app: the service is
// built with `new` and each TypeORM collaborator is a bag of jest.fn()s.
// The fake queryRunner keeps the balance row in memory so the maths can be
// checked end to end (read -> add/subtract -> save -> ledger row).

function makeQueryRunner(balanceRow: { tenantId: number; balance: any } | null) {
  const saved: any[] = [];
  const manager = {
    findOne: jest.fn(async (entity: any, _opts: any) =>
      entity === CreditBalance ? balanceRow : null,
    ),
    create: jest.fn((entity: any, data: any) => ({ __entity: entity, ...data })),
    save: jest.fn(async (row: any) => {
      saved.push({ ...row });
      return row;
    }),
  };
  const qr = {
    manager,
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
  };
  return { qr, manager, saved };
}

function makeService(opts: {
  balanceRow?: { tenantId: number; balance: any } | null;
  tenant?: any;
  ticket?: any;
} = {}) {
  const { qr, manager, saved } = makeQueryRunner(opts.balanceRow ?? null);
  const creditBalanceRepository = {
    findOne: jest.fn(),
    create: jest.fn((d: any) => ({ ...d })),
    save: jest.fn(async (r: any) => r),
    find: jest.fn().mockResolvedValue([]),
  };
  const creditTransactionRepository = {
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    createQueryBuilder: jest.fn(),
  };
  const tenantRepository = {
    findOne: jest.fn().mockResolvedValue(
      opts.tenant === undefined ? { id: 7, name: 'T' } : opts.tenant,
    ),
    find: jest.fn().mockResolvedValue([]),
  };
  const ticketRepository = {
    findOne: jest.fn().mockResolvedValue(opts.ticket ?? null),
  };
  const dataSource = { createQueryRunner: jest.fn(() => qr) };

  const svc = new CreditService(
    creditBalanceRepository as any,
    creditTransactionRepository as any,
    tenantRepository as any,
    ticketRepository as any,
    dataSource as any,
  );
  return {
    svc,
    qr,
    manager,
    saved,
    creditBalanceRepository,
    creditTransactionRepository,
    tenantRepository,
    ticketRepository,
    dataSource,
  };
}

const ledgerRows = (saved: any[]) => saved.filter((r) => r.__entity === CreditTransaction);

describe('CreditService', () => {
  describe('getBalance', () => {
    it('reads the balance scoped to the tenant and coerces DECIMAL strings to numbers', async () => {
      const t = makeService();
      t.creditBalanceRepository.findOne.mockResolvedValue({ tenantId: 7, balance: '12.50' });

      await expect(t.svc.getBalance(7)).resolves.toEqual({ balance: 12.5, tenantId: 7 });
      expect(t.creditBalanceRepository.findOne).toHaveBeenCalledWith({ where: { tenantId: 7 } });
    });

    it('creates a zero balance row for a tenant that has none', async () => {
      const t = makeService();
      t.creditBalanceRepository.findOne.mockResolvedValue(null);

      await expect(t.svc.getBalance(9)).resolves.toEqual({ balance: 0, tenantId: 9 });
      expect(t.creditBalanceRepository.save).toHaveBeenCalledWith({ tenantId: 9, balance: 0 });
    });
  });

  describe('getHistory', () => {
    it('maps signed ledger amounts to add/deduct with a positive amount, tenant-scoped and paged', async () => {
      const t = makeService();
      const createdAt = new Date('2026-10-01T00:00:00Z');
      t.creditTransactionRepository.findAndCount.mockResolvedValue([
        [
          { id: 1, amount: '5.00', type: 'purchase', description: 'Bought', createdByUser: null, createdAt },
          { id: 2, amount: '-1.25', type: 'consume', description: null, createdByUser: { email: 'a@b.c' }, createdAt },
        ],
        41,
      ] as any);

      const res = await t.svc.getHistory(7, 3, 20);

      expect(t.creditTransactionRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: 7 }, skip: 40, take: 20 }),
      );
      expect(res.data).toEqual([
        { id: 1, type: 'add', amount: 5, reason: 'Bought', performedBy: 'system', createdAt },
        { id: 2, type: 'deduct', amount: 1.25, reason: 'Credit consume', performedBy: 'a@b.c', createdAt },
      ]);
      expect(res.totalPages).toBe(3);
    });
  });

  describe('adjustCredits (super admin)', () => {
    it('adds a positive amount and writes an adjustment ledger row with a positive delta', async () => {
      const t = makeService({ balanceRow: { tenantId: 7, balance: '10.00' } });

      const res = await t.svc.adjustCredits(7, { amount: 2.5, type: 'add', reason: 'Goodwill' }, 99);

      expect(res.balance).toBe(12.5);
      expect(t.manager.findOne).toHaveBeenCalledWith(CreditBalance, { where: { tenantId: 7 } });
      const [tx] = ledgerRows(t.saved);
      expect(tx).toMatchObject({
        tenantId: 7,
        type: 'adjustment',
        amount: 2.5,
        balanceAfter: 12.5,
        description: 'Goodwill',
        createdBy: 99,
      });
      expect(t.qr.commitTransaction).toHaveBeenCalledTimes(1);
      expect(t.qr.rollbackTransaction).not.toHaveBeenCalled();
      expect(t.qr.release).toHaveBeenCalledTimes(1);
    });

    it('deducts and stores a negative delta in the ledger', async () => {
      const t = makeService({ balanceRow: { tenantId: 7, balance: 10 } });

      const res = await t.svc.adjustCredits(7, { amount: 4, type: 'deduct', reason: 'Cash refund' }, 99);

      expect(res.balance).toBe(6);
      const [tx] = ledgerRows(t.saved);
      expect(tx.amount).toBe(-4);
      expect(tx.balanceAfter).toBe(6);
    });

    // The UI sends a positive amount + type flag. A negative amount must not
    // flip the direction (e.g. "add -5" must still add 5, never subtract).
    it.each([
      ['add', -3, 13],
      ['deduct', -3, 7],
    ] as const)('ignores the sign of amount: type=%s amount=%s -> balance %s', async (type, amount, expected) => {
      const t = makeService({ balanceRow: { tenantId: 7, balance: 10 } });
      const res = await t.svc.adjustCredits(7, { amount, type, reason: 'x' }, 1);
      expect(res.balance).toBe(expected);
    });

    it('allows deducting down to exactly zero', async () => {
      const t = makeService({ balanceRow: { tenantId: 7, balance: '3.00' } });
      const res = await t.svc.adjustCredits(7, { amount: 3, type: 'deduct', reason: 'x' }, 1);
      expect(res.balance).toBe(0);
    });

    it('refuses to take the balance below zero, rolls back and writes nothing', async () => {
      const t = makeService({ balanceRow: { tenantId: 7, balance: 2 } });

      await expect(
        t.svc.adjustCredits(7, { amount: 2.01, type: 'deduct', reason: 'x' }, 1),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(t.manager.save).not.toHaveBeenCalled();
      expect(t.qr.rollbackTransaction).toHaveBeenCalledTimes(1);
      expect(t.qr.commitTransaction).not.toHaveBeenCalled();
      expect(t.qr.release).toHaveBeenCalledTimes(1);
    });

    it('creates the balance row from zero when the tenant has none', async () => {
      const t = makeService({ balanceRow: null });

      const res = await t.svc.adjustCredits(7, { amount: 5, type: 'add', reason: 'x' }, 1);

      expect(res.balance).toBe(5);
      expect(t.manager.create).toHaveBeenCalledWith(CreditBalance, { tenantId: 7, balance: 0 });
    });

    it('rejects a deduct on a tenant with no balance row (0 - n < 0)', async () => {
      const t = makeService({ balanceRow: null });
      await expect(
        t.svc.adjustCredits(7, { amount: 1, type: 'deduct', reason: 'x' }, 1),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws NotFound for an unknown tenant before opening a transaction', async () => {
      const t = makeService({ tenant: null });

      await expect(
        t.svc.adjustCredits(404, { amount: 1, type: 'add', reason: 'x' }, 1),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(t.tenantRepository.findOne).toHaveBeenCalledWith({ where: { id: 404 } });
      expect(t.dataSource.createQueryRunner).not.toHaveBeenCalled();
    });

    it('rolls back and releases when the ledger write fails', async () => {
      const t = makeService({ balanceRow: { tenantId: 7, balance: 10 } });
      t.manager.save
        .mockImplementationOnce(async (r: any) => r) // balance
        .mockRejectedValueOnce(new Error('db down')); // ledger

      await expect(
        t.svc.adjustCredits(7, { amount: 1, type: 'add', reason: 'x' }, 1),
      ).rejects.toThrow('db down');
      expect(t.qr.rollbackTransaction).toHaveBeenCalledTimes(1);
      expect(t.qr.commitTransaction).not.toHaveBeenCalled();
      expect(t.qr.release).toHaveBeenCalledTimes(1);
    });
  });

  describe('addPurchasedCredits', () => {
    it('adds hours to a DECIMAL-string balance numerically (no string concat) and logs a purchase row', async () => {
      const t = makeService({ balanceRow: { tenantId: 7, balance: '10.00' } });

      const res = await t.svc.addPurchasedCredits(7, 5, 'pi_123', 3);

      expect(res.balance).toBe(15);
      expect(t.manager.findOne).toHaveBeenCalledWith(CreditBalance, { where: { tenantId: 7 } });
      const [tx] = ledgerRows(t.saved);
      expect(tx).toMatchObject({
        tenantId: 7,
        type: 'purchase',
        amount: 5,
        balanceAfter: 15,
        paymentReference: 'pi_123',
        createdBy: 3,
      });
      expect(t.qr.commitTransaction).toHaveBeenCalledTimes(1);
    });

    it('starts from zero for a tenant with no balance row', async () => {
      const t = makeService({ balanceRow: null });
      const res = await t.svc.addPurchasedCredits(8, 10, 'pi_x', 1);
      expect(res.balance).toBe(10);
      expect(ledgerRows(t.saved)[0]).toMatchObject({ tenantId: 8, amount: 10, balanceAfter: 10 });
    });

    // Documents current behaviour: there is no guard on `hours` here and no
    // dedup on paymentReference. The only caller-side protection is the DTO /
    // webhook idempotency. Calling it twice with the same reference credits twice.
    it('does NOT dedupe on paymentReference (documents current behaviour)', async () => {
      const row = { tenantId: 7, balance: 0 };
      const t = makeService({ balanceRow: row });
      await t.svc.addPurchasedCredits(7, 5, 'pi_same', 1);
      const res = await t.svc.addPurchasedCredits(7, 5, 'pi_same', 1);
      expect(res.balance).toBe(10);
    });
  });

  describe('consumeCredits', () => {
    it('subtracts hours and writes a negative consume row linked to the ticket', async () => {
      const t = makeService({
        balanceRow: { tenantId: 7, balance: '4.00' },
        ticket: { id: 55, tenantId: 7, category: 'support' },
      });

      const res = await t.svc.consumeCredits(7, { hours: 1.5, ticketId: 55 }, 2);

      expect(res.balance).toBe(2.5);
      expect(t.ticketRepository.findOne).toHaveBeenCalledWith({ where: { id: 55, tenantId: 7 } });
      expect(ledgerRows(t.saved)[0]).toMatchObject({
        tenantId: 7,
        type: 'consume',
        amount: -1.5,
        balanceAfter: 2.5,
        ticketId: 55,
        createdBy: 2,
      });
    });

    it('rejects when hours exceed the balance and writes nothing', async () => {
      const t = makeService({ balanceRow: { tenantId: 7, balance: 1 } });

      await expect(t.svc.consumeCredits(7, { hours: 1.25 }, 2)).rejects.toThrow('Insufficient credits');
      expect(t.manager.save).not.toHaveBeenCalled();
      expect(t.qr.rollbackTransaction).toHaveBeenCalledTimes(1);
      expect(t.qr.release).toHaveBeenCalledTimes(1);
    });

    it('allows consuming the exact remaining balance', async () => {
      const t = makeService({ balanceRow: { tenantId: 7, balance: 2 } });
      await expect(t.svc.consumeCredits(7, { hours: 2 }, 2)).resolves.toMatchObject({ balance: 0 });
    });

    it('rejects a tenant with no balance row', async () => {
      const t = makeService({ balanceRow: null });
      await expect(t.svc.consumeCredits(7, { hours: 1 }, 2)).rejects.toThrow('No credit balance found');
    });

    it("rejects a ticket from another tenant (lookup is tenant-scoped)", async () => {
      const t = makeService({ balanceRow: { tenantId: 7, balance: 10 }, ticket: null });

      await expect(t.svc.consumeCredits(7, { hours: 1, ticketId: 999 }, 2)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(t.ticketRepository.findOne).toHaveBeenCalledWith({ where: { id: 999, tenantId: 7 } });
      expect(t.dataSource.createQueryRunner).not.toHaveBeenCalled();
    });

    it('never charges for bug tickets', async () => {
      const t = makeService({
        balanceRow: { tenantId: 7, balance: 10 },
        ticket: { id: 1, tenantId: 7, category: 'bug' },
      });
      await expect(t.svc.consumeCredits(7, { hours: 1, ticketId: 1 }, 2)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(t.dataSource.createQueryRunner).not.toHaveBeenCalled();
    });

    // RISK (not a test failure): the service itself does not reject a negative
    // `hours`; only ConsumeCreditDto's @Min(0.25) does. A negative value that
    // bypassed the ValidationPipe would ADD credits under a 'consume' row.
    it('relies on the DTO for hours > 0: a negative value would add credits (documents current behaviour)', async () => {
      const t = makeService({ balanceRow: { tenantId: 7, balance: 1 } });
      const res = await t.svc.consumeCredits(7, { hours: -5 } as any, 2);
      expect(res.balance).toBe(6);
    });
  });

  describe('getAllBalances', () => {
    it('joins balances and last activity per tenant, defaulting to 0 / null', async () => {
      const t = makeService();
      t.tenantRepository.find.mockResolvedValue([
        { id: 1, name: 'A', slug: 'a' },
        { id: 2, name: 'B', slug: 'b' },
      ]);
      t.creditBalanceRepository.find.mockResolvedValue([{ tenantId: 1, balance: '7.75' }]);
      const when = new Date('2026-09-01T00:00:00Z');
      const qb: any = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([{ tenantId: '1', lastActivity: when }]),
      };
      t.creditTransactionRepository.createQueryBuilder.mockReturnValue(qb);

      const res = await t.svc.getAllBalances();

      expect(res).toEqual([
        { tenantId: 1, tenantName: 'A', slug: 'a', balance: 7.75, lastActivity: when },
        { tenantId: 2, tenantName: 'B', slug: 'b', balance: 0, lastActivity: null },
      ]);
    });
  });
});
