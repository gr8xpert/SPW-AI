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

// process.env.X = undefined stores the string "undefined".
function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

describe('AI key source', () => {
  const env = process.env.OPENROUTER_API_KEY;
  const anthropicEnv = process.env.ANTHROPIC_API_KEY;
  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = 'sk-or-platform';
    delete process.env.ANTHROPIC_API_KEY;
  });
  afterAll(() => {
    restore('OPENROUTER_API_KEY', env);
    restore('ANTHROPIC_API_KEY', anthropicEnv);
  });

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

// Our Anthropic credit pays for platform work first (decided 2026-10-23).
describe('AI key source: platform Anthropic key', () => {
  const anthropic = require('./anthropic-client');
  const env = { or: process.env.OPENROUTER_API_KEY, an: process.env.ANTHROPIC_API_KEY, model: process.env.ANTHROPIC_PLATFORM_MODEL };
  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = 'sk-or-platform';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-platform';
    delete process.env.ANTHROPIC_PLATFORM_MODEL;
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => {
    restore('OPENROUTER_API_KEY', env.or);
    restore('ANTHROPIC_API_KEY', env.an);
    restore('ANTHROPIC_PLATFORM_MODEL', env.model);
  });

  function withBudget(clientKey: string | null, available = true) {
    const svc = service(clientKey);
    const budget = { available: jest.fn().mockResolvedValue(available), record: jest.fn(), pause: jest.fn() };
    (svc as any).anthropicBudget = budget;
    return { svc, budget };
  }

  it('platform work goes to Anthropic with the Anthropic model, whatever OpenRouter model was asked for', async () => {
    const { svc } = withBudget(null);
    await expect((svc as any).resolveKeyAndModel(0, 'anthropic/claude-haiku-4.5', 'platform'))
      .resolves.toEqual({ apiKey: 'sk-ant-platform', model: 'claude-haiku-5-5', provider: 'anthropic', owner: 'platform' });
  });

  it('client-first without a client key uses Anthropic; with one, the client key', async () => {
    await expect((withBudget(null).svc as any).resolveKeyAndModel(1, undefined, 'client-first'))
      .resolves.toMatchObject({ provider: 'anthropic' });
    await expect((withBudget('sk-or-client').svc as any).resolveKeyAndModel(1, undefined, 'client-first'))
      .resolves.toEqual({ apiKey: 'sk-or-client', model: 'client/model' });
  });

  it('property AI never touches the Anthropic platform key', async () => {
    await expect((withBudget(null).svc as any).resolveKeyAndModel(1, undefined, 'client')).rejects.toThrow(/Settings → AI/);
  });

  it('budget reached or Anthropic paused: OpenRouter platform key', async () => {
    const r = await (withBudget(null, false).svc as any).resolveKeyAndModel(0, undefined, 'platform');
    expect(r.apiKey).toBe('sk-or-platform');
    expect(r.provider).toBeUndefined();
  });

  it('records spend for a successful call', async () => {
    jest.spyOn(anthropic, 'anthropicComplete').mockResolvedValue({ text: 'hola', usage: { inputTokens: 100, outputTokens: 20 } });
    const { svc, budget } = withBudget(null);
    await expect(svc.chatCompletion(0, [{ role: 'user', content: 'x' }], { keySource: 'platform' })).resolves.toBe('hola');
    expect(budget.record).toHaveBeenCalledWith('claude-haiku-5-5', { inputTokens: 100, outputTokens: 20 });
  });

  it('a failed Anthropic call retries on OpenRouter, and an empty credit pauses Anthropic', async () => {
    jest.spyOn(anthropic, 'anthropicComplete').mockRejectedValue(new anthropic.AnthropicCallError('Your credit balance is too low', 'credits', 400));
    const axios = require('axios');
    const seen: string[] = [];
    jest.spyOn(axios, 'post').mockImplementation(async (_url: any, _body: any, cfg: any) => {
      seen.push(cfg.headers.Authorization);
      return { data: { choices: [{ message: { content: 'ok' } }] } };
    });
    const { svc, budget } = withBudget(null);
    await expect(svc.chatCompletion(0, [{ role: 'user', content: 'x' }], { keySource: 'platform' })).resolves.toBe('ok');
    expect(seen).toEqual(['Bearer sk-or-platform']);
    expect(budget.pause).toHaveBeenCalledWith('credits');
  });

  it('a failed Anthropic call with no OpenRouter key says so', async () => {
    delete process.env.OPENROUTER_API_KEY;
    jest.spyOn(anthropic, 'anthropicComplete').mockRejectedValue(new anthropic.AnthropicCallError('bad key', 'auth', 401));
    await expect(withBudget(null).svc.chatCompletion(0, [{ role: 'user', content: 'x' }], { keySource: 'platform' }))
      .rejects.toThrow(/ANTHROPIC_API_KEY\) was rejected/);
  });

  it('a client key OpenRouter rejects falls back to Anthropic for client-first work', async () => {
    jest.spyOn(anthropic, 'anthropicComplete').mockResolvedValue({ text: 'from claude', usage: { inputTokens: 1, outputTokens: 1 } });
    const axios = require('axios');
    jest.spyOn(axios, 'post').mockImplementation(async () => {
      const e: any = new Error('401'); e.isAxiosError = true; e.response = { status: 401, data: { error: { message: 'User not found.' } } };
      throw e;
    });
    await expect(withBudget('sk-or-client').svc.chatCompletion(1, [{ role: 'user', content: 'x' }], { keySource: 'client-first' }))
      .resolves.toBe('from claude');
  });
});

// A client can run their AI on their own Anthropic key (Settings → AI, 2026-10-23).
describe('AI key source: client Anthropic key', () => {
  const anthropic = require('./anthropic-client');
  const tools = require('./anthropic-tools');
  const env = { or: process.env.OPENROUTER_API_KEY, an: process.env.ANTHROPIC_API_KEY };
  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = 'sk-or-platform';
    delete process.env.ANTHROPIC_API_KEY;
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => {
    restore('OPENROUTER_API_KEY', env.or);
    restore('ANTHROPIC_API_KEY', env.an);
  });

  function onAnthropic(keys: { anthropic?: string | null; openrouter?: string | null; model?: string }) {
    const catalog = { get: jest.fn().mockResolvedValue(null), isAvailable: jest.fn().mockResolvedValue(true) };
    const tenantRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 1,
        settings: { aiProvider: 'anthropic', anthropicModel: keys.model, openRouterModel: 'client/model' },
        anthropicApiKey: keys.anthropic ?? null,
        openrouterApiKey: keys.openrouter ?? null,
      }),
    };
    const svc = new AiService(tenantRepository as any, catalog as any);
    (svc as any).logger = { warn: jest.fn(), error: jest.fn(), log: jest.fn() };
    return svc;
  }
  const audio = [{ role: 'user' as const, content: [{ type: 'input_audio' as const, input_audio: { data: 'x', format: 'wav' as const } }] }];

  it('uses the Anthropic key with the saved Claude model (Sonnet 5.5 when none)', async () => {
    await expect((onAnthropic({ anthropic: 'sk-ant-client' }) as any).resolveKeyAndModel(1, undefined, 'client'))
      .resolves.toEqual({ apiKey: 'sk-ant-client', model: 'claude-sonnet-5-5', provider: 'anthropic', owner: 'client' });
    await expect((onAnthropic({ anthropic: 'sk-ant-client', model: 'claude-haiku-5-5' }) as any).resolveKeyAndModel(1, undefined, 'client'))
      .resolves.toMatchObject({ model: 'claude-haiku-5-5' });
  });

  it('a cheap Haiku asked for by OpenRouter ID stays Haiku; other OpenRouter IDs use the client pick', async () => {
    const svc = onAnthropic({ anthropic: 'sk-ant-client' }) as any;
    await expect(svc.resolveKeyAndModel(1, 'anthropic/claude-haiku-4.5', 'client-first')).resolves.toMatchObject({ model: 'claude-haiku-5-5' });
    await expect(svc.resolveKeyAndModel(1, 'google/gemini-3.8-flash', 'client')).resolves.toMatchObject({ model: 'claude-sonnet-5-5' });
  });

  it('only the chosen provider\'s key counts as having a key', async () => {
    await expect(onAnthropic({ anthropic: null, openrouter: 'sk-or-client' }).hasClientKey(1)).resolves.toBe(false);
    await expect(onAnthropic({ anthropic: 'sk-ant-client' }).hasClientKey(1)).resolves.toBe(true);
  });

  it('voice goes to the OpenRouter key; without one it says so', async () => {
    const both = onAnthropic({ anthropic: 'sk-ant-client', openrouter: 'sk-or-client' });
    await expect(both.hasClientAudioKey(1)).resolves.toBe(true);
    await expect((both as any).resolveKeyAndModel(1, 'google/gemini-3.1-flash-lite', 'client', { needsAudio: true }))
      .resolves.toEqual({ apiKey: 'sk-or-client', model: 'google/gemini-3.1-flash-lite' });
    const claudeOnly = onAnthropic({ anthropic: 'sk-ant-client' });
    await expect(claudeOnly.hasClientAudioKey(1)).resolves.toBe(false);
    await expect(claudeOnly.chatCompletion(1, audio, { keySource: 'client' })).rejects.toThrow(/Voice needs an OpenRouter key/);
  });

  it('property AI on the client key: their errors, never the platform key', async () => {
    jest.spyOn(anthropic, 'anthropicComplete').mockRejectedValue(new anthropic.AnthropicCallError('Your credit balance is too low', 'credits', 400));
    const axios = require('axios');
    const post = jest.spyOn(axios, 'post');
    await expect(onAnthropic({ anthropic: 'sk-ant-client' }).chatCompletion(1, [{ role: 'user', content: 'x' }], { keySource: 'client' }))
      .rejects.toThrow(/Your Anthropic API key \(Settings → AI\) has no credit left/);
    expect(post).not.toHaveBeenCalled();
  });

  it('types/features/labels move to the platform key when the client Anthropic key is empty', async () => {
    jest.spyOn(anthropic, 'anthropicComplete').mockRejectedValue(new anthropic.AnthropicCallError('bad', 'auth', 401));
    const axios = require('axios');
    const seen: string[] = [];
    jest.spyOn(axios, 'post').mockImplementation(async (_u: any, _b: any, cfg: any) => {
      seen.push(cfg.headers.Authorization);
      return { data: { choices: [{ message: { content: 'ok' } }] } };
    });
    await expect(onAnthropic({ anthropic: 'sk-ant-client' }).chatCompletion(1, [{ role: 'user', content: 'x' }], { keySource: 'client-first' }))
      .resolves.toBe('ok');
    expect(seen).toEqual(['Bearer sk-or-platform']);
  });

  it('the chatbot runs on the Anthropic key', async () => {
    const reply = { content: 'Here you go', toolCalls: [], usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } };
    const spy = jest.spyOn(tools, 'anthropicCompleteWithTools').mockResolvedValue(reply);
    await expect(onAnthropic({ anthropic: 'sk-ant-client' }).chatCompletionWithTools(1, [{ role: 'user', content: 'villas?' }], []))
      .resolves.toEqual(reply);
    expect(spy.mock.calls[0][0]).toBe('sk-ant-client');
    expect(spy.mock.calls[0][1]).toBe('claude-sonnet-5-5');
  });

  it('Settings → AI test can try the OpenRouter key while Anthropic is saved', async () => {
    const axios = require('axios');
    const seen: string[] = [];
    jest.spyOn(axios, 'post').mockImplementation(async (_u: any, _b: any, cfg: any) => {
      seen.push(cfg.headers.Authorization);
      return { data: { choices: [{ message: { content: 'OK' } }] } };
    });
    await expect(onAnthropic({ anthropic: 'sk-ant-client', openrouter: 'sk-or-client' }).testConnection(1, 'x/y', 'openrouter'))
      .resolves.toMatchObject({ ok: true });
    expect(seen).toEqual(['Bearer sk-or-client']);
  });
});
