import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from '../../database/entities';
import { TenantPublic, TenantSettings } from '@spw/shared';
import { generateApiKey, hashApiKey } from '../../common/crypto/api-key';

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

  async findByApiKey(rawApiKey: string): Promise<Tenant | null> {
    if (!rawApiKey) return null;
    return this.tenantRepository.findOne({
      where: { apiKeyHash: hashApiKey(rawApiKey), isActive: true },
    });
  }

  // Rotates the tenant's API key. Returns the raw key exactly once; callers
  // must persist it immediately (e.g. in the dashboard flash message).
  async rotateApiKey(tenantId: number): Promise<{ apiKey: string; apiKeyLast4: string }> {
    const tenant = await this.tenantRepository.findOne({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    const generated = generateApiKey();
    tenant.apiKeyHash = generated.hash;
    tenant.apiKeyLast4 = generated.last4;
    await this.tenantRepository.save(tenant);
    return { apiKey: generated.rawKey, apiKeyLast4: generated.last4 };
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

  // Returns non-secret API-key metadata. The raw key itself is never
  // retrievable after generation — admins rotate if they lose it.
  async getApiCredentials(tenantId: number): Promise<{ apiKeyLast4: string; webhookSecret: string }> {
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
      select: ['apiKeyLast4', 'webhookSecret'],
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    return {
      apiKeyLast4: tenant.apiKeyLast4,
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
