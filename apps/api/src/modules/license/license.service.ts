import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LicenseKey, Tenant, Plan } from '../../database/entities';

export interface LicenseValidationResult {
  valid: boolean;
  status: 'active' | 'expired' | 'revoked' | 'invalid';
  message: string;
  tenantId?: number;
  tenantSlug?: string;
}

export interface WidgetConfig {
  tenantId: number;
  tenantSlug: string;
  siteName: string;
  domain: string | null;
  // The raw API key is never returned from the server (we only store sha256).
  // Admins paste it into the WP plugin at setup time; this hint is cosmetic
  // so the plugin can verify it has the matching key configured.
  apiKeyLast4: string;

  // Widget features
  widgetEnabled: boolean;
  aiSearchEnabled: boolean;
  widgetFeatures: string[];

  // Settings
  settings: {
    theme: string;
    defaultLanguage: string;
    languages: string[];
    enableMapView: boolean;
    enableCurrencyConverter: boolean;
    baseCurrency: string;
    availableCurrencies: string[];
    wishlistIcon: string;
    primaryColor?: string;
    logoUrl?: string;
    listingTypes?: Record<string, any>;
    priceRanges?: Record<string, any>;
  };

  // Plan features
  planFeatures: {
    feeds: boolean;
    campaigns: boolean;
    analytics: boolean;
    apiAccess: boolean;
    customBranding: boolean;
  };

  // Subscription status
  subscription: {
    status: string;
    expiresAt: string | null;
    adminOverride: boolean;
    isInternal: boolean;
  };
}

@Injectable()
export class LicenseService {
  constructor(
    @InjectRepository(LicenseKey)
    private licenseKeyRepository: Repository<LicenseKey>,
    @InjectRepository(Tenant)
    private tenantRepository: Repository<Tenant>,
    @InjectRepository(Plan)
    private planRepository: Repository<Plan>,
  ) {}

  /**
   * Validate a license key
   */
  async validateLicense(licenseKey: string, domain?: string): Promise<LicenseValidationResult> {
    // Find the license key
    const license = await this.licenseKeyRepository.findOne({
      where: { key: licenseKey },
      relations: ['tenant'],
    });

    if (!license) {
      return {
        valid: false,
        status: 'invalid',
        message: 'License key not found',
      };
    }

    // Check if revoked
    if (license.status === 'revoked') {
      return {
        valid: false,
        status: 'revoked',
        message: 'License key has been revoked',
      };
    }

    // Check domain if specified
    if (license.domain && domain && license.domain !== domain) {
      return {
        valid: false,
        status: 'invalid',
        message: 'License key is not valid for this domain',
      };
    }

    // Get tenant
    const tenant = await this.tenantRepository.findOne({
      where: { id: license.tenantId },
    });

    if (!tenant || !tenant.isActive) {
      return {
        valid: false,
        status: 'invalid',
        message: 'Associated account is inactive',
      };
    }

    // Check subscription status
    if (!this.isSubscriptionValid(tenant)) {
      return {
        valid: false,
        status: 'expired',
        message: 'Subscription has expired',
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
      };
    }

    // Check if widget is enabled
    if (!tenant.widgetEnabled) {
      return {
        valid: false,
        status: 'invalid',
        message: 'Widget is disabled for this account',
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
      };
    }

    // Update last used timestamp
    await this.licenseKeyRepository.update(license.id, {
      lastUsedAt: new Date(),
      activatedAt: license.activatedAt || new Date(),
    });

    return {
      valid: true,
      status: 'active',
      message: 'License key is valid',
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
    };
  }

  /**
   * Get widget configuration for a valid license key
   */
  async getWidgetConfig(licenseKey: string): Promise<WidgetConfig> {
    // First validate the license
    const validation = await this.validateLicense(licenseKey);

    if (!validation.valid) {
      throw new ForbiddenException(validation.message);
    }

    // Get tenant with plan
    const tenant = await this.tenantRepository.findOne({
      where: { id: validation.tenantId },
      relations: ['plan'],
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const settings = tenant.settings || {};

    return {
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      siteName: tenant.siteName || tenant.name,
      domain: tenant.domain,
      apiKeyLast4: tenant.apiKeyLast4,

      widgetEnabled: tenant.widgetEnabled,
      aiSearchEnabled: tenant.aiSearchEnabled,
      widgetFeatures: tenant.widgetFeatures,

      settings: {
        theme: settings.theme || 'light',
        defaultLanguage: settings.defaultLanguage || 'en',
        languages: settings.languages || ['en'],
        enableMapView: settings.enableMapView ?? true,
        enableCurrencyConverter: settings.enableCurrencyConverter ?? false,
        baseCurrency: settings.baseCurrency || 'EUR',
        availableCurrencies: settings.availableCurrencies || ['EUR', 'GBP', 'USD'],
        wishlistIcon: settings.wishlistIcon || 'heart',
        primaryColor: settings.primaryColor,
        logoUrl: settings.logoUrl,
        listingTypes: settings.listingTypes,
        priceRanges: settings.priceRanges,
      },

      planFeatures: tenant.plan?.features || {
        feeds: false,
        campaigns: false,
        analytics: false,
        apiAccess: false,
        customBranding: false,
      },

      subscription: {
        status: tenant.subscriptionStatus,
        expiresAt: tenant.expiresAt?.toISOString() || null,
        adminOverride: tenant.adminOverride,
        isInternal: tenant.isInternal,
      },
    };
  }

  /**
   * Check if a tenant's subscription is valid
   */
  private isSubscriptionValid(tenant: Tenant): boolean {
    // Admin override - always valid
    if (tenant.adminOverride) {
      return true;
    }

    // Internal accounts - always valid
    if (tenant.isInternal) {
      return true;
    }

    // Check subscription status
    if (tenant.subscriptionStatus === 'expired') {
      return false;
    }

    // Check expiry date
    if (tenant.expiresAt) {
      const now = new Date();

      // If in grace period, still valid
      if (tenant.graceEndsAt && now <= tenant.graceEndsAt) {
        return true;
      }

      // Otherwise check expiry
      if (now > tenant.expiresAt) {
        return false;
      }
    }

    return true;
  }
}
