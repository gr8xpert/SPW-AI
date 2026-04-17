import { Global, Module } from '@nestjs/common';
import { SystemMailerService } from './system-mailer.service';

// Global because the mailer is a cross-cutting concern (auth + future
// password-reset + etc.). Keeping it out of AuthModule avoids the auth
// module bloating as more flows need outbound email.
@Global()
@Module({
  providers: [SystemMailerService],
  exports: [SystemMailerService],
})
export class MailModule {}
