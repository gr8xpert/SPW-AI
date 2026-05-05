import { Entity, Column, PrimaryColumn, CreateDateColumn, Index } from 'typeorm';

@Entity('processed_stripe_events')
export class ProcessedStripeEvent {
  @PrimaryColumn({ length: 100 })
  eventId: string;

  @Column({ length: 100 })
  @Index()
  eventType: string;

  @CreateDateColumn()
  processedAt: Date;
}
