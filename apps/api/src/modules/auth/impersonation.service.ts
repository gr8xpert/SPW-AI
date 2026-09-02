import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { Tenant, User, ImpersonationAudit } from '../../database/entities';
import { JwtPayload, UserRole } from '@spm/shared';

export interface ImpersonationStartResult {
  accessToken: string;
  tenant: {
    id: number;
    name: string;
    slug: string;
  };
  impersonatedUser: {
    id: number;
    email: string;
    role: string;
  };
  sessionId: string;
  // Short-lived so a leaked impersonation token can't linger for days.
  expiresIn: string;
}

@Injectable()
export class ImpersonationService {
  private readonly logger = new Logger(ImpersonationService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(ImpersonationAudit)
    private readonly auditRepository: Repository<ImpersonationAudit>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Mint a scoped JWT that lets a super-admin act as the tenant's admin
   * user. The token carries impersonation claims so:
   *   - JwtStrategy can preserve who's really acting for audit
   *   - guards behave as if the tenant admin is logged in (RolesGuard,
   *     TenantGuard, DashboardAddonGuard all use payload.role/tenantId)
   *
   * Deliberately does NOT allow impersonating another super_admin — that
   * would let one admin cover their tracks by acting under another
   * admin's identity.
   */
  async startImpersonation(
    superAdmin: JwtPayload,
    tenantId: number,
    request: { ip?: string; userAgent?: string },
  ): Promise<ImpersonationStartResult> {
    if (superAdmin.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only super admins can impersonate clients');
    }
    if (superAdmin.impersonating) {
      // Prevent nested impersonation: return to admin first, then swap.
      // Nested chains break the audit story ("who really did X?").
      throw new ForbiddenException(
        'Already impersonating — return to admin before switching clients',
      );
    }

    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
      select: ['id', 'name', 'slug', 'isActive'],
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    if (!tenant.isActive) {
      throw new ForbiddenException('Cannot impersonate an inactive tenant');
    }

    // Prefer the tenant's ADMIN user so the impersonation session sees the
    // dashboard exactly as the tenant owner does. Fallback to any active
    // user if no ADMIN exists (edge case — a tenant should always have one
    // from client creation, but grandfathered rows may not).
    const impersonatedUser =
      (await this.userRepository.findOne({
        where: { tenantId, role: UserRole.ADMIN, isActive: true },
        select: ['id', 'email', 'role', 'isActive'],
      })) ??
      (await this.userRepository.findOne({
        where: { tenantId, isActive: true },
        select: ['id', 'email', 'role', 'isActive'],
      }));

    if (!impersonatedUser) {
      throw new NotFoundException(
        'No active user found for this tenant — cannot impersonate',
      );
    }

    const sessionId = randomBytes(16).toString('hex');
    const payload: JwtPayload = {
      sub: superAdmin.sub, // keep original identity so audit stays honest
      email: impersonatedUser.email,
      tenantId: tenant.id,
      role: impersonatedUser.role, // act with the tenant user's role
      impersonating: true,
      originalUserId: superAdmin.sub,
      originalRole: UserRole.SUPER_ADMIN,
      impersonatedTenantId: tenant.id,
      impersonatedUserId: impersonatedUser.id,
      // sessionId is not part of JwtPayload officially but survives through
      // the JWT since JwtService signs whatever object we pass. The
      // interceptor reads it back off req.user (see JwtStrategy.validate).
      ...({ sessionId } as any),
    };

    // Short-lived (1h) so a stolen impersonation token has a small blast
    // radius. Operator can always start a new session — cost is one click.
    const expiresIn =
      this.configService.get<string>('impersonation.expiresIn') ?? '1h';
    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('jwt.secret'),
      expiresIn,
    });

    await this.auditRepository.save(
      this.auditRepository.create({
        sessionId,
        superAdminUserId: superAdmin.sub,
        tenantId: tenant.id,
        impersonatedUserId: impersonatedUser.id,
        action: 'start',
        method: null,
        path: null,
        ipAddress: request.ip ?? null,
        userAgent: request.userAgent ?? null,
      }),
    );

    this.logger.log(
      `Impersonation started: superAdmin=${superAdmin.sub} tenant=${tenant.id} session=${sessionId}`,
    );

    return {
      accessToken,
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
      impersonatedUser: {
        id: impersonatedUser.id,
        email: impersonatedUser.email,
        role: impersonatedUser.role,
      },
      sessionId,
      expiresIn,
    };
  }

  /**
   * Return the calling super-admin to their own session. Issues a fresh
   * un-impersonated JWT with the super_admin's real tenantId and marks the
   * session's 'start' rows as ended so audit stays clean.
   *
   * The caller must be authenticated with an impersonation token — plain
   * super-admin tokens aren't valid here (nothing to end).
   */
  async endImpersonation(payload: JwtPayload): Promise<{ accessToken: string }> {
    if (!payload.impersonating || !payload.originalUserId) {
      throw new ForbiddenException('Not currently impersonating');
    }

    const superAdmin = await this.userRepository.findOne({
      where: { id: payload.originalUserId, isActive: true },
      select: ['id', 'email', 'tenantId', 'role', 'isActive'],
    });
    if (!superAdmin || superAdmin.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Original super-admin account no longer valid',
      );
    }

    const sessionId = (payload as any).sessionId as string | undefined;
    if (sessionId) {
      // Stamp endedAt on the session's start row so the audit view can
      // show duration and flag sessions that were abandoned (no end row).
      await this.auditRepository
        .createQueryBuilder()
        .update()
        .set({ endedAt: new Date() })
        .where('sessionId = :sessionId AND action = :action AND endedAt IS NULL', {
          sessionId,
          action: 'start',
        })
        .execute();

      await this.auditRepository.save(
        this.auditRepository.create({
          sessionId,
          superAdminUserId: superAdmin.id,
          tenantId: payload.impersonatedTenantId ?? payload.tenantId,
          impersonatedUserId: payload.impersonatedUserId ?? null,
          action: 'end',
        }),
      );
    }

    const restoredPayload: JwtPayload = {
      sub: superAdmin.id,
      email: superAdmin.email,
      tenantId: superAdmin.tenantId,
      role: superAdmin.role,
    };
    const accessToken = this.jwtService.sign(restoredPayload, {
      secret: this.configService.get<string>('jwt.secret'),
      expiresIn: this.configService.get<string>('jwt.expiresIn'),
    });

    this.logger.log(
      `Impersonation ended: superAdmin=${superAdmin.id} session=${sessionId ?? 'unknown'}`,
    );

    return { accessToken };
  }
}
