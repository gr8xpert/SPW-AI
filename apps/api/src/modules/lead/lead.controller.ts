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
} from '@nestjs/common';
import { LeadService } from './lead.service';
import { CreateLeadDto, UpdateLeadDto, CreateActivityDto } from './dto';
import { CurrentTenant, CurrentUser, Public } from '../../common/decorators';
import { LeadStatus, Tenant } from '../../database/entities';
import { TenantService } from '../tenant/tenant.service';
import { SystemMailerService } from '../mail/system-mailer.service';
import { WebhookService } from '../webhook/webhook.service';
import { TenantSettings } from '@spm/shared';

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

// Public inquiry endpoint for widget
@Controller('api/v1/inquiry')
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
    const tenant = await this.tenantService.findByApiKey(apiKey);
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

  @Public()
  @Post()
  async createInquiry(
    @Headers('x-api-key') apiKey: string,
    @Body() body: CreateLeadDto & { recaptchaToken?: string },
  ) {
    const tenant = await this.getTenantFromApiKey(apiKey);
    const settings = (tenant.settings || {}) as TenantSettings;
    const secretKey = settings.recaptchaSecretKey;

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

    // 1. Email to configured notification recipients
    const recipients = settings.inquiryNotificationEmails;
    if (recipients?.length) {
      const subject = `New Inquiry from ${inquirerName}`;
      const html = `
        <div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:${settings.primaryColor || '#2563eb'};padding:20px;border-radius:8px 8px 0 0;">
            <h2 style="color:white;margin:0;">New Property Inquiry</h2>
          </div>
          <div style="border:1px solid #e2e8f0;border-top:none;padding:24px;border-radius:0 0 8px 8px;">
            <p><strong>From:</strong> ${inquirerName} (${inquirerEmail})</p>
            <p><strong>Phone:</strong> ${phone}</p>
            ${dto.propertyId ? `<p><strong>Property ID:</strong> ${dto.propertyId}</p>` : ''}
            <div style="background:#f8fafc;border-radius:6px;padding:16px;margin:16px 0;">
              <p style="margin:0;white-space:pre-wrap;">${message}</p>
            </div>
            <p style="color:#64748b;font-size:12px;">Lead #${leadId} — ${companyName}</p>
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
          <div style="background:${settings.primaryColor || '#2563eb'};padding:20px;border-radius:8px 8px 0 0;">
            <h2 style="color:white;margin:0;">${companyName}</h2>
          </div>
          <div style="border:1px solid #e2e8f0;border-top:none;padding:24px;border-radius:0 0 8px 8px;">
            <p>Hi ${inquirerName},</p>
            <p>Thank you for your inquiry. We have received your message and our team will get back to you shortly.</p>
            <div style="background:#f8fafc;border-radius:6px;padding:16px;margin:16px 0;">
              <p style="margin:0;color:#64748b;font-size:13px;">Your message:</p>
              <p style="margin:8px 0 0;white-space:pre-wrap;">${message}</p>
            </div>
            <p style="color:#64748b;font-size:13px;">Best regards,<br/>${companyName}</p>
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

    // Main webhook system (uses tenant.webhookUrl)
    this.webhookService.emit(tenant.id, 'lead.created', webhookPayload).catch((err) =>
      this.logger.warn(`Webhook emit failed: ${err.message}`),
    );

    // Dedicated inquiry webhook URL (Zapier/HubSpot/Make)
    const inquiryWebhookUrl = settings.inquiryWebhookUrl;
    if (inquiryWebhookUrl) {
      fetch(inquiryWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(webhookPayload),
        signal: AbortSignal.timeout(10000),
      }).catch((err) =>
        this.logger.warn(`Inquiry webhook to ${inquiryWebhookUrl} failed: ${err.message}`),
      );
    }
  }
}

// Public share-favorites endpoint for widget wishlist
@Controller('api/v1/share-favorites')
export class ShareFavoritesController {
  constructor(
    private readonly leadService: LeadService,
    private readonly tenantService: TenantService,
  ) {}

  private async getTenantIdFromApiKey(apiKey: string): Promise<number> {
    if (!apiKey) throw new UnauthorizedException('API key required');
    const tenant = await this.tenantService.findByApiKey(apiKey);
    if (!tenant) throw new UnauthorizedException('Invalid API key');
    return tenant.id;
  }

  @Public()
  @Post()
  async shareFavorites(
    @Headers('x-api-key') apiKey: string,
    @Body() body: { name: string; email: string; friendEmail?: string; message?: string; propertyIds: number[] },
  ) {
    const tenantId = await this.getTenantIdFromApiKey(apiKey);
    await this.leadService.create(tenantId, 0, {
      name: body.name,
      email: body.email,
      message: body.message || `Shared ${body.propertyIds.length} wishlist properties`,
      source: 'website',
    });

    if (body.friendEmail && body.friendEmail !== body.email) {
      await this.leadService.create(tenantId, 0, {
        name: body.name,
        email: body.friendEmail,
        message: `Wishlist shared by ${body.name} (${body.email}): ${body.propertyIds.length} properties`,
        source: 'referral',
      });
    }

    return { success: true, message: 'Wishlist shared successfully' };
  }
}
