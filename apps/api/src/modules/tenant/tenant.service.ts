import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { Tenant, WebhookDelivery } from '../../database/entities';
import { TenantPublic, TenantSettings, DEFAULT_TENANT_TIER, DEFAULT_LOCATION_SEARCH_CONFIG } from '@spm/shared';
import { generateApiKey, hashApiKey } from '../../common/crypto/api-key';
import { createPreviewToken, isPreviewToken, verifyPreviewToken } from '../../common/crypto/preview-token';
import { isSlugFormat } from '../property/property-url';
import { widgetVersion } from './widget-version';
import { WebhookService } from '../webhook/webhook.service';
import { validateWebhookTarget, validateWebhookTargetAsync } from '../webhook/webhook-target';
import { siteMinPrices } from '../property/site-limits';
import { isRecaptchaKey } from '../../common/security/recaptcha-key';

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

  // Read-only public endpoints (listings, lookups, widget config) also accept
  // a dashboard preview token in place of the key; see preview-token.ts.
  async findWidgetTenantForRead(rawApiKeyOrToken: string): Promise<Tenant | null> {
    if (isPreviewToken(rawApiKeyOrToken)) {
      const tenantId = verifyPreviewToken(rawApiKeyOrToken);
      if (!tenantId) return null;
      const tenant = await this.tenantRepository.findOne({ where: { id: tenantId, isActive: true } });
      if (!tenant || !tenant.widgetEnabled || !isTenantSubscriptionValid(tenant)) return null;
      return tenant;
    }
    return this.findActiveWidgetTenantByApiKey(rawApiKeyOrToken);
  }

  createPreviewToken(tenantId: number): { token: string; expiresAt: string } {
    return createPreviewToken(tenantId);
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
        if (!isRecaptchaKey(trimmed)) {
          throw new BadRequestException('The reCAPTCHA secret key is not valid: it is 40 characters and starts with "6L".');
        }
        tenant.recaptchaSecretKey = trimmed;
      }
    }
    const hideEmpty = (publicSettings as { hideEmptySearchOptions?: unknown }).hideEmptySearchOptions;
    if (hideEmpty !== undefined && typeof hideEmpty !== 'boolean') {
      delete (publicSettings as { hideEmptySearchOptions?: unknown }).hideEmptySearchOptions;
    }
    const rateIn = (publicSettings as { mortgageInterestRate?: unknown }).mortgageInterestRate;
    if (rateIn != null && rateIn !== '' && mortgageRate(rateIn) == null) {
      throw new BadRequestException('The mortgage interest rate must be a number from 0 to 30.');
    }
    const siteKey = (publicSettings as { recaptchaSiteKey?: unknown }).recaptchaSiteKey;
    if (typeof siteKey === 'string' && siteKey.trim() !== '' && !isRecaptchaKey(siteKey)) {
      throw new BadRequestException('The reCAPTCHA site key is not valid: it is 40 characters and starts with "6L".');
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
    // Settings reach the website (design choice, brand colour, currency…), and
    // the WP plugin only rebuilds its saved copy when syncVersion moves. Until
    // 10-05 it didn't, so a new Website Design never showed on plugin sites.
    await this.bumpSyncVersionSafely(tenantId, 'settings update');

    return this.toPublic(tenant);
  }

  async incrementSyncVersion(tenantId: number): Promise<void> {
    await this.tenantRepository.increment({ id: tenantId }, 'syncVersion', 1);
  }

  // For writes that change public data (names, translations, SEO, imports)
  // but have already committed: the bump is how the widget, the WP plugin
  // and the public ETag cache learn about the change, yet failing it must
  // not fail work that is already saved — the 5-minute ETag bucket and the
  // next bump cover the gap. Call once per finished operation, not per row.
  async bumpSyncVersionSafely(tenantId: number, reason: string): Promise<void> {
    try {
      await this.incrementSyncVersion(tenantId);
    } catch (err) {
      this.logger.warn(
        `syncVersion bump failed after ${reason} tenant=${tenantId}: ${(err as Error).message}`,
      );
    }
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
  async getSyncMeta(tenantId: number): Promise<{ syncVersion: number; tenantSlug: string; widgetVersion?: string }> {
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
      select: ['id', 'syncVersion', 'slug'],
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    const version = widgetVersion();
    return { syncVersion: tenant.syncVersion, tenantSlug: tenant.slug, ...(version ? { widgetVersion: version } : {}) };
  }

  /**
   * Returns the subset of dashboard settings that the public widget consumes
   * to configure itself (counts, options, toggles). Anything sensitive
   * (API keys, webhooks, AI provider keys, etc.) is intentionally excluded.
   */
  async getPublicWidgetConfig(tenantId: number): Promise<Record<string, unknown>> {
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
      select: ['id', 'settings', 'featureFlags', 'aiSearchEnabled'],
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    const s = (tenant.settings || {}) as TenantSettings;
    const f = (tenant.featureFlags || {}) as Partial<Record<'mortgageCalculator' | 'currencyConverter' | 'mapSearch' | 'mapView' | 'aiSearch' | 'aiChatbot', boolean>>;
    const config: Record<string, unknown> = {};
    if (s.similarPropertiesLimit != null) config.similarPropertiesLimit = s.similarPropertiesLimit;
    if (s.enabledListingTypes) config.enabledListingTypes = s.enabledListingTypes;
    if (s.bedroomOptions) config.bedroomOptions = s.bedroomOptions;
    if (s.bathroomOptions) config.bathroomOptions = s.bathroomOptions;
    if (s.priceOptions) config.priceOptions = s.priceOptions;
    const minPrices = siteMinPrices(s);
    if (minPrices) config.minPrices = minPrices;
    const rate = mortgageRate(s.mortgageInterestRate);
    if (rate != null) config.mortgageInterestRate = rate;
    // Default on: only an explicit false shows zero-count choices.
    if (s.hideEmptySearchOptions === false) config.hideEmptySearchOptions = false;
    if (s.primaryColor) config.primaryColor = s.primaryColor;
    if (s.mapVariation) config.mapVariation = s.mapVariation;
    const tiles = publicMapTiles(s.mapTiles);
    if (tiles) config.mapTiles = tiles;
    if (isSlugFormat(s.slugFormat)) config.slugFormat = s.slugFormat;
    const version = widgetVersion();
    if (version) config.widgetVersion = version;
    const templates = publicSiteTemplates(s.siteTemplates);
    if (templates) config.siteTemplates = templates;
    config.locationSearchConfig = publicLocationSearchConfig(s.locationSearchConfig);
    // A malformed key would put Google's "Invalid site key" box on the form
    // and block every inquiry: no key, no captcha.
    if (isRecaptchaKey(s.recaptchaSiteKey)) config.recaptchaSiteKey = s.recaptchaSiteKey.trim();
    // Site display currency. A currency set on the embedding page itself
    // (RealtySoftConfig.currency / data-spm-currency) still wins in the widget.
    if (typeof s.baseCurrency === 'string' && /^[A-Z]{3}$/.test(s.baseCurrency)) {
      config.currency = s.baseCurrency;
    }
    // Map super-admin-controlled feature flags into widget-facing flags so
    // the embed renders the right surfaces. Defaults to true when unset so
    // existing tenants don't suddenly lose features after this rolls out.
    if (f.mortgageCalculator !== false) config.enableMortgageCalculator = true;
    if (f.currencyConverter !== false) config.enableCurrencyConverter = true;
    if (f.mapSearch !== false) config.mapSearchEnabled = true;
    if (f.aiChatbot === true) config.enableAiChat = true;
    // The widget only shows the AI button when the feature is on AND the
    // client has their own OpenRouter key — it spends their credit, so
    // without a key there is nothing to spend. /api/v1/ai-search/status
    // confirms both before the panel opens.
    if (f.aiSearch !== false && tenant.aiSearchEnabled) config.aiSearchEnabled = true;
    return config;
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
        aiTranslation: false,
      },
      tier: tenant.tier || DEFAULT_TENANT_TIER,
      recaptchaSecretKeyConfigured: !!tenant.recaptchaSecretKey,
      openRouterApiKeyConfigured: !!tenant.openrouterApiKey,
      inquiryWebhookUrlConfigured: !!tenant.inquiryWebhookUrl,
      ownEmailDomain: tenant.featureFlags?.ownEmailDomain === true,
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

// Only a well-formed map tile setting reaches the website: a MapTiler key is
// a public browser key by design, and a custom URL must be an https tile
// template.
export function publicMapTiles(value: TenantSettings['mapTiles']): TenantSettings['mapTiles'] | null {
  if (!value || typeof value !== 'object') return null;
  if (value.provider === 'maptiler' && typeof value.key === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(value.key.trim())) {
    return { provider: 'maptiler', key: value.key.trim() };
  }
  if (
    value.provider === 'custom' &&
    typeof value.url === 'string' &&
    /^https:\/\/[^\s"'<>]+$/.test(value.url.trim()) &&
    ['{z}', '{x}', '{y}'].every((part) => value.url!.includes(part))
  ) {
    const attribution = typeof value.attribution === 'string' ? value.attribution.replace(/[<>]/g, '').trim().slice(0, 200) : '';
    return { provider: 'custom', url: value.url.trim(), ...(attribution ? { attribution } : {}) };
  }
  return null;
}

// The mortgage calculator's starting interest rate (%), or null when unset
// or not a sensible rate.
export function mortgageRate(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 30 ? Math.round(n * 100) / 100 : null;
}

// Templates the widget has, per page type. Keep in step with the widget's
// component registry.
export const SITE_TEMPLATE_IDS: Record<'search' | 'listing' | 'detail' | 'map' | 'carousel', string[]> = {
  search: ['01', '02', '03', '04', '05', '06'].map((n) => `search-template-${n}`),
  listing: Array.from({ length: 17 }, (_, i) => `listing-template-${String(i + 1).padStart(2, '0')}`),
  detail: ['detail-template-01'],
  map: ['map-template-01', 'map-template-02', 'map-template-03'],
  carousel: Array.from({ length: 6 }, (_, i) => `carousel-template-${String(i + 1).padStart(2, '0')}`),
};

// The levels the hierarchy actually uses. Keep in step with the dashboard's
// Locations page (`levels` there) — a level missing from this list is dropped
// from the dropdown config and the site silently loses that step.
const LOCATION_LEVELS = ['region', 'province', 'area', 'municipality', 'town', 'urbanization'];

/**
 * Which location levels each search dropdown offers (Locations → Website Search
 * Dropdowns). Without this the widget falls back to the roots of the tree,
 * which on most sites is a single region — so the dropdown offers one useless
 * choice. A tenant that has never saved the section gets the same default the
 * dashboard shows, rather than that fallback.
 */
export function publicLocationSearchConfig(
  value: TenantSettings['locationSearchConfig'],
): TenantSettings['locationSearchConfig'] {
  const out = {} as NonNullable<TenantSettings['locationSearchConfig']>;
  for (const key of ['dropdown1', 'dropdown2', 'dropdown3'] as const) {
    const dd = value && typeof value === 'object' ? value[key] : undefined;
    const levels = Array.isArray(dd?.levels)
      ? dd.levels.filter((l): l is string => typeof l === 'string' && LOCATION_LEVELS.includes(l))
      : [];
    const fallback = DEFAULT_LOCATION_SEARCH_CONFIG[key];
    out[key] = levels.length
      ? { levels, ...(typeof dd?.visible === 'boolean' ? { visible: dd.visible } : {}) }
      : { ...fallback };
  }
  const count = value && typeof value === 'object' ? (value as { count?: unknown }).count : undefined;
  if (count === 1 || count === 2 || count === 3) out.count = count;
  return out;
}

export function publicSiteTemplates(value: TenantSettings['siteTemplates']): TenantSettings['siteTemplates'] | null {
  if (!value || typeof value !== 'object') return null;
  const out: NonNullable<TenantSettings['siteTemplates']> = {};
  for (const kind of Object.keys(SITE_TEMPLATE_IDS) as Array<keyof typeof SITE_TEMPLATE_IDS>) {
    const id = value[kind];
    if (typeof id === 'string' && SITE_TEMPLATE_IDS[kind].includes(id)) out[kind] = id;
  }
  return Object.keys(out).length ? out : null;
}
