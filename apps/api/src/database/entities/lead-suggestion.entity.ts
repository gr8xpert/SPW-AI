import {
  Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';
import { SUGGESTION_STATUSES } from '@spm/shared';
import type { SuggestionStatus } from '@spm/shared';
import { Tenant } from './tenant.entity';
import { Lead } from './lead.entity';
import { Property } from './property.entity';
import { User } from './user.entity';

// A property the agent picked for a buyer (Suggested tab). Sending it by
// email sets status 'sent' and sentAt; the agent moves it on from there.
@Entity('lead_suggestions')
@Index(['leadId', 'propertyId'], { unique: true })
@Index(['tenantId'])
export class LeadSuggestion {
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

  @ManyToOne(() => Property, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'propertyId' })
  property: Property;

  @Column()
  propertyId: number;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  virtualTourUrl: string | null;

  @Column({ type: 'datetime', nullable: true })
  visitDate: Date | null;

  @Column({ type: 'enum', enum: SUGGESTION_STATUSES, default: 'suggested' })
  status: SuggestionStatus;

  @Column({ type: 'datetime', nullable: true })
  sentAt: Date | null;

  // Timeline (milestone E): see buyer/tracking/timeline.ts.
  @Column({ type: 'datetime', nullable: true })
  openedAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  clickedAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  likedAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  rejectedAt: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  rejectReason: string | null;

  @Column({ type: 'datetime', nullable: true })
  viewingAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  offerAt: Date | null;

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
