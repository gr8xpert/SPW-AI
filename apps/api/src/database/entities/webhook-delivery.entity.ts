import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type WebhookDeliveryStatus =
  | 'pending'
  | 'delivered'
  | 'failed'
  | 'skipped';

export type WebhookEvent =
  | 'property.created'
  | 'property.updated'
  | 'property.deleted'
  | 'lead.created'
  | 'cache.invalidated'
  // Operator-triggered from the dashboard "Send test" button. Receivers may
  // ignore it; the server-side purpose is to round-trip a signed request
  // through the live URL so a misconfigured endpoint surfaces before a real
  // event fires.
  | 'webhook.test';

// One row per attempt chain — BullMQ handles the retry scheduling; this table
// records the outcome that the dashboard surfaces (replay/redeliver later
// reads from here). The raw payload stays so an operator can re-send without
// needing the original trigger's context.
@Entity('webhook_deliveries')
@Index(['tenantId', 'createdAt'])
@Index(['status'])
export class WebhookDelivery {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  tenantId: number;

  @Column({ type: 'varchar', length: 64 })
  event: WebhookEvent;

  @Column({ type: 'varchar', length: 500 })
  targetUrl: string;

  @Column({ type: 'json' })
  payload: Record<string, unknown>;

  @Column({
    type: 'enum',
    enum: ['pending', 'delivered', 'failed', 'skipped'],
    default: 'pending',
  })
  status: WebhookDeliveryStatus;

  @Column({ type: 'int', default: 0 })
  attemptCount: number;

  @Column({ type: 'int', nullable: true })
  lastStatusCode: number | null;

  @Column({ type: 'text', nullable: true })
  lastError: string | null;

  @Column({ type: 'timestamp', nullable: true })
  deliveredAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
