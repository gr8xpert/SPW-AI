import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPayload } from '@spm/shared';

// Extended payload type to support 'id' as alias for 'sub'
type ExtendedJwtPayloadKey = keyof JwtPayload | 'id';

export const CurrentUser = createParamDecorator(
  (data: ExtendedJwtPayloadKey | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as JwtPayload;

    if (data) {
      // Support 'id' as alias for 'sub' (user ID)
      if (data === 'id') {
        return user.sub;
      }
      return user[data as keyof JwtPayload];
    }

    return user;
  },
);
