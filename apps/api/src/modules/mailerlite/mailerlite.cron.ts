import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { MailerliteConnection, Tenant } from '../../database/entities';
import { RedisLockService } from '../../common/redis/redis-lock.service';
import { MailerLiteConnectionService } from './mailerlite-connection.service';

// Once a day, every connected client who confirmed consent and still has Email
// Campaigns. One client's trouble doesn't stop the others.
@Injectable()
export class MailerLiteCron {
  private readonly logger = new Logger(MailerLiteCron.name);

  constructor(
    @InjectRepository(MailerliteConnection) private readonly connections: Repository<MailerliteConnection>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    private readonly service: MailerLiteConnectionService,
    private readonly lock: RedisLockService,
  ) {}

  @Cron('20 3 * * *')
  async daily(): Promise<void> {
    await this.lock.withLock('mailerlite-sync:daily', 5 * 60_000, () => this.enqueueAll());
  }

  async enqueueAll(): Promise<number> {
    const rows = await this.connections.find({ where: { enabled: true }, select: ['tenantId', 'consentAt', 'state'] });
    const due = rows.filter((r) => r.consentAt && r.state !== 'needs_attention').map((r) => r.tenantId);
    if (!due.length) return 0;

    const tenants = await this.tenants.find({ where: { id: In(due) }, select: ['id', 'isActive', 'dashboardAddons'] });
    let queued = 0;
    for (const t of tenants) {
      if (!t.isActive || !t.dashboardAddons?.emailCampaign) continue;
      try {
        if (await this.service.enqueue(t.id)) queued++;
      } catch (err) {
        this.logger.warn(`MailerLite daily sync not queued for tenant ${t.id}: ${(err as Error).message}`);
      }
    }
    if (queued) this.logger.log(`MailerLite daily sync queued for ${queued} client(s)`);
    return queued;
  }
}
