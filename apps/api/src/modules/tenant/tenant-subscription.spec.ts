import { isTenantSubscriptionValid } from './tenant.service';
import type { Tenant } from '../../database/entities';

// Minimal stub builder — only the fields isTenantSubscriptionValid actually
// reads. Returning `as Tenant` is fine because the function's signature
// only touches subscriptionStatus / expiresAt / graceEndsAt / overrides.
function tenant(over: Partial<Tenant> = {}): Tenant {
  return {
    adminOverride: false,
    isInternal: false,
    subscriptionStatus: 'active',
    expiresAt: null,
    graceEndsAt: null,
    ...over,
  } as Tenant;
}

describe('isTenantSubscriptionValid', () => {
  const now = new Date('2026-05-13T12:00:00Z');
  const pastDate = new Date(now.getTime() - 24 * 3600_000);
  const futureDate = new Date(now.getTime() + 24 * 3600_000);

  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(now);
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  it('always valid for admin override', () => {
    expect(
      isTenantSubscriptionValid(
        tenant({ adminOverride: true, subscriptionStatus: 'expired', expiresAt: pastDate }),
      ),
    ).toBe(true);
  });

  it('always valid for internal accounts', () => {
    expect(
      isTenantSubscriptionValid(
        tenant({ isInternal: true, subscriptionStatus: 'expired', expiresAt: pastDate }),
      ),
    ).toBe(true);
  });

  it('valid when status=active and no expiry set', () => {
    expect(isTenantSubscriptionValid(tenant())).toBe(true);
  });

  it('valid when future expiry', () => {
    expect(
      isTenantSubscriptionValid(tenant({ expiresAt: futureDate })),
    ).toBe(true);
  });

  it('invalid when subscriptionStatus is expired', () => {
    expect(
      isTenantSubscriptionValid(tenant({ subscriptionStatus: 'expired' })),
    ).toBe(false);
  });

  it('invalid when expiresAt is in the past and not in grace', () => {
    expect(
      isTenantSubscriptionValid(tenant({ expiresAt: pastDate })),
    ).toBe(false);
  });

  it('valid when expired but inside grace window', () => {
    expect(
      isTenantSubscriptionValid(
        tenant({ expiresAt: pastDate, graceEndsAt: futureDate }),
      ),
    ).toBe(true);
  });

  it('invalid when both expiresAt and graceEndsAt are past', () => {
    expect(
      isTenantSubscriptionValid(
        tenant({ expiresAt: pastDate, graceEndsAt: pastDate }),
      ),
    ).toBe(false);
  });
});
