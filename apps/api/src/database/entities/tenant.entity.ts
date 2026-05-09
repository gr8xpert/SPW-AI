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
import { encryptedColumn } from '../../common/crypto/secret-cipher';
import {
  TenantSettings,
  DEFAULT_TENANT_SETTINGS,
  TenantFeatureFlags,
  DEFAULT_FEATURE_FLAGS,
  SubscriptionStatus,
  BillingCycle,
  BillingSource,
} from '@spm/shared';

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

  // sha256(rawApiKey). Raw key is shown only at registration/rotation.
  @Column({ type: 'char', length: 64, unique: true })
  @Index()
  apiKeyHash: string;

  // Cosmetic hint for the dashboard (e.g. "spm_****1a2b"). Last 4 of the raw key.
  @Column({ type: 'char', length: 4 })
  apiKeyLast4: string;

  // Encrypted at rest via AES-256-GCM transformer (enc:v1: prefix). Legacy
  // plaintext rows decrypt to themselves via the cipher's passthrough so a
  // rolling migration is safe. Column widened from 64 → 255 in
  // SecretEncryptionWidening migration so encoded ciphertext fits.
  @Column({ length: 255, transformer: encryptedColumn })
  webhookSecret: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  webhookUrl: string | null;

  @Column({ type: 'json', default: () => `'${JSON.stringify(DEFAULT_TENANT_SETTINGS)}'` })
  settings: TenantSettings;

  @Column({ default: 1 })
  syncVersion: number;

  // Timestamp of the most recent "Clear widget cache" action (from the
  // dashboard or a support override). Persisted so the UI can show "last
  // cleared N minutes ago" across reloads — before 5P this was generated
  // per-click and lost on page refresh.
  @Column({ type: 'timestamp', nullable: true })
  lastCacheClearedAt: Date | null;

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
    enum: ['manual', 'stripe', 'internal'],
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

  // Super-admin toggle. When true, feed importers download property images,
  // re-encode to WebP, and push them to this tenant's R2 bucket (with
  // content-hash deduplication). When false, feed images keep the
  // provider's CDN URL — no re-hosting. Default off because most clients
  // don't need it (and it costs R2 storage).
  @Column({ default: false })
  feedImagesToR2: boolean;

  @Column({ type: 'json', default: () => "'[\"search\", \"detail\", \"wishlist\"]'" })
  widgetFeatures: string[];

  @Column({ type: 'json', default: () => `'${JSON.stringify(DEFAULT_FEATURE_FLAGS)}'` })
  featureFlags: TenantFeatureFlags;

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
