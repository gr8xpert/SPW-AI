import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PluginActivation, PluginCreditUsage, PluginLicense } from '../../database/entities';
import { MailModule } from '../mail/mail.module';
import { PluginLicenseBillingService } from './plugin-license-billing.service';
import { PluginLicenseController } from './plugin-license.controller';
import { PluginLicenseService } from './plugin-license.service';
import { PluginTranslateService } from './plugin-translate.service';

// Licences for SPM's sellable WordPress plugins (SPM AI Translator for Polylang).
// PaymentModule imports this to hand plugin Stripe events to PluginLicenseBillingService.
@Module({
  imports: [TypeOrmModule.forFeature([PluginLicense, PluginActivation, PluginCreditUsage]), MailModule],
  controllers: [PluginLicenseController],
  providers: [PluginLicenseService, PluginTranslateService, PluginLicenseBillingService],
  exports: [PluginLicenseBillingService, PluginLicenseService],
})
export class PluginLicenseModule {}
