import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LeadFile } from '../../../database/entities';
import { UploadService, UploadedFile } from '../../upload/upload.service';
import { BuyerService } from './buyer.service';
import { BuyerViewer } from './buyer-access';

// Images and PDF only (what UploadService stores; videos are not buyer files).
const BUYER_FILE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf']);

// The Files tab: documents on a buyer. Bytes go through UploadService (R2 or
// disk, images optimised); lead_files ties them to the buyer.
@Injectable()
export class BuyerFileService {
  private readonly logger = new Logger(BuyerFileService.name);

  constructor(
    @InjectRepository(LeadFile)
    private readonly fileRepository: Repository<LeadFile>,
    private readonly uploads: UploadService,
    private readonly buyers: BuyerService,
  ) {}

  async list(tenantId: number, viewer: BuyerViewer, leadId: number): Promise<LeadFile[]> {
    await this.buyers.get(tenantId, viewer, leadId);
    return this.query(tenantId).andWhere('f.leadId = :leadId', { leadId }).orderBy('f.createdAt', 'DESC').getMany();
  }

  // Files with the uploader's id and name only.
  private query(tenantId: number) {
    return this.fileRepository
      .createQueryBuilder('f')
      .leftJoin('f.uploadedByUser', 'u')
      .addSelect(['u.id', 'u.name'])
      .where('f.tenantId = :tenantId', { tenantId });
  }

  async upload(tenantId: number, viewer: BuyerViewer, leadId: number, file: UploadedFile): Promise<LeadFile> {
    const lead = await this.buyers.get(tenantId, viewer, leadId);
    if (!BUYER_FILE_TYPES.has(file.mimetype)) throw new BadRequestException('Only images and PDF files can be added');
    const stored = await this.uploads.uploadFile(tenantId, file);
    const name = (file.originalname || 'file').replace(/[\\/:*?"<>|\r\n]+/g, '_').slice(0, 255);
    const saved = await this.fileRepository.save(
      this.fileRepository.create({
        tenantId,
        leadId: lead.id,
        mediaFileId: stored.id,
        name,
        mimeType: stored.mimeType,
        size: stored.fileSize,
        url: stored.url,
        uploadedBy: viewer.id,
      }),
    );
    return this.query(tenantId).andWhere('f.id = :id', { id: saved.id }).getOneOrFail();
  }

  async remove(tenantId: number, viewer: BuyerViewer, fileId: number): Promise<void> {
    const file = await this.fileRepository.findOne({ where: { id: fileId, tenantId } });
    if (!file) throw new NotFoundException('File not found');
    await this.buyers.get(tenantId, viewer, file.leadId).catch(() => {
      throw new NotFoundException('File not found');
    });
    if (file.mediaFileId) {
      // The stored bytes may already be gone (storage cleanup); the row still goes.
      await this.uploads.deleteFile(tenantId, file.mediaFileId).catch((err) => {
        this.logger.warn(`Buyer file ${file.id}: media file ${file.mediaFileId} not deleted: ${(err as Error).message}`);
      });
    }
    await this.fileRepository.delete({ id: file.id, tenantId });
  }
}
