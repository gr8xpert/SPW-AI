import {
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { JwtPayload } from '@spm/shared';

/**
 * Resolves to the current tenant ID from the authenticated JWT.
 * Throws if the request is unauthenticated or the token has no tenantId —
 * so controllers are safe even without an explicit TenantGuard.
 */
export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): number => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as JwtPayload | undefined;

    if (!user || typeof user.tenantId !== 'number') {
      throw new ForbiddenException('Tenant context required');
    }

    return user.tenantId;
  },
);
