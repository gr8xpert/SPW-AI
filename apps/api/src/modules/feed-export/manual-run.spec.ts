import { ExportFeedsController } from './export-feeds.controller';
import { BadRequestException, ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { FeedExportConfigController } from './feed-export.controller';
import { FeedExportService } from './feed-export.service';
import { IdealistaConfigController } from './idealista-feed.controller';
import { IdealistaFeedService } from './idealista-feed.service';
import { RightmoveConfigController } from './rightmove/rightmove.controller';
import { RightmoveSyncService } from './rightmove/rightmove-sync.service';
import { RolesGuard } from '../../common/guards';

const TENANT = 2;

// Runs the job like the real lock, or refuses like a held lock / dead Redis.
function lockMock(state: 'free' | 'held' | 'down' = 'free') {
  return {
    withLock: jest.fn(async (_key: string, _ttl: number, fn: () => Promise<unknown>) => {
      if (state === 'held') return { acquired: false };
      if (state === 'down') return { acquired: false, error: true };
      return { acquired: true, result: await fn() };
    }),
    isHeld: jest.fn(async () => false),
  };
}

function repoMock(row: unknown = null) {
  return {
    findOne: jest.fn(async () => row),
    find: jest.fn(async () => []),
    create: jest.fn((v: unknown) => v),
    save: jest.fn(async (v: unknown) => v),
  };
}

function feedExportService(config: unknown, lock = lockMock()) {
  const configRepo = repoMock(config);
  const logRepo = repoMock();
  const empty = () => repoMock();
  const service = new (FeedExportService as any)(
    configRepo, logRepo, empty(), empty(), empty(), empty(), empty(), empty(), {}, {}, lock,
  ) as FeedExportService;
  jest.spyOn(service as any, 'fullListingBatches').mockImplementation(async function* () {});
  jest.spyOn(service as any, 'loadLookups').mockResolvedValue({ locations: new Map(), types: new Map(), features: new Map() });
  return { service, configRepo, logRepo, lock };
}

const urlConfig = (over: object = {}) => ({
  tenantId: TENANT,
  isEnabled: true,
  allowedFormats: ['xml', 'json'],
  includeUnpublished: false,
  includeSold: false,
  listingScope: 'all',
  jsonFeed: { enabled: true },
  ...over,
});

describe('Kyero and JSON Push Now', () => {
  it('refuses a feed never saved, without building anything', async () => {
    const { service, lock } = feedExportService(null);
    await expect(service.runNow(TENANT, 'xml', '', '')).rejects.toBeInstanceOf(BadRequestException);
    expect(lock.withLock).not.toHaveBeenCalled();
  });

  it('checks each feed against its own switch', async () => {
    const off = feedExportService(urlConfig({ isEnabled: false }));
    await expect(off.service.runNow(TENANT, 'xml', '', '')).rejects.toBeInstanceOf(BadRequestException);
    await expect(off.service.runNow(TENANT, 'json', '', '')).resolves.toEqual({ listings: 0, skipped: 0 });
    const jsonOff = feedExportService(urlConfig({ jsonFeed: { enabled: false } }));
    await expect(jsonOff.service.runNow(TENANT, 'json', '', '')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('answers 400, not 401, for a format the client may not use', async () => {
    const { service } = feedExportService(urlConfig({ allowedFormats: ['json'] }));
    await expect(service.runNow(TENANT, 'xml', '', '')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a second press while one runs, and says so if Redis is down', async () => {
    const held = feedExportService(urlConfig(), lockMock('held'));
    await expect(held.service.runNow(TENANT, 'xml', '', '')).rejects.toBeInstanceOf(ConflictException);
    const down = feedExportService(urlConfig(), lockMock('down'));
    await expect(down.service.runNow(TENANT, 'xml', '', '')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('reads and logs for the calling tenant only, marked manual', async () => {
    const { service, configRepo, logRepo, lock } = feedExportService(urlConfig());
    await service.runNow(TENANT, 'json', '1.2.3.4', 'browser');
    expect(configRepo.findOne).toHaveBeenCalledWith({ where: { tenantId: TENANT } });
    expect(lock.withLock.mock.calls[0][0]).toBe(`feed-export:run:json:${TENANT}`);
    expect(logRepo.save).toHaveBeenCalledWith(expect.objectContaining({ tenantId: TENANT, format: 'json', trigger: 'manual' }));
  });

  it('still logs a portal read as a read', async () => {
    const { service, logRepo } = feedExportService(urlConfig());
    await service.exportProperties(TENANT, urlConfig() as any, 'json', '', '');
    expect(logRepo.save).toHaveBeenCalledWith(expect.objectContaining({ trigger: 'read' }));
  });
});

describe('idealista Push Now', () => {
  function idealista(config: unknown, lock = lockMock()) {
    const logRepo = repoMock();
    const service = new (IdealistaFeedService as any)(
      {}, repoMock(config), logRepo, repoMock(), repoMock(), repoMock(), repoMock(), repoMock(), repoMock(), lock,
    ) as IdealistaFeedService;
    jest.spyOn(service as any, 'build').mockResolvedValue({ included: 3, skipped: [{}], issues: [], feed: {} });
    return { service, logRepo, lock };
  }

  it('refuses when never saved, off, or without a feed URL', async () => {
    for (const config of [null, { idealista: { enabled: false, feedKey: 'idl_x' } }, { idealista: { enabled: true } }]) {
      await expect(idealista(config).service.runNow(TENANT, '', '')).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('refuses a second press', async () => {
    const { service } = idealista({ idealista: { enabled: true, feedKey: 'idl_x' } }, lockMock('held'));
    await expect(service.runNow(TENANT, '', '')).rejects.toBeInstanceOf(ConflictException);
  });

  it('reports the counts and logs a manual row', async () => {
    const { service, logRepo } = idealista({ idealista: { enabled: true, feedKey: 'idl_x' } });
    await expect(service.runNow(TENANT, '', '')).resolves.toEqual({ listings: 3, skipped: 1, issues: 0 });
    expect(logRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT, format: 'idealista', propertiesCount: 3, trigger: 'manual' }),
    );
  });
});

describe('Rightmove Push Now', () => {
  const ON = { rightmove: { enabled: true, networkId: 1, branchId: 2, mode: 'own', propertyIds: [] } };

  function rightmove(config: unknown, opts: { live?: boolean; lock?: ReturnType<typeof lockMock> } = {}) {
    const client = { isLive: !!opts.live, sendProperty: jest.fn(), removeProperty: jest.fn() };
    const logRepo = repoMock();
    const listingRepo = repoMock();
    const lock = opts.lock ?? lockMock();
    const service = new (RightmoveSyncService as any)(
      client, lock, repoMock(config), repoMock(), repoMock(), repoMock(), repoMock(), repoMock(), listingRepo, logRepo,
    ) as RightmoveSyncService;
    const build = jest.spyOn(service, 'build').mockResolvedValue({
      settings: (config as any)?.rightmove,
      built: [{ agentRef: 'R1', propertyId: 1, hash: 'h', payload: {}, issues: [] }],
      skipped: [],
    } as any);
    return { service, client, logRepo, lock, build };
  }
  const flush = () => new Promise((r) => setImmediate(r));

  it('refuses when never saved, off, or without IDs', async () => {
    for (const config of [null, { rightmove: { enabled: false, networkId: 1, branchId: 2 } }, { rightmove: { enabled: true } }]) {
      const { service, lock } = rightmove(config);
      await expect(service.startManualPush(TENANT)).rejects.toBeInstanceOf(BadRequestException);
      expect(lock.withLock).not.toHaveBeenCalled();
    }
  });

  it('refuses a second press, including during a scheduled run', async () => {
    const { service } = rightmove(ON, { lock: lockMock('held') });
    await expect(service.startManualPush(TENANT)).rejects.toBeInstanceOf(ConflictException);
  });

  it('sends nothing in dry-run mode and logs a dry manual run', async () => {
    const { service, client, logRepo } = rightmove(ON);
    await expect(service.startManualPush(TENANT)).resolves.toEqual({ started: true, dryRun: true });
    await flush();
    expect(client.sendProperty).not.toHaveBeenCalled();
    expect(logRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT,
        action: 'run',
        trigger: 'manual',
        dryRun: true,
        success: true,
        summary: expect.objectContaining({ sent: 1 }),
      }),
    );
  });

  it('answers before the push ends and records a crash as a failed run', async () => {
    const { service, logRepo, build } = rightmove(ON);
    build.mockRejectedValueOnce(new Error('db went away'));
    await expect(service.startManualPush(TENANT)).resolves.toEqual({ started: true, dryRun: true });
    await flush();
    expect(logRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'run', trigger: 'manual', success: false, message: expect.stringContaining('db went away') }),
    );
  });

  it('leaves no row for a scheduled run that changed nothing', async () => {
    const { service, logRepo, build } = rightmove(ON);
    build.mockResolvedValueOnce({ settings: ON.rightmove, built: [], skipped: [] } as any);
    await service.pushTenant(TENANT);
    expect(logRepo.save).not.toHaveBeenCalled();
  });

  it('reads status for the calling tenant', async () => {
    const { service, lock, logRepo } = rightmove(ON);
    await expect(service.pushStatus(TENANT)).resolves.toEqual({ running: false, lastRun: null });
    expect(lock.isHeld).toHaveBeenCalledWith(`rightmove:push:${TENANT}`);
    expect(logRepo.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: TENANT, action: 'run' } }));
  });
});

describe('Push Now routes', () => {
  const handlers: Array<[string, unknown]> = [
    ['Feeds', ExportFeedsController.prototype.run],
    ['JSON', FeedExportConfigController.prototype.runJson],
    ['idealista', IdealistaConfigController.prototype.run],
    ['Rightmove', RightmoveConfigController.prototype.push],
  ];

  it.each(handlers)('%s needs an admin and is rate limited', (_name, handler) => {
    expect(Reflect.getMetadata('roles', handler as object)).toEqual(['admin']);
    expect(Reflect.getMetadata('__guards__', handler as object)).toContain(RolesGuard);
    expect(Reflect.getMetadata('THROTTLER:LIMITdefault', handler as object)).toBe(6);
  });
});
