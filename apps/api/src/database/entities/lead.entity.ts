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
import { BuyerStage } from './buyer-stage.entity';
import { LeadAgent } from './lead-agent.entity';
import type { BuyerRole, BuyerWishlist, NoteRule, PreferredContact, RelatedContact } from '@spm/shared';

export type LeadSource = 'widget_inquiry' | 'phone' | 'email' | 'walkin' | 'referral' | 'website' | 'other' | 'facebook' | 'instagram';
export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'viewing_scheduled' | 'offer_made' | 'negotiating' | 'won' | 'lost';

@Entity('leads')
@Index(['tenantId', 'status'])
@Index(['assignedTo', 'status'])
@Index(['nextFollowUp'])
@Index('idx_leads_buyer_list', ['tenantId', 'mergedIntoId', 'stageId'])
@Index('idx_leads_last_activity', ['tenantId', 'lastActivityAt'])
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
    enum: ['widget_inquiry', 'phone', 'email', 'walkin', 'referral', 'website', 'other', 'facebook', 'instagram'],
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

  // ── Buyer Match (migration 1777230000000) ──────────────────────────────
  // A lead is a buyer record: one per email (contactId). Older duplicates
  // point at the kept record through mergedIntoId and are hidden.

  @Column({
    type: 'enum',
    enum: ['buyer', 'registered', 'seller', 'professional', 'estate_agent', 'developer', 'landlord', 'tenant'],
    default: 'buyer',
  })
  role: BuyerRole;

  @Column({ type: 'varchar', length: 100, nullable: true })
  firstName: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  lastName: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  mobile: string | null;

  @Column({ type: 'varchar', length: 5, nullable: true })
  language: string | null;

  @Column({ type: 'enum', enum: ['call', 'email', 'whatsapp'], nullable: true })
  preferredContact: PreferredContact | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  photoUrl: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  street: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  street2: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  zip: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  state: string | null;

  // ISO 3166-1 alpha-2
  @Column({ type: 'varchar', length: 2, nullable: true })
  country: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  idType: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  idNumber: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  lawyer: string | null;

  @ManyToOne(() => BuyerStage, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'stageId' })
  stage: BuyerStage | null;

  @Column({ type: 'int', nullable: true })
  stageId: number | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  subStatus: string | null;

  // 0–3 stars
  @Column({ type: 'tinyint', unsigned: true, default: 0 })
  priority: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  dealValue: number | null;

  @Column({ type: 'date', nullable: true })
  waitingReplyAt: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  referredBy: string | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  referralPercent: number | null;

  @Column({ type: 'date', nullable: true })
  visitStart: string | null;

  @Column({ type: 'date', nullable: true })
  visitEnd: string | null;

  @Column({ type: 'json', nullable: true })
  wishlist: BuyerWishlist | null;

  // Buyer questions: { [questionKey]: optionKeys[] }
  @Column({ type: 'json', nullable: true })
  answers: Record<string, string[]> | null;

  @Column({ type: 'json', nullable: true })
  relatedContacts: RelatedContact[] | null;

  @Column({ type: 'int', nullable: true })
  mergedIntoId: number | null;

  // GDPR (migration 1777300000000): consent to be contacted, opt-out from
  // property emails, and erasure (personal data wiped, numbers kept).
  @Column({ type: 'datetime', nullable: true })
  consentAt: Date | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  consentSource: string | null;

  @Column({ type: 'datetime', nullable: true })
  unsubscribedAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  erasedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  lastActivityAt: Date | null;

  // Came in from a website form and nobody picked a role yet (migration
  // 1777360000000): shown on New Leads, kept out of Contacts and matching.
  @Column({ type: 'boolean', default: false })
  isNewLead: boolean;

  // Id in the system the buyer was imported from (Odoo), for re-imports.
  @Column({ type: 'varchar', length: 50, nullable: true })
  importRef: string | null;

  // The personal buyer page (milestone F): the random code in the buyer's
  // private link, and whether the agent has it switched on.
  @Column({ type: 'varchar', length: 16, nullable: true })
  pageCode: string | null;

  @Column({ type: 'boolean', default: true })
  pageEnabled: boolean;

  // Phase 3 (milestone L): rules the agent accepted from the notes, and the
  // hash of the notes they were read from (see buyer/ai/note-rules.ts).
  @Column({ type: 'json', nullable: true })
  noteRules: NoteRule[] | null;

  @Column({ type: 'char', length: 64, nullable: true })
  noteRulesHash: string | null;

  // Milestone M: the three-line summary, the hash of its input (the cache
  // key), when it was written, and dismissed feedback suggestions.
  @Column({ type: 'text', nullable: true })
  aiSummary: string | null;

  @Column({ type: 'char', length: 64, nullable: true })
  aiSummaryHash: string | null;

  @Column({ type: 'datetime', nullable: true })
  aiSummaryAt: Date | null;

  @Column({ type: 'json', nullable: true })
  aiDismissed: string[] | null;

  @OneToMany(() => LeadAgent, (agent) => agent.lead)
  agents: LeadAgent[];

  @OneToMany(() => LeadActivity, (activity) => activity.lead)
  activities: LeadActivity[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

export const LEAD_ACTIVITY_TYPES = [
  'note', 'call', 'email', 'sms', 'viewing', 'offer', 'meeting', 'status_change', 'assignment',
  // Buyer Match
  'enquiry', 'wishlist_form', 'task_done', 'suggestion_sent', 'import', 'merge',
  // Buyer Match Phase 2 (migration 1777260000000)
  'buyer_feedback', 'viewing_request', 'alert_sent',
  // Milestone I (migration 1777290000000)
  'viewing_planned', 'viewing_done',
  // Milestone J (migration 1777300000000)
  'erase', 'unsubscribe',
] as const;
export type LeadActivityType = (typeof LEAD_ACTIVITY_TYPES)[number];

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

  // Null = done by the website (an enquiry or the wishlist form) or the system.
  @ManyToOne(() => User, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User | null;

  @Column({ type: 'int', nullable: true })
  userId: number | null;

  @Column({ type: 'enum', enum: LEAD_ACTIVITY_TYPES })
  type: LeadActivityType;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, any> | null;

  @CreateDateColumn()
  createdAt: Date;
}
