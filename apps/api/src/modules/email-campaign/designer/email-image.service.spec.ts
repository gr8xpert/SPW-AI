import * as sharp from 'sharp';
import { EmailImageService, optimizeImage, imageLimits } from './email-image.service';
import { fakeRepo } from './test-fake-repo';

describe('optimizeImage', () => {
  it('shrinks a wide photo to 1200px JPEG', async () => {
    const big = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#336699' } }).png().toBuffer();
    const out = await optimizeImage(big, 'image/png');
    expect(out.mimeType).toBe('image/jpeg');
    expect(out.width).toBe(1200);
    expect(out.height).toBe(800);
  });

  it('keeps PNG when the image has transparency', async () => {
    const logo = await sharp({ create: { width: 400, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    const out = await optimizeImage(logo, 'image/png');
    expect(out.mimeType).toBe('image/png');
    expect(out.width).toBe(400);
  });

  it('turns WebP into JPEG (Outlook cannot show WebP)', async () => {
    const webp = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#ccc' } }).webp().toBuffer();
    expect((await optimizeImage(webp, 'image/webp')).mimeType).toBe('image/jpeg');
  });

  it('keeps a GIF as it is, with no extra size cap below 10 MB', async () => {
    const gif = await sharp({ create: { width: 50, height: 40, channels: 3, background: '#f00' } }).gif().toBuffer();
    const out = await optimizeImage(gif, 'image/gif');
    expect(out.mimeType).toBe('image/gif');
    expect(out.buffer).toBe(gif);
    expect(out.width).toBe(50);
  });

  it('refuses SVG bytes sent as image/gif or image/png', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>');
    await expect(optimizeImage(svg, 'image/gif')).rejects.toMatchObject({ response: { code: 'IMAGE_INVALID' } });
    await expect(optimizeImage(svg, 'image/png')).rejects.toMatchObject({ response: { code: 'IMAGE_INVALID' } });
  });

  it('refuses other file types', async () => {
    await expect(optimizeImage(Buffer.from('%PDF'), 'application/pdf')).rejects.toThrow('IMAGE_TYPE');
  });
});

describe('imageLimits', () => {
  it('uses 100 MB / 200 images by default and the client override when set', () => {
    expect(imageLimits(null)).toEqual({ bytes: 100 * 1024 * 1024, count: 200 });
    expect(imageLimits({ emailImageLimitMb: 250 }).bytes).toBe(250 * 1024 * 1024);
    expect(imageLimits({ emailImageLimitMb: 'x' }).bytes).toBe(100 * 1024 * 1024);
  });
});

describe('EmailImageService rules', () => {
  const day = 24 * 3600 * 1000;
  const setup = (images: any[], templates: any[] = [], settings: any = {}, versionRows: any[] = []) => {
    const imgs = fakeRepo<any>(images);
    const lookups = { templates: 0, versions: 0, images: [] as any[] };
    const tpls = { find: async ({ where }: any = {}) => { lookups.templates++; return templates.filter((t) => !where?.tenantId || t.tenantId === where.tenantId); } } as any;
    const vers = fakeRepo<any>(versionRows);
    const versFind = vers.find;
    (vers as any).find = async (q: any) => { lookups.versions++; return versFind(q); };
    const imgFind = imgs.find;
    (imgs as any).find = async (q: any) => { lookups.images.push(q?.where); return imgFind(q); };
    const order: string[] = [];
    const imgDelete = imgs.delete;
    (imgs as any).delete = async (ids: any) => { order.push('delete'); return imgDelete(ids); };
    const tenants = { findOne: async () => ({ settings }) } as any;
    const released: string[] = [];
    const stored: any[] = [];
    const upload = {
      getStorageConfig: async () => null,
      storeBlob: async (...a: any[]) => { stored.push(a); return { url: 'https://r2/x.jpg' }; },
      releaseBlob: async (_t: number, h: string) => { order.push('release'); released.push(h); },
    } as any;
    return { imgs, released, stored, lookups, order, svc: new EmailImageService(imgs as any, tpls, tenants, upload, vers as any) };
  };
  const png = () => sharp({ create: { width: 100, height: 80, channels: 3, background: '#123456' } }).png().toBuffer();

  it('cleans up only unpinned images unused for 30 days and not in a template', async () => {
    const now = new Date('2026-11-30T00:00:00Z');
    const old = new Date(now.getTime() - 31 * day);
    const { svc, imgs, released } = setup(
      [
        { id: 1, tenantId: 2, contentHash: 'a', url: 'https://r2/a.jpg', pinned: false, lastUsedAt: old, createdAt: old },
        { id: 2, tenantId: 2, contentHash: 'b', url: 'https://r2/b.jpg', pinned: true, lastUsedAt: old, createdAt: old },
        { id: 3, tenantId: 2, contentHash: 'c', url: 'https://r2/c.jpg', pinned: false, lastUsedAt: old, createdAt: old },
      ],
      [{ tenantId: 2, bodyHtml: '<img src="https://r2/c.jpg">' }],
    );
    expect(await svc.cleanup(now)).toBe(1);
    expect(released).toEqual(['a']);
    expect(imgs.rows.map((r: any) => r.id)).toEqual([2, 3]);
  });

  it('refuses to delete a pinned image (used in a sent email)', async () => {
    const { svc } = setup([{ id: 2, tenantId: 2, contentHash: 'b', url: 'https://r2/b.jpg', pinned: true }]);
    await expect(svc.remove(2, 2)).rejects.toMatchObject({ response: { code: 'IMAGE_IN_USE' } });
  });

  it('refuses an upload over the size limit with IMAGE_LIMIT', async () => {
    const { svc, stored } = setup(
      [{ id: 1, tenantId: 2, contentHash: 'z', url: 'https://r2/z.jpg', bytes: 1024 * 1024, pinned: false }],
      [],
      { emailImageLimitMb: 1 },
    );
    await expect(svc.upload(2, { buffer: await png(), mimetype: 'image/png' })).rejects.toMatchObject({ response: { code: 'IMAGE_LIMIT' } });
    expect(stored).toHaveLength(0);
  });

  it('two uploads of the same new image at once: the loser gives back its blob and gets the winner row', async () => {
    const { svc, imgs, released, stored } = setup([]);
    const buf = await png();
    // The winner inserted between our lookup and our insert.
    const winner = await svc.upload(2, { buffer: buf, mimetype: 'image/png' });
    const realFind = imgs.findOne;
    let lookups = 0;
    (imgs as any).findOne = async (q: any) => (q.where?.contentHash && lookups++ === 0 ? null : realFind(q));
    const realSave = imgs.save;
    (imgs as any).save = async (r: any) => {
      if (!r.id && imgs.rows.some((x: any) => x.tenantId === r.tenantId && x.contentHash === r.contentHash)) {
        throw Object.assign(new Error("Duplicate entry for key 'IDX_email_images_tenant_hash'"), { code: 'ER_DUP_ENTRY', errno: 1062 });
      }
      return realSave(r);
    };
    const loser = await svc.upload(2, { buffer: buf, mimetype: 'image/png' });
    expect(loser.id).toBe(winner.id);
    expect(stored).toHaveLength(2);
    expect(released).toEqual([imgs.rows[0].contentHash]);
    expect(imgs.rows).toHaveLength(1);
  });

  it('returns the same row when the same image is uploaded twice', async () => {
    const { svc, stored, imgs } = setup([]);
    const buf = await png();
    const a = await svc.upload(2, { buffer: buf, mimetype: 'image/png' });
    const b = await svc.upload(2, { buffer: buf, mimetype: 'image/png' });
    expect(b.id).toBe(a.id);
    imgs.rows[0].lastUsedAt = new Date(0);
    await svc.upload(2, { buffer: buf, mimetype: 'image/png' });
    expect(imgs.rows[0].lastUsedAt.getTime()).toBeGreaterThan(0);
    expect(imgs.rows).toHaveLength(1);
    expect(stored).toHaveLength(1);
  });

  it('touch refreshes lastUsedAt and pin pins images found in the html', async () => {
    const old = new Date('2026-01-01T00:00:00Z');
    const { svc, imgs } = setup([
      { id: 1, tenantId: 2, contentHash: 'a', url: 'https://r2/a.jpg', pinned: false, lastUsedAt: old },
      { id: 2, tenantId: 2, contentHash: 'b', url: 'https://r2/b.jpg', pinned: false, lastUsedAt: old },
    ]);
    await svc.touch(2, '<img src="https://r2/a.jpg">');
    expect(imgs.rows[0].lastUsedAt.getTime()).toBeGreaterThan(old.getTime());
    expect(imgs.rows[1].lastUsedAt).toBe(old);
    await svc.pin(2, '<img src="https://r2/b.jpg">');
    expect(imgs.rows[1].pinned).toBe(true);
    expect(imgs.rows[0].pinned).toBe(false);
  });

  it('cleanup keeps images that only an old template version still uses, and looks bodies up once per client', async () => {
    const now = new Date('2026-11-30T00:00:00Z');
    const old = new Date(now.getTime() - 31 * day);
    const img = (id: number, tenantId: number, h: string) => ({ id, tenantId, contentHash: h, url: `https://r2/${h}.jpg`, pinned: false, lastUsedAt: old, createdAt: old });
    const { svc, released, lookups } = setup(
      [img(1, 2, 'a'), img(2, 2, 'b'), img(3, 2, 'c'), img(4, 3, 'd')],
      [{ tenantId: 2, bodyHtml: '<img src="https://r2/c.jpg">' }],
      {},
      [{ id: 1, tenantId: 2, templateId: 7, bodyHtml: '<img src="https://r2/b.jpg">' }],
    );
    expect(await svc.cleanup(now)).toBe(2);
    expect(released.sort()).toEqual(['a', 'd']);
    expect(lookups.templates).toBe(2); // one per client, not one per image
    expect(lookups.versions).toBeLessThanOrEqual(2);
  });

  it('remove deletes the row before giving back the blob', async () => {
    const { svc, order, imgs } = setup([{ id: 1, tenantId: 2, contentHash: 'a', url: 'https://r2/a.jpg', pinned: false }]);
    await svc.remove(2, 1);
    expect(order).toEqual(['delete', 'release']);
    expect(imgs.rows).toHaveLength(0);
  });

  it('an upload that pushes the library over the limit after its insert (a parallel upload) is undone', async () => {
    const { svc, imgs, released, order } = setup(
      [{ id: 1, tenantId: 2, contentHash: 'z', url: 'https://r2/z.jpg', bytes: 1024 * 1024 - 64 * 1024, pinned: false }],
      [],
      { emailImageLimitMb: 1 },
    );
    const realSave = imgs.save;
    (imgs as any).save = async (r: any) => {
      const out = await realSave(r);
      // Another upload landed at the same time.
      if (r.contentHash !== 'p') imgs.rows.push({ id: 99, tenantId: 2, contentHash: 'p', url: 'https://r2/p.jpg', bytes: 100 * 1024, pinned: false } as any);
      return out;
    };
    await expect(svc.upload(2, { buffer: await png(), mimetype: 'image/png' })).rejects.toMatchObject({ response: { code: 'IMAGE_LIMIT' } });
    expect(imgs.rows.map((r: any) => r.id).sort()).toEqual([1, 99]);
    expect(released).toHaveLength(1);
    expect(order).toEqual(['delete', 'release']);
  });

  it('touch and pin only load the images whose address is in the html', async () => {
    const { svc, lookups } = setup([{ id: 1, tenantId: 2, contentHash: 'a', url: 'https://r2/a.jpg', pinned: false, lastUsedAt: new Date(0) }]);
    await svc.touch(2, '<td style="background:url(https://r2/a.jpg)"><img src="https://r2/a.jpg"><a href="https://site/x?a=1&amp;b=2">x</a></td>');
    const where = lookups.images.at(-1);
    expect(where.tenantId).toBe(2);
    expect(where.url.type).toBe('in');
    expect(where.url.value).toEqual(expect.arrayContaining(['https://r2/a.jpg']));
    lookups.images.length = 0;
    await svc.pin(2, '<p>no images</p>');
    expect(lookups.images).toHaveLength(0);
  });

  describe('touch/pin find addresses the way the sanitizer stores them', () => {
    const row = (id: number, url: string) => ({ id, tenantId: 2, contentHash: `h${id}`, url, pinned: false, lastUsedAt: new Date(0) });

    it('a &quot;-quoted url() in a style attribute', async () => {
      const { svc, imgs } = setup([row(1, 'https://r2/a.jpg')]);
      await svc.pin(2, '<td style="background:url(&quot;https://r2/a.jpg&quot;)">x</td>');
      expect(imgs.rows[0].pinned).toBe(true);
      await svc.touch(2, "<td style=\"background:url(&#39;https://r2/a.jpg&#39;)\">x</td>");
      expect(imgs.rows[0].lastUsedAt.getTime()).toBeGreaterThan(0);
    });

    it('an address with a ?query or #fragment', async () => {
      const { svc, imgs } = setup([row(1, 'https://r2/a.jpg'), row(2, 'https://r2/b.jpg')]);
      await svc.pin(2, '<img src="https://r2/a.jpg?w=600&amp;q=80"><img src="https://r2/b.jpg#top">');
      expect(imgs.rows.map((r: any) => r.pinned)).toEqual([true, true]);
    });

    it('more than 500 addresses falls back to the whole library, so nothing is missed', async () => {
      const { svc, imgs, lookups } = setup([row(1, 'https://r2/last.jpg')]);
      const many = Array.from({ length: 600 }, (_, i) => `<a href="https://site/p/${i}">x</a>`).join('');
      await svc.pin(2, `${many}<img src="https://r2/last.jpg">`);
      expect(imgs.rows[0].pinned).toBe(true);
      expect(lookups.images.at(-1)).toEqual({ tenantId: 2 });
    });
  });
});
