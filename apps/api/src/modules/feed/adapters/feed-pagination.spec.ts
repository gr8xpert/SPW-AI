import axios from 'axios';
import { ResalesAdapter } from './resales.adapter';
import { InmobaAdapter } from './inmoba.adapter';

jest.mock('axios');
const mockedGet = axios.get as jest.MockedFunction<typeof axios.get>;

// Resales Online V6 caps SearchProperties at 40 per page whatever P_PageSize
// asks for (confirmed against the live API for a client feed: P_PageSize=100
// -> PropertiesPerPage 40, PropertyCount 1227). The importer asked for 100 and
// computed "more pages?" from that, so it stopped after page 13: 13 x 40 = 520.

// Mirrors FeedService.processImport's paging loop.
async function importAll(adapter: { fetchProperties: (c: any, p: number, l: number) => Promise<any> }) {
  const refs: string[] = [];
  let page = 1;
  let hasMore = true;
  while (hasMore && page < 1000) {
    const result = await adapter.fetchProperties({ clientId: 'c', apiKey: 'k', filterId: '1' }, page, 100);
    refs.push(...result.properties.map((p: any) => p.reference));
    hasMore = result.hasMore;
    page++;
  }
  return { refs, pages: page - 1 };
}

describe('feed adapters page through the whole feed when the API caps the page size', () => {
  afterEach(() => mockedGet.mockReset());

  it('Resales: imports all 1227 listings at 40 per page (was 520)', async () => {
    const TOTAL = 1227;
    const CAP = 40;
    mockedGet.mockImplementation(async (url: string, config?: any) => {
      if (url.endsWith('/PropertyDetails')) throw new Error('details not needed here');
      const page = Number(config.params.P_PageNo);
      const start = (page - 1) * CAP;
      const count = Math.max(0, Math.min(CAP, TOTAL - start));
      return {
        data: {
          transaction: { status: 'success' },
          QueryInfo: { SearchType: 'Sale', PropertyCount: count > 0 ? TOTAL : 0, CurrentPage: page, PropertiesPerPage: CAP },
          Property: Array.from({ length: count }, (_, i) => ({ Reference: `R${start + i + 1}` })),
        },
      } as any;
    });

    const adapter = new ResalesAdapter();
    (adapter as any).logger = { warn: jest.fn(), error: jest.fn(), log: jest.fn() };
    const { refs, pages } = await importAll(adapter);

    expect(refs).toHaveLength(TOTAL);
    expect(new Set(refs).size).toBe(TOTAL);
    expect(pages).toBe(Math.ceil(TOTAL / CAP));
  });

  it('Inmoba: follows the page size the API actually returns', async () => {
    const TOTAL = 130;
    const CAP = 25;
    mockedGet.mockImplementation(async (_url: string, config?: any) => {
      const page = Number(config.params.page);
      const start = (page - 1) * CAP;
      const count = Math.max(0, Math.min(CAP, TOTAL - start));
      return {
        data: {
          data: Array.from({ length: count }, (_, i) => ({ id: start + i + 1, reference: `I${start + i + 1}` })),
          meta: { total: TOTAL },
        },
      } as any;
    });

    const { refs } = await importAll(new InmobaAdapter());
    expect(new Set(refs).size).toBe(TOTAL);
  });
});
