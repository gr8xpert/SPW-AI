import { ForbiddenException } from '@nestjs/common';
import { PropertyQuotaService } from './property-quota.service';

// Hand-rolled mocks rather than @nestjs/testing — fewer moving parts and
// the service has zero injection beyond three repositories.
function makeRepo<T = unknown>(initial: Partial<{
  findOne: (q: unknown) => Promise<T | null>;
  count: (q: unknown) => Promise<number>;
}> = {}) {
  return {
    findOne: initial.findOne ?? (async () => null),
    count: initial.count ?? (async () => 0),
  };
}

function makeService(opts: {
  propertyCount?: number;
  tenant?: { planId?: number; isInternal?: boolean; adminOverride?: boolean } | null;
  planMax?: number | null;
}) {
  const propertyRepo = makeRepo({ count: async () => opts.propertyCount ?? 0 });
  const tenantRepo = makeRepo({
    findOne: async () =>
      opts.tenant === undefined
        ? { id: 1, planId: 1, isInternal: false, adminOverride: false }
        : opts.tenant === null
          ? null
          : { id: 1, planId: 1, isInternal: false, adminOverride: false, ...opts.tenant },
  });
  const planRepo = makeRepo({
    findOne: async () =>
      opts.planMax === null ? null : { id: 1, maxProperties: opts.planMax ?? 100 },
  });

  return new PropertyQuotaService(
    propertyRepo as any,
    tenantRepo as any,
    planRepo as any,
  );
}

describe('PropertyQuotaService', () => {
  it('returns { used, limit, remaining } from plan + count', async () => {
    const svc = makeService({ propertyCount: 30, planMax: 100 });
    const result = await svc.checkQuota(1);
    expect(result).toEqual({ used: 30, limit: 100, remaining: 70 });
  });

  it('treats internal tenants as infinite', async () => {
    const svc = makeService({
      propertyCount: 99999,
      tenant: { isInternal: true },
    });
    const result = await svc.checkQuota(1);
    expect(result.limit).toBe(Number.POSITIVE_INFINITY);
    expect(result.remaining).toBe(Number.POSITIVE_INFINITY);
  });

  it('treats adminOverride tenants as infinite', async () => {
    const svc = makeService({
      propertyCount: 99999,
      tenant: { adminOverride: true },
    });
    const result = await svc.checkQuota(1);
    expect(result.limit).toBe(Number.POSITIVE_INFINITY);
  });

  it('falls back to 100 when plan has no maxProperties row', async () => {
    const svc = makeService({ propertyCount: 0, planMax: null });
    const result = await svc.checkQuota(1);
    expect(result.limit).toBe(100);
  });

  it('assertCanCreate throws ForbiddenException with PLAN_QUOTA_EXCEEDED when over budget', async () => {
    const svc = makeService({ propertyCount: 100, planMax: 100 });
    await expect(svc.assertCanCreate(1, 1)).rejects.toThrow(ForbiddenException);
  });

  it('assertCanCreate passes when budget allows', async () => {
    const svc = makeService({ propertyCount: 50, planMax: 100 });
    await expect(svc.assertCanCreate(1, 1)).resolves.toBeUndefined();
  });

  it('reserveSlots clamps to remaining', async () => {
    const svc = makeService({ propertyCount: 90, planMax: 100 });
    expect(await svc.reserveSlots(1, 50)).toBe(10);
  });

  it('reserveSlots returns full count for infinite limits', async () => {
    const svc = makeService({
      propertyCount: 0,
      tenant: { isInternal: true },
    });
    expect(await svc.reserveSlots(1, 50_000)).toBe(50_000);
  });
});
