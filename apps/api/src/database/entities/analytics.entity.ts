import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  CreateDateColumn,
  Index,
  JoinColumn,
} from 'typeorm';
import { Tenant } from './tenant.entity';
import { Property } from './property.entity';
import { Contact } from './contact.entity';

@Entity('property_views')
@Index(['tenantId', 'propertyId'])
@Index(['tenantId', 'viewedAt'])
@Index(['sessionId'])
export class PropertyView {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Column()
  tenantId: number;

  @ManyToOne(() => Property, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'propertyId' })
  property: Property;

  @Column()
  propertyId: number;

  @Column({ length: 64 })
  sessionId: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  visitorIpHash: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  referrer: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  userAgent: string | null;

  @Column({ type: 'int', nullable: true })
  durationSeconds: number | null;

  @Column({ default: false })
  inquiryMade: boolean;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  viewedAt: Date;
}

@Entity('search_logs')
@Index(['tenantId', 'searchedAt'])
export class SearchLog {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Column()
  tenantId: number;

  @Column({ length: 64 })
  sessionId: string;

  @Column({ type: 'json' })
  filters: Record<string, any>;

  @Column({ default: 0 })
  resultsCount: number;

  @ManyToOne(() => Property, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'clickedPropertyId' })
  clickedProperty: Property;

  @Column({ type: 'int', nullable: true })
  clickedPropertyId: number | null;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  searchedAt: Date;
}

@Entity('favorites')
@Index(['tenantId'])
@Index(['contactId', 'propertyId'], { unique: true, where: 'contactId IS NOT NULL' })
@Index(['sessionId', 'propertyId'], { unique: true, where: 'sessionId IS NOT NULL' })
export class Favorite {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Column()
  tenantId: number;

  @ManyToOne(() => Contact, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contactId' })
  contact: Contact;

  @Column({ type: 'int', nullable: true })
  contactId: number | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  sessionId: string | null;

  @ManyToOne(() => Property, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'propertyId' })
  property: Property;

  @Column()
  propertyId: number;

  @CreateDateColumn()
  createdAt: Date;
}

@Entity('saved_searches')
@Index(['notifyNewMatches', 'lastNotifiedAt'])
export class SavedSearch {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Column()
  tenantId: number;

  @ManyToOne(() => Contact, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contactId' })
  contact: Contact;

  @Column()
  contactId: number;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'json' })
  filters: Record<string, any>;

  @Column({ default: false })
  notifyNewMatches: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lastNotifiedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
