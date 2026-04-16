import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  JoinColumn,
} from 'typeorm';
import { Tenant } from './tenant.entity';
import { Contact } from './contact.entity';
import { Property } from './property.entity';
import { User } from './user.entity';

export type LeadSource = 'widget_inquiry' | 'phone' | 'email' | 'walkin' | 'referral' | 'website' | 'other';
export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'viewing_scheduled' | 'offer_made' | 'negotiating' | 'won' | 'lost';

@Entity('leads')
@Index(['tenantId', 'status'])
@Index(['assignedTo', 'status'])
@Index(['nextFollowUp'])
export class Lead {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Column()
  tenantId: number;

  @ManyToOne(() => Contact, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contactId' })
  contact: Contact;

  @Column()
  contactId: number;

  @ManyToOne(() => Property, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'propertyId' })
  property: Property;

  @Column({ type: 'int', nullable: true })
  propertyId: number | null;

  @Column({
    type: 'enum',
    enum: ['widget_inquiry', 'phone', 'email', 'walkin', 'referral', 'website', 'other'],
    default: 'widget_inquiry',
  })
  source: LeadSource;

  @Column({
    type: 'enum',
    enum: ['new', 'contacted', 'qualified', 'viewing_scheduled', 'offer_made', 'negotiating', 'won', 'lost'],
    default: 'new',
  })
  status: LeadStatus;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assignedTo' })
  assignedToUser: User;

  @Column({ type: 'int', nullable: true })
  assignedTo: number | null;

  @Column({ default: 0 })
  score: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  budgetMin: number | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  budgetMax: number | null;

  @Column({ length: 3, default: 'EUR' })
  budgetCurrency: string;

  @Column({ type: 'json', nullable: true })
  preferredLocations: number[] | null;

  @Column({ type: 'json', nullable: true })
  preferredTypes: number[] | null;

  @Column({ type: 'json', nullable: true })
  preferredFeatures: number[] | null;

  @Column({ type: 'tinyint', unsigned: true, nullable: true })
  preferredBedroomsMin: number | null;

  @Column({ type: 'tinyint', unsigned: true, nullable: true })
  preferredBedroomsMax: number | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'timestamp', nullable: true })
  nextFollowUp: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  lastContactAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  wonAt: Date | null;

  @ManyToOne(() => Property, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'wonPropertyId' })
  wonProperty: Property;

  @Column({ type: 'int', nullable: true })
  wonPropertyId: number | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  wonAmount: number | null;

  @Column({ type: 'timestamp', nullable: true })
  lostAt: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  lostReason: string | null;

  @OneToMany(() => LeadActivity, (activity) => activity.lead)
  activities: LeadActivity[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

export type LeadActivityType = 'note' | 'call' | 'email' | 'sms' | 'viewing' | 'offer' | 'meeting' | 'status_change' | 'assignment';

@Entity('lead_activities')
@Index(['leadId', 'createdAt'])
export class LeadActivity {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Lead, (lead) => lead.activities, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'leadId' })
  lead: Lead;

  @Column()
  leadId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: number;

  @Column({
    type: 'enum',
    enum: ['note', 'call', 'email', 'sms', 'viewing', 'offer', 'meeting', 'status_change', 'assignment'],
  })
  type: LeadActivityType;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, any> | null;

  @CreateDateColumn()
  createdAt: Date;
}
