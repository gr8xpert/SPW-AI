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
import { User } from './user.entity';

export type MigrationType = 'full' | 'properties_only' | 'settings_only';
export type MigrationSourceFormat = 'csv' | 'json';
export type MigrationStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface MigrationStats {
  properties?: number;
  locations?: number;
  types?: number;
  features?: number;
  labels?: number;
  images?: number;
}

export interface MigrationError {
  row?: number;
  field?: string;
  message: string;
}

@Entity('migration_jobs')
@Index(['tenantId', 'status'])
export class MigrationJob {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Column()
  tenantId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: number;

  @Column({
    type: 'enum',
    enum: ['full', 'properties_only', 'settings_only'],
    default: 'full',
  })
  type: MigrationType;

  @Column({
    type: 'enum',
    enum: ['csv', 'json'],
  })
  sourceFormat: MigrationSourceFormat;

  @Column({
    type: 'enum',
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
    default: 'pending',
  })
  status: MigrationStatus;

  @Column({ type: 'int', default: 0 })
  progress: number; // 0-100 percentage

  @Column({ length: 255, nullable: true })
  currentStep: string;

  @Column({ length: 500 })
  filePath: string;

  @Column({ type: 'json', nullable: true })
  stats: MigrationStats;

  @Column({ type: 'json', nullable: true })
  errors: MigrationError[];

  @Column({ type: 'timestamp', nullable: true })
  startedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
