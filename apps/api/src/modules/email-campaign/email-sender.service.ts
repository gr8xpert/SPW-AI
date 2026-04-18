import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as nodemailer from 'nodemailer';
import { TenantEmailConfig, TenantEmailDomain } from '../../database/entities';

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// Shape nodemailer expects on createTransport({ dkim: ... }). Kept as its
// own export so the processor + tests can pass a typed value instead of
// an `any`.
export interface DkimSigningOptions {
  domainName: string;
  keySelector: string;
  privateKey: string;
}

@Injectable()
export class EmailSenderService {
  private readonly logger = new Logger(EmailSenderService.name);

  constructor(
    @InjectRepository(TenantEmailDomain)
    private readonly emailDomainRepo: Repository<TenantEmailDomain>,
  ) {}

  async sendEmail(
    config: TenantEmailConfig,
    options: SendEmailOptions,
    tenantId?: number,
  ): Promise<SendResult> {
    try {
      // 6B — only sign when the tenant has a DKIM record we've confirmed
      // is live in DNS. Signing with an unverified domain would make every
      // receiver hard-fail the message on signature verification.
      const dkim = tenantId ? await this.getDkimOptions(tenantId) : null;
      const transporter = this.createTransporter(config, dkim);

      const result = await transporter.sendMail({
        from: config.fromName
          ? `"${config.fromName}" <${config.fromEmail}>`
          : config.fromEmail,
        replyTo: config.replyTo,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });

      return {
        success: true,
        messageId: result.messageId,
      };
    } catch (error) {
      this.logger.error(`Failed to send email to ${options.to}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async testConnection(config: TenantEmailConfig): Promise<boolean> {
    try {
      const transporter = this.createTransporter(config, null);
      await transporter.verify();
      return true;
    } catch (error) {
      this.logger.error('Email connection test failed:', error);
      return false;
    }
  }

  // Returns the DKIM options nodemailer needs to sign outbound mail on
  // behalf of `tenantId`, or null if the tenant has no verified domain.
  // "Verified" here is deliberately narrow — we require dkimVerifiedAt
  // (the DKIM TXT record landed in DNS). SPF/DMARC being unverified
  // doesn't block signing, since the DKIM signature alone is useful and
  // SPF/DMARC verification is a tenant-ops concern they can complete later.
  async getDkimOptions(tenantId: number): Promise<DkimSigningOptions | null> {
    const row = await this.emailDomainRepo.findOne({ where: { tenantId } });
    if (!row) return null;
    if (!row.dkimVerifiedAt) return null;
    return {
      domainName: row.domain,
      keySelector: row.dkimSelector,
      privateKey: row.dkimPrivateKey,
    };
  }

  private createTransporter(
    config: TenantEmailConfig,
    dkim: DkimSigningOptions | null,
  ): nodemailer.Transporter {
    const base: Record<string, unknown> = {};
    if (dkim) base.dkim = dkim;

    switch (config.provider) {
      case 'smtp':
        return nodemailer.createTransport({
          ...base,
          host: config.smtpHost,
          port: config.smtpPort,
          secure: config.smtpEncryption === 'ssl',
          auth: {
            user: config.smtpUser,
            pass: config.smtpPassword,
          },
          tls:
            config.smtpEncryption === 'tls'
              ? { rejectUnauthorized: false }
              : undefined,
        });

      case 'mailgun':
        // Using nodemailer with mailgun SMTP
        return nodemailer.createTransport({
          ...base,
          host: 'smtp.mailgun.org',
          port: 587,
          secure: false,
          auth: {
            user: `postmaster@${config.apiDomain}`,
            pass: config.apiKey,
          },
        });

      case 'sendgrid':
        return nodemailer.createTransport({
          ...base,
          host: 'smtp.sendgrid.net',
          port: 587,
          secure: false,
          auth: {
            user: 'apikey',
            pass: config.apiKey,
          },
        });

      case 'ses':
        // For SES, use standard SMTP transport with SES credentials
        return nodemailer.createTransport({
          ...base,
          host: `email-smtp.${config.apiDomain || 'us-east-1'}.amazonaws.com`,
          port: 587,
          secure: false,
          auth: {
            user: config.smtpUser, // SES SMTP username
            pass: config.smtpPassword, // SES SMTP password
          },
        });

      default:
        throw new Error(`Unknown email provider: ${config.provider}`);
    }
  }

  renderTemplate(
    template: string,
    data: Record<string, any>,
  ): string {
    // Simple mustache-style template rendering
    return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, path) => {
      const value = path.split('.').reduce((obj: any, key: string) => {
        return obj && obj[key] !== undefined ? obj[key] : '';
      }, data);
      return String(value);
    });
  }
}
