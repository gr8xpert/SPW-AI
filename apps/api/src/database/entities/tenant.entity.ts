import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { Plan } from './plan.entity';
import {
  TenantSettings,
  DEFAULT_TENANT_SETTINGS,
  SubscriptionStatus,
  BillingCycle,
  BillingSource,
} from '@spw/shared';

@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 255 })
  name: string;

  @Column({ length: 100, unique: true })
  @Index()
  slug: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  domain: string | null;

  // Owner and identity fields
  @Column({ type: 'varchar', length: 255, nullable: true })
  ownerEmail: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  siteName: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  apiUrl: string | null;

  @Column()
  planId: number;

  @ManyToOne(() => Plan, (plan) => plan.tenants)
  @JoinColumn({ name: 'planId' })
  plan: Plan;

  @Column({ length: 64, unique: true })
  @Index()
  apiKey: string;

  @Column({ length: 64 })
  webhookSecret: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  webhookUrl: string | null;

  @Column({ type: 'json', default: () => `'${JSON.stringify(DEFAULT_TENANT_SETTINGS)}'` })
  settings: TenantSettings;

  @Column({ default: 1 })
  syncVersion: number;

  @Column({ default: true })
  isActive: boolean;

  // Subscription fields
  @Column({
    type: 'enum',
    enum: ['active', 'grace', 'expired', 'manual', 'internal'],
    default: 'active',
  })
  subscriptionStatus: SubscriptionStatus;

  @Column({
    type: 'enum',
    enum: ['monthly', 'yearly'],
    nullable: true,
  })
  billingCycle: BillingCycle | null;

  @Column({
    type: 'enum',
    enum: ['manual', 'paddle', 'internal'],
    nullable: true,
  })
  billingSource: BillingSource | null;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  graceEndsAt: Date | null;

  @Column({ default: false })
  adminOverride: boolean;

  @Column({ default: false })
  isInternal: boolean;

  // Widget toggles
  @Column({ default: true })
  widgetEnabled: boolean;

  @Column({ default: false })
  aiSearchEnabled: boolean;

  @Column({ type: 'json', default: () => "'[\"search\", \"detail\", \"wishlist\"]'" })
  widgetFeatures: string[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany('User', 'tenant')
  users: any[];

  @OneToMany('LicenseKey', 'tenant')
  licenseKeys: any[];

  @OneToMany('CreditBalance', 'tenant')
  creditBalances: any[];

  @OneToMany('SubscriptionPayment', 'tenant')
  subscriptionPayments: any[];
}
