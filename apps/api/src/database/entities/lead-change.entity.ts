import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './user.entity';

export type LeadChangeSource = 'dashboard' | 'website' | 'import' | 'system';

// One value of a change: the field and its display text before and after
// (ids already turned into names, so renames don't rewrite history).
export interface LeadChangeItem {
  field: string;
  from: string | null;
  to: string | null;
}

// The buyer change log: one row per save that changed something.
@Entity('lead_changes')
@Index(['leadId', 'id'])
@Index(['tenantId'])
export class LeadChange {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  tenantId: number;

  @Column()
  leadId: number;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'userId' })
  user: User | null;

  @Column({ type: 'int', nullable: true })
  userId: number | null;

  @Column({ type: 'enum', enum: ['dashboard', 'website', 'import', 'system'] })
  source: LeadChangeSource;

  @Column({ type: 'json' })
  changes: LeadChangeItem[];

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;
}
