import {
  Injectable,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';

export const IS_PUBLIC_KEY = 'isPublic';

// A user whose agency requires two-factor login but who has not set it up
// gets a token marked mfaSetup: it only opens these paths.
const MFA_SETUP_PATHS = /^\/api\/auth\/(me|2fa)(\/|\?|$)/;

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    if (err || !user) {
      throw err || new UnauthorizedException('Invalid or expired token');
    }
    if (user.mfaSetup) {
      const url: string = context.switchToHttp().getRequest()?.originalUrl ?? '';
      if (!MFA_SETUP_PATHS.test(url)) {
        throw new ForbiddenException({ message: 'Set up two-factor login first', code: 'TWO_FACTOR_SETUP_REQUIRED' });
      }
    }
    return user;
  }
}
