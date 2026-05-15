import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Plan, Property, Tenant } from '../../database/entities';

export interface QuotaCheck {
  used: number;
  limit: number;
  remaining: number;
}

// Tenant property-quota enforcement (review P1-05). `Plan.maxProperties` was
// previously decorative — the field existed on the entity but no code path
// consulted it. Without enforcement, a tenant on a 100-property starter plan
// could create 10,000 rows manually (or via feed import) without billing
// signal.
//
// Used in two places:
//   - PropertyService.create()  → assertCanCreate(tenantId, 1) — blocks at the
//                                  controller layer with 403 + ADDON_QUOTA_EXCEEDED.
//   - FeedService.processImport() → reservedSlots(tenantId, batchSize) returns
//                                  how many of the incoming batch fit; the
//                                  importer skips the overflow.
//
// Plan rows without an explicit maxProperties default to 100 (the column
// default). Internal/admin-override tenants are exempt — same policy as
// subscription enforcement.
@Injectable()
export class PropertyQuotaService {
  private readonly logger = new Logger(PropertyQuotaService.name);

  constructor(
    @InjectRepository(Property)
    private readonly propertyRepo: Repository<Property>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(Plan)
    private readonly planRepo: Repository<Plan>,
  ) {}

  // Returns { used, limit, remaining }. Internal/override tenants get
  // Number.POSITIVE_INFINITY as the limit so callers don't need separate
  // branches.
  async checkQuota(tenantId: number): Promise<QuotaCheck> {
    const tenant = await this.tenantRepo.findOne({
      where: { id: tenantId },
      select: ['id', 'planId', 'isInternal', 'adminOverride'],
    });
    if (!tenant) {
      return { used: 0, limit: Number.POSITIVE_INFINITY, remaining: Number.POSITIVE_INFINITY };
    }
    if (tenant.isInternal || tenant.adminOverride) {
      const used = await this.propertyRepo.count({ where: { tenantId } });
      return { used, limit: Number.POSITIVE_INFINITY, remaining: Number.POSITIVE_INFINITY };
    }

    const plan = tenant.planId
      ? await this.planRepo.findOne({ where: { id: tenant.planId }, select: ['id', 'maxProperties'] })
      : null;
    const limit = plan?.maxProperties ?? 100;
    const used = await this.propertyRepo.count({ where: { tenantId } });
    return { used, limit, remaining: Math.max(0, limit - used) };
  }

  // Throws 403 if creating `count` more properties would exceed the plan
  // limit. Used by the manual-create endpoint where exceeding quota is a
  // hard error the operator can act on (upgrade plan, delete stale rows).
  async assertCanCreate(tenantId: number, count = 1): Promise<void> {
    const { used, limit, remaining } = await this.checkQuota(tenantId);
    if (count <= remaining) return;
    throw new ForbiddenException({
      message:
        `Plan limit reached: ${used}/${limit} properties used. ` +
        `Upgrade the plan or remove existing properties to add more.`,
      code: 'PLAN_QUOTA_EXCEEDED',
      used,
      limit,
      requested: count,
    });
  }

  // Returns how many of `count` requested can be created without exceeding
  // the plan limit. Used by the feed importer so a 5,000-property feed against
  // a 1,000-row plan imports the first 1,000 and records the rest as skipped
  // instead of failing the whole import or silently inflating row count.
  async reserveSlots(tenantId: number, count: number): Promise<number> {
    const { remaining } = await this.checkQuota(tenantId);
    if (!Number.isFinite(remaining)) return count;
    return Math.max(0, Math.min(count, remaining));
  }
}
