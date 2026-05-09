import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Tenant } from './tenant.entity';
import { StorageType } from './upload.entity';

// Content-addressed image storage with reference counting. Each unique
// (tenantId, contentHash) pair maps to one R2 object; multiple property
// images / media files can reference the same blob, deduplicating both
// storage (R2 cost) and bandwidth (no re-upload of identical bytes).
//
// Why per-tenant (not global): each tenant has their own R2 bucket via
// TenantStorageConfig — we can't share bytes across buckets even when the
// hash matches. The (tenantId, contentHash) unique key keeps the table
// honest and lets refcount math stay tenant-scoped.
//
// Refcount lifecycle:
//   storeBlob(buffer)  → INSERT new row OR increment refCount (atomic)
//   releaseBlob(hash)  → decrement refCount; DELETE row + R2 object when 0
@Entity('media_blobs')
@Index(['tenantId', 'contentHash'], { unique: true })
@Index(['tenantId', 'refCount'])
export class MediaBlob {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  tenantId: number;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  // sha256 of the original bytes after optimization (e.g. WebP buffer for
  // images). Hex-encoded, always 64 chars.
  @Column({ length: 64 })
  contentHash: string;

  @Column({ length: 500 })
  storageKey: string;

  @Column({
    type: 'enum',
    enum: ['local', 's3'],
    default: 's3',
  })
  storageType: StorageType;

  @Column({ type: 'int' })
  size: number;

  @Column({ length: 100, default: 'image/webp' })
  mimeType: string;

  @Column({ type: 'int', default: 1 })
  refCount: number;

  @CreateDateColumn()
  createdAt: Date;
}
