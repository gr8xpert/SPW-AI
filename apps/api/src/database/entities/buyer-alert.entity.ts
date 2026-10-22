import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { Lead } from './lead.entity';

export type BuyerAlertKind = 'new_listing' | 'price_drop';
export type BuyerAlertStatus = 'pending' | 'approved' | 'rejected' | 'sent' | 'skipped';

// A new matching listing or a price drop for one buyer. It waits for the
// agent (pending → approved / rejected), then goes out (sent) or is dropped
// at send time when it no longer applies (skipped).
@Entity('buyer_alerts')
@Index(['tenantId', 'status', 'id'])
@Index(['leadId'])
export class BuyerAlert {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  tenantId: number;

  @ManyToOne(() => Lead, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'leadId' })
  lead: Lead;

  @Column()
  leadId: number;

  @Column()
  propertyId: number;

  @Column({ type: 'enum', enum: ['new_listing', 'price_drop'] })
  kind: BuyerAlertKind;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  oldPrice: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  newPrice: string | null;

  @Column({ type: 'int', default: 0 })
  score: number;

  @Column({ type: 'enum', enum: ['pending', 'approved', 'rejected', 'sent', 'skipped'], default: 'pending' })
  status: BuyerAlertStatus;

  @Column({ type: 'varchar', length: 80 })
  dedupeKey: string;

  @Column({ type: 'int', nullable: true })
  decidedBy: number | null;

  @Column({ type: 'datetime', nullable: true })
  decidedAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  sentAt: Date | null;

  @Column({ type: 'int', nullable: true })
  sendId: number | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
