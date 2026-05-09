import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Tenant } from './tenant.entity';
import { PropertyType } from './property-type.entity';
import { Location } from './location.entity';
import { User } from './user.entity';

export type ListingType = 'sale' | 'rent' | 'holiday_rent' | 'development';
export type PropertyStatus = 'draft' | 'active' | 'sold' | 'rented' | 'archived';
export type PropertySource = 'resales' | 'inmoba' | 'infocasa' | 'redsp' | 'kyero' | 'odoo' | 'manual';

export interface PropertyImage {
  url: string;
  sourceUrl?: string;
  // Present when the image is stored in R2 via media_blobs dedup.
  // On feed re-sync or property delete we use this to releaseBlob().
  contentHash?: string;
  order: number;
  alt?: string;
}

@Entity('properties')
@Index(['tenantId', 'reference'], { unique: true })
@Index(['tenantId', 'source', 'externalId'], { unique: true })
@Index(['tenantId', 'status'])
@Index(['tenantId', 'listingType'])
@Index(['tenantId', 'locationId'])
@Index(['tenantId', 'slug'], { unique: true })
@Index(['tenantId', 'status', 'isPublished', 'listingType', 'locationId', 'propertyTypeId', 'price', 'bedrooms'])
export class Property {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  tenantId: number;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Column({ length: 50 })
  reference: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  agentReference: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  externalId: string | null;

  @Column({
    type: 'enum',
    enum: ['resales', 'inmoba', 'infocasa', 'redsp', 'kyero', 'odoo', 'manual'],
    default: 'manual',
  })
  source: PropertySource;

  @Column({
    type: 'enum',
    enum: ['sale', 'rent', 'holiday_rent', 'development'],
  })
  listingType: ListingType;

  @Column({ type: 'int', nullable: true })
  propertyTypeId: number | null;

  @ManyToOne(() => PropertyType, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'propertyTypeId' })
  propertyType: PropertyType | null;

  @Column({ type: 'int', nullable: true })
  locationId: number | null;

  @ManyToOne(() => Location, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'locationId' })
  location: Location | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  urbanization: string | null;

  // Address
  @Column({ type: 'varchar', length: 50, nullable: true })
  floor: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  street: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  streetNumber: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  postcode: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  cadastralReference: string | null;

  // Pricing
  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  price: number | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  priceTo: number | null;

  @Column({ default: false })
  priceOnRequest: boolean;

  @Column({ length: 3, default: 'EUR' })
  currency: string;

  // Metrics
  @Column({ type: 'tinyint', unsigned: true, nullable: true })
  bedrooms: number | null;

  @Column({ type: 'tinyint', unsigned: true, nullable: true })
  bedroomsTo: number | null;

  @Column({ type: 'tinyint', unsigned: true, nullable: true })
  bathrooms: number | null;

  @Column({ type: 'tinyint', unsigned: true, nullable: true })
  bathroomsTo: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  buildSize: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  buildSizeTo: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  plotSize: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  plotSizeTo: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  terraceSize: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  terraceSizeTo: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  gardenSize: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  solariumSize: number | null;

  // Financial / Tax
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  communityFees: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  basuraTax: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  ibiFees: number | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  commission: number | null;

  @Column({ default: false })
  sharedCommission: boolean;

  // Building / Energy
  @Column({ type: 'smallint', unsigned: true, nullable: true })
  builtYear: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  energyConsumption: number | null;

  // Distance
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  distanceToBeach: number | null;

  // Content (multilingual)
  @Column({ type: 'json', nullable: true })
  title: Record<string, string> | null; // { en: "Beautiful Villa", es: "Villa Hermosa" }

  @Column({ type: 'json', nullable: true })
  description: Record<string, string> | null;

  // Media
  @Column({ type: 'json', nullable: true })
  images: PropertyImage[] | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  videoUrl: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  virtualTourUrl: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  floorPlanUrl: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  externalLink: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  blogUrl: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  mapLink: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  websiteUrl: string | null;

  // Features (array of feature IDs)
  @Column({ type: 'json', nullable: true })
  features: number[] | null;

  // Coordinates
  @Column({ type: 'decimal', precision: 10, scale: 8, nullable: true })
  lat: number | null;

  @Column({ type: 'decimal', precision: 11, scale: 8, nullable: true })
  lng: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  geoLocationLabel: string | null;

  // SEO
  @Column({ type: 'varchar', length: 255, nullable: true })
  slug: string | null;

  @Column({ type: 'json', nullable: true })
  metaTitle: Record<string, string> | null;

  @Column({ type: 'json', nullable: true })
  metaDescription: Record<string, string> | null;

  @Column({ type: 'json', nullable: true })
  metaKeywords: Record<string, string> | null;

  @Column({ type: 'json', nullable: true })
  pageTitle: Record<string, string> | null;

  // Agent / Assignment
  @Column({ type: 'int', nullable: true })
  agentId: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'agentId' })
  agent: User | null;

  @Column({ type: 'int', nullable: true })
  salesAgentId: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'salesAgentId' })
  salesAgent: User | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  project: string | null;

  // Selection flags
  @Column({ default: false })
  isOwnProperty: boolean;

  @Column({ default: false })
  villaSelection: boolean;

  @Column({ default: false })
  luxurySelection: boolean;

  @Column({ default: false })
  apartmentSelection: boolean;

  // Dates
  @Column({ type: 'date', nullable: true })
  deliveryDate: Date | null;

  @Column({ type: 'date', nullable: true })
  completionDate: Date | null;

  // Status flags
  @Column({
    type: 'enum',
    enum: ['draft', 'active', 'sold', 'rented', 'archived'],
    default: 'draft',
  })
  status: PropertyStatus;

  @Column({ default: false })
  isFeatured: boolean;

  @Column({ default: false })
  isPublished: boolean;

  @Column({ default: true })
  syncEnabled: boolean;

  // Field locking (array of locked field names)
  @Column({ type: 'json', nullable: true })
  lockedFields: string[] | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  contentHash: string | null;

  // Audit / Feed
  @Column({ type: 'int', nullable: true })
  lastUpdatedById: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'lastUpdatedById' })
  lastUpdatedByUser: User | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  propertyTypeReference: string | null;

  // Timestamps
  @Column({ type: 'timestamp', nullable: true })
  importedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  publishedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  soldAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  lastUpdatedResales: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
