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

export type FeedProvider = 'resales' | 'inmoba' | 'infocasa' | 'redsp';
export type FeedSyncStatus = 'success' | 'partial' | 'failed';

export interface FeedCredentials {
  apiKey?: string;
  clientId?: string;
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
    enum: ['resales', 'inmoba', 'infocasa', 'redsp'],
  })
  provider: FeedProvider;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'json' })
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
