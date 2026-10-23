import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { createHash } from 'crypto';
import * as sharp from 'sharp';
import { EmailImage, EmailTemplate, EmailTemplateVersion, Tenant } from '../../../database/entities';
import { UploadService } from '../../upload/upload.service';

// Pictures clients put in their emails. Shrunk on upload, stored once per
// client (content hash), limited per client, and deleted after 30 days
// unused, except images in sent campaigns, which old emails still show.

export const MAX_INPUT_BYTES = 10 * 1024 * 1024;
const MAX_WIDTH = 1200;
const DEFAULT_LIMIT_MB = Number(process.env.EMAIL_IMAGE_LIMIT_MB) || 100;
const MAX_COUNT = 200;
const UNUSED_DAYS = 30;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const VERSION_PAGE = 200;
const MAX_URLS = 500;

// An entity other than &amp; ends an address: sanitize-html writes the quotes
// of `url("…")` as &quot; (or &#39; / &#x27;).
const ENTITY_END = /&(?!amp;)#?[a-z0-9]+;/i;

// Every http(s) address in the html (attributes and CSS url()), as written,
// with &amp; read as &, and without its ?query / #fragment. Null when there
// are more than MAX_URLS: the caller then checks the whole library instead.
export function urlsIn(html: string): string[] | null {
  const found = new Set<string>();
  for (const m of html.matchAll(/https?:\/\/[^\s"'<>()\\]+/gi)) {
    const cut = m[0].search(ENTITY_END);
    const url = cut >= 0 ? m[0].slice(0, cut) : m[0];
    found.add(url);
    found.add(url.replace(/&amp;/g, '&'));
    found.add(url.replace(/[?#].*$/, ''));
    if (found.size > MAX_URLS) return null;
  }
  return [...found];
}

export interface EmailImageDto {
  id: number;
  url: string;
  width: number;
  height: number;
  bytes: number;
  pinned: boolean;
  createdAt: Date;
}

export function imageLimits(settings: { emailImageLimitMb?: unknown } | null): { bytes: number; count: number } {
  const mb = Number(settings?.emailImageLimitMb);
  return { bytes: (Number.isFinite(mb) && mb > 0 ? mb : DEFAULT_LIMIT_MB) * 1024 * 1024, count: MAX_COUNT };
}

export async function optimizeImage(
  buffer: Buffer,
  mimetype: string,
): Promise<{ buffer: Buffer; mimeType: string; width: number; height: number }> {
  if (!ACCEPTED.includes(mimetype)) {
    throw new BadRequestException({ code: 'IMAGE_TYPE', message: 'IMAGE_TYPE: use a JPEG, PNG, GIF or WebP image.' });
  }
  if (buffer.length > MAX_INPUT_BYTES) {
    throw new BadRequestException({ code: 'IMAGE_TOO_BIG', message: 'Images can be up to 10 MB.' });
  }
  let meta: sharp.Metadata;
  try {
    meta = await sharp(buffer).metadata();
  } catch {
    throw new BadRequestException({ code: 'IMAGE_INVALID', message: 'This file is not a valid image.' });
  }
  // Trust what the bytes are, not the declared type (sharp also reads SVG etc.).
  if (!meta.format || !['jpeg', 'png', 'gif', 'webp'].includes(meta.format)) {
    throw new BadRequestException({ code: 'IMAGE_INVALID', message: 'This file is not a valid JPEG, PNG, GIF or WebP image.' });
  }
  // Animated GIFs are kept as they are (resizing them breaks the animation).
  if (meta.format === 'gif') {
    return { buffer, mimeType: 'image/gif', width: meta.width ?? 0, height: meta.height ?? 0 };
  }
  const base = sharp(buffer).rotate().resize({ width: MAX_WIDTH, withoutEnlargement: true });
  const out = meta.hasAlpha
    ? await base.png({ compressionLevel: 9, palette: true }).toBuffer({ resolveWithObject: true })
    : await base
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: 82, progressive: true, mozjpeg: true })
        .toBuffer({ resolveWithObject: true });
  return {
    buffer: out.data,
    mimeType: meta.hasAlpha ? 'image/png' : 'image/jpeg',
    width: out.info.width,
    height: out.info.height,
  };
}

const toDto = (r: EmailImage): EmailImageDto => ({
  id: r.id,
  url: r.url,
  width: r.width,
  height: r.height,
  bytes: r.bytes,
  pinned: r.pinned,
  createdAt: r.createdAt,
});

// MySQL duplicate key (ER_DUP_ENTRY / errno 1062), raw or wrapped by TypeORM.
function isDuplicateKey(err: unknown): boolean {
  const e = err as { code?: string; errno?: number; driverError?: { code?: string; errno?: number } } | null;
  return e?.code === 'ER_DUP_ENTRY' || e?.errno === 1062 || e?.driverError?.code === 'ER_DUP_ENTRY' || e?.driverError?.errno === 1062;
}

@Injectable()
export class EmailImageService {
  constructor(
    @InjectRepository(EmailImage) private readonly images: Repository<EmailImage>,
    @InjectRepository(EmailTemplate) private readonly templates: Repository<EmailTemplate>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    private readonly storage: UploadService,
    @InjectRepository(EmailTemplateVersion) private readonly versions: Repository<EmailTemplateVersion>,
  ) {}

  private async limits(tenantId: number) {
    const tenant = await this.tenants.findOne({ where: { id: tenantId }, select: ['id', 'settings'] });
    return imageLimits((tenant?.settings ?? null) as { emailImageLimitMb?: unknown } | null);
  }

  async list(tenantId: number) {
    const rows = await this.images.find({ where: { tenantId }, order: { id: 'DESC' } });
    const limit = await this.limits(tenantId);
    return {
      images: rows.map(toDto),
      usedBytes: rows.reduce((s, r) => s + r.bytes, 0),
      limitBytes: limit.bytes,
      limitCount: limit.count,
    };
  }

  async upload(tenantId: number, file: { buffer: Buffer; mimetype: string }): Promise<EmailImageDto> {
    const img = await optimizeImage(file.buffer, file.mimetype);
    const hash = createHash('sha256').update(img.buffer).digest('hex');
    const same = await this.images.findOne({ where: { tenantId, contentHash: hash } });
    if (same) {
      same.lastUsedAt = new Date();
      await this.images.save(same);
      return toDto(same);
    }
    const { images: all, usedBytes, limitBytes, limitCount } = await this.list(tenantId);
    if (all.length >= limitCount || usedBytes + img.buffer.length > limitBytes) {
      throw new BadRequestException({ code: 'IMAGE_LIMIT', message: 'Your image library is full. Delete some images first.' });
    }
    const config = await this.storage.getStorageConfig(tenantId);
    const stored = await this.storage.storeBlob(tenantId, img.buffer, img.mimeType, config);
    let row: EmailImage;
    try {
      row = await this.images.save(
        this.images.create({
          tenantId,
          contentHash: hash,
          url: stored.url,
          mimeType: img.mimeType,
          width: img.width,
          height: img.height,
          bytes: img.buffer.length,
          pinned: false,
          lastUsedAt: new Date(),
        }),
      );
    } catch (err) {
      // The same image uploaded twice at once: the other request inserted the
      // row (unique tenantId + contentHash). Give back our blob ref, use theirs.
      if (!isDuplicateKey(err)) throw err;
      await this.storage.releaseBlob(tenantId, hash, config);
      const existing = await this.images.findOne({ where: { tenantId, contentHash: hash } });
      if (!existing) throw err;
      return toDto(existing);
    }
    // Two different uploads at once can both pass the check above: count
    // again with our row in, and undo it if the library is now over.
    const after = await this.list(tenantId);
    if (after.images.length > limitCount || after.usedBytes > limitBytes) {
      await this.release(row);
      throw new BadRequestException({ code: 'IMAGE_LIMIT', message: 'Your image library is full. Delete some images first.' });
    }
    return toDto(row);
  }

  private async inAnyTemplate(tenantId: number, url: string): Promise<boolean> {
    const rows = await this.templates.find({ where: { tenantId }, select: ['id', 'bodyHtml'] });
    return rows.some((t) => t.bodyHtml?.includes(url));
  }

  async remove(tenantId: number, id: number): Promise<void> {
    const row = await this.images.findOne({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('Image not found');
    if (row.pinned || (await this.inAnyTemplate(tenantId, row.url))) {
      throw new ConflictException({ code: 'IMAGE_IN_USE', message: 'This image is used in a template or a sent email.' });
    }
    await this.release(row);
  }

  // Row first: a failed delete then leaves a row whose blob still exists,
  // never a row pointing at a released blob.
  private async release(row: EmailImage): Promise<void> {
    await this.images.delete([row.id]);
    const config = await this.storage.getStorageConfig(row.tenantId);
    await this.storage.releaseBlob(row.tenantId, row.contentHash, config);
  }

  // The library rows whose address appears in the html: looked up by the
  // addresses found, or (very many addresses) the whole client library.
  private async rowsIn(tenantId: number, html: string): Promise<EmailImage[]> {
    if (!html) return [];
    const urls = urlsIn(html);
    if (urls && !urls.length) return [];
    const rows = await this.images.find({ where: urls ? { tenantId, url: In(urls) } : { tenantId } });
    return rows.filter((r) => html.includes(r.url));
  }

  // Of `urls`, those still used by one of the client's templates or by any
  // saved version (a restore would bring it back). Template bodies are read
  // once; versions page by page until every address is accounted for.
  private async usedOf(tenantId: number, urls: string[]): Promise<Set<string>> {
    const used = new Set<string>();
    const open = () => urls.filter((u) => !used.has(u));
    const mark = (body: string | null | undefined) => {
      if (!body) return;
      for (const u of open()) if (body.includes(u)) used.add(u);
    };
    for (const t of await this.templates.find({ where: { tenantId }, select: ['id', 'bodyHtml'] })) mark(t.bodyHtml);
    for (let skip = 0; open().length; skip += VERSION_PAGE) {
      const page = await this.versions.find({ where: { tenantId }, select: ['id', 'bodyHtml'], order: { id: 'ASC' }, skip, take: VERSION_PAGE });
      for (const v of page) mark(v.bodyHtml);
      if (page.length < VERSION_PAGE) break;
    }
    return used;
  }

  async touch(tenantId: number, html: string): Promise<void> {
    for (const r of await this.rowsIn(tenantId, html)) {
      r.lastUsedAt = new Date();
      await this.images.save(r);
    }
  }

  async pin(tenantId: number, html: string): Promise<void> {
    for (const r of await this.rowsIn(tenantId, html)) {
      if (r.pinned) continue;
      r.pinned = true;
      r.lastUsedAt = new Date();
      await this.images.save(r);
    }
  }

  async cleanup(now = new Date()): Promise<number> {
    const cutoff = now.getTime() - UNUSED_DAYS * 24 * 3600 * 1000;
    const candidates = (await this.images.find({ where: { pinned: false } })).filter(
      (r) => (r.lastUsedAt ?? r.createdAt).getTime() < cutoff,
    );
    const byTenant = new Map<number, EmailImage[]>();
    for (const r of candidates) byTenant.set(r.tenantId, [...(byTenant.get(r.tenantId) ?? []), r]);
    let removed = 0;
    for (const [tenantId, rows] of byTenant) {
      const used = await this.usedOf(tenantId, rows.map((r) => r.url));
      for (const r of rows) {
        if (used.has(r.url)) continue;
        await this.release(r);
        removed++;
      }
    }
    return removed;
  }
}
