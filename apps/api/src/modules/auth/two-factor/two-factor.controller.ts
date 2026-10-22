import { Body, Controller, ForbiddenException, Get, HttpCode, Post, Put } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { JwtPayload } from '@spm/shared';
import { CurrentUser } from '../../../common/decorators';
import { TwoFactorService } from './two-factor.service';

class CodeDto {
  @IsString()
  @MaxLength(20)
  code: string;
}

class DisableDto extends CodeDto {
  @IsString()
  @MaxLength(200)
  password: string;
}

class RequireDto {
  @IsBoolean()
  on: boolean;

  @IsOptional()
  @IsString()
  note?: string;
}

// The signed-in user's own two-factor login. Reachable with an `mfaSetup`
// token (see JwtAuthGuard), so a user forced to set it up can.
@Controller('api/auth/2fa')
export class TwoFactorController {
  constructor(private readonly twoFactor: TwoFactorService) {}

  // Impersonation tokens act as the client's admin but belong to the Super
  // Admin: never let them change the client's own two-factor set-up.
  private self(user: JwtPayload): number {
    if (user.impersonating) throw new ForbiddenException({ message: 'Not while viewing as a client', code: 'IMPERSONATING' });
    return user.sub;
  }

  @Get()
  status(@CurrentUser() user: JwtPayload) {
    return this.twoFactor.status(this.self(user));
  }

  @Post('setup')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  setup(@CurrentUser() user: JwtPayload) {
    return this.twoFactor.setup(this.self(user));
  }

  @Post('enable')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  enable(@CurrentUser() user: JwtPayload, @Body() dto: CodeDto) {
    return this.twoFactor.enable(this.self(user), dto.code);
  }

  @Post('disable')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  disable(@CurrentUser() user: JwtPayload, @Body() dto: DisableDto) {
    return this.twoFactor.disable(this.self(user), dto.password, dto.code);
  }

  @Post('recovery-codes')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  recoveryCodes(@CurrentUser() user: JwtPayload, @Body() dto: CodeDto) {
    return this.twoFactor.newRecoveryCodes(this.self(user), dto.code);
  }

  // Agency admins: everyone in the agency must use two-factor login.
  @Put('require')
  setRequired(@CurrentUser() user: JwtPayload, @Body() dto: RequireDto) {
    if (user.role !== 'admin' && user.role !== 'super_admin') throw new ForbiddenException({ message: 'Only the agency admin can change this', code: 'ADMIN_ONLY' });
    if (user.mfaSetup) throw new ForbiddenException({ message: 'Set up two-factor login first', code: 'TWO_FACTOR_SETUP_REQUIRED' });
    return this.twoFactor.setRequired(user.tenantId, dto.on);
  }
}
