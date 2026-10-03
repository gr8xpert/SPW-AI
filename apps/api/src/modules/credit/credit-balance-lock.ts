import type { EntityManager } from 'typeorm';
import { CreditBalance } from '../../database/entities';

function isDuplicateKey(err: unknown): boolean {
  const e = err as { code?: string; driverError?: { code?: string } } | null;
  return e?.code === 'ER_DUP_ENTRY' || e?.driverError?.code === 'ER_DUP_ENTRY';
}

// Creates the tenant's balance row at zero unless it already exists.
// credit_balances.tenantId is UNIQUE, so when two requests both find no row
// and both insert, one hits a duplicate key — which just means the row is
// there now. In MySQL that failed statement doesn't abort the transaction.
export async function ensureCreditBalanceRow(manager: EntityManager, tenantId: number): Promise<void> {
  try {
    await manager.insert(CreditBalance, { tenantId, balance: 0 });
  } catch (err) {
    if (!isDuplicateKey(err)) throw err;
  }
}

// The tenant's balance row, locked (SELECT … FOR UPDATE) until the caller's
// transaction ends, so concurrent credit changes queue up instead of each
// reading the same balance and the last save silently wiping the others.
//
// The existence check is a plain read on purpose: a locking read of a row
// that isn't there takes a gap lock in InnoDB, and two first-time creators
// holding the same gap lock would deadlock on their inserts.
//
// Must run inside a transaction. With `create: false` returns null when the
// tenant has no balance row yet.
export async function lockCreditBalance(
  manager: EntityManager,
  tenantId: number,
  opts: { create: boolean },
): Promise<CreditBalance | null> {
  const exists = await manager.findOne(CreditBalance, { where: { tenantId }, select: ['id'] });
  if (!exists) {
    if (!opts.create) return null;
    await ensureCreditBalanceRow(manager, tenantId);
  }
  return manager.findOne(CreditBalance, {
    where: { tenantId },
    lock: { mode: 'pessimistic_write' },
  });
}
