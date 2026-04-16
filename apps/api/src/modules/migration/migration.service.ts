import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as fs from 'fs';
import * as path from 'path';
import {
  MigrationJob,
  MigrationStatus,
  MigrationSourceFormat,
  Property,
  Location,
  PropertyType,
  Feature,
  Label,
} from '../../database/entities';
import {
  StartMigrationDto,
  MigrationValidationResult,
  MigrationData,
} from './dto';

@Injectable()
export class MigrationService {
  constructor(
    @InjectRepository(MigrationJob)
    private migrationJobRepository: Repository<MigrationJob>,
    @InjectRepository(Property)
    private propertyRepository: Repository<Property>,
    @InjectRepository(Location)
    private locationRepository: Repository<Location>,
    @InjectRepository(PropertyType)
    private typeRepository: Repository<PropertyType>,
    @InjectRepository(Feature)
    private featureRepository: Repository<Feature>,
    @InjectRepository(Label)
    private labelRepository: Repository<Label>,
    @InjectQueue('migration')
    private migrationQueue: Queue,
  ) {}

  async validateFile(
    tenantId: number,
    filePath: string,
  ): Promise<MigrationValidationResult> {
    const content = fs.readFileSync(filePath, 'utf-8');
    const errors: string[] = [];

    // Determine format
    let format: MigrationSourceFormat;
    let data: MigrationData;

    try {
      if (filePath.endsWith('.json')) {
        data = JSON.parse(content);
        format = 'json';
      } else if (filePath.endsWith('.csv')) {
        data = this.parseCsv(content);
        format = 'csv';
      } else {
        return {
          valid: false,
          format: 'json',
          counts: { properties: 0, locations: 0, types: 0, features: 0, labels: 0 },
          conflicts: { properties: [] },
          errors: ['Unknown file format. Use .json or .csv'],
        };
      }
    } catch (error) {
      return {
        valid: false,
        format: filePath.endsWith('.csv') ? 'csv' : 'json',
        counts: { properties: 0, locations: 0, types: 0, features: 0, labels: 0 },
        conflicts: { properties: [] },
        errors: [`Failed to parse file: ${error.message}`],
      };
    }

    // Count entities
    const counts = {
      properties: data.properties?.length || 0,
      locations: data.locations?.length || 0,
      types: data.property_types?.length || 0,
      features: data.features?.length || 0,
      labels: data.labels?.length || 0,
    };

    // Check for conflicts
    const conflicts = { properties: [] as string[] };

    if (data.properties) {
      const existingRefs = await this.propertyRepository.find({
        where: { tenantId },
        select: ['reference'],
      });
      const existingRefSet = new Set(existingRefs.map((p) => p.reference));

      for (const prop of data.properties) {
        if (existingRefSet.has(prop.reference)) {
          conflicts.properties.push(prop.reference);
        }
      }
    }

    // Validate required fields
    if (data.properties) {
      for (let i = 0; i < data.properties.length; i++) {
        const prop = data.properties[i];
        if (!prop.reference) {
          errors.push(`Property at row ${i + 1} missing required 'reference' field`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      format,
      counts,
      conflicts,
      errors,
    };
  }

  async startMigration(
    tenantId: number,
    userId: number,
    filePath: string,
    dto: StartMigrationDto,
  ): Promise<MigrationJob> {
    // Validate file first
    const validation = await this.validateFile(tenantId, filePath);

    if (!validation.valid) {
      throw new BadRequestException(validation.errors.join(', '));
    }

    // Create job
    const job = this.migrationJobRepository.create({
      tenantId,
      userId,
      type: dto.type || 'full',
      sourceFormat: validation.format,
      status: 'pending',
      filePath,
    });

    const savedJob = await this.migrationJobRepository.save(job);

    // Queue processing
    await this.migrationQueue.add('process-migration', {
      jobId: savedJob.id,
      tenantId,
      conflictHandling: dto.conflictHandling || 'skip',
    });

    return savedJob;
  }

  async getJobs(tenantId: number): Promise<MigrationJob[]> {
    return this.migrationJobRepository.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      take: 20,
    });
  }

  async getJob(tenantId: number, id: number): Promise<MigrationJob> {
    const job = await this.migrationJobRepository.findOne({
      where: { id, tenantId },
    });

    if (!job) {
      throw new NotFoundException('Migration job not found');
    }

    return job;
  }

  async cancelJob(tenantId: number, id: number): Promise<MigrationJob> {
    const job = await this.getJob(tenantId, id);

    if (job.status !== 'pending' && job.status !== 'processing') {
      throw new BadRequestException('Cannot cancel job with status ' + job.status);
    }

    job.status = 'cancelled';
    return this.migrationJobRepository.save(job);
  }

  async processJob(
    jobId: number,
    tenantId: number,
    conflictHandling: 'skip' | 'overwrite' | 'new_reference',
  ): Promise<void> {
    const job = await this.migrationJobRepository.findOne({
      where: { id: jobId },
    });

    if (!job || job.status === 'cancelled') {
      return;
    }

    job.status = 'processing';
    job.startedAt = new Date();
    await this.migrationJobRepository.save(job);

    try {
      const content = fs.readFileSync(job.filePath, 'utf-8');
      const data: MigrationData = job.sourceFormat === 'json'
        ? JSON.parse(content)
        : this.parseCsv(content);

      const stats = {
        properties: 0,
        locations: 0,
        types: 0,
        features: 0,
        labels: 0,
        images: 0,
      };

      const errors: Array<{ row?: number; field?: string; message: string }> = [];

      // Import in order: settings, locations, types, features, labels, properties

      // 1. Locations
      if (data.locations && job.type !== 'properties_only') {
        job.currentStep = 'Importing locations';
        await this.migrationJobRepository.save(job);

        for (const loc of data.locations) {
          try {
            await this.importLocation(tenantId, loc);
            stats.locations++;
          } catch (error) {
            errors.push({ message: `Location '${loc.name}': ${error.message}` });
          }
        }
        job.progress = 20;
        await this.migrationJobRepository.save(job);
      }

      // 2. Property Types
      if (data.property_types && job.type !== 'properties_only') {
        job.currentStep = 'Importing property types';
        await this.migrationJobRepository.save(job);

        for (const type of data.property_types) {
          try {
            await this.importPropertyType(tenantId, type);
            stats.types++;
          } catch (error) {
            errors.push({ message: `Type '${type.name}': ${error.message}` });
          }
        }
        job.progress = 35;
        await this.migrationJobRepository.save(job);
      }

      // 3. Features
      if (data.features && job.type !== 'properties_only') {
        job.currentStep = 'Importing features';
        await this.migrationJobRepository.save(job);

        for (const feature of data.features) {
          try {
            await this.importFeature(tenantId, feature);
            stats.features++;
          } catch (error) {
            errors.push({ message: `Feature '${feature.name}': ${error.message}` });
          }
        }
        job.progress = 50;
        await this.migrationJobRepository.save(job);
      }

      // 4. Labels
      if (data.labels && job.type !== 'properties_only') {
        job.currentStep = 'Importing labels';
        await this.migrationJobRepository.save(job);

        for (const label of data.labels) {
          try {
            await this.importLabel(tenantId, label);
            stats.labels++;
          } catch (error) {
            errors.push({ message: `Label '${label.key}': ${error.message}` });
          }
        }
        job.progress = 60;
        await this.migrationJobRepository.save(job);
      }

      // 5. Properties
      if (data.properties && job.type !== 'settings_only') {
        job.currentStep = 'Importing properties';
        await this.migrationJobRepository.save(job);

        const total = data.properties.length;
        for (let i = 0; i < total; i++) {
          const prop = data.properties[i];

          // Check cancellation
          const currentJob = await this.migrationJobRepository.findOne({
            where: { id: jobId },
          });
          if (currentJob?.status === 'cancelled') {
            return;
          }

          try {
            const result = await this.importProperty(tenantId, prop, conflictHandling);
            if (result) {
              stats.properties++;
              if (prop.images) stats.images += prop.images.length;
            }
          } catch (error) {
            errors.push({
              row: i + 1,
              message: `Property '${prop.reference}': ${error.message}`,
            });
          }

          // Update progress
          job.progress = 60 + Math.round((i / total) * 40);
          await this.migrationJobRepository.save(job);
        }
      }

      // Complete
      job.status = errors.length > 0 ? 'completed' : 'completed';
      job.progress = 100;
      job.completedAt = new Date();
      job.stats = stats;
      job.errors = errors.length > 0 ? errors.slice(0, 100) : [];
      await this.migrationJobRepository.save(job);

    } catch (error) {
      job.status = 'failed';
      job.completedAt = new Date();
      job.errors = [{ message: error.message }];
      await this.migrationJobRepository.save(job);
    }
  }

  // ============ Private Import Methods ============
  private parseCsv(content: string): MigrationData {
    const lines = content.split('\n').filter((l) => l.trim());
    if (lines.length < 2) {
      return { properties: [] };
    }

    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const properties = [];

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCsvLine(lines[i]);
      const prop: any = {};

      headers.forEach((h, idx) => {
        const value = values[idx]?.trim();
        if (value) {
          if (h === 'title_en') prop.title = { ...prop.title, en: value };
          else if (h === 'title_es') prop.title = { ...prop.title, es: value };
          else if (h === 'features') prop.features = value.split('|');
          else if (h === 'images') prop.images = value.split('|');
          else prop[h] = value;
        }
      });

      if (prop.reference) {
        properties.push(prop);
      }
    }

    return { properties };
  }

  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);

    return result;
  }

  private slugify(text: string): string {
    return text
      .toString()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private async importLocation(
    tenantId: number,
    data: any,
  ): Promise<Location> {
    const name = typeof data.name === 'string'
      ? { en: data.name, es: data.name }
      : data.name;

    const slug = this.slugify(name.en || Object.values(name)[0]);

    const existing = await this.locationRepository.findOne({
      where: { tenantId, slug },
    });

    if (existing) {
      return existing;
    }

    const location = this.locationRepository.create({
      tenantId,
      name,
      slug,
      level: data.level || 'town',
    });

    return this.locationRepository.save(location);
  }

  private async importPropertyType(
    tenantId: number,
    data: any,
  ): Promise<PropertyType> {
    const name = typeof data.name === 'string'
      ? { en: data.name, es: data.name }
      : data.name;

    const slug = this.slugify(name.en || Object.values(name)[0]);

    const existing = await this.typeRepository.findOne({
      where: { tenantId, slug },
    });

    if (existing) {
      return existing;
    }

    const type = this.typeRepository.create({
      tenantId,
      name,
      slug,
    });

    return this.typeRepository.save(type);
  }

  private async importFeature(
    tenantId: number,
    data: any,
  ): Promise<Feature> {
    const name = typeof data.name === 'string'
      ? { en: data.name, es: data.name }
      : data.name;

    const slug = this.slugify(name.en || Object.values(name)[0]);

    const existing = await this.featureRepository.findOne({
      where: { tenantId },
    });

    // Check by name match
    const features = await this.featureRepository.find({ where: { tenantId } });
    const match = features.find(
      (f) => (f.name.en || '').toLowerCase() === (name.en || '').toLowerCase(),
    );

    if (match) {
      return match;
    }

    const feature = this.featureRepository.create({
      tenantId,
      name,
      category: data.category || 'other',
    });

    return this.featureRepository.save(feature);
  }

  private async importLabel(
    tenantId: number,
    data: any,
  ): Promise<Label> {
    const existing = await this.labelRepository.findOne({
      where: { tenantId, key: data.key },
    });

    if (existing) {
      existing.translations = data.translations;
      return this.labelRepository.save(existing);
    }

    const label = this.labelRepository.create({
      tenantId,
      key: data.key,
      translations: data.translations,
      isCustom: true,
    });

    return this.labelRepository.save(label);
  }

  private async importProperty(
    tenantId: number,
    data: any,
    conflictHandling: 'skip' | 'overwrite' | 'new_reference',
  ): Promise<Property | null> {
    const existing = await this.propertyRepository.findOne({
      where: { tenantId, reference: data.reference },
    });

    if (existing) {
      if (conflictHandling === 'skip') {
        return null;
      } else if (conflictHandling === 'new_reference') {
        data.reference = `${data.reference}-import-${Date.now()}`;
      }
    }

    // Resolve location
    let locationId: number | null = null;
    if (data.location_name) {
      const location = await this.locationRepository.findOne({
        where: { tenantId, slug: this.slugify(data.location_name) },
      });
      locationId = location?.id || null;
    }

    // Resolve type
    let typeId: number | null = null;
    if (data.property_type) {
      const type = await this.typeRepository.findOne({
        where: { tenantId, slug: this.slugify(data.property_type) },
      });
      typeId = type?.id || null;
    }

    // Resolve features
    let featureIds: number[] = [];
    if (data.features?.length) {
      const features = await this.featureRepository.find({ where: { tenantId } });
      featureIds = data.features
        .map((name: string) => {
          const match = features.find(
            (f) => (f.name.en || '').toLowerCase() === name.toLowerCase(),
          );
          return match?.id;
        })
        .filter((id: number | undefined): id is number => !!id);
    }

    const propertyData: Partial<Property> = {
      tenantId,
      reference: data.reference,
      title: data.title,
      description: data.description,
      price: data.price ? parseFloat(data.price) : null,
      currency: data.currency || 'EUR',
      bedrooms: data.bedrooms ? parseInt(data.bedrooms) : null,
      bathrooms: data.bathrooms ? parseInt(data.bathrooms) : null,
      buildSize: data.buildSize ? parseFloat(data.buildSize) : null,
      plotSize: data.plotSize ? parseFloat(data.plotSize) : null,
      locationId,
      propertyTypeId: typeId,
      features: featureIds,
      listingType: data.listing_type || 'sale',
      source: 'manual',
      status: 'draft',
      images: data.images?.map((url: string, i: number) => ({ url, order: i })) || [],
    };

    if (existing && conflictHandling === 'overwrite') {
      Object.assign(existing, propertyData);
      return this.propertyRepository.save(existing);
    }

    const property = this.propertyRepository.create(propertyData);
    return this.propertyRepository.save(property);
  }
}
