import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RefreshTokenService } from './refresh-token.service';
import { EmailVerificationService } from './email-verification.service';
import { PasswordResetService } from './password-reset.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { ImpersonationService } from './impersonation.service';
import { ImpersonationController } from './impersonation.controller';
import { ImpersonationAuditInterceptor } from '../../common/interceptors/impersonation-audit.interceptor';
import {
  User,
  Tenant,
  Plan,
  RefreshToken,
  EmailVerificationToken,
  PasswordResetToken,
  ImpersonationAudit,
} from '../../database/entities';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Tenant,
      Plan,
      RefreshToken,
      EmailVerificationToken,
      PasswordResetToken,
      ImpersonationAudit,
    ]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.secret'),
        signOptions: {
          expiresIn: configService.get<string>('jwt.expiresIn'),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController, ImpersonationController],
  providers: [
    AuthService,
    RefreshTokenService,
    EmailVerificationService,
    PasswordResetService,
    JwtStrategy,
    ImpersonationService,
    ImpersonationAuditInterceptor,
  ],
  exports: [
    AuthService,
    RefreshTokenService,
    EmailVerificationService,
    PasswordResetService,
    JwtStrategy,
    ImpersonationService,
    ImpersonationAuditInterceptor,
  ],
})
export class AuthModule {}
