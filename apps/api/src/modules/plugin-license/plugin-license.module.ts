import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog, PluginActivation, PluginCreditUsage, PluginLicense } from '../../database/entities';
import { MailModule } from '../mail/mail.module';
import { PluginLicenseAdminController } from './plugin-license-admin.controller';
import { PluginLicenseAdminService } from './plugin-license-admin.service';
import { PluginLicenseBillingService } from './plugin-license-billing.service';
import { PluginLicenseMailer } from './plugin-license-mailer.service';
import { PluginLicenseController } from './plugin-license.controller';
import { PluginLicenseService } from './plugin-license.service';
import { PluginTranslateService } from './plugin-translate.service';

// Licences for SPM's sellable WordPress plugins (SPM AI Translator for Polylang): the plugin API,
// Super admin -> Plugin licences, and (optional) Stripe auto-issue.
// PaymentModule imports this to hand plugin Stripe events to PluginLicenseBillingService.
@Module({
  imports: [TypeOrmModule.forFeature([PluginLicense, PluginActivation, PluginCreditUsage, AuditLog]), MailModule],
  controllers: [PluginLicenseController, PluginLicenseAdminController],
  providers: [PluginLicenseService, PluginTranslateService, PluginLicenseBillingService, PluginLicenseMailer, PluginLicenseAdminService],
  exports: [PluginLicenseBillingService, PluginLicenseService],
})
export class PluginLicenseModule {}
