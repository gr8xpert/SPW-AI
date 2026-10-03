import { Controller, Get, INestApplication, NotFoundException, Query, Req, Res } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Request, Response } from 'express';
import * as request from 'supertest';
import { TransformInterceptor } from '../interceptors/transform.interceptor';
import {
  ETAG_TIME_BUCKET_MS,
  WIDGET_CACHE_CONTROL,
  buildWidgetEtag,
  isNotModified,
  withWidgetCache,
} from './widget-http-cache';

const NOW = 1_800_000_000_000;
const base = {
  tenantId: 7,
  syncVersion: 42,
  settings: { slugFormat: 'title-ref' },
  route: 'search',
  query: { page: '1', listingType: 'sale' },
  lang: 'en',
  now: NOW,
};

describe('buildWidgetEtag', () => {
  it('is stable for the same inputs and weak', () => {
    const tag = buildWidgetEtag(base);
    expect(tag).toBe(buildWidgetEtag({ ...base }));
    expect(tag).toMatch(/^W\/"[A-Za-z0-9_-]{32}"$/);
  });

  it('differs per tenant even with identical everything else', () => {
    expect(buildWidgetEtag({ ...base, tenantId: 8 })).not.toBe(buildWidgetEtag(base));
  });

  it('differs when syncVersion moves', () => {
    expect(buildWidgetEtag({ ...base, syncVersion: 43 })).not.toBe(buildWidgetEtag(base));
  });

  it('differs per query, route, params, language and settings', () => {
    const tag = buildWidgetEtag(base);
    expect(buildWidgetEtag({ ...base, query: { page: '2', listingType: 'sale' } })).not.toBe(tag);
    expect(buildWidgetEtag({ ...base, route: 'facets' })).not.toBe(tag);
    expect(buildWidgetEtag({ ...base, params: { reference: 'R1' } })).not.toBe(
      buildWidgetEtag({ ...base, params: { reference: 'R2' } }),
    );
    expect(buildWidgetEtag({ ...base, lang: 'es' })).not.toBe(tag);
    expect(buildWidgetEtag({ ...base, settings: { slugFormat: 'ref' } })).not.toBe(tag);
  });

  it('ignores query key order but not array order', () => {
    expect(buildWidgetEtag({ ...base, query: { listingType: 'sale', page: '1' } })).toBe(buildWidgetEtag(base));
    expect(buildWidgetEtag({ ...base, query: { types: ['1', '2'] } })).not.toBe(
      buildWidgetEtag({ ...base, query: { types: ['2', '1'] } }),
    );
  });

  it('rolls over with the time bucket', () => {
    expect(buildWidgetEtag({ ...base, now: NOW + ETAG_TIME_BUCKET_MS })).not.toBe(buildWidgetEtag(base));
  });
});

describe('isNotModified', () => {
  const tag = 'W/"abc"';
  it('matches the same tag, weak or strong, in a list', () => {
    expect(isNotModified('W/"abc"', undefined, tag)).toBe(true);
    expect(isNotModified('"abc"', undefined, tag)).toBe(true);
    expect(isNotModified('"x", W/"abc"', undefined, tag)).toBe(true);
    expect(isNotModified('*', undefined, tag)).toBe(true);
  });
  it('does not match a different tag or a missing header', () => {
    expect(isNotModified('W/"abd"', undefined, tag)).toBe(false);
    expect(isNotModified(undefined, undefined, tag)).toBe(false);
  });
  it('a hard reload (Cache-Control: no-cache) always gets the full response', () => {
    expect(isNotModified('W/"abc"', 'no-cache', tag)).toBe(false);
  });
});

// End to end through Nest + Express, because the 304 itself is produced by
// Express's res.send seeing a fresh request — the helper only returns null.
describe('withWidgetCache over HTTP', () => {
  let app: INestApplication;
  const load = jest.fn();
  const tenants: Record<string, { tenantId: number; syncVersion: number }> = {
    'key-a': { tenantId: 1, syncVersion: 5 },
    'key-b': { tenantId: 2, syncVersion: 5 },
  };

  @Controller('t')
  class TestController {
    @Get()
    get(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Query('missing') missing?: string) {
      const t = tenants[req.headers['x-api-key'] as string];
      return withWidgetCache(req, res, { ...t, settings: null, route: 'search' }, async () => {
        load();
        if (missing) throw new NotFoundException();
        return { data: [{ id: t.tenantId }] };
      });
    }
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ controllers: [TestController] }).compile();
    app = mod.createNestApplication();
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
  });
  afterAll(() => app.close());
  beforeEach(() => {
    load.mockClear();
    // Pin the clock so a time-bucket rollover can't land between two requests.
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
  });
  afterEach(() => jest.restoreAllMocks());

  it('first request: 200 with body, ETag, private no-cache, Vary on key + language', async () => {
    const res = await request(app.getHttpServer()).get('/t?page=1').set('X-API-Key', 'key-a');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [{ id: 1 }] });
    expect(res.headers.etag).toMatch(/^W\//);
    expect(res.headers['cache-control']).toBe(WIDGET_CACHE_CONTROL);
    expect(res.headers.vary).toMatch(/X-API-Key/i);
    expect(res.headers.vary).toMatch(/Accept-Language/i);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('matching If-None-Match: 304, empty body, loader never runs', async () => {
    const first = await request(app.getHttpServer()).get('/t?page=1').set('X-API-Key', 'key-a');
    load.mockClear();
    const res = await request(app.getHttpServer())
      .get('/t?page=1')
      .set('X-API-Key', 'key-a')
      .set('If-None-Match', first.headers.etag);
    expect(res.status).toBe(304);
    expect(res.text ?? '').toBe('');
    expect(load).not.toHaveBeenCalled();
  });

  it("another tenant's tag never matches", async () => {
    const a = await request(app.getHttpServer()).get('/t?page=1').set('X-API-Key', 'key-a');
    const res = await request(app.getHttpServer())
      .get('/t?page=1')
      .set('X-API-Key', 'key-b')
      .set('If-None-Match', a.headers.etag);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [{ id: 2 }] });
  });

  it('a bumped syncVersion invalidates the old tag', async () => {
    const first = await request(app.getHttpServer()).get('/t').set('X-API-Key', 'key-a');
    tenants['key-a'].syncVersion++;
    const res = await request(app.getHttpServer())
      .get('/t')
      .set('X-API-Key', 'key-a')
      .set('If-None-Match', first.headers.etag);
    expect(res.status).toBe(200);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('errors carry no cache headers', async () => {
    const res = await request(app.getHttpServer()).get('/t?missing=1').set('X-API-Key', 'key-a');
    expect(res.status).toBe(404);
    expect(res.headers['cache-control']).not.toBe(WIDGET_CACHE_CONTROL);
  });
});
