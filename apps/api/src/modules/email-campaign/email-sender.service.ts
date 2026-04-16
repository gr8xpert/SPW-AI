import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { TenantEmailConfig } from '../../database/entities';

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

@Injectable()
export class EmailSenderService {
  private readonly logger = new Logger(EmailSenderService.name);

  async sendEmail(
    config: TenantEmailConfig,
    options: SendEmailOptions,
  ): Promise<SendResult> {
    try {
      const transporter = this.createTransporter(config);

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
      const transporter = this.createTransporter(config);
      await transporter.verify();
      return true;
    } catch (error) {
      this.logger.error('Email connection test failed:', error);
      return false;
    }
  }

  private createTransporter(config: TenantEmailConfig): nodemailer.Transporter {
    switch (config.provider) {
      case 'smtp':
        return nodemailer.createTransport({
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
