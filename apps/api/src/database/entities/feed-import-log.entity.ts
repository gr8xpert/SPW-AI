import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Tenant } from './tenant.entity';
import { FeedConfig } from './feed-config.entity';

export type ImportStatus = 'running' | 'success' | 'partial' | 'failed';

export interface ImportError {
  ref: string;
  error: string;
}

@Entity('feed_import_logs')
@Index(['tenantId', 'startedAt'])
export class FeedImportLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  feedConfigId: number;

  @ManyToOne(() => FeedConfig, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'feedConfigId' })
  feedConfig: FeedConfig;

  @Column()
  tenantId: number;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Column({ type: 'timestamp' })
  startedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @Column({
    type: 'enum',
    enum: ['running', 'success', 'partial', 'failed'],
    default: 'running',
  })
  status: ImportStatus;

  @Column({ default: 0 })
  totalFetched: number;

  @Column({ default: 0 })
  createdCount: number;

  @Column({ default: 0 })
  updatedCount: number;

  @Column({ default: 0 })
  skippedCount: number;

  @Column({ default: 0 })
  errorCount: number;

  @Column({ type: 'json', nullable: true })
  errors: ImportError[] | null;
}
