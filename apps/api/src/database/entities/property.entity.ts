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

export type ListingType = 'sale' | 'rent' | 'development';
export type PropertyStatus = 'draft' | 'active' | 'sold' | 'rented' | 'archived';
export type PropertySource = 'resales' | 'inmoba' | 'infocasa' | 'redsp' | 'manual';

export interface PropertyImage {
  url: string;
  order: number;
  alt?: string;
}

@Entity('properties')
@Index(['tenantId', 'reference'], { unique: true })
@Index(['tenantId', 'source', 'externalId'], { unique: true })
@Index(['tenantId', 'status'])
@Index(['tenantId', 'listingType'])
@Index(['tenantId', 'locationId'])
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
    enum: ['resales', 'inmoba', 'infocasa', 'redsp', 'manual'],
    default: 'manual',
  })
  source: PropertySource;

  @Column({
    type: 'enum',
    enum: ['sale', 'rent', 'development'],
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

  // Pricing
  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  price: number | null;

  @Column({ default: false })
  priceOnRequest: boolean;

  @Column({ length: 3, default: 'EUR' })
  currency: string;

  // Metrics
  @Column({ type: 'tinyint', unsigned: true, nullable: true })
  bedrooms: number | null;

  @Column({ type: 'tinyint', unsigned: true, nullable: true })
  bathrooms: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  buildSize: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  plotSize: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  terraceSize: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  gardenSize: number | null;

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

  // Features (array of feature IDs)
  @Column({ type: 'json', nullable: true })
  features: number[] | null;

  // Coordinates
  @Column({ type: 'decimal', precision: 10, scale: 8, nullable: true })
  lat: number | null;

  @Column({ type: 'decimal', precision: 11, scale: 8, nullable: true })
  lng: number | null;

  // Dates
  @Column({ type: 'date', nullable: true })
  deliveryDate: Date | null;

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

  // Timestamps
  @Column({ type: 'timestamp', nullable: true })
  importedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  publishedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  soldAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
