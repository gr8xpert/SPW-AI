import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Tenant } from './tenant.entity';
import { Plan } from './plan.entity';
import { BillingCycle } from '@spw/shared';

export type PaymentType = 'new' | 'renewal' | 'upgrade' | 'downgrade';
export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded' | 'cancelled';

@Entity('subscription_payments')
@Index(['tenantId'])
@Index(['paddleTransactionId'])
@Index(['status'])
@Index(['createdAt'])
export class SubscriptionPayment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  tenantId: number;

  @ManyToOne(() => Tenant, (tenant) => tenant.subscriptionPayments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Column()
  planId: number;

  @ManyToOne(() => Plan, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'planId' })
  plan: Plan;

  @Column({
    type: 'enum',
    enum: ['new', 'renewal', 'upgrade', 'downgrade'],
  })
  type: PaymentType;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ length: 3, default: 'EUR' })
  currency: string;

  @Column({
    type: 'enum',
    enum: ['monthly', 'yearly'],
  })
  billingCycle: BillingCycle;

  @Column({ type: 'varchar', length: 255, nullable: true })
  paddleTransactionId: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  paddleSubscriptionId: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  paddleCustomerId: string | null;

  @Column({
    type: 'enum',
    enum: ['pending', 'completed', 'failed', 'refunded', 'cancelled'],
    default: 'pending',
  })
  status: PaymentStatus;

  @Column({ type: 'json', nullable: true })
  paddleWebhookData: Record<string, any> | null;

  @Column({ type: 'text', nullable: true })
  failureReason: string | null;

  @Column({ type: 'timestamp', nullable: true })
  paidAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  refundedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
