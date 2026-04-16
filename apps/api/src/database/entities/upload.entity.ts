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
import { Property } from './property.entity';

export type StorageType = 'local' | 's3';

@Entity('media_files')
@Index(['tenantId', 'propertyId'])
export class MediaFile {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Column()
  tenantId: number;

  @ManyToOne(() => Property, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'propertyId' })
  property: Property;

  @Column({ type: 'int', nullable: true })
  propertyId: number;

  @Column({
    type: 'enum',
    enum: ['local', 's3'],
    default: 'local',
  })
  storageType: StorageType;

  @Column({ length: 255 })
  originalFilename: string;

  @Column({ length: 500 })
  storedPath: string;

  @Column({ length: 500 })
  url: string;

  @Column({ length: 100 })
  mimeType: string;

  @Column({ type: 'int' })
  fileSize: number;

  @Column({ type: 'json', nullable: true })
  dimensions: { width: number; height: number };

  @Column({ default: false })
  isOptimized: boolean;

  @Column({ default: 0 })
  sortOrder: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('tenant_storage_configs')
export class TenantStorageConfig {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Column({ unique: true })
  tenantId: number;

  @Column({
    type: 'enum',
    enum: ['local', 's3'],
    default: 'local',
  })
  storageType: StorageType;

  @Column({ length: 255, nullable: true })
  s3Bucket: string;

  @Column({ length: 50, nullable: true })
  s3Region: string;

  @Column({ length: 255, nullable: true })
  s3AccessKey: string; // Encrypted

  @Column({ length: 255, nullable: true })
  s3SecretKey: string; // Encrypted

  @Column({ length: 255, nullable: true })
  s3Endpoint: string; // For S3-compatible services

  @Column({ length: 255, nullable: true })
  cdnUrl: string;

  @Column({ default: 10 })
  maxFileSize: number; // In MB

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
