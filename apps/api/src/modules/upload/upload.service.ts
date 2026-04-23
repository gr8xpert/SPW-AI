import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
import { MediaFile, TenantStorageConfig } from '../../database/entities';
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
    @InjectRepository(TenantStorageConfig)
    private storageConfigRepository: Repository<TenantStorageConfig>,
    private configService: ConfigService,
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

    // Always use the verified-by-mimetype extension, never the client filename's ext
    const filename = `${uuidv4()}${safeExt}`;
    const storedPath = `${tenantId}/${propertyId || 'unassigned'}/${filename}`;

    let dimensions: { width: number; height: number } | undefined;
    let processedBuffer = file.buffer;

    if (this.isImage(file.mimetype)) {
      try {
        const metadata = await sharp(file.buffer).metadata();
        dimensions = {
          width: metadata.width || 0,
          height: metadata.height || 0,
        };
        processedBuffer = await this.optimizeImage(file.buffer, file.mimetype);
      } catch (err) {
        this.logger.warn(
          `Rejected invalid image upload for tenant=${tenantId}: ${(err as Error).message}`,
        );
        throw new BadRequestException('Uploaded file is not a valid image');
      }
    }

    const storageType = config?.storageType || 'local';
    let url: string;
    if (storageType === 's3' && config) {
      url = await this.uploadToS3(config, storedPath, processedBuffer, file.mimetype);
    } else {
      url = await this.uploadToLocal(storedPath, processedBuffer);
    }

    const mediaFile = this.mediaFileRepository.create({
      tenantId,
      propertyId,
      storageType,
      originalFilename: this.sanitizeOriginalName(file.originalname),
      storedPath,
      url,
      mimeType: file.mimetype,
      fileSize: processedBuffer.length,
      dimensions,
      isOptimized: this.isImage(file.mimetype),
    });

    const saved = await this.mediaFileRepository.save(mediaFile);

    return {
      id: saved.id,
      url: saved.url,
      originalFilename: saved.originalFilename,
      mimeType: saved.mimeType,
      fileSize: saved.fileSize,
      dimensions: saved.dimensions,
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
    try {
      if (file.storageType === 's3' && config) {
        await this.deleteFromS3(config, file.storedPath);
      } else {
        await this.deleteFromLocal(file.storedPath);
      }
    } catch (err) {
      // We log but still remove the DB row — otherwise a missing file in storage
      // permanently blocks cleanup.
      this.logger.warn(
        `Failed to delete storage object for MediaFile#${id}: ${(err as Error).message}`,
      );
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

  // ============ Private Methods ============
  private isImage(mimeType: string): boolean {
    return mimeType.startsWith('image/');
  }

  private sanitizeOriginalName(name: string): string {
    // Strip path components and control characters. Limit length.
    const base = path.basename(name || 'file').replace(/[\x00-\x1f\x7f]/g, '');
    return base.slice(0, 255);
  }

  private async optimizeImage(buffer: Buffer, mimeType: string): Promise<Buffer> {
    const sharpInstance = sharp(buffer);
    const metadata = await sharpInstance.metadata();
    if ((metadata.width || 0) > 2000 || (metadata.height || 0) > 2000) {
      sharpInstance.resize(2000, 2000, {
        fit: 'inside',
        withoutEnlargement: true,
      });
    }
    switch (mimeType) {
      case 'image/jpeg':
        return sharpInstance.jpeg({ quality: 85 }).toBuffer();
      case 'image/png':
        return sharpInstance.png({ compressionLevel: 8 }).toBuffer();
      case 'image/webp':
        return sharpInstance.webp({ quality: 85 }).toBuffer();
      default:
        return sharpInstance.toBuffer();
    }
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
        ACL: 'public-read',
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
