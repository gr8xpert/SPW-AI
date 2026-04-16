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

  @Column({
    type: 'enum',
    enum: ['kyero', 'idealista', 'generic'],
    default: 'kyero',
  })
  xmlFormat: XmlFormat;

  @Column({ default: 900 })
  cacheTtl: number; // Seconds

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
    enum: ['xml', 'json'],
  })
  format: ExportFormat;

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
