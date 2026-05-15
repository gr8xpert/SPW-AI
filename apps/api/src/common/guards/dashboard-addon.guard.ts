import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from '../../database/entities';
import { REQUIRES_ADDON_KEY, DashboardAddonKey } from '../decorators/requires-addon.decorator';

// Server-side enforcement for dashboard add-ons. Without this guard, the
// dashboard UI could grey out a feature but a caller hitting the API directly
// (curl / Postman / a leaked admin token) would still succeed — the review's
// P1-04 finding. Resolves @RequiresAddon() metadata set at class or method
// scope and 403s when the add-on isn't unlocked on the tenant.
//
// Tenant comes from request.tenantId, which TenantGuard already populates
// from the JWT payload. This guard must be wired AFTER JwtAuthGuard and
// TenantGuard in the @UseGuards list so request.tenantId is populated by
// the time we run.
@Injectable()
export class DashboardAddonGuard implements CanActivate {
  // Short cache so a single page render (which can fire 5-10 calls) doesn't
  // hit the DB once per request. 30s matches the ApiKeyThrottlerGuard's
  // tenant-plan cache — plan changes propagate in under a minute.
  private readonly cache = new Map<number, { addons: Record<string, boolean>; expiresAt: number }>();
  private readonly TTL_MS = 30_000;

  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Method-level overrides class-level — matches Nest's standard metadata
    // resolution so an addon-free handler on an addon-gated controller can be
    // declared with @RequiresAddon() set on the method.
    const required = this.reflector.getAllAndOverride<DashboardAddonKey | undefined>(
      REQUIRES_ADDON_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true;

    const request = context.switchToHttp().getRequest();
    const tenantId: number | undefined = request.tenantId ?? request.user?.tenantId;
    if (!tenantId) {
      // No tenant context = JwtAuthGuard/TenantGuard should have already
      // rejected. Treat as forbidden rather than silently allowing.
      throw new ForbiddenException('Tenant context required');
    }

    const addons = await this.loadAddons(tenantId);
    if (!addons[required]) {
      throw new ForbiddenException({
        message: `Dashboard add-on "${required}" is not enabled for this tenant`,
        code: 'ADDON_LOCKED',
        addon: required,
      });
    }
    return true;
  }

  private async loadAddons(tenantId: number): Promise<Record<string, boolean>> {
    const now = Date.now();
    const cached = this.cache.get(tenantId);
    if (cached && cached.expiresAt > now) return cached.addons;

    const tenant = await this.tenantRepo.findOne({
      where: { id: tenantId },
      select: ['id', 'dashboardAddons'],
    });
    const addons = (tenant?.dashboardAddons ?? {}) as Record<string, boolean>;
    this.cache.set(tenantId, { addons, expiresAt: now + this.TTL_MS });
    return addons;
  }
}
