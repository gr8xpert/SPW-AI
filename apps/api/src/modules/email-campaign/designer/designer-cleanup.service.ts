import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { RedisLockService } from '../../../common/redis/redis-lock.service';
import { EmailCampaign, EmailTemplate } from '../../../database/entities';
import { EmailImageService } from './email-image.service';

const LOCK_KEY = 'cron:email-designer-cleanup';
const LOCK_TTL_MS = 30 * 60 * 1000;
const DAY_MS = 24 * 3600 * 1000;

// Daily: unused email images (30 days) and empty templates the editor created
// but nobody filled (empty body and subject, untouched for 1 day, no campaign uses them).
// One replica runs it (Redis lock).
@Injectable()
export class DesignerCleanupService {
  private readonly logger = new Logger(DesignerCleanupService.name);

  constructor(
    private readonly images: EmailImageService,
    private readonly lock: RedisLockService,
    @InjectRepository(EmailTemplate) private readonly templates: Repository<EmailTemplate>,
    @InjectRepository(EmailCampaign) private readonly campaigns: Repository<EmailCampaign>,
  ) {}

  @Cron('41 3 * * *')
  async run(): Promise<void> {
    const outcome = await this.lock.withLock(LOCK_KEY, LOCK_TTL_MS, () => this.cleanup());
    if (outcome.acquired && outcome.result) {
      this.logger.log(`removed ${outcome.result.images} unused email image(s), ${outcome.result.templates} empty template(s)`);
    }
  }

  async cleanup(now = new Date()): Promise<{ images: number; templates: number }> {
    const images = await this.images.cleanup(now);
    const empty = await this.templates.find({
      where: { bodyHtml: '', subject: '', updatedAt: LessThan(new Date(now.getTime() - DAY_MS)) },
      select: ['id'],
    });
    let templates = 0;
    for (const t of empty) {
      if (await this.campaigns.count({ where: { templateId: t.id } })) continue;
      await this.templates.delete(t.id);
      templates++;
    }
    return { images, templates };
  }
}
