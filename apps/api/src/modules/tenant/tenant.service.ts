import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { Tenant, WebhookDelivery } from '../../database/entities';
import { TenantPublic, TenantSettings } from '@spm/shared';
import { generateApiKey, hashApiKey } from '../../common/crypto/api-key';
import { WebhookService } from '../webhook/webhook.service';
import { validateWebhookTarget, validateWebhookTargetAsync } from '../webhook/webhook-target';

export interface CacheClearResult {
  tenantId: number;
  syncVersion: number;
  clearedAt: string; // ISO string
}

@Injectable()
export class TenantService {
  private readonly logger = new Logger(TenantService.name);

  constructor(
    @InjectRepository(Tenant)
    private tenantRepository: Repository<Tenant>,
    @InjectRepository(WebhookDelivery)
    private readonly webhookDeliveryRepo: Repository<WebhookDelivery>,
    private readonly webhookService: WebhookService,
  ) {}

  async findById(id: number): Promise<TenantPublic> {
    const tenant = await this.tenantRepository.findOne({
      where: { id },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    return this.toPublic(tenant);
  }

  async findBySlug(slug: string): Promise<TenantPublic> {
    const tenant = await this.tenantRepository.findOne({
      where: { slug },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    return this.toPublic(tenant);
  }

  async findByApiKey(rawApiKey: string): Promise<Tenant | null> {
    if (!rawApiKey) return null;
    return this.tenantRepository.findOne({
      where: { apiKeyHash: hashApiKey(rawApiKey), isActive: true },
    });
  }

  // Like findByApiKey but additionally enforces the entitlements required for
  // public widget API access: active subscription (with grace window respected)
  // and widgetEnabled. Returns null when any check fails so the caller can
  // throw the appropriate 401/403 without leaking which condition tripped.
  async findActiveWidgetTenantByApiKey(rawApiKey: string): Promise<Tenant | null> {
    const tenant = await this.findByApiKey(rawApiKey);
    if (!tenant) return null;
    if (!tenant.widgetEnabled) return null;
    if (!isTenantSubscriptionValid(tenant)) return null;
    return tenant;
  }

  // Rotates the tenant's API key. Returns the raw key exactly once; callers
  // must persist it immediately (e.g. in the dashboard flash message).
  async rotateApiKey(tenantId: number): Promise<{ apiKey: string; apiKeyLast4: string }> {
    const tenant = await this.tenantRepository.findOne({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    const generated = generateApiKey();
    tenant.apiKeyHash = generated.hash;
    tenant.apiKeyLast4 = generated.last4;
    await this.tenantRepository.save(tenant);
    return { apiKey: generated.rawKey, apiKeyLast4: generated.last4 };
  }

  async updateSettings(
    tenantId: number,
    settings: Partial<TenantSettings>,
  ): Promise<TenantPublic> {
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    // Pull secrets/SSRF-relevant fields out of the JSON payload and route them
    // to the dedicated encrypted/validated columns. Masked values (e.g.
    // "abc••••xyz" from a re-save where the user didn't retype the key) are
    // silently ignored so the existing column is preserved.
    const {
      recaptchaSecretKey,
      openRouterApiKey,
      inquiryWebhookUrl,
      ...publicSettings
    } = settings as Partial<TenantSettings> & {
      recaptchaSecretKey?: string;
      openRouterApiKey?: string;
      inquiryWebhookUrl?: string;
    };

    if (recaptchaSecretKey !== undefined) {
      const trimmed = typeof recaptchaSecretKey === 'string' ? recaptchaSecretKey.trim() : '';
      if (trimmed === '') {
        tenant.recaptchaSecretKey = null;
      } else if (!trimmed.includes('••••')) {
        tenant.recaptchaSecretKey = trimmed;
      }
    }

    if (openRouterApiKey !== undefined) {
      const trimmed = typeof openRouterApiKey === 'string' ? openRouterApiKey.trim() : '';
      if (trimmed === '') {
        tenant.openrouterApiKey = null;
      } else if (!trimmed.includes('••••')) {
        tenant.openrouterApiKey = trimmed;
      }
    }

    if (inquiryWebhookUrl !== undefined) {
      const trimmed = typeof inquiryWebhookUrl === 'string' ? inquiryWebhookUrl.trim() : '';
      if (trimmed === '') {
        tenant.inquiryWebhookUrl = null;
      } else if (trimmed.includes('••••')) {
        // Re-save from dashboard where the user didn't retype the URL —
        // keep the stored value unchanged.
      } else {
        // Async variant resolves DNS so a domain that points at a private IP
        // is rejected even when the host part of the URL is non-literal.
        const check = await validateWebhookTargetAsync(trimmed);
        if (!check.ok) {
          throw new BadRequestException({
            message: 'inquiryWebhookUrl rejected',
            code: 'INQUIRY_WEBHOOK_URL_INVALID',
            reason: check.reason,
          });
        }
        tenant.inquiryWebhookUrl = trimmed;
      }
    }

    const merged = { ...tenant.settings, ...publicSettings } as Record<string, any>;
    // Belt and braces: if a legacy caller (or a prior migration) left secret
    // values in the JSON blob, scrub them so they can't be returned.
    delete merged.recaptchaSecretKey;
    delete merged.openRouterApiKey;
    delete merged.inquiryWebhookUrl;
    tenant.settings = merged as TenantSettings;

    await this.tenantRepository.save(tenant);

    return this.toPublic(tenant);
  }

  async incrementSyncVersion(tenantId: number): Promise<void> {
    await this.tenantRepository.increment({ id: tenantId }, 'syncVersion', 1);
  }

  // Same as incrementSyncVersion but re-reads the row so callers know the
  // exact post-bump value. PropertyService uses this to stamp the new version
  // into outbound webhook payloads so receivers can de-dupe / debug.
  async incrementAndGetSyncVersion(tenantId: number): Promise<number> {
    await this.tenantRepository.increment({ id: tenantId }, 'syncVersion', 1);
    const after = await this.tenantRepository.findOneOrFail({
      where: { id: tenantId },
      select: ['id', 'syncVersion'],
    });
    return after.syncVersion;
  }

  // Bumps the tenant's syncVersion and fires a cache.invalidated webhook so
  // downstream consumers (WP plugin, widget poller) refresh immediately.
  // Webhook failures are non-fatal — the version bump is the canonical
  // signal; webhooks are an optimization to shorten propagation delay.
  async clearCache(
    tenantId: number,
    triggeredBy: { userId?: number; role?: string; reason?: string } = {},
  ): Promise<CacheClearResult> {
    const tenant = await this.tenantRepository.findOne({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    // Bump + re-read to avoid a race where two concurrent clears each see
    // the pre-bump value and return the same version.
    await this.tenantRepository.increment({ id: tenantId }, 'syncVersion', 1);
    // Persist the cleared-at timestamp alongside the version bump so the
    // dashboard can show "last cleared N minutes ago" across reloads.
    // Separate UPDATE (rather than folded into increment) because TypeORM's
    // increment() doesn't accept arbitrary column sets.
    const clearedAtDate = new Date();
    const clearedAt = clearedAtDate.toISOString();
    await this.tenantRepository.update(
      { id: tenantId },
      { lastCacheClearedAt: clearedAtDate },
    );
    const after = await this.tenantRepository.findOneOrFail({
      where: { id: tenantId },
      select: ['id', 'syncVersion', 'lastCacheClearedAt'],
    });

    try {
      await this.webhookService.emit(tenantId, 'cache.invalidated', {
        tenantId,
        syncVersion: after.syncVersion,
        clearedAt,
        triggeredBy,
      });
    } catch (err) {
      this.logger.warn(
        `cache.invalidated webhook emit failed for tenant=${tenantId}: ${(err as Error).message}`,
      );
    }

    return {
      tenantId,
      syncVersion: after.syncVersion,
      clearedAt,
    };
  }

  // Public sync-meta payload — the widget/WP plugin polls this to detect
  // stale local caches. Intentionally minimal: only the signals a client
  // needs to decide whether to drop its cache.
  async getSyncMeta(tenantId: number): Promise<{ syncVersion: number; tenantSlug: string }> {
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
      select: ['id', 'syncVersion', 'slug'],
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    return { syncVersion: tenant.syncVersion, tenantSlug: tenant.slug };
  }

  // Returns non-secret API-key metadata. The raw API key and the full webhook
  // signing secret are never retrievable after generation — admins rotate if
  // they lose either. Only the last 4 chars are returned so the dashboard can
  // confirm which credential is active without exposing enough to forge a
  // signature or re-use the API key.
  async getApiCredentials(
    tenantId: number,
  ): Promise<{ apiKeyLast4: string; webhookSecretLast4: string }> {
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
      select: ['apiKeyLast4', 'webhookSecret'],
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    return {
      apiKeyLast4: tenant.apiKeyLast4,
      webhookSecretLast4: (tenant.webhookSecret || '').slice(-4),
    };
  }

  // Webhook management — replaces the previous "only-by-DB-edit" workflow.
  // Tenants can now configure their receiver URL, see deliveries, and fire a
  // round-trip test without the super-admin having to touch the DB directly.

  async getWebhookConfig(tenantId: number): Promise<{
    webhookUrl: string | null;
    webhookSecretLast4: string;
  }> {
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
      select: ['webhookUrl', 'webhookSecret'],
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    return {
      webhookUrl: tenant.webhookUrl,
      // Show only the last 4 chars so the dashboard can remind the user
      // which secret is active without leaking enough to forge signatures.
      webhookSecretLast4: tenant.webhookSecret.slice(-4),
    };
  }

  async updateWebhookUrl(
    tenantId: number,
    rawUrl: string | null | undefined,
  ): Promise<{ webhookUrl: string | null; webhookSecretLast4: string }> {
    const tenant = await this.tenantRepository.findOne({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const trimmed =
      typeof rawUrl === 'string' ? rawUrl.trim() : rawUrl === undefined ? null : rawUrl;
    const normalized = trimmed === '' ? null : trimmed;

    if (normalized !== null) {
      const check = await validateWebhookTargetAsync(normalized);
      if (!check.ok) {
        // Surface the SSRF guard's reason so the user knows why
        // http://10.0.0.1/hook got rejected without having to guess.
        // Async variant catches both literal-private-IP URLs AND domains
        // that resolve to private IPs.
        throw new BadRequestException({
          message: 'webhookUrl rejected',
          code: 'WEBHOOK_URL_INVALID',
          reason: check.reason,
        });
      }
    }

    tenant.webhookUrl = normalized;
    await this.tenantRepository.save(tenant);

    return {
      webhookUrl: tenant.webhookUrl,
      webhookSecretLast4: tenant.webhookSecret.slice(-4),
    };
  }

  async rotateWebhookSecret(tenantId: number): Promise<{ webhookSecret: string }> {
    const tenant = await this.tenantRepository.findOne({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    // 64-char hex = 32 raw bytes; matches the original register-time format.
    const next = randomBytes(32).toString('hex');
    tenant.webhookSecret = next;
    await this.tenantRepository.save(tenant);
    return { webhookSecret: next };
  }

  async listWebhookDeliveries(
    tenantId: number,
    limit = 50,
  ): Promise<WebhookDelivery[]> {
    const safeLimit = Math.min(Math.max(limit, 1), 200);
    return this.webhookDeliveryRepo.find({
      where: { tenantId },
      order: { id: 'DESC' },
      take: safeLimit,
    });
  }

  // Single-delivery detail for the dashboard drawer. Tenant-scoped so
  // one tenant can't peek at another's payloads by guessing IDs.
  async getWebhookDelivery(
    tenantId: number,
    deliveryId: number,
  ): Promise<WebhookDelivery> {
    const row = await this.webhookDeliveryRepo.findOne({
      where: { id: deliveryId, tenantId },
    });
    if (!row) {
      throw new NotFoundException('Webhook delivery not found');
    }
    return row;
  }

  // Operator-initiated retry: creates a NEW delivery row carrying the
  // same event + payload and enqueues a fresh job. The original row is
  // left untouched so the dashboard can still surface the original
  // failure — audit trail stays intact. Using webhookService.emit means
  // the current webhookUrl + SSRF rules are re-applied, so a redeliver
  // against a URL that's since been removed records as 'skipped'
  // instead of silently retrying a dead target.
  async redeliverWebhook(
    tenantId: number,
    deliveryId: number,
    _triggeredBy: { userId?: number; role?: string },
  ): Promise<WebhookDelivery> {
    const original = await this.getWebhookDelivery(tenantId, deliveryId);
    return this.webhookService.emit(
      tenantId,
      original.event,
      original.payload,
    );
  }

  async sendTestWebhook(
    tenantId: number,
    triggeredBy: { userId?: number; role?: string },
  ): Promise<WebhookDelivery> {
    // Reuses the same dispatch path as any real event, so a passing test
    // proves the delivery+signing pipeline works — not just a DB insert.
    return this.webhookService.emit(tenantId, 'webhook.test', {
      tenantId,
      triggeredAt: new Date().toISOString(),
      triggeredBy,
      note: 'This is a test webhook. Receivers may respond with 200 and ignore it.',
    });
  }

  private toPublic(tenant: Tenant): TenantPublic {
    const settings = { ...(tenant.settings || {}) } as Record<string, any>;
    // Drop any secrets that may still live in the JSON blob from before the
    // 5Q split migration. The dashboard reads the *Configured booleans below
    // to render "Configured" indicators instead of the raw secret.
    delete settings.recaptchaSecretKey;
    delete settings.openRouterApiKey;
    delete settings.inquiryWebhookUrl;

    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      domain: tenant.domain,
      settings: settings as TenantSettings,
      isActive: tenant.isActive,
      dashboardAddons: tenant.dashboardAddons ?? {
        addProperty: false,
        emailCampaign: false,
        feedExport: false,
        team: false,
        aiChat: false,
      },
      recaptchaSecretKeyConfigured: !!tenant.recaptchaSecretKey,
      openRouterApiKeyConfigured: !!tenant.openrouterApiKey,
      inquiryWebhookUrlConfigured: !!tenant.inquiryWebhookUrl,
    };
  }
}

// Subscription validity check used by both the public widget API entitlement
// path and the license validator. Kept here (not in license.service) so the
// public/widget hot path doesn't pull in license-specific dependencies.
export function isTenantSubscriptionValid(tenant: Tenant): boolean {
  if (tenant.adminOverride) return true;
  if (tenant.isInternal) return true;
  if (tenant.subscriptionStatus === 'expired') return false;
  if (tenant.expiresAt) {
    const now = new Date();
    if (tenant.graceEndsAt && now <= tenant.graceEndsAt) return true;
    if (now > tenant.expiresAt) return false;
  }
  return true;
}
