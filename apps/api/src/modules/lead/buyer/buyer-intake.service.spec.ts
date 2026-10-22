import { DEFAULT_BUYER_MATCH_SETTINGS } from '@spm/shared';
import { BuyerIntakeService } from './buyer-intake.service';

// In-memory stand-ins for the repositories the intake touches.
function setup(opts: { existing?: Record<string, unknown> | null; settings?: Record<string, unknown> } = {}) {
  const leads: Record<string, unknown>[] = opts.existing ? [{ id: 7, tenantId: 1, contactId: 3, ...opts.existing }] : [];
  const activities: Record<string, unknown>[] = [];
  const updates: [number, Record<string, unknown>][] = [];
  const leadRepo = {
    findOne: jest.fn(async ({ where }: { where: Record<string, unknown> }) => leads.find((l) => l.contactId === where.contactId || l.id === where.id) ?? null),
    create: jest.fn((x: Record<string, unknown>) => x),
    save: jest.fn(async (x: Record<string, unknown>) => {
      const row = { id: 50, ...x };
      leads.push(row);
      return row;
    }),
    update: jest.fn(async (id: number | { id: number }, patch: Record<string, unknown>) => {
      updates.push([typeof id === 'number' ? id : id.id, patch]);
    }),
  };
  const activityRepo = {
    create: jest.fn((x: Record<string, unknown>) => x),
    save: jest.fn(async (x: Record<string, unknown>) => activities.push(x)),
    count: jest.fn(async () => 0),
  };
  const propertyRepo = {
    find: jest.fn(async () => [
      { id: 11, reference: 'R1', title: 'Villa', listingType: 'sale', propertyTypeId: 4, locationId: 9, price: '500000.00', priceTo: null, priceOnRequest: false, bedrooms: 3, currency: 'EUR' },
    ]),
  };
  const locationRepo = { find: jest.fn(async () => [{ id: 9, parentId: 2, level: 'town' }]) };
  const userRepo = { find: jest.fn(async () => [{ id: 21 }, { id: 22 }]) };
  const manager = {
    update: jest.fn(async (_e: unknown, where: { id: number }, patch: Record<string, unknown>) => updates.push([where.id, patch])),
    create: jest.fn((_e: unknown, x: Record<string, unknown>) => x),
    save: jest.fn(async (x: Record<string, unknown>) => activities.push(x)),
  };
  const dataSource = { manager, query: jest.fn(async () => []), createQueryRunner: jest.fn() };
  const contacts = { findOrCreate: jest.fn(async () => ({ id: 3 })) };
  const stages = { defaultStageId: jest.fn(async () => 100) };
  const settings = { get: jest.fn(async () => ({ ...DEFAULT_BUYER_MATCH_SETTINGS, ...opts.settings })) };
  const questions = { list: jest.fn(async () => []), clean: jest.fn(async () => ({})) };
  const service = new BuyerIntakeService(
    leadRepo as never, activityRepo as never, propertyRepo as never, locationRepo as never, userRepo as never, dataSource as never,
    contacts as never, stages as never, settings as never, questions as never, { record: jest.fn(async () => undefined) } as never,
  );
  const wishlistWrites = () => updates.filter(([, p]) => 'wishlist' in p).map(([, p]) => p.wishlist);
  return { service, activities, updates, wishlistWrites, manager };
}

const enquiry = { email: 'Ana@X.es', name: 'Ana Lopez', message: 'Hi', propertyIds: [11], source: 'widget_inquiry' as const, kind: 'enquiry' as const };

describe('BuyerIntakeService.upsertFromWebsite', () => {
  it('creates a buyer with a guessed wishlist and gives it the default agent', async () => {
    const { service, activities, wishlistWrites, manager } = setup({ settings: { defaultAgentId: 22 } });
    const { created } = await service.upsertFromWebsite(1, enquiry);
    expect(created).toBe(true);
    expect(wishlistWrites()[0]).toMatchObject({ listingTypes: ['sale'], locationIds: [9], budgetMin: 400000, budgetMax: 600000, minBedrooms: 3, guessed: true });
    expect(manager.update).toHaveBeenCalledWith(expect.anything(), { id: 50 }, { assignedTo: 22 });
    const types = activities.map((a) => a.type);
    expect(types).toEqual(['enquiry', 'assignment']);
    expect(activities[0]).toMatchObject({ description: 'Hi', metadata: { propertyId: 11, reference: 'R1', guessedWishlist: true } });
    expect(activities[1].metadata).toEqual({ from: null, to: 22, auto: true, mode: 'default' });
  });

  it('never touches a wishlist the agent set, and never reassigns an existing buyer', async () => {
    const { service, wishlistWrites, manager } = setup({ existing: { wishlist: { minBedrooms: 5, guessed: false } }, settings: { defaultAgentId: 22 } });
    const { created } = await service.upsertFromWebsite(1, enquiry);
    expect(created).toBe(false);
    expect(wishlistWrites()).toEqual([]);
    expect(manager.update).not.toHaveBeenCalled();
  });

  it('merges a new guess into an earlier guess', async () => {
    const { service, wishlistWrites } = setup({ existing: { wishlist: { listingTypes: ['rent'], locationIds: [5], minBedrooms: 2, guessed: true } } });
    await service.upsertFromWebsite(1, enquiry);
    expect(wishlistWrites()[0]).toMatchObject({ listingTypes: ['rent', 'sale'], locationIds: [5, 9], minBedrooms: 2, guessed: true });
  });

  it('leaves a new buyer unassigned when the default agent is gone', async () => {
    const { service, manager } = setup({ settings: { defaultAgentId: 99 } });
    await service.upsertFromWebsite(1, enquiry);
    expect(manager.update).not.toHaveBeenCalled();
  });
});
