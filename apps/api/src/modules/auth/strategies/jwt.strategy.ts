import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from '@spm/shared';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../../database/entities';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.secret'),
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    // For impersonation tokens: `sub` is the SUPER_ADMIN's real id. That
    // user must still exist + be active. We don't re-query the
    // impersonated user on every request — the token itself is proof the
    // super-admin was allowed to become them at start time, and the
    // interceptor logs each request for audit.
    const user = await this.userRepository.findOne({
      where: { id: payload.sub, isActive: true },
      select: ['id', 'tenantId', 'role', 'isActive'],
    });

    if (!user) {
      throw new UnauthorizedException('User not found or inactive');
    }

    // Preserve every impersonation claim so downstream guards (RolesGuard,
    // TenantGuard, DashboardAddonGuard) act on the impersonated tenant's
    // scope while the audit interceptor can still see who's really acting.
    return {
      sub: payload.sub,
      email: payload.email,
      tenantId: payload.tenantId,
      role: payload.role,
      impersonating: payload.impersonating,
      originalUserId: payload.originalUserId,
      originalRole: payload.originalRole,
      impersonatedTenantId: payload.impersonatedTenantId,
      impersonatedUserId: payload.impersonatedUserId,
      // sessionId isn't in the JwtPayload type but rides along for the
      // audit interceptor. Cast to any to survive TS's strict shape.
      ...((payload as any).sessionId
        ? { sessionId: (payload as any).sessionId }
        : {}),
    } as JwtPayload;
  }
}
