import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

// Bearer-token guard for the inbound-email webhook. n8n (or Postmark /
// Mailgun) posts with `Authorization: Bearer <INBOUND_EMAIL_SECRET>` — a
// symmetric secret shared out-of-band, rotated with the env var.
//
// Constant-time comparison so timing side-channels can't leak the secret.
// Also refuses to run when INBOUND_EMAIL_ENABLED != 'true' — a stray
// pod with the endpoint left enabled shouldn't accept messages.
@Injectable()
export class InboundAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.config.get<string>('INBOUND_EMAIL_ENABLED') !== 'true') {
      throw new UnauthorizedException('Inbound email is disabled');
    }
    const expected = this.config.get<string>('INBOUND_EMAIL_SECRET');
    if (!expected) throw new UnauthorizedException('Inbound email is not configured');

    const req = context.switchToHttp().getRequest();
    const header: string | undefined = req.headers['authorization'];
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }
    const presented = header.slice('Bearer '.length).trim();

    const a = Buffer.from(presented);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Invalid bearer token');
    }

    return true;
  }
}
