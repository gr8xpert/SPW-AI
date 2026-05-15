import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  Headers,
  ParseIntPipe,
  UnauthorizedException,
  BadRequestException,
  Logger,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { ApiKeyThrottlerGuard } from '../../common/guards/api-key-throttler.guard';
import { LeadService } from './lead.service';
import { CreateLeadDto, UpdateLeadDto, CreateActivityDto } from './dto';
import { CurrentTenant, CurrentUser, Public } from '../../common/decorators';
import { LeadStatus, Tenant } from '../../database/entities';
import { TenantService } from '../tenant/tenant.service';
import { SystemMailerService } from '../mail/system-mailer.service';
import { WebhookService } from '../webhook/webhook.service';
import { TenantSettings } from '@spm/shared';
import { escapeHtml } from '../../common/security/escape-html';

@Controller('api/dashboard/leads')
export class LeadController {
  constructor(private readonly leadService: LeadService) {}

  @Post()
  create(
    @CurrentTenant() tenantId: number,
    @CurrentUser('id') userId: number,
    @Body() dto: CreateLeadDto,
  ) {
    return this.leadService.create(tenantId, userId, dto);
  }

  @Get()
  findAll(
    @CurrentTenant() tenantId: number,
    @Query('status') status?: LeadStatus,
    @Query('assignedTo') assignedTo?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.leadService.findAll(tenantId, {
      status,
      assignedTo: assignedTo ? parseInt(assignedTo) : undefined,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
    });
  }

  @Get('pipeline')
  getPipeline(@CurrentTenant() tenantId: number) {
    return this.leadService.findByPipeline(tenantId);
  }

  @Get('stats')
  getStats(@CurrentTenant() tenantId: number) {
    return this.leadService.getStats(tenantId);
  }

  @Get(':id')
  findOne(
    @CurrentTenant() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.leadService.findOne(tenantId, id);
  }

  @Put(':id')
  update(
    @CurrentTenant() tenantId: number,
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLeadDto,
  ) {
    return this.leadService.update(tenantId, id, userId, dto);
  }

  @Post(':id/activities')
  addActivity(
    @CurrentTenant() tenantId: number,
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateActivityDto,
  ) {
    return this.leadService.addActivity(tenantId, id, userId, dto);
  }

  @Get(':id/activities')
  getActivities(
    @CurrentTenant() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.leadService.getActivities(tenantId, id);
  }
}

// Public inquiry endpoint for widget. Write-heavy and abuse-prone, so we
// (a) scope rate-limiting per tenant API key via ApiKeyThrottlerGuard and
// (b) pin a tighter per-key ceiling here — 30 requests / minute is plenty for
// a genuine inquiry form and curbs CRM-spam attacks.
@Controller('api/v1/inquiry')
@UseGuards(ApiKeyThrottlerGuard)
@SkipThrottle({ default: true, short: true, medium: true, long: true })
@Throttle({ 'api-key': { limit: 30, ttl: 60_000 } })
export class InquiryController {
  private readonly logger = new Logger(InquiryController.name);

  constructor(
    private readonly leadService: LeadService,
    private readonly tenantService: TenantService,
    private readonly mailer: SystemMailerService,
    private readonly webhookService: WebhookService,
  ) {}

  private async getTenantFromApiKey(apiKey: string): Promise<Tenant> {
    if (!apiKey) throw new UnauthorizedException('API key required');
    const tenant = await this.tenantService.findActiveWidgetTenantByApiKey(apiKey);
    if (!tenant) throw new UnauthorizedException('Invalid API key');
    return tenant;
  }

  private async verifyRecaptcha(secretKey: string, token: string): Promise<boolean> {
    try {
      const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `secret=${encodeURIComponent(secretKey)}&response=${encodeURIComponent(token)}`,
      });
      const data = await res.json();
      return data.success === true;
    } catch {
      return false;
    }
  }

  // Window for considering an inquiry a duplicate. 10 minutes balances
  // "double-clicked submit" / "F5 refresh" abuse against the legitimate case
  // of two distinct buyers from the same household using the same email.
  private static readonly DEDUPE_WINDOW_MS = 10 * 60 * 1000;

  @Public()
  @Post()
  async createInquiry(
    @Headers('x-api-key') apiKey: string,
    @Body() body: CreateLeadDto & { recaptchaToken?: string },
  ) {
    const tenant = await this.getTenantFromApiKey(apiKey);
    const settings = (tenant.settings || {}) as TenantSettings;
    // Encrypted column is authoritative; settings.recaptchaSecretKey is a
    // pre-migration legacy fallback (post-migration this field is always undefined
    // since the public sanitizer strips it).
    const secretKey = tenant.recaptchaSecretKey || settings.recaptchaSecretKey;

    if (secretKey) {
      if (!body.recaptchaToken) {
        throw new BadRequestException('reCAPTCHA verification required');
      }
      const valid = await this.verifyRecaptcha(secretKey, body.recaptchaToken);
      if (!valid) {
        throw new BadRequestException('reCAPTCHA verification failed');
      }
    }

    const { recaptchaToken, ...dto } = body;

    // Duplicate-inquiry suppression (review P1-09). If the same email already
    // inquired about the same property in the last 10 minutes, return the
    // existing lead instead of creating a new one + firing another email +
    // another webhook. The widget client sees a 200 with the original lead
    // ID, so a UX of "thanks!" continues to render even on retries.
    if (dto.email) {
      const existing = await this.leadService.findRecentDuplicateInquiry(
        tenant.id,
        dto.email,
        dto.propertyId ?? null,
        InquiryController.DEDUPE_WINDOW_MS,
      );
      if (existing) {
        this.logger.log(
          `Inquiry dedup for tenant=${tenant.id} email=${dto.email} property=${dto.propertyId ?? 'null'} → reusing lead ${existing.id}`,
        );
        return existing;
      }
    }

    const lead = await this.leadService.create(tenant.id, 0, {
      ...dto,
      source: 'widget_inquiry',
    });

    // Fire-and-forget: notifications + webhook
    this.sendNotifications(tenant, settings, dto, lead.id).catch((err) =>
      this.logger.error(`Notification failed for lead ${lead.id}: ${err.message}`),
    );

    return lead;
  }

  private async sendNotifications(
    tenant: Tenant,
    settings: TenantSettings,
    dto: CreateLeadDto,
    leadId: number,
  ): Promise<void> {
    const companyName = settings.companyName || tenant.name || 'Your Company';
    const inquirerName = dto.name || 'A visitor';
    const inquirerEmail = dto.email;
    const message = dto.message || '(No message)';
    const phone = dto.phone || 'Not provided';

    // Pre-escape every user-controlled value before it enters the HTML template.
    // The plain-text body keeps the raw values so it stays human-readable.
    const safeName = escapeHtml(inquirerName);
    const safeEmail = escapeHtml(inquirerEmail);
    const safePhone = escapeHtml(phone);
    const safeMessage = escapeHtml(message);
    const safeCompany = escapeHtml(companyName);
    const safePropertyId = dto.propertyId !== undefined ? escapeHtml(dto.propertyId) : '';
    const safePrimaryColor = escapeHtml(settings.primaryColor || '#2563eb');

    // 1. Email to configured notification recipients
    const recipients = settings.inquiryNotificationEmails;
    if (recipients?.length) {
      const subject = `New Inquiry from ${inquirerName}`;
      const html = `
        <div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:${safePrimaryColor};padding:20px;border-radius:8px 8px 0 0;">
            <h2 style="color:white;margin:0;">New Property Inquiry</h2>
          </div>
          <div style="border:1px solid #e2e8f0;border-top:none;padding:24px;border-radius:0 0 8px 8px;">
            <p><strong>From:</strong> ${safeName} (${safeEmail})</p>
            <p><strong>Phone:</strong> ${safePhone}</p>
            ${dto.propertyId ? `<p><strong>Property ID:</strong> ${safePropertyId}</p>` : ''}
            <div style="background:#f8fafc;border-radius:6px;padding:16px;margin:16px 0;">
              <p style="margin:0;white-space:pre-wrap;">${safeMessage}</p>
            </div>
            <p style="color:#64748b;font-size:12px;">Lead #${leadId} — ${safeCompany}</p>
          </div>
        </div>
      `;
      const text = `New inquiry from ${inquirerName} (${inquirerEmail})\nPhone: ${phone}\n${dto.propertyId ? `Property: ${dto.propertyId}\n` : ''}Message: ${message}`;

      for (const to of recipients) {
        this.mailer.send({ to, subject, html, text }).catch((err) =>
          this.logger.warn(`Failed to notify ${to}: ${err.message}`),
        );
      }
    }

    // 2. Auto-reply confirmation to the inquirer
    if (settings.inquiryAutoReplyEnabled !== false) {
      const subject = `We received your inquiry — ${companyName}`;
      const html = `
        <div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:${safePrimaryColor};padding:20px;border-radius:8px 8px 0 0;">
            <h2 style="color:white;margin:0;">${safeCompany}</h2>
          </div>
          <div style="border:1px solid #e2e8f0;border-top:none;padding:24px;border-radius:0 0 8px 8px;">
            <p>Hi ${safeName},</p>
            <p>Thank you for your inquiry. We have received your message and our team will get back to you shortly.</p>
            <div style="background:#f8fafc;border-radius:6px;padding:16px;margin:16px 0;">
              <p style="margin:0;color:#64748b;font-size:13px;">Your message:</p>
              <p style="margin:8px 0 0;white-space:pre-wrap;">${safeMessage}</p>
            </div>
            <p style="color:#64748b;font-size:13px;">Best regards,<br/>${safeCompany}</p>
          </div>
        </div>
      `;
      const text = `Hi ${inquirerName},\n\nThank you for your inquiry. We have received your message and our team will get back to you shortly.\n\nYour message:\n${message}\n\nBest regards,\n${companyName}`;

      this.mailer.send({ to: inquirerEmail, subject, html, text }).catch((err) =>
        this.logger.warn(`Failed to send auto-reply to ${inquirerEmail}: ${err.message}`),
      );
    }

    // 3. Fire webhook (both main webhook via WebhookService + dedicated inquiry webhook URL)
    const webhookPayload = {
      event: 'lead.created',
      leadId,
      name: dto.name,
      email: dto.email,
      phone: dto.phone,
      message: dto.message,
      propertyId: dto.propertyId,
      source: 'widget_inquiry',
      createdAt: new Date().toISOString(),
    };

    // Main webhook (tenant.webhookUrl) AND dedicated inquiry webhook
    // (tenant.inquiryWebhookUrl) both go through WebhookService.emit so
    // they get the same treatment: HMAC-signed dispatch, audited rows in
    // webhook_deliveries, exponential-backoff retry via BullMQ, and
    // pre-flight SSRF + DNS rebind protection. The `channel` arg picks
    // which URL on the tenant to target. emit() handles "no URL configured"
    // internally by writing a status='skipped' row.
    this.webhookService.emit(tenant.id, 'lead.created', webhookPayload).catch((err) =>
      this.logger.warn(`Main webhook emit failed: ${err.message}`),
    );
    this.webhookService
      .emit(tenant.id, 'lead.created', webhookPayload, { channel: 'inquiry' })
      .catch((err) =>
        this.logger.warn(`Inquiry webhook emit failed: ${err.message}`),
      );
  }
}

// Public share-favorites endpoint for widget wishlist. Same throttling shape
// as InquiryController — write-heavy and creates lead rows.
@Controller('api/v1/share-favorites')
@UseGuards(ApiKeyThrottlerGuard)
@SkipThrottle({ default: true, short: true, medium: true, long: true })
@Throttle({ 'api-key': { limit: 30, ttl: 60_000 } })
export class ShareFavoritesController {
  constructor(
    private readonly leadService: LeadService,
    private readonly tenantService: TenantService,
  ) {}

  private async getTenantIdFromApiKey(apiKey: string): Promise<number> {
    if (!apiKey) throw new UnauthorizedException('API key required');
    const tenant = await this.tenantService.findActiveWidgetTenantByApiKey(apiKey);
    if (!tenant) throw new UnauthorizedException('Invalid API key');
    return tenant.id;
  }

  // Same dedupe window as inquiry. share-favorites is even spammier (a
  // hostile visitor can flood referrals to a friend's email) — the window
  // is sized to absorb a double-click on the "share" button without
  // suppressing legitimate retries hours later.
  private static readonly DEDUPE_WINDOW_MS = 10 * 60 * 1000;

  @Public()
  @Post()
  async shareFavorites(
    @Headers('x-api-key') apiKey: string,
    @Body() body: { name: string; email: string; friendEmail?: string; message?: string; propertyIds: number[] },
  ) {
    const tenantId = await this.getTenantIdFromApiKey(apiKey);

    // Suppress duplicate primary-lead within the window. propertyId is null
    // for share-favorites (it covers a set of properties, not one), so the
    // dedupe key is (tenantId, email, null).
    const existing = await this.leadService.findRecentDuplicateInquiry(
      tenantId,
      body.email,
      null,
      ShareFavoritesController.DEDUPE_WINDOW_MS,
    );
    if (existing) {
      return { success: true, message: 'Wishlist already shared (duplicate suppressed)' };
    }

    await this.leadService.create(tenantId, 0, {
      name: body.name,
      email: body.email,
      message: body.message || `Shared ${body.propertyIds.length} wishlist properties`,
      source: 'website',
    });

    if (body.friendEmail && body.friendEmail !== body.email) {
      // Also dedupe the referral side so the friend isn't spammed twice.
      const referralDup = await this.leadService.findRecentDuplicateInquiry(
        tenantId,
        body.friendEmail,
        null,
        ShareFavoritesController.DEDUPE_WINDOW_MS,
      );
      if (!referralDup) {
        await this.leadService.create(tenantId, 0, {
          name: body.name,
          email: body.friendEmail,
          message: `Wishlist shared by ${body.name} (${body.email}): ${body.propertyIds.length} properties`,
          source: 'referral',
        });
      }
    }

    return { success: true, message: 'Wishlist shared successfully' };
  }
}
