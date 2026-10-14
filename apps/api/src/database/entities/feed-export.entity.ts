import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  JoinColumn,
} from 'typeorm';
import { Tenant } from './tenant.entity';

export type XmlFormat = 'kyero' | 'idealista' | 'generic';
export type ExportFormat = 'xml' | 'json';
// What an access-log row records: one of the URL feeds, or idealista's.
export type ExportLogFormat = ExportFormat | 'idealista';
export type ExportListingScope = 'all' | 'own';

// The client's idealista feed (customer JSON, v6). One per client.
export interface IdealistaExportSettings {
  enabled: boolean;
  // Issued by idealista to the agency: "ilc" + 40 lowercase letters/digits.
  customerCode: string;
  country: 'Spain' | 'Portugal' | 'Italy';
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  addressVisibility: 'full' | 'street' | 'hidden';
  // 'own' = every active published own listing; 'selected' = only propertyIds.
  mode: 'own' | 'selected';
  propertyIds: number[];
  // "https://site.com/en/property/{segment}" — {segment} or {ref}. Empty = no link.
  propertyUrlPattern: string;
  // The idealista URL's own key (in the path). Separate from exportKey so a
  // leaked idealista URL can be replaced without touching the other feeds.
  feedKey?: string;
}

// The client's Rightmove Overseas feed. Rightmove takes pushes only: SPM calls
// their Real Time Datafeed with the platform certificate, one listing a call.
export interface RightmoveExportSettings {
  enabled: boolean;
  // Issued by Rightmove for the agent's branch.
  networkId: number | null;
  branchId: number | null;
  // 'own' = every live own sale listing; 'selected' = only propertyIds.
  mode: 'own' | 'selected';
  propertyIds: number[];
  // Spanish text after the English (Rightmove wants English first).
  includeSpanish: boolean;
}

// The client's JSON feed, separate from the Kyero XML feed (whose settings
// are the config's top-level columns). Own key so each URL can be replaced alone.
export interface JsonFeedSettings {
  enabled: boolean;
  includeUnpublished: boolean;
  includeSold: boolean;
  listingScope: ExportListingScope;
  feedKey?: string;
}

@Entity('feed_export_configs')
export class FeedExportConfig {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Column({ unique: true })
  tenantId: number;

  @Column({ default: false })
  isEnabled: boolean;

  @Column({ length: 64, unique: true })
  exportKey: string;

  @Column({ type: 'json', default: '["xml", "json"]' })
  allowedFormats: ExportFormat[];

  @Column({ type: 'json', nullable: true })
  propertyFilter: Record<string, any>;

  @Column({ default: false })
  includeUnpublished: boolean;

  @Column({ default: false })
  includeSold: boolean;

  // 'all' = every live listing (network ones too); 'own' = the client's own
  // (Resales OwnProperty or added by hand), like the idealista feed.
  @Column({ type: 'varchar', length: 8, default: 'all' })
  listingScope: ExportListingScope;

  @Column({
    type: 'enum',
    enum: ['kyero', 'idealista', 'generic'],
    default: 'kyero',
  })
  xmlFormat: XmlFormat;

  @Column({ default: 900 })
  cacheTtl: number; // Seconds

  @Column({ type: 'json', nullable: true })
  idealista: IdealistaExportSettings | null;

  @Column({ type: 'json', nullable: true })
  rightmove: RightmoveExportSettings | null;

  @Column({ type: 'json', nullable: true })
  jsonFeed: JsonFeedSettings | null;

  @Column({ type: 'timestamp', nullable: true })
  lastGeneratedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('feed_export_logs')
@Index(['tenantId', 'accessedAt'])
export class FeedExportLog {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Column()
  tenantId: number;

  @Column({
    type: 'enum',
    enum: ['xml', 'json', 'idealista'],
  })
  format: ExportLogFormat;

  @Column({ default: 0 })
  propertiesCount: number;

  @Column({ length: 45, nullable: true })
  requesterIp: string;

  @Column({ length: 500, nullable: true })
  userAgent: string;

  @Column({ type: 'int', nullable: true })
  responseTimeMs: number;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  accessedAt: Date;
}
