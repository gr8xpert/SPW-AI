import { TranslationProcessor } from './translation.processor';
import { TranslationService } from './translation.service';

// Translations are public text, so a finished run must bump the tenant's
// syncVersion — once for the whole run, after the rows are saved — or the
// widget and WP plugin keep serving the old languages.

function setup() {
  const events: string[] = [];
  const repo = (rows: any[]) => ({
    find: async () => rows,
    findOne: async ({ where }: any) => rows.find((r) => r.id === where.id) || null,
    save: async (row: any) => {
      events.push(`save:${row.id}`);
      return row;
    },
    // Bulk property runs write only the translated fields.
    update: async (where: any, patch: any) => {
      events.push(`save:${where.id}`);
      Object.assign(rows.find((r) => r.id === where.id), patch);
    },
  });
  const calls: string[] = [];
  const aiService = {
    // Echo every key back with a marker so we know a translation happened.
    chatCompletion: async (_t: number, messages: Array<{ content: string }>) => {
      const input = JSON.parse(messages[messages.length - 1].content);
      calls.push(Object.keys(input).join(','));
      return JSON.stringify(Object.fromEntries(Object.keys(input).map((k) => [k, `es:${input[k]}`])));
    },
  };
  const tenantService = {
    bumpSyncVersionSafely: jest.fn(async () => void events.push('bump')),
  };
  return { events, repo, aiService, tenantService, calls };
}

const job = (data: any) => ({ data, updateProgress: async () => undefined }) as any;

describe('TranslationProcessor syncVersion bump', () => {
  it('bulk property run: one bump, after every property is saved', async () => {
    const { events, repo, aiService, tenantService } = setup();
    const properties = [
      { id: 1, title: { en: 'Villa' } },
      { id: 2, title: { en: 'Flat' } },
      { id: 3, title: { en: 'Plot' } },
    ];
    const processor = new TranslationProcessor(
      repo(properties) as any,
      repo([]) as any,
      repo([]) as any,
      repo([]) as any,
      aiService as any,
      tenantService as any,
    );

    await processor.process(job({ tenantId: 5, targetLanguages: ['es'], entityType: 'property' }));

    expect(tenantService.bumpSyncVersionSafely).toHaveBeenCalledTimes(1);
    expect(tenantService.bumpSyncVersionSafely).toHaveBeenCalledWith(5, expect.any(String));
    expect([...events.slice(0, 3)].sort()).toEqual(['save:1', 'save:2', 'save:3']);
    expect(events[3]).toBe('bump');
    expect(properties[0].title).toEqual({ en: 'Villa', es: 'es:Villa' });
  });

  it('bulk property run: text already in the language is kept, not paid for again', async () => {
    const { events, repo, aiService, tenantService, calls } = setup();
    const properties: any[] = [
      { id: 1, title: { en: 'Villa', es: 'Chalet (hand-written)' }, description: { en: 'Sea views' } },
      { id: 2, title: { en: 'Flat', es: 'Piso' } },
    ];
    const processor = new TranslationProcessor(
      repo(properties) as any, repo([]) as any, repo([]) as any, repo([]) as any,
      aiService as any, tenantService as any,
    );

    await processor.process(job({ tenantId: 5, targetLanguages: ['es'], entityType: 'property' }));

    expect(calls).toEqual(['description']);
    expect(properties[0].title).toEqual({ en: 'Villa', es: 'Chalet (hand-written)' });
    expect(properties[0].description).toEqual({ en: 'Sea views', es: 'es:Sea views' });
    expect(events).toEqual(['save:1', 'bump']);
  });

  it('bulk feature run: one bump at the end', async () => {
    const { events, repo, aiService, tenantService } = setup();
    const features = [
      { id: 10, name: { en: 'Pool' } },
      { id: 11, name: { en: 'Garden' } },
    ];
    const processor = new TranslationProcessor(
      repo([]) as any,
      repo([]) as any,
      repo(features) as any,
      repo([]) as any,
      aiService as any,
      tenantService as any,
    );

    await processor.process(job({ tenantId: 5, targetLanguages: ['es'], entityType: 'feature' }));

    expect(events).toEqual(['save:10', 'save:11', 'bump']);
  });

  it('a run that translated nothing does not bump', async () => {
    const { repo, aiService, tenantService } = setup();
    // Target equals the source language: nothing to do.
    const processor = new TranslationProcessor(
      repo([{ id: 1, title: { en: 'Villa' } }]) as any,
      repo([]) as any,
      repo([]) as any,
      repo([]) as any,
      aiService as any,
      tenantService as any,
    );

    await processor.process(job({ tenantId: 5, targetLanguages: ['en'], entityType: 'property' }));

    expect(tenantService.bumpSyncVersionSafely).not.toHaveBeenCalled();
  });
});

describe('TranslationService single translate syncVersion bump', () => {
  it('translateProperty bumps once after the save', async () => {
    const { events, repo, aiService, tenantService } = setup();
    const service = new TranslationService(
      repo([{ id: 1, tenantId: 5, title: { en: 'Villa' } }]) as any,
      repo([]) as any,
      repo([]) as any,
      repo([]) as any,
      {} as any,
      aiService as any,
      tenantService as any,
    );

    await service.translateProperty(5, 1, ['es', 'de']);

    expect(events).toEqual(['save:1', 'bump']);
  });

  it('translateFeature with only the source language does not bump', async () => {
    const { repo, aiService, tenantService } = setup();
    const service = new TranslationService(
      repo([]) as any,
      repo([]) as any,
      repo([{ id: 3, tenantId: 5, name: { en: 'Pool' } }]) as any,
      repo([]) as any,
      {} as any,
      aiService as any,
      tenantService as any,
    );

    await service.translateFeature(5, 3, ['en']);

    expect(tenantService.bumpSyncVersionSafely).not.toHaveBeenCalled();
  });
});
