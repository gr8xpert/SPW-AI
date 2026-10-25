import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { Lead } from './lead.entity';
import { User } from './user.entity';

// A buyer's visiting period (milestone I). Its viewings point at it.
@Entity('buyer_trips')
@Index(['leadId', 'startDate'])
@Index(['tenantId'])
export class BuyerTrip {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  tenantId: number;

  @ManyToOne(() => Lead, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'leadId' })
  lead: Lead;

  @Column()
  leadId: number;

  @Column({ type: 'date' })
  startDate: string;

  @Column({ type: 'date' })
  endDate: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'int', nullable: true })
  createdBy: number | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}

export const VIEWING_STATUSES = ['planned', 'done', 'cancelled', 'no_show'] as const;
export type ViewingStatus = (typeof VIEWING_STATUSES)[number];

// One viewing: a property (or a free title for one not in SPM), when, with
// which agent, where to meet, and how it went.
@Entity('buyer_viewings')
@Index(['tenantId', 'startsAt'])
@Index(['leadId', 'startsAt'])
@Index('idx_buyer_viewings_external', ['tenantId', 'externalRef'])
export class BuyerViewing {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  tenantId: number;

  @ManyToOne(() => Lead, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'leadId' })
  lead: Lead;

  @Column()
  leadId: number;

  @Column({ type: 'int', nullable: true })
  tripId: number | null;

  @Column({ type: 'int', nullable: true })
  propertyId: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  title: string | null;

  @Column({ type: 'datetime' })
  startsAt: Date;

  @Column({ type: 'smallint', default: 60 })
  durationMin: number;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'agentId' })
  agent: User | null;

  @Column({ type: 'int', nullable: true })
  agentId: number | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  meetingPoint: string | null;

  @Column({ type: 'enum', enum: VIEWING_STATUSES, default: 'planned' })
  status: ViewingStatus;

  @Column({ type: 'text', nullable: true })
  feedback: string | null;

  // How interested the buyer was, 1–5.
  @Column({ type: 'tinyint', nullable: true })
  interest: number | null;

  @Column({ type: 'datetime', nullable: true })
  reminderSentAt: Date | null;

  // A viewing booked in Calendly: its invitee URI (migration 1777460000000),
  // so a cancel or reschedule finds it.
  @Column({ type: 'varchar', length: 255, nullable: true })
  externalRef: string | null;

  @Column({ type: 'int', nullable: true })
  createdBy: number | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
