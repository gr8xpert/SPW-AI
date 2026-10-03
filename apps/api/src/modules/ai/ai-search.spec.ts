import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { AiSearchService, VOICE_MODELS } from './ai-search.service';

// What the AI returns is untrusted text from a model that is allowed to be
// wrong: it fences its JSON, invents ids that belong to no client, sends
// prices as strings and gets ranges backwards. None of that may reach a
// search. And because every call spends the CLIENT's OpenRouter credit, the
// gates in front of it matter as much as the parsing.

const LOCATIONS = [{ id: 11, name: 'Marbella' }, { id: 12, name: 'Estepona' }];
const TYPES = [{ id: 21, name: 'Villa' }, { id: 22, name: 'Apartment' }];
const FEATURES = [{ id: 31, name: 'Pool' }, { id: 32, name: 'Sea view' }];

function build(reply: string, opts: { key?: string | null; enabled?: boolean; voice?: boolean; usedToday?: number; limit?: number } = {}) {
  const chatCompletion = jest.fn().mockResolvedValue(reply);
  const settings: Record<string, unknown> = {};
  if (opts.limit !== undefined) settings.aiSearchDailyLimit = opts.limit;

  const tenants = {
    findOne: jest.fn().mockResolvedValue({
      id: 1,
      settings,
      openrouterApiKey: opts.key === undefined ? 'sk-or-client-key' : opts.key,
    }),
  };
  const usage = {
    findOne: jest.fn().mockResolvedValue(opts.usedToday ? { tenantId: 1, day: 'x', count: opts.usedToday } : null),
    query: jest.fn().mockResolvedValue(undefined),
  };
  const svc = new AiSearchService(
    {
      chatCompletion,
      hasClientKey: jest.fn(async () => !!(await tenants.findOne()).openrouterApiKey),
      firstAvailableModel: jest.fn(async (ids: string[]) => ids[0]),
    } as any,
    { findAll: jest.fn().mockResolvedValue(LOCATIONS) } as any,
    { findAll: jest.fn().mockResolvedValue(TYPES) } as any,
    { findAll: jest.fn().mockResolvedValue(FEATURES) } as any,
    usage as any,
    tenants as any,
  );
  (svc as any).logger = { warn: jest.fn(), error: jest.fn(), log: jest.fn() };
  const tenant = { id: 1, aiSearchEnabled: opts.enabled ?? true, featureFlags: { aiVoiceSearch: opts.voice ?? true } } as any;
  return { svc, tenant, chatCompletion, usage };
}

describe('AI search', () => {
  it('turns a sentence into filters the search understands', async () => {
    const { svc, tenant } = build(JSON.stringify({
      filters: { locationId: 11, propertyTypeId: 21, minBedrooms: 3, maxPrice: 500000, features: [31] },
      interpretation: 'Villas in Marbella with a pool',
    }));
    const { filters, interpretation } = await svc.search(tenant, '3 bed villa in Marbella with a pool under 500k');
    expect(filters).toEqual({ locationId: 11, propertyTypeId: 21, minBedrooms: 3, maxPrice: 500000, features: [31] });
    expect(interpretation).toBe('Villas in Marbella with a pool');
  });

  it('reads JSON the model wrapped in a code fence', async () => {
    const { svc, tenant } = build('```json\n{"filters":{"locationId":12}}\n```');
    await expect(svc.search(tenant, 'estepona')).resolves.toMatchObject({ filters: { locationId: 12 } });
  });

  it('drops ids that belong to no list on this website', async () => {
    const { svc, tenant } = build(JSON.stringify({
      filters: { locationId: 999, propertyTypeId: 21, features: [31, 4242] },
    }));
    const { filters } = await svc.search(tenant, 'anything');
    expect(filters.locationId).toBeUndefined();
    expect(filters.propertyTypeId).toBe(21);
    expect(filters.features).toEqual([31]);
  });

  it('accepts a price the model sent as text, and puts a backwards range right', async () => {
    const { svc, tenant } = build(JSON.stringify({ filters: { minPrice: '800000', maxPrice: '300,000' } }));
    const { filters } = await svc.search(tenant, 'between 300k and 800k');
    expect(filters.minPrice).toBe(300000);
    expect(filters.maxPrice).toBe(800000);
  });

  it('refuses a listing type it does not have', async () => {
    const { svc, tenant } = build(JSON.stringify({ filters: { listingType: 'timeshare', minBedrooms: 2 } }));
    const { filters } = await svc.search(tenant, 'two bed timeshare');
    expect(filters.listingType).toBeUndefined();
    expect(filters.minBedrooms).toBe(2);
  });

  it('says so plainly when the model answers with prose', async () => {
    const { svc, tenant } = build('I am sorry, I could not work that out.');
    await expect(svc.search(tenant, 'hmm')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('never calls the model when the client has no key of their own', async () => {
    const { svc, tenant, chatCompletion } = build('{}', { key: null });
    await expect(svc.search(tenant, 'villa in Marbella')).rejects.toBeInstanceOf(ForbiddenException);
    expect(chatCompletion).not.toHaveBeenCalled();
  });

  it('ignores a hidden legacy key in settings: Settings → AI shows no key, so no AI search', async () => {
    const { svc, tenant, chatCompletion } = build('{}', { key: null });
    (svc as any).tenants.findOne.mockResolvedValue({ id: 1, settings: { openRouterApiKey: 'sk-or-old' }, openrouterApiKey: null });
    await expect(svc.status(tenant)).resolves.toEqual({ enabled: false, reason: 'no_api_key' });
    await expect(svc.search(tenant, 'villa in Marbella')).rejects.toBeInstanceOf(ForbiddenException);
    expect(chatCompletion).not.toHaveBeenCalled();
  });

  it('never calls the model when the feature is switched off', async () => {
    const { svc, tenant, chatCompletion } = build('{}', { enabled: false });
    await expect(svc.search(tenant, 'villa')).rejects.toBeInstanceOf(ForbiddenException);
    expect(chatCompletion).not.toHaveBeenCalled();
  });

  it('stops at the client’s daily ceiling, before spending anything', async () => {
    const { svc, tenant, chatCompletion } = build('{}', { usedToday: 50, limit: 50 });
    await expect(svc.search(tenant, 'villa')).rejects.toBeInstanceOf(ForbiddenException);
    expect(chatCompletion).not.toHaveBeenCalled();
  });

  it('counts a search that goes through', async () => {
    const { svc, tenant, usage } = build(JSON.stringify({ filters: { locationId: 11 } }), { usedToday: 3, limit: 50 });
    await svc.search(tenant, 'marbella');
    expect(usage.query).toHaveBeenCalledWith(expect.stringContaining('ON DUPLICATE KEY UPDATE'), [1, expect.any(String)]);
  });

  it('refuses a wall of pasted text before it reaches the model', async () => {
    const { svc, tenant, chatCompletion } = build('{}');
    await expect(svc.search(tenant, 'x'.repeat(401))).rejects.toBeInstanceOf(BadRequestException);
    expect(chatCompletion).not.toHaveBeenCalled();
  });

  it('asks the model with the client’s own key, never the platform one', async () => {
    const { svc, tenant, chatCompletion } = build(JSON.stringify({ filters: { locationId: 11 } }));
    await svc.search(tenant, 'marbella');
    expect(chatCompletion).toHaveBeenCalledWith(
      1,
      expect.any(Array),
      expect.objectContaining({ keySource: 'client' }),
    );
  });

  it('gives the model only this client’s places and types', async () => {
    const { svc, tenant, chatCompletion } = build(JSON.stringify({ filters: {} }));
    await svc.search(tenant, 'anything').catch(() => undefined);
    const [, messages] = chatCompletion.mock.calls[0];
    expect(messages[0].content).toContain('11: Marbella');
    expect(messages[0].content).toContain('21: Villa');
    expect(messages[1].content).toContain('anything');
  });
});

// A spoken search: the widget records a short WAV, the API checks it really is
// one and how long it runs, then sends it to an audio-capable model with the
// client's own lists — on the client's key, under the same daily ceiling.
function wav(seconds: number, sampleRate = 16000): Buffer {
  const data = Math.round(seconds * sampleRate) * 2;
  const b = Buffer.alloc(44 + data);
  b.write('RIFF', 0, 'ascii'); b.writeUInt32LE(36 + data, 4); b.write('WAVE', 8, 'ascii');
  b.write('fmt ', 12, 'ascii'); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sampleRate, 24); b.writeUInt32LE(sampleRate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36, 'ascii'); b.writeUInt32LE(data, 40);
  return b;
}

describe('AI voice search', () => {
  it('sends the recording to an audio model and returns filters plus what it heard', async () => {
    const { svc, tenant, chatCompletion } = build(JSON.stringify({
      filters: { locationId: 12, minBedrooms: 3 }, interpretation: 'Homes in Estepona', heard: '3 bedrooms in Estepona',
    }));
    const r = await svc.voiceSearch(tenant, wav(3), 'en');
    expect(r).toEqual({ filters: { locationId: 12, minBedrooms: 3 }, interpretation: 'Homes in Estepona', heard: '3 bedrooms in Estepona' });
    const [, messages, opts] = chatCompletion.mock.calls[0];
    expect(opts).toMatchObject({ model: VOICE_MODELS[0], keySource: 'client' });
    expect(messages[0].content).toContain('SPOKE');
    expect(messages[1].content[1]).toMatchObject({ type: 'input_audio', input_audio: { format: 'wav' } });
  });

  it('refuses something that is not a WAV before spending anything', async () => {
    const { svc, tenant, chatCompletion } = build('{}');
    await expect(svc.voiceSearch(tenant, Buffer.from('x'.repeat(2000)))).rejects.toBeInstanceOf(BadRequestException);
    expect(chatCompletion).not.toHaveBeenCalled();
  });

  it('refuses a recording that is too long or too short', async () => {
    const { svc, tenant, chatCompletion } = build('{}');
    await expect(svc.voiceSearch(tenant, wav(25, 8000))).rejects.toThrow(/15 seconds/);
    await expect(svc.voiceSearch(tenant, wav(0.1))).rejects.toThrow(/too short/);
    expect(chatCompletion).not.toHaveBeenCalled();
  });

  it('is off without the client’s own key, like typed search', async () => {
    const { svc, tenant, chatCompletion } = build('{}', { key: null });
    await expect(svc.voiceSearch(tenant, wav(2))).rejects.toBeInstanceOf(ForbiddenException);
    expect(chatCompletion).not.toHaveBeenCalled();
  });

  it('is off until super admin switches voice on, even with AI search on', async () => {
    const { svc, tenant, chatCompletion } = build('{}', { voice: false });
    expect(svc.voiceEnabled(tenant)).toBe(false);
    await expect(svc.voiceSearch(tenant, wav(2))).rejects.toThrow(/Voice search is not enabled/);
    expect(chatCompletion).not.toHaveBeenCalled();
  });

  it('counts against the same daily ceiling', async () => {
    const { svc, tenant, chatCompletion } = build('{}', { usedToday: 5, limit: 5 });
    await expect(svc.voiceSearch(tenant, wav(2))).rejects.toBeInstanceOf(ForbiddenException);
    expect(chatCompletion).not.toHaveBeenCalled();
  });
});

// The upload's header is not trusted for length or cost: a lying byte rate
// can't pass a long clip off as short, and only the counted samples are sent.
describe('AI voice search upload checks', () => {
  it('refuses a header whose byte rate does not match its format', async () => {
    const { svc, tenant, chatCompletion } = build('{}');
    const forged = wav(25); // 800 KB, under the size cap
    forged.writeUInt32LE(16000 * 2 * 100, 28); // claims 100x the real rate: "0.6 s"
    await expect(svc.voiceSearch(tenant, forged)).rejects.toThrow(/could not be read/);
    expect(chatCompletion).not.toHaveBeenCalled();
  });

  it('refuses formats the widget never sends (stereo, 8-bit, float)', async () => {
    const { svc, tenant } = build('{}');
    const stereo = wav(2); stereo.writeUInt16LE(2, 22);
    const eightBit = wav(2); eightBit.writeUInt16LE(8, 34);
    const float = wav(2); float.writeUInt16LE(3, 20);
    for (const bad of [stereo, eightBit, float]) {
      await expect(svc.voiceSearch(tenant, bad)).rejects.toThrow(/could not be read/);
    }
  });

  it('sends the model only the counted samples, not data smuggled after them', async () => {
    const { svc, tenant, chatCompletion } = build(JSON.stringify({ filters: { minBedrooms: 2 } }));
    const clean = wav(2);
    await svc.voiceSearch(tenant, Buffer.concat([clean, Buffer.alloc(200_000, 7)]));
    const sent = Buffer.from(chatCompletion.mock.calls[0][1][1].content[1].input_audio.data, 'base64');
    expect(sent.equals(clean)).toBe(true);
  });
});
