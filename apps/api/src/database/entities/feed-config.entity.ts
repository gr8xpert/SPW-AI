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
