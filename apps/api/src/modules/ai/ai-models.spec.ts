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
    const resolved = await (svc as any).resolveKeyAndModel(1, undefined, 'client');
    expect(resolved).toEqual({ apiKey: 'sk-or-test', model: FALLBACK_DEFAULT_MODEL });
  });

  it('the recommended list uses real OpenRouter IDs (provider/model)', () => {
    for (const m of RECOMMENDED_MODELS) expect(m.id).toMatch(/^[a-z-]+\/[\w.:-]+$/);
    expect(RECOMMENDED_MODELS.some((m) => m.id === 'google/gemini-2.0-flash-001')).toBe(false);
  });
});

// Who pays is fixed per feature: the client's Settings → AI key for property,
// SEO, property translations, AI search and chat; the .env key for locations,
// types, features, labels and super admin. Never one falling back to the other.
describe('AI key source', () => {
  const env = process.env.OPENROUTER_API_KEY;
  afterEach(() => { process.env.OPENROUTER_API_KEY = env; });

  function withTenant(row: Record<string, unknown> | null) {
    const svc = new AiService(
      { findOne: jest.fn().mockResolvedValue(row) } as any,
      { get: jest.fn().mockResolvedValue(null), isAvailable: jest.fn().mockResolvedValue(true) } as any,
    );
    return svc as any;
  }

  it('client: uses the key from Settings → AI', async () => {
    const svc = withTenant({ id: 1, settings: {}, openrouterApiKey: 'sk-or-client' });
    await expect(svc.resolveKeyAndModel(1, undefined, 'client')).resolves.toMatchObject({ apiKey: 'sk-or-client' });
  });

  it('client: a hidden legacy settings key and the platform key are never used', async () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-platform';
    const svc = withTenant({ id: 1, settings: { openRouterApiKey: 'sk-or-legacy' }, openrouterApiKey: null });
    await expect(svc.resolveKeyAndModel(1, undefined, 'client')).rejects.toThrow(/Settings → AI/);
    await expect(svc.hasClientKey(1)).resolves.toBe(false);
  });

  it('platform: uses .env even when the client has a key, and ignores their model', async () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-platform';
    const svc = withTenant({ id: 1, settings: { openRouterModel: 'x/client-model' }, openrouterApiKey: 'sk-or-client' });
    const r = await svc.resolveKeyAndModel(1, undefined, 'platform');
    expect(r.apiKey).toBe('sk-or-platform');
    expect(r.model).not.toBe('x/client-model');
  });

  it('platform: no .env key means no key — not the client one', async () => {
    delete process.env.OPENROUTER_API_KEY;
    const svc = withTenant({ id: 1, settings: {}, openrouterApiKey: 'sk-or-client' });
    await expect(svc.resolvePlatformKey()).resolves.toBeNull();
  });
});
