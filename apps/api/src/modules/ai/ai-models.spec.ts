import { AiService } from './ai.service';
import { FALLBACK_DEFAULT_MODEL, RECOMMENDED_MODELS } from './ai-models';

// OpenRouter retires model IDs (google/gemini-2.0-flash-001 went while it was
// still our "Recommended" default). A retired saved model must degrade to a
// working one, and the settings list must only offer models that exist.
function service(available: string[] | null, saved?: string) {
  const models = available ? new Map(available.map((id) => [id, { id, name: `Name ${id}`, inputPrice: 1, outputPrice: 2 }])) : null;
  const catalog = {
    get: jest.fn().mockResolvedValue(models),
    isAvailable: jest.fn(async (id: string) => !models || models.has(id)),
  };
  const tenantRepository = {
    findOne: jest.fn().mockResolvedValue({ id: 1, settings: saved ? { openRouterModel: saved } : {}, openrouterApiKey: 'sk-or-test' }),
  };
  const svc = new AiService(tenantRepository as any, catalog as any);
  (svc as any).logger = { warn: jest.fn(), error: jest.fn(), log: jest.fn() };
  return svc;
}

describe('AI model selection', () => {
  it('keeps a model OpenRouter still offers', async () => {
    const svc = service(['openai/gpt-4o-mini', FALLBACK_DEFAULT_MODEL]);
    await expect(svc.usableModel('openai/gpt-4o-mini')).resolves.toBe('openai/gpt-4o-mini');
  });

  it('swaps a retired model for the default', async () => {
    const svc = service([FALLBACK_DEFAULT_MODEL]);
    await expect(svc.usableModel('google/gemini-2.0-flash-001')).resolves.toBe(FALLBACK_DEFAULT_MODEL);
  });

  it('falls through to a recommended model when the defaults are retired too', async () => {
    const svc = service([RECOMMENDED_MODELS[2].id]);
    await expect(svc.usableModel('google/gemini-2.0-flash-001')).resolves.toBe(RECOMMENDED_MODELS[2].id);
  });

  it('trusts any model when the catalog is unreachable', async () => {
    const svc = service(null);
    await expect(svc.usableModel('google/gemini-2.0-flash-001')).resolves.toBe('google/gemini-2.0-flash-001');
  });

  it('lists only available recommended models and flags a retired saved one', async () => {
    const available = [RECOMMENDED_MODELS[0].id, RECOMMENDED_MODELS[5].id, FALLBACK_DEFAULT_MODEL];
    const svc = service(available, 'google/gemini-2.0-flash-001');
    const r = await svc.listModels(1);
    expect(r.models.map((m) => m.id)).toEqual(RECOMMENDED_MODELS.filter((m) => available.includes(m.id)).map((m) => m.id));
    expect(r.models[0]).toMatchObject({ inputPrice: 1, outputPrice: 2 });
    expect(r).toMatchObject({ saved: 'google/gemini-2.0-flash-001', savedAvailable: false, effective: FALLBACK_DEFAULT_MODEL });
  });

  it('requests are sent with the working model, not the retired saved one', async () => {
    const svc = service([FALLBACK_DEFAULT_MODEL], 'google/gemini-2.0-flash-001');
    const resolved = await svc.resolveBackgroundKey(1);
    expect(resolved).toEqual({ apiKey: 'sk-or-test', model: FALLBACK_DEFAULT_MODEL });
  });

  it('the recommended list uses real OpenRouter IDs (provider/model)', () => {
    for (const m of RECOMMENDED_MODELS) expect(m.id).toMatch(/^[a-z-]+\/[\w.:-]+$/);
    expect(RECOMMENDED_MODELS.some((m) => m.id === 'google/gemini-2.0-flash-001')).toBe(false);
  });
});
