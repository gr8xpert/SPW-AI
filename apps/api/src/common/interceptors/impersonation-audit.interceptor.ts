import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Observable } from 'rxjs';
import { ImpersonationAudit } from '../../database/entities';

// Attaches to every request. When the caller is running as an impersonation
// session, appends one `action='request'` row per handler invocation. When
// the caller is a normal user, does nothing (early return keeps overhead
// near zero — this is on the hot path).
//
// Writes are fire-and-forget so a stalled DB never blocks the response;
// failures log at warn level so an oncall dashboard sees ledger drift.
@Injectable()
export class ImpersonationAuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ImpersonationAuditInterceptor.name);

  constructor(
    @InjectRepository(ImpersonationAudit)
    private readonly auditRepository: Repository<ImpersonationAudit>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const user = req?.user as
      | (JwtLikeUser & { sessionId?: string })
      | undefined;

    if (!user?.impersonating) {
      return next.handle();
    }

    // Skip the end-impersonation endpoint itself so the session's final
    // request doesn't inflate the ledger with a request row after 'end'.
    const path: string = req?.originalUrl ?? req?.url ?? '';
    if (path.startsWith('/api/auth/end-impersonation')) {
      return next.handle();
    }

    // Fire and forget. `.catch` on a save Promise is enough; we don't
    // await it so response latency is unaffected.
    this.auditRepository
      .save(
        this.auditRepository.create({
          sessionId: user.sessionId ?? 'unknown',
          superAdminUserId: user.originalUserId ?? user.sub,
          tenantId: user.impersonatedTenantId ?? user.tenantId,
          impersonatedUserId: user.impersonatedUserId ?? null,
          action: 'request',
          method: (req?.method ?? '').slice(0, 8),
          path: path.slice(0, 500),
          ipAddress: extractIp(req),
          userAgent: (req?.headers?.['user-agent'] ?? '').toString().slice(0, 500),
        }),
      )
      .catch((err: Error) => {
        this.logger.warn(
          `impersonation audit write failed session=${user.sessionId}: ${err.message}`,
        );
      });

    return next.handle();
  }
}

interface JwtLikeUser {
  sub: number;
  tenantId: number;
  impersonating?: boolean;
  originalUserId?: number;
  impersonatedTenantId?: number;
  impersonatedUserId?: number;
}

function extractIp(req: any): string | null {
  const forwarded = req?.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim().slice(0, 45);
  }
  const ip = req?.ip ?? req?.socket?.remoteAddress;
  return typeof ip === 'string' ? ip.slice(0, 45) : null;
}
