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
import { encryptedJsonColumn } from '../../common/crypto/secret-cipher';

export type FeedProvider = 'resales' | 'inmoba' | 'infocasa' | 'redsp' | 'kyero' | 'odoo';
export type FeedSyncStatus = 'success' | 'partial' | 'failed';

export interface FeedCredentials {
  apiKey?: string;
  clientId?: string;
  filterId?: string;
  username?: string;
  password?: string;
  endpoint?: string;
}

export interface FeedFieldMapping {
  [externalField: string]: string;
}

@Entity('feed_configs')
@Index(['tenantId', 'isActive'])
export class FeedConfig {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  tenantId: number;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Column({
    type: 'enum',
    enum: ['resales', 'inmoba', 'infocasa', 'redsp', 'kyero', 'odoo'],
  })
  provider: FeedProvider;

  @Column({ length: 100 })
  name: string;

  // Encrypted at rest (AES-256-GCM via encryptedJsonColumn). Column type widened
  // to TEXT in EncryptFeedCredentials migration so ciphertext fits comfortably.
  // Legacy rows (plaintext JSON written before that migration) decrypt to
  // themselves via the cipher's passthrough.
  @Column({ type: 'text', transformer: encryptedJsonColumn })
  credentials: FeedCredentials;

  @Column({ type: 'json', nullable: true })
  fieldMapping: FeedFieldMapping | null;

  // Field names that should NEVER be overwritten by a sync from this feed,
  // for every property regardless of per-property lockedFields. Merged with
  // Property.lockedFields at import time.
  @Column({ type: 'json', nullable: true })
  protectedFields: string[] | null;

  // Everything this feed imports is flagged isFeatured, and unflagged again
  // when it leaves the feed. For a Resales filter the agency curates as its
  // featured list.
  @Column({ default: false })
  markAsFeatured: boolean;

  // After a complete sync, delete properties this feed imported that are no
  // longer in it (sold, withdrawn), so the site mirrors the source. Off keeps
  // them. Properties with syncEnabled=false are always kept.
  @Column({ default: true })
  removeMissing: boolean;

  @Column({ length: 50, default: '0 2 * * *' })
  syncSchedule: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lastSyncAt: Date | null;

  @Column({
    type: 'enum',
    enum: ['success', 'partial', 'failed'],
    nullable: true,
  })
  lastSyncStatus: FeedSyncStatus | null;

  @Column({ default: 0 })
  lastSyncCount: number;

  @Column({ type: 'text', nullable: true })
  lastError: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
