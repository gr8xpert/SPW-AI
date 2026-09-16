import { AiSeoProcessor } from './ai-seo.processor';

// Hand-rolled fakes rather than a Nest module + live DB: what's under test is
// which properties the pass pays for and what it writes, not persistence.

type Row = {
  id: number;
  reference?: string;
  slug?: string | null;
  title?: Record<string, string> | null;
  pageTitle?: Record<string, string> | null;
  metaTitle?: Record<string, string> | null;
  metaDescription?: Record<string, string> | null;
  metaKeywords?: Record<string, string> | null;
  seoSchemaJson?: string | null;
};

function makeProcessor(rows: Row[]) {
  const seoCalls: Array<{ id: number; languages: string[] }> = [];
  const schemaCalls: number[] = [];
  const saved: Row[] = [];

  const propertyRepository = {
    find: async () => rows.map((r) => ({ id: r.id })),
    findOne: async ({ where }: any) => {
      if (where.slug !== undefined) {
        // Uniqueness probe: Not(id) is an operator object, so compare on slug
        // and exclude the row being written.
        const excluded = where.id?._value ?? where.id?.value;
        return rows.find((r) => r.slug === where.slug && r.id !== excluded) || null;
      }
      return rows.find((r) => r.id === where.id) || null;
    },
    save: async (row: Row) => {
      saved.push(row);
      return row;
    },
  };

  const aiSeoService = {
    generateSeoForProperty: async (_t: number, id: number, languages: string[]) => {
      seoCalls.push({ id, languages });
      const out: Record<string, any> = {};
      for (const lang of languages) {
        out[lang] = {
          pageTitle: `Title ${lang}`,
          metaTitle: `Meta ${lang}`,
          metaDescription: `Desc ${lang}`,
          metaKeywords: `kw ${lang}`,
        };
      }
      return out;
    },
    generateSchemaForProperty: async (_t: number, id: number) => {
      schemaCalls.push(id);
      return { schema: '{"@type":"RealEstateListing"}' };
    },
  };

  const processor = new (AiSeoProcessor as any)(
    propertyRepository,
    aiSeoService,
  ) as AiSeoProcessor;

  return { processor, seoCalls, schemaCalls, saved };
}

function makeJob(data: any) {
  const progress: any[] = [];
  return {
    job: { data, updateProgress: async (p: any) => void progress.push(p) } as any,
    progress,
  };
}

const filled = (langs: string[]) =>
  Object.fromEntries(langs.map((l) => [l, 'existing'])) as Record<string, string>;

const seoComplete = (langs: string[]) => ({
  pageTitle: filled(langs),
  metaTitle: filled(langs),
  metaDescription: filled(langs),
});

describe('AiSeoProcessor', () => {
  it('skips properties that already have SEO in every requested language', async () => {
    const rows: Row[] = [
      { id: 1, ...seoComplete(['en', 'es']) },
      { id: 2, title: { en: 'Sea View Villa' } },
    ];
    const { processor, seoCalls } = makeProcessor(rows);
    const { job, progress } = makeJob({ tenantId: 1, targetLanguages: ['en', 'es'] });

    await processor.process(job);

    // Only the empty property costs an AI call.
    expect(seoCalls).toEqual([{ id: 2, languages: ['en', 'es'] }]);
    expect(progress.at(-1)).toEqual({ total: 2, completed: 2, failed: 0, skipped: 1 });
  });

  it('generates only the languages that are missing', async () => {
    const rows: Row[] = [{ id: 1, ...seoComplete(['en']) }];
    const { processor, seoCalls } = makeProcessor(rows);
    const { job } = makeJob({ tenantId: 1, targetLanguages: ['en', 'es', 'de'] });

    await processor.process(job);

    expect(seoCalls).toEqual([{ id: 1, languages: ['es', 'de'] }]);
  });

  it('regenerates everything when overwrite is on', async () => {
    const rows: Row[] = [{ id: 1, ...seoComplete(['en', 'es']) }];
    const { processor, seoCalls } = makeProcessor(rows);
    const { job } = makeJob({ tenantId: 1, targetLanguages: ['en', 'es'], overwrite: true });

    await processor.process(job);

    expect(seoCalls).toEqual([{ id: 1, languages: ['en', 'es'] }]);
  });

  it('leaves languages outside the run untouched', async () => {
    const rows: Row[] = [
      { id: 1, title: { en: 'Villa' }, pageTitle: { fr: 'Titre FR' } },
    ];
    const { processor, saved } = makeProcessor(rows);
    const { job } = makeJob({ tenantId: 1, targetLanguages: ['en'] });

    await processor.process(job);

    expect(saved[0].pageTitle).toEqual({ fr: 'Titre FR', en: 'Title en' });
  });

  // A slug is a live URL. Nothing here writes redirects, so an existing one is
  // never touched — not even with overwrite on.
  it('never rewrites an existing slug', async () => {
    const rows: Row[] = [
      { id: 1, slug: 'hand-written-slug', title: { en: 'Villa' } },
    ];
    const { processor, saved } = makeProcessor(rows);
    const { job } = makeJob({
      tenantId: 1,
      targetLanguages: ['en'],
      includeSlug: true,
      overwrite: true,
    });

    await processor.process(job);

    expect(saved[0].slug).toBe('hand-written-slug');
  });

  it('fills an empty slug from the generated page title', async () => {
    const rows: Row[] = [{ id: 1, slug: null, title: { en: 'Villa' } }];
    const { processor, saved } = makeProcessor(rows);
    const { job } = makeJob({ tenantId: 1, targetLanguages: ['en'], includeSlug: true });

    await processor.process(job);

    expect(saved[0].slug).toBe('title-en');
  });

  it('suffixes a slug that another property already holds', async () => {
    const rows: Row[] = [
      { id: 1, slug: 'title-en' },
      { id: 2, slug: null, title: { en: 'Villa' } },
    ];
    const { processor, saved } = makeProcessor(rows);
    const { job } = makeJob({ tenantId: 1, targetLanguages: ['en'], includeSlug: true });

    await processor.process(job);

    expect(saved.find((r) => r.id === 2)!.slug).toBe('title-en-2');
  });

  it('only generates schema where there is none', async () => {
    const rows: Row[] = [
      { id: 1, ...seoComplete(['en']), seoSchemaJson: '{"@type":"Existing"}' },
      { id: 2, ...seoComplete(['en']) },
    ];
    const { processor, schemaCalls } = makeProcessor(rows);
    const { job } = makeJob({ tenantId: 1, targetLanguages: ['en'], includeSchema: true });

    await processor.process(job);

    expect(schemaCalls).toEqual([2]);
  });

  // One property with no usable content must not abort a 15k-property run.
  it('records a failure and carries on', async () => {
    const rows: Row[] = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const { processor, seoCalls } = makeProcessor(rows);
    (processor as any).aiSeoService.generateSeoForProperty = async (
      _t: number,
      id: number,
      languages: string[],
    ) => {
      seoCalls.push({ id, languages });
      if (id === 2) throw new Error('Property has no title or description');
      return { en: { pageTitle: 't', metaTitle: 'm', metaDescription: 'd', metaKeywords: 'k' } };
    };
    const { job, progress } = makeJob({ tenantId: 1, targetLanguages: ['en'] });

    await processor.process(job);

    expect(seoCalls.map((c) => c.id)).toEqual([1, 2, 3]);
    expect(progress.at(-1)).toEqual({ total: 3, completed: 3, failed: 1, skipped: 0 });
  });

  it('reports progress after every property', async () => {
    const rows: Row[] = [{ id: 1 }, { id: 2 }];
    const { processor } = makeProcessor(rows);
    const { job, progress } = makeJob({ tenantId: 1, targetLanguages: ['en'] });

    await processor.process(job);

    // Initial zero state plus one update per property — the dashboard polls
    // this to drive the percentage on the button.
    expect(progress).toEqual([
      { total: 2, completed: 0, failed: 0, skipped: 0 },
      { total: 2, completed: 1, failed: 0, skipped: 0 },
      { total: 2, completed: 2, failed: 0, skipped: 0 },
    ]);
  });
});
