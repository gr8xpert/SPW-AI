import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import {
  FeedExportConfig,
  FeedExportLog,
  Property,
  Location,
  PropertyType,
  Feature,
  Tenant,
  ExportFormat,
} from '../../database/entities';
import { UpdateFeedExportConfigDto } from './dto';

interface ExportProperty {
  id: string;
  reference: string;
  date: string;
  price: number;
  currency: string;
  type: string;
  town: string;
  province: string;
  beds: number;
  baths: number;
  buildSize: number;
  plotSize: number;
  descriptions: Record<string, string>;
  images: string[];
  features: string[];
  lat?: number;
  lng?: number;
  status: string;
}

@Injectable()
export class FeedExportService {
  constructor(
    @InjectRepository(FeedExportConfig)
    private configRepository: Repository<FeedExportConfig>,
    @InjectRepository(FeedExportLog)
    private logRepository: Repository<FeedExportLog>,
    @InjectRepository(Property)
    private propertyRepository: Repository<Property>,
    @InjectRepository(Location)
    private locationRepository: Repository<Location>,
    @InjectRepository(PropertyType)
    private typeRepository: Repository<PropertyType>,
    @InjectRepository(Feature)
    private featureRepository: Repository<Feature>,
    @InjectRepository(Tenant)
    private tenantRepository: Repository<Tenant>,
    private configService: ConfigService,
  ) {}

  // ============ Config Management ============
  async getConfig(tenantId: number): Promise<FeedExportConfig | null> {
    return this.configRepository.findOne({ where: { tenantId } });
  }

  async createOrUpdateConfig(
    tenantId: number,
    dto: UpdateFeedExportConfigDto,
  ): Promise<FeedExportConfig> {
    let config = await this.configRepository.findOne({ where: { tenantId } });

    if (config) {
      Object.assign(config, dto);
    } else {
      config = this.configRepository.create({
        ...dto,
        tenantId,
        exportKey: this.generateExportKey(),
      });
    }

    return this.configRepository.save(config);
  }

  async regenerateKey(tenantId: number): Promise<FeedExportConfig> {
    const config = await this.configRepository.findOne({ where: { tenantId } });

    if (!config) {
      throw new NotFoundException('Feed export not configured');
    }

    config.exportKey = this.generateExportKey();
    return this.configRepository.save(config);
  }

  async getLogs(
    tenantId: number,
    days: number = 7,
  ): Promise<FeedExportLog[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    return this.logRepository
      .createQueryBuilder('log')
      .where('log.tenantId = :tenantId', { tenantId })
      .andWhere('log.accessedAt >= :since', { since })
      .orderBy('log.accessedAt', 'DESC')
      .limit(100)
      .getMany();
  }

  // ============ Feed Export ============
  async validateExportKey(
    tenantSlug: string,
    exportKey: string,
  ): Promise<{ config: FeedExportConfig; tenantId: number }> {
    const tenant = await this.tenantRepository.findOne({
      where: { slug: tenantSlug },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const config = await this.configRepository.findOne({
      where: { tenantId: tenant.id },
    });

    if (!config || !config.isEnabled) {
      throw new UnauthorizedException('Invalid export key');
    }

    // Use timing-safe comparison to prevent timing attacks
    const storedKeyBuffer = Buffer.from(config.exportKey);
    const providedKeyBuffer = Buffer.from(exportKey);

    // Keys must be same length for timingSafeEqual
    if (
      storedKeyBuffer.length !== providedKeyBuffer.length ||
      !crypto.timingSafeEqual(storedKeyBuffer, providedKeyBuffer)
    ) {
      throw new UnauthorizedException('Invalid export key');
    }

    return { config, tenantId: tenant.id };
  }

  async exportProperties(
    tenantId: number,
    config: FeedExportConfig,
    format: ExportFormat,
    ip: string,
    userAgent: string,
  ): Promise<{ content: string; contentType: string }> {
    const startTime = Date.now();

    // Check if format is allowed
    if (!config.allowedFormats.includes(format)) {
      throw new UnauthorizedException(`Format ${format} not allowed`);
    }

    // Get properties
    const properties = await this.getExportableProperties(tenantId, config);

    // Generate content
    let content: string;
    let contentType: string;

    if (format === 'xml') {
      content = await this.generateXml(tenantId, properties, config.xmlFormat);
      contentType = 'application/xml';
    } else {
      content = JSON.stringify(properties, null, 2);
      contentType = 'application/json';
    }

    // Update last generated time
    config.lastGeneratedAt = new Date();
    await this.configRepository.save(config);

    // Log access
    const log = this.logRepository.create({
      tenantId,
      format,
      propertiesCount: properties.length,
      requesterIp: ip,
      userAgent,
      responseTimeMs: Date.now() - startTime,
    });
    await this.logRepository.save(log);

    return { content, contentType };
  }

  // ============ Private Methods ============
  private generateExportKey(): string {
    return `sk_export_${crypto.randomBytes(24).toString('hex')}`;
  }

  private async getExportableProperties(
    tenantId: number,
    config: FeedExportConfig,
  ): Promise<ExportProperty[]> {
    const query = this.propertyRepository
      .createQueryBuilder('property')
      .leftJoinAndSelect('property.location', 'location')
      .leftJoinAndSelect('property.propertyType', 'propertyType')
      .where('property.tenantId = :tenantId', { tenantId });

    // Apply filters
    if (!config.includeUnpublished) {
      query.andWhere('property.isPublished = true');
    }

    if (!config.includeSold) {
      query.andWhere('property.status != :sold', { sold: 'sold' });
    }

    // Apply custom filters
    if (config.propertyFilter) {
      if (config.propertyFilter.locations?.length) {
        query.andWhere('property.locationId IN (:...locations)', {
          locations: config.propertyFilter.locations,
        });
      }
      if (config.propertyFilter.types?.length) {
        query.andWhere('property.propertyTypeId IN (:...types)', {
          types: config.propertyFilter.types,
        });
      }
    }

    query.andWhere('property.status = :active', { active: 'active' });

    const properties = await query.getMany();

    // Get features
    const features = await this.featureRepository.find({
      where: { tenantId },
    });
    const featureMap = new Map(features.map((f) => [f.id, f.name.en || '']));

    // Transform to export format
    return properties.map((p) => ({
      id: p.reference,
      reference: p.reference,
      date: p.updatedAt.toISOString().split('T')[0],
      price: p.price || 0,
      currency: p.currency,
      type: p.propertyType?.name?.en || '',
      town: p.location?.name?.en || '',
      province: '', // Would need parent location
      beds: p.bedrooms || 0,
      baths: p.bathrooms || 0,
      buildSize: p.buildSize || 0,
      plotSize: p.plotSize || 0,
      descriptions: p.description || {},
      images: (p.images || []).map((img) => img.url),
      features: (p.features || [])
        .map((fId) => featureMap.get(fId))
        .filter((f): f is string => !!f),
      lat: p.lat ?? undefined,
      lng: p.lng ?? undefined,
      status: p.status,
    }));
  }

  private async generateXml(
    tenantId: number,
    properties: ExportProperty[],
    format: string,
  ): Promise<string> {
    // Kyero XML format
    const lines: string[] = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<root>',
    ];

    for (const prop of properties) {
      lines.push('  <property>');
      lines.push(`    <id>${this.escapeXml(prop.id)}</id>`);
      lines.push(`    <date>${prop.date}</date>`);
      lines.push(`    <ref>${this.escapeXml(prop.reference)}</ref>`);
      lines.push(`    <price>${prop.price}</price>`);
      lines.push(`    <currency>${prop.currency}</currency>`);
      lines.push(`    <type>${this.escapeXml(prop.type)}</type>`);
      lines.push(`    <town>${this.escapeXml(prop.town)}</town>`);
      lines.push(`    <province>${this.escapeXml(prop.province)}</province>`);
      lines.push(`    <beds>${prop.beds}</beds>`);
      lines.push(`    <baths>${prop.baths}</baths>`);
      lines.push(`    <built>${prop.buildSize}</built>`);
      lines.push(`    <plot>${prop.plotSize}</plot>`);

      // Descriptions in multiple languages
      for (const [lang, text] of Object.entries(prop.descriptions)) {
        lines.push(`    <desc lang="${lang}">${this.escapeXml(text)}</desc>`);
      }

      // Images
      if (prop.images.length > 0) {
        lines.push('    <images>');
        prop.images.forEach((url, i) => {
          lines.push(`      <image id="${i + 1}">`);
          lines.push(`        <url>${this.escapeXml(url)}</url>`);
          lines.push('      </image>');
        });
        lines.push('    </images>');
      }

      // Features
      if (prop.features.length > 0) {
        lines.push('    <features>');
        for (const feature of prop.features) {
          lines.push(`      <feature>${this.escapeXml(feature)}</feature>`);
        }
        lines.push('    </features>');
      }

      // Coordinates
      if (prop.lat && prop.lng) {
        lines.push(`    <latitude>${prop.lat}</latitude>`);
        lines.push(`    <longitude>${prop.lng}</longitude>`);
      }

      lines.push('  </property>');
    }

    lines.push('</root>');
    return lines.join('\n');
  }

  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
