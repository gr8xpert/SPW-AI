import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as QRCode from 'qrcode';
import { PuppeteerPoolService } from './puppeteer-pool.service';
import { BrochureCacheService } from './brochure-cache.service';
import { PropertyService } from '../property/property.service';
import { LabelService } from '../label/label.service';
import { FeatureService } from '../feature/feature.service';
import { Property } from '../../database/entities/property.entity';
import { Tenant } from '../../database/entities/tenant.entity';
import {
  renderLayoutV1,
  renderBrandedHeader,
  renderBrandedFooter,
  renderUnbrandedHeader,
  renderUnbrandedFooter,
  PDF_MARGIN_V1,
} from './templates/layout-v1';
import { BrochureContext, BrochureVariant } from './templates/template-context';

interface RenderArgs {
  tenantId: number;
  reference: string;
  lang: string;
  variantOverride?: BrochureVariant;
}

/** Public-URL fetch cache for tenant logos — keyed by URL, base64 of the
 *  fetched image. 1h TTL bounds tenant logo swaps; cleared on full restart. */
const logoCache = new Map<string, { dataUrl: string; expiresAt: number }>();
const LOGO_TTL_MS = 60 * 60 * 1000;

@Injectable()
export class BrochureService {
  private readonly logger = new Logger(BrochureService.name);

  constructor(
    private readonly puppeteerPool: PuppeteerPoolService,
    private readonly cache: BrochureCacheService,
    private readonly propertyService: PropertyService,
    private readonly labelService: LabelService,
    private readonly featureService: FeatureService,
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
  ) {}

  async renderBrochure(args: RenderArgs): Promise<{ pdf: Buffer; filename: string }> {
    const { tenantId, reference, lang } = args;

    const property = await this.propertyService.findByReference(tenantId, reference);
    if (!property || property.status !== 'active' || !property.isPublished) {
      throw new NotFoundException('Property not found');
    }

    const tenantFull = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenantFull) throw new NotFoundException('Tenant not found');

    const variant = this.resolveVariant(property, tenantFull, args.variantOverride);

    // Cache lookup
    const cached = this.cache.get({
      tenantId,
      reference,
      updatedAt: property.updatedAt,
      lang,
      variant,
    });
    if (cached) {
      this.logger.debug(`Brochure cache HIT: ${tenantId}/${reference}/${lang}/${variant}`);
      return { pdf: cached, filename: this.buildFilename(property, lang) };
    }

    const ctx = await this.buildContext(property, tenantFull, lang, variant);
    const html = renderLayoutV1(ctx);
    const isBranded = variant === 'branded';

    const pdf = await this.puppeteerPool.renderPdf(html, {
      format: 'A4',
      printBackground: true,
      margin: PDF_MARGIN_V1,
      displayHeaderFooter: true,
      headerTemplate: isBranded ? renderBrandedHeader(ctx) : renderUnbrandedHeader(),
      footerTemplate: isBranded ? renderBrandedFooter(ctx) : renderUnbrandedFooter(),
    });

    this.cache.set({ tenantId, reference, updatedAt: property.updatedAt, lang, variant }, pdf);

    return { pdf, filename: this.buildFilename(property, lang) };
  }

  private resolveVariant(
    property: Property,
    tenant: Tenant,
    override?: BrochureVariant,
  ): BrochureVariant {
    if (override === 'branded' || override === 'unbranded') return override;
    if (property.brochureVariant === 'branded' || property.brochureVariant === 'unbranded') {
      return property.brochureVariant;
    }
    return (tenant.settings?.defaultBrochureVariant as BrochureVariant) || 'branded';
  }

  private async buildContext(
    property: Property,
    tenant: Tenant,
    lang: string,
    variant: BrochureVariant,
  ): Promise<BrochureContext> {
    const labels = await this.labelService.getLabelsForWidget(tenant.id, lang);
    const settings = tenant.settings || ({} as any);

    // Multilingual fields → resolve for lang with fallback to default lang then any
    const resolveMl = (m: Record<string, string> | null | undefined): string => {
      if (!m) return '';
      return m[lang] || m[settings.defaultLanguage || 'en'] || Object.values(m)[0] || '';
    };

    // Feature load: property.features is a JSON array of feature IDs
    const featureIds = Array.isArray(property.features) ? property.features : [];
    const featureRows = featureIds.length
      ? await this.featureService.findByIds(tenant.id, featureIds)
      : [];
    const featureCtx = featureRows.map((f) => ({
      category: f.category,
      name: resolveMl(f.name),
    }));

    // Location full path: walk parent chain and join, deepest first
    const locationName = resolveMl(property.location?.name as any);
    const locationFullPath = this.buildLocationPath(property.location, lang, settings.defaultLanguage || 'en');

    // Property type name
    const propertyTypeName = property.propertyType ? resolveMl(property.propertyType.name as any) : null;

    // Title fallback: explicit title, else "{type} for sale in {location}"
    const title =
      resolveMl(property.title) ||
      this.buildFallbackTitle(propertyTypeName, locationName, property.listingType);

    const description = resolveMl(property.description);

    // Tenant brand context
    const logoUrl = await this.maybeFetchLogo(settings.logoUrl);

    // QR points at the property's public URL on the tenant site (best-effort:
    // use tenant.domain or apiUrl host + slug. Falls back to reference.)
    const publicUrl = this.buildPublicUrl(tenant, property);
    const qrDataUrl = variant === 'branded' && publicUrl ? await this.makeQr(publicUrl) : null;

    return {
      property: {
        reference: property.reference,
        title,
        description,
        price: property.price != null ? Number(property.price) : null,
        currency: property.currency,
        priceOnRequest: property.priceOnRequest,
        bedrooms: property.bedrooms,
        bathrooms: property.bathrooms,
        buildSize: property.buildSize != null ? Number(property.buildSize) : null,
        plotSize: property.plotSize != null ? Number(property.plotSize) : null,
        terraceSize: property.terraceSize != null ? Number(property.terraceSize) : null,
        energyRating: property.energyRating,
        listingTypeLabel: labels[`listing_type_${property.listingType}`] || property.listingType,
        propertyTypeName,
        locationName,
        locationFullPath,
        images: (property.images || []).map((i) => ({ url: i.url })),
        features: featureCtx,
      },
      tenant: {
        name: settings.companyName || tenant.name,
        logoUrl,
        contactEmail: settings.contactEmail || tenant.ownerEmail || null,
        contactPhone: settings.contactPhone || null,
        primaryColor: settings.primaryColor || '#1a1a1a',
        websiteUrl: settings.websiteUrl || null,
      },
      labels,
      variant,
      qrDataUrl,
      publicUrl,
      lang,
    };
  }

  private buildFallbackTitle(typeName: string | null, locationName: string | null, listingType: string): string {
    const action = listingType === 'sale' ? 'for sale' : listingType === 'rent' ? 'for rent' : '';
    const parts = [typeName, action, locationName ? `in ${locationName}` : ''].filter(Boolean);
    return parts.join(' ').trim();
  }

  private buildLocationPath(location: any, lang: string, defaultLang: string): string | null {
    if (!location) return null;
    const names: string[] = [];
    let cur: any = location;
    let depth = 0;
    while (cur && depth < 4) {
      const n = cur.name?.[lang] || cur.name?.[defaultLang] || Object.values(cur.name || {})[0];
      if (n) names.push(String(n));
      cur = cur.parent;
      depth += 1;
    }
    return names.length ? names.join(', ') : null;
  }

  private buildPublicUrl(tenant: Tenant, property: Property): string | null {
    const settings = tenant.settings || ({} as any);
    const host = settings.websiteUrl || (tenant.domain ? `https://${tenant.domain}` : null);
    if (!host) return null;
    const base = host.replace(/\/$/, '');
    return `${base}/property/${encodeURIComponent(property.reference)}`;
  }

  private async makeQr(url: string): Promise<string> {
    try {
      return await QRCode.toDataURL(url, { margin: 0, width: 220, errorCorrectionLevel: 'M' });
    } catch (err) {
      this.logger.warn(`QR generation failed for ${url}: ${(err as Error).message}`);
      return '';
    }
  }

  private async maybeFetchLogo(logoUrl: string | undefined | null): Promise<string | null> {
    if (!logoUrl) return null;
    const hit = logoCache.get(logoUrl);
    if (hit && hit.expiresAt > Date.now()) return hit.dataUrl;

    try {
      const res = await fetch(logoUrl, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const mime = res.headers.get('content-type') || 'image/png';
      const dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
      logoCache.set(logoUrl, { dataUrl, expiresAt: Date.now() + LOGO_TTL_MS });
      return dataUrl;
    } catch (err) {
      this.logger.warn(`Logo fetch failed for ${logoUrl}: ${(err as Error).message}`);
      return null;
    }
  }

  private buildFilename(property: Property, lang: string): string {
    // Brochure-{reference}-{lang}.pdf — safe for Content-Disposition.
    return `Brochure-${property.reference.replace(/[^A-Za-z0-9_.-]/g, '_')}-${lang}.pdf`;
  }
}
