import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Transporter, SendMailOptions } from 'nodemailer';
import * as nodemailer from 'nodemailer';

/**
 * System-level mailer for platform emails (verification, password reset) —
 * distinct from EmailSenderService which sends on behalf of tenants using
 * per-tenant campaign credentials.
 *
 * Configured via env vars; when SMTP_HOST is absent the service logs the
 * outgoing message instead of dispatching it. That's the default in dev +
 * tests so no one accidentally emails a real address during a smoke run.
 *
 * Env:
 *   SMTP_HOST        Required to enable real delivery.
 *   SMTP_PORT        Default 587.
 *   SMTP_USER        Optional.
 *   SMTP_PASSWORD    Optional. If user set, pass must be set too.
 *   SMTP_SECURE      'true' → TLS from the start (port 465 style). Default false.
 *   SMTP_FROM        Required envelope-from address when host is configured.
 *   SMTP_FROM_NAME   Optional display name wrapped around SMTP_FROM.
 *
 * A custom transporter can be injected via `__setTransporterForTests` so the
 * verification-email smoke test can capture outgoing messages without
 * booting a real SMTP server.
 */
export interface SystemMailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

interface MailTransport {
  sendMail(options: SendMailOptions): Promise<{ messageId?: string }>;
}

export interface MailerSendResult {
  delivered: boolean;
  skippedReason?: 'no-transport' | 'error';
  messageId?: string;
  error?: string;
}

@Injectable()
export class SystemMailerService {
  private readonly logger = new Logger(SystemMailerService.name);
  private transporter: MailTransport | null = null;
  private from: string | null = null;
  private readonly host: string | undefined;

  constructor(private readonly config: ConfigService) {
    this.host = this.config.get<string>('SMTP_HOST') || undefined;
    if (this.host) {
      const port = Number(this.config.get<string>('SMTP_PORT') ?? 587);
      const user = this.config.get<string>('SMTP_USER') || undefined;
      const pass = this.config.get<string>('SMTP_PASSWORD') || undefined;
      const secure = this.config.get<string>('SMTP_SECURE') === 'true';
      const fromEmail = this.config.get<string>('SMTP_FROM');

      if (!fromEmail) {
        // Operator configured a host without a from-address; refuse to send
        // anything — nodemailer would reject per-call anyway, but failing
        // loudly at boot is less surprising than every verification silently
        // erroring in the wild.
        this.logger.error(
          'SMTP_HOST is set but SMTP_FROM is missing — system emails will be log-only',
        );
        return;
      }

      const fromName = this.config.get<string>('SMTP_FROM_NAME');
      this.from = fromName ? `"${fromName}" <${fromEmail}>` : fromEmail;

      this.transporter = nodemailer.createTransport({
        host: this.host,
        port,
        secure,
        auth: user ? { user, pass } : undefined,
      }) as Transporter;

      this.logger.log(`System mailer configured: ${user ?? '-'}@${this.host}:${port}`);
    } else {
      this.logger.log('SMTP_HOST not set — system emails will be log-only (dev mode)');
    }
  }

  async send(message: SystemMailMessage): Promise<MailerSendResult> {
    if (!this.transporter || !this.from) {
      // Log-only mode. Keep the subject + a link preview so devs can click
      // through without reading the full HTML — verification flows pivot on
      // the URL, not the styling.
      const linkPreview = firstHttpUrl(message.text) || firstHttpUrl(message.html);
      this.logger.log(
        `[mail:log-only] to=${message.to} subject="${message.subject}"${
          linkPreview ? ` link=${linkPreview}` : ''
        }`,
      );
      return { delivered: false, skippedReason: 'no-transport' };
    }

    try {
      const result = await this.transporter.sendMail({
        from: this.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      });
      return { delivered: true, messageId: result.messageId };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.logger.error(`mail send failed: to=${message.to} error=${error}`);
      return { delivered: false, skippedReason: 'error', error };
    }
  }

  // Test-only seam. Never used in production code paths — keeps the
  // SystemMailerService boot contract without forcing tests to set real
  // SMTP env vars or spin up a fake server.
  __setTransporterForTests(transport: MailTransport, from: string): void {
    this.transporter = transport;
    this.from = from;
  }
}

function firstHttpUrl(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const match = text.match(/https?:\/\/[^\s"<>)]+/i);
  return match?.[0];
}
