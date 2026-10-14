import axios from 'axios';
import { ResalesAdapter } from './resales.adapter';

jest.mock('axios');
const mockedGet = axios.get as jest.MockedFunction<typeof axios.get>;

// Resales holds the agent's own translations, one language per request:
// P_Lang takes numbers (5 = Dutch), letter codes give English, and a language
// the agent never filled in comes back as the English text (probed live
// 2026-10-14). The importer used to ask for English only, so a client's Dutch
// never reached SPM.

const ENGLISH = { R1: 'Sea view villa.', R2: 'Cozy studio.' };
const BY_LANG: Record<string, Record<string, string>> = {
  '5': { R1: 'Villa met zeezicht.', R2: ENGLISH.R2 }, // R2 has no Dutch
  '2': { R1: 'Villa con vistas al mar.', R2: 'Estudio acogedor.' },
};

function mockResales(failLang?: string) {
  mockedGet.mockImplementation(async (url: string, config?: any) => {
    if (url.endsWith('/PropertyDetails')) throw new Error('details not needed here');
    const lang = config.params.P_Lang ? String(config.params.P_Lang) : '1';
    if (lang === failLang) throw new Error('timeout');
    const text = lang === '1' ? ENGLISH : BY_LANG[lang] || ENGLISH;
    return {
      data: {
        transaction: { status: 'success' },
        QueryInfo: { SearchType: 'Sale', PropertyCount: 2, CurrentPage: 1, PropertiesPerPage: 40 },
        Property: Object.entries(text).map(([Reference, Description]) => ({ Reference, Description })),
      },
    } as any;
  });
}

function adapter() {
  const a = new ResalesAdapter();
  (a as any).logger = { warn: jest.fn(), error: jest.fn(), log: jest.fn() };
  return a;
}

const creds = { clientId: 'c', apiKey: 'k', filterId: '1' };
// P_Lang of each SearchProperties call (PropertyDetails always asks for EN).
const searchLangs = () =>
  mockedGet.mock.calls.filter(([url]) => String(url).endsWith('/SearchProperties')).map(([, c]: any) => c.params.P_Lang);

describe('Resales imports the agent\'s own translations', () => {
  afterEach(() => mockedGet.mockReset());

  it('adds the website languages, asking with Resales\' numeric codes', async () => {
    mockResales();
    const result = await adapter().fetchProperties(creds, 1, 100, { languages: ['nl', 'es'] });
    const r1 = result.properties.find((p) => p.reference === 'R1')!;
    expect(r1.description).toEqual({
      en: 'Sea view villa.',
      nl: 'Villa met zeezicht.',
      es: 'Villa con vistas al mar.',
    });
    expect(searchLangs().filter(Boolean).sort()).toEqual([2, 5]);
  });

  it('leaves out a language that is only the English text again', async () => {
    mockResales();
    const result = await adapter().fetchProperties(creds, 1, 100, { languages: ['nl'] });
    const r2 = result.properties.find((p) => p.reference === 'R2')!;
    expect(r2.description).toEqual({ en: 'Cozy studio.' });
  });

  it('keeps the page when one language fails, and skips languages Resales lacks', async () => {
    mockResales('5');
    const a = adapter();
    const result = await a.fetchProperties(creds, 1, 100, { languages: ['nl', 'es', 'xx', 'en'] });
    expect(result.properties).toHaveLength(2);
    expect(result.properties[0].description).toEqual({ en: 'Sea view villa.', es: 'Villa con vistas al mar.' });
    expect((a as any).logger.warn).toHaveBeenCalledWith(expect.stringContaining('nl descriptions failed'));
  });

  it('asks only for English when no languages are given', async () => {
    mockResales();
    await adapter().fetchProperties(creds, 1, 100);
    expect(searchLangs()).toEqual([undefined]);
  });
});
