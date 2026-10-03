import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { MigrationService } from './migration.service';

// An import writes public rows (locations, types, features, labels,
// properties), so it ends with exactly one syncVersion bump — after the
// writes, never per row.

function setup(fileContent: object) {
  const events: string[] = [];
  const filePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'spm-mig-')), 'import.json');
  fs.writeFileSync(filePath, JSON.stringify(fileContent));

  const jobRow: any = { id: 1, tenantId: 9, type: 'full', sourceFormat: 'json', status: 'pending', filePath };
  const migrationJobRepository = {
    findOne: async () => jobRow,
    save: async (row: any) => row,
  };
  const repo = (kind: string) => ({
    findOne: async () => null,
    find: async () => [],
    create: (data: any) => ({ ...data }),
    save: async (row: any) => {
      events.push(`save:${kind}`);
      return { id: Math.floor(Math.random() * 1000), ...row };
    },
  });
  const tenantService = {
    bumpSyncVersionSafely: jest.fn(async () => void events.push('bump')),
  };
  const service = new MigrationService(
    migrationJobRepository as any,
    repo('property') as any,
    repo('location') as any,
    repo('type') as any,
    repo('feature') as any,
    repo('label') as any,
    {} as any,
    tenantService as any,
  );
  return { service, events, tenantService, jobRow, filePath };
}

describe('MigrationService syncVersion bump', () => {
  it('bumps once, after every row is written', async () => {
    const { service, events, tenantService, jobRow } = setup({
      locations: [{ name: 'Marbella' }, { name: 'Estepona' }],
      features: [{ name: 'Pool' }],
      properties: [{ reference: 'R1' }, { reference: 'R2' }],
    });

    await service.processJob(1, 9, 'skip');

    expect(jobRow.status).toBe('completed');
    expect(tenantService.bumpSyncVersionSafely).toHaveBeenCalledTimes(1);
    expect(tenantService.bumpSyncVersionSafely).toHaveBeenCalledWith(9, expect.any(String));
    expect(events.at(-1)).toBe('bump');
    expect(events.filter((e) => e.startsWith('save:'))).toHaveLength(5);
  });

  it('an import that wrote nothing does not bump', async () => {
    const { service, tenantService } = setup({ properties: [] });

    await service.processJob(1, 9, 'skip');

    expect(tenantService.bumpSyncVersionSafely).not.toHaveBeenCalled();
  });

  it('a run that fails part-way still bumps for the rows it already wrote', async () => {
    const { service, events, tenantService } = setup({
      locations: [{ name: 'Marbella' }],
      // Not an array: iterating it throws after the locations are in.
      properties: { not: 'an array', length: 1 },
    });

    await service.processJob(1, 9, 'skip');

    expect(tenantService.bumpSyncVersionSafely).toHaveBeenCalledTimes(1);
    expect(events).toEqual(['save:location', 'bump']);
  });
});
