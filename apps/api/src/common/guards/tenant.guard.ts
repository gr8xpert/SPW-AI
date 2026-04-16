import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { JwtPayload } from '@spw/shared';

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user as JwtPayload;

    if (!user || !user.tenantId) {
      throw new ForbiddenException('Tenant context required');
    }

    // Attach tenantId to request for easy access in services
    request.tenantId = user.tenantId;

    return true;
  }
}
