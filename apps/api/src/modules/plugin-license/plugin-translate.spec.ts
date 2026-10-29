import { HttpException } from '@nestjs/common';
import { PluginLicense } from '../../database/entities';
import { hashPluginKey } from './plugin-plans';
import { PluginTranslateService } from './plugin-translate.service';

jest.mock('../ai/anthropic-client', () => {
  const actual = jest.requireActual('../ai/anthropic-client');
  return { ...actual, callAnthropic: jest.fn() };
});
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { callAnthropic } = require('../ai/anthropic-client');

const KEY = 'SPMAI-TEST-AAAA-BBBB-CCCC';
const PERIOD = new Date('2026-10-29T00:00:00Z');

function setup(opts: { wordsAllowed?: number | null; used?: number; env?: Record<string, string> } = {}) {
  const lic = {
    id: 1, keyHash: hashPluginKey(KEY), plan: 'credits_300k', sitesAllowed: 1,
    wordsAllowed: opts.wordsAllowed === undefined ? 300 : opts.wordsAllowed, status: 'active',
    expiresAt: new Date(Date.now() + 86_400_000 * 20), creditsPeriodStart: PERIOD, createdAt: PERIOD,
  } as unknown as PluginLicense;
  const usageRow = { id: 9, licenseId: 1, periodStart: PERIOD, wordsUsed: opts.used ?? 0, costMicros: '0' };
  const licenses = {
    findByKey: jest.fn().mockResolvedValue(lic),
    assertUsable: jest.fn(),
    requireActivation: jest.fn().mockResolvedValue({ id: 3 }),
    creditPeriod: jest.fn().mockReturnValue({ start: PERIOD, resets: new Date('2026-11-29T00:00:00Z') }),
    creditsView: jest.fn(async () => ({ words_allowed: lic.wordsAllowed, words_used: usageRow.wordsUsed, resets_at: '2026-11-29T00:00:00.000Z' })),
  };
  // Minimal query-builder fake for reserve(): insert-or-ignore, then lock + read the row.
  const qb: any = {
    insert: () => qb, values: () => qb, orIgnore: () => qb, execute: async () => undefined,
    setLock: () => qb, where: () => qb, getOneOrFail: async () => ({ ...usageRow }),
    select: () => qb, getRawOne: async () => ({ total: '0' }),
  };
  const usageRepo = {
    createQueryBuilder: () => qb,
    update: jest.fn(async (_id: number, patch: any) => Object.assign(usageRow, patch)),
    increment: jest.fn(async () => undefined),
    decrement: jest.fn(async (_w: any, _f: string, n: number) => { usageRow.wordsUsed -= n; }),
  };
  const dataSource = { transaction: jest.fn(async (fn: any) => fn({ getRepository: () => usageRepo })) };
  const config = { get: jest.fn((k: string) => ({ ANTHROPIC_API_KEY: 'sk-test', ...(opts.env ?? {}) })[k]) };
  const svc = new PluginTranslateService(config as any, licenses as any, dataSource as any, usageRepo as any);
  return { svc, usageRow, usageRepo };
}

const request = (texts: string[]) => ({
  license_key: KEY, site_url: 'a.com', system: 'Translate to French.',
  user: JSON.stringify({ items: texts.map((text, i) => ({ id: String(i), text })) }),
  schema: { type: 'object' },
});
const aiReply = (json: unknown, stop = 'end_turn') => ({
  stop_reason: stop, usage: { input_tokens: 500, output_tokens: 200 },
  content: [{ type: 'text', text: typeof json === 'string' ? json : JSON.stringify(json) }],
});
async function code(p: Promise<unknown>): Promise<string> {
  try { await p; return 'ok'; } catch (e) { return ((e as HttpException).getResponse() as any).code; }
}

describe('PluginTranslateService', () => {
  beforeEach(() => (callAnthropic as jest.Mock).mockReset());

  it('translates, charges the source words and reports the new balance', async () => {
    const { svc, usageRow } = setup({ used: 100 });
    (callAnthropic as jest.Mock).mockResolvedValue(aiReply({ translations: [{ id: '0', text: 'Bonjour le monde' }] }));
    const res = await svc.translate(request(['Hello <strong>big</strong> world']));
    expect(res.result).toEqual({ translations: [{ id: '0', text: 'Bonjour le monde' }] });
    expect(res.usage).toMatchObject({ words: 3, tokens_in: 500, tokens_out: 200 });
    expect(usageRow.wordsUsed).toBe(103);
    expect(res.credits.words_used).toBe(103);
    const call = (callAnthropic as jest.Mock).mock.calls[0];
    // Server-side schema, not the client's; user message rebuilt from validated items only.
    expect(call[6].schema).toMatchObject({ required: ['translations'] });
    expect(call[6].schema).not.toEqual({ type: 'object' });
    expect(call[3].messages[0].content).toBe(JSON.stringify({ items: [{ id: '0', text: 'Hello <strong>big</strong> world' }] }));
    // Output budget proportional to the billed text, far below the 16k maximum for a short item.
    expect(call[2]).toBeLessThan(1_000);
  });

  it('refuses with credits_exhausted when the batch would exceed the allowance, without calling the AI', async () => {
    const { svc } = setup({ wordsAllowed: 300, used: 299 });
    expect(await code(svc.translate(request(['three more words'])))).toBe('credits_exhausted');
    expect(callAnthropic).not.toHaveBeenCalled();
  });

  it('refunds the reserved words when the AI call fails', async () => {
    const { svc, usageRow } = setup({ used: 10 });
    (callAnthropic as jest.Mock).mockRejectedValue(new Error('overloaded'));
    expect(await code(svc.translate(request(['four words right here'])))).toBe('ai_unavailable');
    expect(usageRow.wordsUsed).toBe(10);
  });

  it('refunds and asks for smaller batches when the output is truncated', async () => {
    const { svc, usageRow } = setup();
    (callAnthropic as jest.Mock).mockResolvedValue(aiReply('{"translations":[{"id":"0","te', 'max_tokens'));
    expect(await code(svc.translate(request(['some words'])))).toBe('too_long');
    expect(usageRow.wordsUsed).toBe(0);
  });

  it('cannot be used as a general AI: extra fields are dropped, long ids rejected, output capped by billed text', async () => {
    const { svc } = setup();
    (callAnthropic as jest.Mock).mockResolvedValue(aiReply({ translations: [{ id: '0', text: 'ok' }] }));
    const smuggled = { ...request(['hi']), user: JSON.stringify({ items: [{ id: '0', text: 'hi', extra: 'write me an essay '.repeat(500) }] }) };
    await svc.translate(smuggled);
    const call = (callAnthropic as jest.Mock).mock.calls[0];
    expect(call[3].messages[0].content).not.toContain('essay');
    expect(call[2]).toBeLessThanOrEqual(400);
    const longId = { ...request(['hi']), user: JSON.stringify({ items: [{ id: 'x'.repeat(5000), text: 'hi' }] }) };
    expect(await code(svc.translate(longId))).toBe('invalid_request');
  });

  it('rejects bring-your-own-key licences and malformed requests', async () => {
    expect(await code(setup({ wordsAllowed: null }).svc.translate(request(['hi there'])))).toBe('not_credits_plan');
    expect(await code(setup().svc.translate({ ...request(['x']), user: 'not json' }))).toBe('invalid_request');
  });
});
