import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, CreateDateColumn, Index } from 'typeorm';
import { Tenant } from './tenant.entity';

export interface BuyerQuestionOption {
  key: string;
  // { en: 'Investment', es: 'Inversión', … }
  label: Record<string, string>;
}

// A question about the buyer rather than the property (purpose, financial
// situation, timeframe…). Each client edits and translates its own list.
// Answers live on leads.answers as { [qkey]: optionKeys[] }; they are stored
// and filterable, never used for matching.
@Entity('buyer_questions')
@Index('uq_buyer_questions_key', ['tenantId', 'qkey'], { unique: true })
export class BuyerQuestion {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Column()
  tenantId: number;

  // Never changes after creation, so answers keep pointing at it.
  @Column({ length: 60 })
  qkey: string;

  @Column({ type: 'json' })
  label: Record<string, string>;

  @Column({ type: 'json' })
  options: BuyerQuestionOption[];

  @Column({ default: false })
  multiple: boolean;

  // Shown on the website wishlist form (milestone C).
  @Column({ default: true })
  showOnForm: boolean;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: 0 })
  sortOrder: number;

  @CreateDateColumn()
  createdAt: Date;
}
