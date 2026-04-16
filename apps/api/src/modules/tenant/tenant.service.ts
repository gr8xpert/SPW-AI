import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from '../../database/entities';
import { TenantPublic, TenantSettings } from '@spw/shared';

@Injectable()
export class TenantService {
  constructor(
    @InjectRepository(Tenant)
    private tenantRepository: Repository<Tenant>,
  ) {}

  async findById(id: number): Promise<TenantPublic> {
    const tenant = await this.tenantRepository.findOne({
      where: { id },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    return this.toPublic(tenant);
  }

  async findBySlug(slug: string): Promise<TenantPublic> {
    const tenant = await this.tenantRepository.findOne({
      where: { slug },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    return this.toPublic(tenant);
  }

  async findByApiKey(apiKey: string): Promise<Tenant | null> {
    return this.tenantRepository.findOne({
      where: { apiKey, isActive: true },
    });
  }

  async updateSettings(
    tenantId: number,
    settings: Partial<TenantSettings>,
  ): Promise<TenantPublic> {
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    tenant.settings = { ...tenant.settings, ...settings };
    await this.tenantRepository.save(tenant);

    return this.toPublic(tenant);
  }

  async incrementSyncVersion(tenantId: number): Promise<void> {
    await this.tenantRepository.increment({ id: tenantId }, 'syncVersion', 1);
  }

  async getApiCredentials(tenantId: number): Promise<{ apiKey: string; webhookSecret: string }> {
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
      select: ['apiKey', 'webhookSecret'],
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    return {
      apiKey: tenant.apiKey,
      webhookSecret: tenant.webhookSecret,
    };
  }

  private toPublic(tenant: Tenant): TenantPublic {
    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      domain: tenant.domain,
      settings: tenant.settings,
      isActive: tenant.isActive,
    };
  }
}
