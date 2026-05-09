import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { promises as fs, mkdirSync } from 'fs';
import * as path from 'path';
import * as sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import {
  MediaBlob,
  MediaFile,
  TenantStorageConfig,
} from '../../database/entities';
import { CreateStorageConfigDto, UpdateStorageConfigDto } from './dto';

export interface UploadedFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

export interface UploadResult {
  id: number;
  url: string;
  thumbnailUrl?: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  dimensions?: { width: number; height: number };
}

// Client-provided mimetype is untrusted. Only these types are accepted, and the
// stored extension is derived from this table rather than the uploaded filename
// to prevent stored-XSS via attacker-controlled extensions.
const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  private readonly uploadDir: string;
  private readonly baseUrl: string;

  constructor(
    @InjectRepository(MediaFile)
    private mediaFileRepository: Repository<MediaFile>,
    @InjectRepository(MediaBlob)
    private mediaBlobRepository: Repository<MediaBlob>,
    @InjectRepository(TenantStorageConfig)
    private storageConfigRepository: Repository<TenantStorageConfig>,
    private configService: ConfigService,
    private dataSource: DataSource,
  ) {
    this.uploadDir = path.resolve(
      this.configService.get<string>('UPLOAD_DIR') || './uploads',
    );
    this.baseUrl = this.configService.get<string>('API_URL') || 'http://localhost:3001';

    // Ensure upload directory exists (sync is fine at startup)
    mkdirSync(this.uploadDir, { recursive: true });
  }

  // ============ Storage Config ============
  async getStorageConfig(tenantId: number): Promise<TenantStorageConfig | null> {
    const tenantConfig = await this.storageConfigRepository.findOne({ where: { tenantId } });
    if (tenantConfig) return tenantConfig;

    const bucket = this.configService.get<string>('DEFAULT_S3_BUCKET');
    if (!bucket) return null;

    const fallback = new TenantStorageConfig();
    fallback.tenantId = tenantId;
    fallback.storageType = 's3';
    fallback.s3Bucket = bucket;
    fallback.s3Region = this.configService.get<string>('DEFAULT_S3_REGION') || 'eu-west-1';
    fallback.s3AccessKey = this.configService.get<string>('DEFAULT_S3_ACCESS_KEY') || '';
    fallback.s3SecretKey = this.configService.get<string>('DEFAULT_S3_SECRET_KEY') || '';
    fallback.s3Endpoint = this.configService.get<string>('DEFAULT_S3_ENDPOINT') || '';
    fallback.cdnUrl = this.configService.get<string>('DEFAULT_CDN_URL') || '';
    fallback.maxFileSize = 10;
    fallback.isActive = true;
    return fallback;
  }

  async createOrUpdateStorageConfig(
    tenantId: number,
    dto: CreateStorageConfigDto | UpdateStorageConfigDto,
  ): Promise<TenantStorageConfig> {
    let config = await this.storageConfigRepository.findOne({
      where: { tenantId },
    });

    if (config) {
      Object.assign(config, dto);
    } else {
      config = this.storageConfigRepository.create({ ...dto, tenantId });
    }

    return this.storageConfigRepository.save(config);
  }

  async testS3Connection(
    tenantId: number,
  ): Promise<{ success: boolean; error?: string }> {
    const config = await this.getStorageConfig(tenantId);
    if (!config || config.storageType !== 's3') {
      return { success: false, error: 'S3 not configured' };
    }

    try {
      const s3Client = this.createS3Client(config);
      // HeadBucket verifies credentials without writing to the bucket.
      await s3Client.send(new HeadBucketCommand({ Bucket: config.s3Bucket }));
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ============ File Upload ============
  async uploadFile(
    tenantId: number,
    file: UploadedFile,
    propertyId?: number,
  ): Promise<UploadResult> {
    const safeExt = ALLOWED_TYPES[file.mimetype];
    if (!safeExt) {
      throw new BadRequestException('File type not allowed');
    }

    const config = await this.getStorageConfig(tenantId);
    const maxSize = (config?.maxFileSize || 10) * 1024 * 1024;
    if (file.size > maxSize) {
      throw new BadRequestException(
        `File size exceeds maximum of ${config?.maxFileSize || 10}MB`,
      );
    }

    const isImage = this.isImage(file.mimetype);

    if (isImage) {
      let dimensions: { width: number; height: number };
      let main: Buffer;
      let thumbnail: Buffer;
      try {
        const metadata = await sharp(file.buffer).metadata();
        dimensions = {
          width: metadata.width || 0,
          height: metadata.height || 0,
        };
        const optimized = await this.optimizeImageWithThumbnail(file.buffer);
        main = optimized.main;
        thumbnail = optimized.thumbnail;
      } catch (err) {
        this.logger.warn(
          `Rejected invalid image upload for tenant=${tenantId}: ${(err as Error).message}`,
        );
        throw new BadRequestException('Uploaded file is not a valid image');
      }

      // Both main + thumb deduped via media_blobs. If the same image is
      // uploaded twice (e.g. tenant re-uploads an existing photo), refCount
      // bumps and we skip the R2 PUT.
      const mainBlob = await this.storeBlob(tenantId, main, 'image/webp', config);
      const thumbBlob = await this.storeBlob(tenantId, thumbnail, 'image/webp', config);

      const mediaFile = this.mediaFileRepository.create({
        tenantId,
        propertyId,
        storageType: mainBlob.storageType,
        originalFilename: this.sanitizeOriginalName(file.originalname),
        storedPath: mainBlob.storageKey,
        url: mainBlob.url,
        thumbnailPath: thumbBlob.storageKey,
        thumbnailUrl: thumbBlob.url,
        contentHash: mainBlob.hash,
        thumbnailContentHash: thumbBlob.hash,
        mimeType: 'image/webp',
        fileSize: main.length,
        dimensions,
        isOptimized: true,
      });
      const saved = await this.mediaFileRepository.save(mediaFile);
      return {
        id: saved.id,
        url: saved.url,
        thumbnailUrl: saved.thumbnailUrl ?? undefined,
        originalFilename: saved.originalFilename,
        mimeType: saved.mimeType,
        fileSize: saved.fileSize,
        dimensions: saved.dimensions,
      };
    }

    // Non-image (PDF etc): keep the per-upload uuid path. Dedup gives no
    // win for documents tenants typically upload once.
    const filename = `${uuidv4()}${safeExt}`;
    const storedPath = `${tenantId}/${propertyId || 'unassigned'}/${filename}`;
    const storageType = config?.storageType || 'local';
    const url =
      storageType === 's3' && config
        ? await this.uploadToS3(config, storedPath, file.buffer, file.mimetype)
        : await this.uploadToLocal(storedPath, file.buffer);

    const mediaFile = this.mediaFileRepository.create({
      tenantId,
      propertyId,
      storageType,
      originalFilename: this.sanitizeOriginalName(file.originalname),
      storedPath,
      url,
      mimeType: file.mimetype,
      fileSize: file.size,
      isOptimized: false,
    });
    const saved = await this.mediaFileRepository.save(mediaFile);
    return {
      id: saved.id,
      url: saved.url,
      originalFilename: saved.originalFilename,
      mimeType: saved.mimeType,
      fileSize: saved.fileSize,
    };
  }

  async deleteFile(tenantId: number, id: number): Promise<void> {
    const file = await this.mediaFileRepository.findOne({
      where: { id, tenantId },
    });
    if (!file) {
      throw new NotFoundException('File not found');
    }

    const config = await this.getStorageConfig(tenantId);

    // Deduped uploads: decrement refcount via releaseBlob (deletes the R2
    // object only when no other MediaFile/PropertyImage references it).
    if (file.contentHash) {
      await this.releaseBlob(tenantId, file.contentHash, config);
    }
    if (file.thumbnailContentHash) {
      await this.releaseBlob(tenantId, file.thumbnailContentHash, config);
    }

    // Non-deduped paths (legacy or non-image files) still get direct delete.
    if (!file.contentHash) {
      try {
        if (file.storageType === 's3' && config) {
          await this.deleteFromS3(config, file.storedPath);
        } else {
          await this.deleteFromLocal(file.storedPath);
        }
      } catch (err) {
        this.logger.warn(
          `Failed to delete storage object for MediaFile#${id}: ${(err as Error).message}`,
        );
      }
    }

    await this.mediaFileRepository.remove(file);
  }

  async getFilesForProperty(tenantId: number, propertyId: number): Promise<MediaFile[]> {
    return this.mediaFileRepository.find({
      where: { tenantId, propertyId },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
  }

  async updateFileOrder(
    tenantId: number,
    propertyId: number,
    fileIds: number[],
  ): Promise<void> {
    await Promise.all(
      fileIds.map((id, i) =>
        this.mediaFileRepository.update(
          { id, tenantId, propertyId },
          { sortOrder: i },
        ),
      ),
    );
  }

  async assignToProperty(
    tenantId: number,
    fileId: number,
    propertyId: number,
  ): Promise<MediaFile> {
    const file = await this.mediaFileRepository.findOne({
      where: { id: fileId, tenantId },
    });
    if (!file) {
      throw new NotFoundException('File not found');
    }
    file.propertyId = propertyId;
    return this.mediaFileRepository.save(file);
  }

  // ============ Feed Image Methods ============

  // Called from FeedService when tenant.feedImagesToR2 is ON. Downloads
  // the provider image, re-encodes to WebP, deduplicates against
  // media_blobs (skip the R2 PUT if an identical image is already in
  // the tenant's bucket), returns the public URL + content hash for the
  // PropertyImage record.
  async downloadAndStoreFeedImage(
    tenantId: number,
    sourceUrl: string,
  ): Promise<{ url: string; contentHash: string } | null> {
    const config = await this.getStorageConfig(tenantId);
    if (!config || !config.isActive) return null;

    const response = await fetch(sourceUrl, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const webpBuffer = await sharp(Buffer.from(arrayBuffer))
      .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();

    const blob = await this.storeBlob(tenantId, webpBuffer, 'image/webp', config);
    return { url: blob.url, contentHash: blob.hash };
  }

  // ============ Content-Hash Dedup ============

  // Deduplicates by sha256(buffer). Same content = same R2 object across
  // every property/upload that references it. Atomic refcount: insert if
  // new, increment if existing; under concurrency the unique key on
  // (tenantId, contentHash) makes the loser increment the winner's row.
  async storeBlob(
    tenantId: number,
    buffer: Buffer,
    mimeType: string,
    config: TenantStorageConfig | null,
  ): Promise<{
    url: string;
    hash: string;
    storageKey: string;
    storageType: 'local' | 's3';
    isNew: boolean;
  }> {
    const hash = createHash('sha256').update(buffer).digest('hex');
    const ext = mimeType === 'image/webp' ? '.webp' : '';
    const storageKey = `blobs/${tenantId}/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}${ext}`;
    const storageType: 'local' | 's3' =
      config?.storageType === 's3' ? 's3' : 'local';

    // Fast path: already-stored content. Bump refcount, return existing URL.
    const existing = await this.mediaBlobRepository.findOne({
      where: { tenantId, contentHash: hash },
    });
    if (existing) {
      await this.mediaBlobRepository.increment(
        { id: existing.id },
        'refCount',
        1,
      );
      return {
        url: this.urlForKey(config, existing.storageKey, existing.storageType),
        hash,
        storageKey: existing.storageKey,
        storageType: existing.storageType,
        isNew: false,
      };
    }

    // Cold path: upload first so a crash doesn't leave a refcount-1 row
    // pointing at nothing. The unique key on (tenantId, hash) catches a
    // concurrent insert and we just bump the winner instead.
    const url =
      storageType === 's3' && config
        ? await this.uploadToS3(config, storageKey, buffer, mimeType)
        : await this.uploadToLocal(storageKey, buffer);

    try {
      await this.mediaBlobRepository.insert({
        tenantId,
        contentHash: hash,
        storageKey,
        storageType,
        size: buffer.length,
        mimeType,
        refCount: 1,
      });
      return { url, hash, storageKey, storageType, isNew: true };
    } catch (err: any) {
      // ER_DUP_ENTRY: someone inserted the same hash between our SELECT
      // and INSERT. Increment the winner's refcount; our just-uploaded
      // object is identical bytes overwriting the same key — harmless.
      if (err?.code === 'ER_DUP_ENTRY' || err?.errno === 1062) {
        await this.mediaBlobRepository.increment(
          { tenantId, contentHash: hash },
          'refCount',
          1,
        );
        return { url, hash, storageKey, storageType, isNew: false };
      }
      throw err;
    }
  }

  // Decrement refcount; if hit zero, delete from storage and remove the
  // row. The conditional DELETE protects against a concurrent storeBlob
  // bumping the count back up between our decrement and our delete.
  async releaseBlob(
    tenantId: number,
    contentHash: string,
    config: TenantStorageConfig | null,
  ): Promise<void> {
    const blob = await this.mediaBlobRepository.findOne({
      where: { tenantId, contentHash },
    });
    if (!blob) return;

    if (blob.refCount > 1) {
      await this.dataSource.query(
        `UPDATE media_blobs SET refCount = refCount - 1
           WHERE id = ? AND refCount > 1`,
        [blob.id],
      );
      return;
    }

    // Last reference — atomic "delete if still last" so we don't race.
    const result: { affectedRows?: number } = await this.dataSource.query(
      `DELETE FROM media_blobs WHERE id = ? AND refCount = 1`,
      [blob.id],
    );
    if ((result.affectedRows ?? 0) !== 1) {
      // Someone bumped refCount between our SELECT and DELETE; let them keep it.
      return;
    }

    try {
      if (blob.storageType === 's3' && config) {
        await this.deleteFromS3(config, blob.storageKey);
      } else {
        await this.deleteFromLocal(blob.storageKey);
      }
    } catch (err) {
      this.logger.warn(
        `Failed to delete storage object for blob ${blob.contentHash}: ${(err as Error).message}`,
      );
    }
  }

  private urlForKey(
    config: TenantStorageConfig | null,
    storageKey: string,
    storageType: 'local' | 's3',
  ): string {
    if (storageType === 'local' || !config) {
      return `${this.baseUrl}/uploads/${storageKey}`;
    }
    if (config.cdnUrl) return `${config.cdnUrl}/${storageKey}`;
    if (config.s3Endpoint)
      return `${config.s3Endpoint}/${config.s3Bucket}/${storageKey}`;
    return `https://${config.s3Bucket}.s3.${config.s3Region}.amazonaws.com/${storageKey}`;
  }

  // ============ Private Methods ============
  private isImage(mimeType: string): boolean {
    return mimeType.startsWith('image/');
  }

  private sanitizeOriginalName(name: string): string {
    // Strip path components and control characters. Limit length.
    const base = path.basename(name || 'file').replace(/[\x00-\x1f\x7f]/g, '');
    return base.slice(0, 255);
  }

  private async optimizeImageWithThumbnail(
    buffer: Buffer,
  ): Promise<{ main: Buffer; thumbnail: Buffer }> {
    const main = await sharp(buffer)
      .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();

    const thumbnail = await sharp(buffer)
      .resize(400, 400, { fit: 'cover', position: 'centre' })
      .webp({ quality: 75 })
      .toBuffer();

    return { main, thumbnail };
  }

  private async uploadToLocal(storedPath: string, buffer: Buffer): Promise<string> {
    const fullPath = path.join(this.uploadDir, storedPath);
    // Defence in depth: make sure the resolved path stays under uploadDir.
    const resolved = path.resolve(fullPath);
    if (!resolved.startsWith(this.uploadDir + path.sep)) {
      throw new BadRequestException('Invalid storage path');
    }
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, buffer);
    return `${this.baseUrl}/uploads/${storedPath}`;
  }

  private async deleteFromLocal(storedPath: string): Promise<void> {
    const fullPath = path.join(this.uploadDir, storedPath);
    const resolved = path.resolve(fullPath);
    if (!resolved.startsWith(this.uploadDir + path.sep)) return;
    try {
      await fs.unlink(resolved);
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err;
    }
  }

  private createS3Client(config: TenantStorageConfig): S3Client {
    return new S3Client({
      region: config.s3Region || 'us-east-1',
      endpoint: config.s3Endpoint,
      credentials: {
        accessKeyId: config.s3AccessKey || '',
        secretAccessKey: config.s3SecretKey || '',
      },
      forcePathStyle: !!config.s3Endpoint,
    });
  }

  private async uploadToS3(
    config: TenantStorageConfig,
    storedPath: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<string> {
    const s3Client = this.createS3Client(config);
    await s3Client.send(
      new PutObjectCommand({
        Bucket: config.s3Bucket,
        Key: storedPath,
        Body: buffer,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    if (config.cdnUrl) return `${config.cdnUrl}/${storedPath}`;
    if (config.s3Endpoint)
      return `${config.s3Endpoint}/${config.s3Bucket}/${storedPath}`;
    return `https://${config.s3Bucket}.s3.${config.s3Region}.amazonaws.com/${storedPath}`;
  }

  private async deleteFromS3(
    config: TenantStorageConfig,
    storedPath: string,
  ): Promise<void> {
    const s3Client = this.createS3Client(config);
    await s3Client.send(
      new DeleteObjectCommand({ Bucket: config.s3Bucket, Key: storedPath }),
    );
  }
}
