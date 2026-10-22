import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './user.entity';

export const SUGGESTION_EVENTS = ['sent', 'opened', 'clicked', 'liked', 'rejected', 'cleared', 'viewing', 'offer'] as const;
export type SuggestionEventType = (typeof SUGGESTION_EVENTS)[number];
export type SuggestionEventSource = 'email' | 'page' | 'agent' | 'alert';

// Every step of a property's timeline for one buyer, in order (by id).
@Entity('lead_suggestion_events')
@Index(['leadId', 'propertyId', 'id'])
@Index(['tenantId'])
export class LeadSuggestionEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  tenantId: number;

  @Column()
  leadId: number;

  @Column()
  propertyId: number;

  @Column({ type: 'int', nullable: true })
  sendId: number | null;

  @Column({ type: 'enum', enum: SUGGESTION_EVENTS })
  event: SuggestionEventType;

  @Column({ type: 'enum', enum: ['email', 'page', 'agent', 'alert'] })
  source: SuggestionEventSource;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'userId' })
  user: User | null;

  @Column({ type: 'int', nullable: true })
  userId: number | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;
}
