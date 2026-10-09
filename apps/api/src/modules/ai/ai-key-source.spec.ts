import { AiService } from './ai.service';

// Who pays for each AI call (decided 2026-10-09):
//  - property AI (SEO, property translations, AI search, chat): the client's
//    own key only — never ours, it costs too many credits;
//  - locations, types, features, labels: the client's key when they added
//    one, else the platform key;
//  - Super Admin work: the platform key.
function service(clientKey: string | null) {
  const catalog = { get: jest.fn().mockResolvedValue(null), isAvailable: jest.fn().mockResolvedValue(true) };
  const tenantRepository = {
    findOne: jest.fn().mockResolvedValue({ id: 1, settings: { openRouterModel: 'client/model' }, openrouterApiKey: clientKey }),
  };
  const svc = new AiService(tenantRepository as any, catalog as any);
  (svc as any).logger = { warn: jest.fn(), error: jest.fn(), log: jest.fn() };
  return svc;
}

describe('AI key source', () => {
  const env = process.env.OPENROUTER_API_KEY;
  beforeEach(() => { process.env.OPENROUTER_API_KEY = 'sk-or-platform'; });
  afterAll(() => { process.env.OPENROUTER_API_KEY = env; });

  it('property AI uses the client key with the client model', async () => {
    await expect((service('sk-or-client') as any).resolveKeyAndModel(1, undefined, 'client'))
      .resolves.toEqual({ apiKey: 'sk-or-client', model: 'client/model' });
  });

  it('property AI never falls back to the platform key', async () => {
    await expect((service(null) as any).resolveKeyAndModel(1, undefined, 'client')).rejects.toThrow(/Settings → AI/);
  });

  it('types/features/labels prefer the client key', async () => {
    await expect((service('sk-or-client') as any).resolveKeyAndModel(1, undefined, 'client-first'))
      .resolves.toEqual({ apiKey: 'sk-or-client', model: 'client/model' });
  });

  it('types/features/labels fall back to the platform key', async () => {
    const r = await (service(null) as any).resolveKeyAndModel(1, undefined, 'client-first');
    expect(r.apiKey).toBe('sk-or-platform');
  });

  it('enrichment reports which key it got, and tenant 0 is always the platform', async () => {
    await expect(service('sk-or-client').resolveClientFirstKey(1, 'x/enrich')).resolves.toEqual({ apiKey: 'sk-or-client', model: 'x/enrich', source: 'client' });
    await expect(service(null).resolveClientFirstKey(1, 'x/enrich')).resolves.toEqual({ apiKey: 'sk-or-platform', model: 'x/enrich', source: 'platform' });
    await expect(service('sk-or-client').resolveClientFirstKey(0, 'x/enrich')).resolves.toMatchObject({ apiKey: 'sk-or-platform' });
  });

  it('types/features/labels retry on the platform key when OpenRouter rejects the client key', async () => {
    const axios = require('axios');
    const seen: string[] = [];
    const spy = jest.spyOn(axios, 'post').mockImplementation(async (_url: any, _body: any, cfg: any) => {
      seen.push(cfg.headers.Authorization);
      if (cfg.headers.Authorization === 'Bearer sk-or-client') {
        const e: any = new Error('401'); e.isAxiosError = true; e.response = { status: 401, data: { error: { message: 'User not found.' } } };
        throw e;
      }
      return { data: { choices: [{ message: { content: 'ok' } }] } };
    });
    try {
      await expect(service('sk-or-client').chatCompletion(1, [{ role: 'user', content: 'x' }], { keySource: 'client-first' })).resolves.toBe('ok');
      expect(seen).toEqual(['Bearer sk-or-client', 'Bearer sk-or-platform']);
      // Property AI never does.
      await expect(service('sk-or-client').chatCompletion(1, [{ role: 'user', content: 'x' }], { keySource: 'client' })).rejects.toThrow(/Your OpenRouter API key/);
    } finally {
      spy.mockRestore();
    }
  });

  it('no key anywhere: types/features/labels say both keys are missing', async () => {
    delete process.env.OPENROUTER_API_KEY;
    await expect((service(null) as any).resolveKeyAndModel(1, undefined, 'client-first')).rejects.toThrow(/not set on the server either/);
  });

  it('no key anywhere: client-first gives null instead of throwing', async () => {
    delete process.env.OPENROUTER_API_KEY;
    await expect(service(null).resolveClientFirstKey(1)).resolves.toBeNull();
  });
});
