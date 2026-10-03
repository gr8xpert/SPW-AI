import { LocationController } from './location.controller';

// Location writes from the dashboard change public names/tree, so each one
// ends with a single syncVersion bump once all its writes are done.

function setup() {
  const events: string[] = [];
  const locationService = {
    mergeLocations: jest.fn(async (_t: number, _s: number, targetId: number) => {
      events.push('merge');
      return { id: targetId };
    }),
    rememberOrigins: jest.fn(async () => void events.push('rememberOrigins')),
    bulkMove: jest.fn(async (_t: number, ids: number[]) => {
      events.push('bulkMove');
      return { count: ids.length, merged: 0 };
    }),
    markUserLocked: jest.fn(async () => void events.push('markUserLocked')),
    bulkDelete: jest.fn(async (_t: number, ids: number[]) => ({ count: ids.length })),
  };
  const tenantService = {
    bumpSyncVersionSafely: jest.fn(async () => void events.push('bump')),
  };
  const controller = new LocationController(
    locationService as any,
    {} as any,
    {} as any,
    tenantService as any,
  );
  return { controller, events, tenantService };
}

describe('LocationController syncVersion bump', () => {
  it('merge bumps once, after the merge is written', async () => {
    const { controller, events, tenantService } = setup();

    await controller.merge(4, 10, { targetId: 20 } as any);

    expect(tenantService.bumpSyncVersionSafely).toHaveBeenCalledTimes(1);
    expect(tenantService.bumpSyncVersionSafely).toHaveBeenCalledWith(4, expect.any(String));
    expect(events).toEqual(['merge', 'bump']);
  });

  it('a failed merge does not bump', async () => {
    const { controller, tenantService } = setup();
    (controller as any).locationService.mergeLocations = async () => {
      throw new Error('Location not found');
    };

    await expect(controller.merge(4, 10, { targetId: 20 } as any)).rejects.toThrow('Location not found');
    expect(tenantService.bumpSyncVersionSafely).not.toHaveBeenCalled();
  });

  it('bulk move bumps once after the move and the lock, not per row', async () => {
    const { controller, events, tenantService } = setup();

    await controller.bulkMove(4, { ids: [1, 2, 3], parentId: 9 });

    expect(tenantService.bumpSyncVersionSafely).toHaveBeenCalledTimes(1);
    expect(events).toEqual(['rememberOrigins', 'bulkMove', 'markUserLocked', 'bump']);
  });

  it('an empty bulk delete is a no-op and does not bump', async () => {
    const { controller, tenantService } = setup();

    await controller.bulkDelete(4, { ids: [] });

    expect(tenantService.bumpSyncVersionSafely).not.toHaveBeenCalled();
  });
});
