import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SystemMailerService } from './system-mailer.service';
import { EmailDomainService } from './email-domain.service';
import { EmailDomainController } from './email-domain.controller';
import { TenantEmailDomain } from '../../database/entities';

// Global because the mailer is a cross-cutting concern (auth + future
// password-reset + etc.). Keeping it out of AuthModule avoids the auth
// module bloating as more flows need outbound email.
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([TenantEmailDomain])],
  providers: [SystemMailerService, EmailDomainService],
  controllers: [EmailDomainController],
  exports: [SystemMailerService, EmailDomainService],
})
export class MailModule {}
