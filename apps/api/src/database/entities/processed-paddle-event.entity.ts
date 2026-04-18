import { Entity, Column, PrimaryColumn, CreateDateColumn, Index } from 'typeorm';

// Idempotency record for inbound Paddle webhooks. One row per Paddle eventId.
// Insertion is the dedup primitive: if the PK collides, the event was already
// processed and the handler returns 200 without re-applying side-effects.
@Entity('processed_paddle_events')
export class ProcessedPaddleEvent {
  @PrimaryColumn({ length: 100 })
  eventId: string;

  @Column({ length: 100 })
  @Index()
  eventType: string;

  @CreateDateColumn()
  processedAt: Date;
}
