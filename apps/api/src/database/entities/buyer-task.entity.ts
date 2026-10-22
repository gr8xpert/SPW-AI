import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { Tenant } from './tenant.entity';
import { Lead } from './lead.entity';
import { User } from './user.entity';

// A follow-up on a buyer: what to do, who does it, by when.
@Entity('buyer_tasks')
@Index('idx_buyer_tasks_due', ['tenantId', 'assignedTo', 'doneAt', 'dueAt'])
@Index(['leadId'])
export class BuyerTask {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Column()
  tenantId: number;

  @ManyToOne(() => Lead, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'leadId' })
  lead: Lead;

  @Column()
  leadId: number;

  @Column({ length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assignedTo' })
  assignedToUser: User | null;

  @Column({ type: 'int', nullable: true })
  assignedTo: number | null;

  @Column({ type: 'datetime', nullable: true })
  dueAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  doneAt: Date | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdBy' })
  createdByUser: User | null;

  @Column({ type: 'int', nullable: true })
  createdBy: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
