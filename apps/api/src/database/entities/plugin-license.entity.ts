import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

// Licences for SPM's sellable WordPress plugins (first: SPM AI Translator for Polylang, 2026-10-29).
// Issued by a super admin after confirming payment on realtysoft.eu (source=manual), or, when
// PLUGIN_STRIPE_AUTO_ISSUE is on, automatically from a Stripe Payment Link (source=stripe).
// No SPM tenant is needed. Only the sha256 of the key is stored; the raw key is shown/emailed once.
export type PluginLicenseStatus = 'active' | 'expired' | 'revoked';
export type PluginLicenseSource = 'manual' | 'stripe';

@Entity('plugin_licenses')
@Index('idx_plugin_licenses_email', ['email'])
export class PluginLicense {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 50, default: 'spm-ai-translator' })
  product: string;

  @Column({ type: 'char', length: 64, unique: true })
  keyHash: string;

  @Column({ type: 'char', length: 4 })
  last4: string;

  // Plan id from plugin-plans.ts (pro_single, pro_5, agency, credits_100k ...).
  @Column({ length: 30 })
  plan: string;

  @Column({ type: 'int' })
  sitesAllowed: number;

  // Monthly word allowance for SPM AI credit plans; null = bring-your-own-key plan.
  @Column({ type: 'int', nullable: true })
  wordsAllowed: number | null;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: PluginLicenseStatus;

  // End of the paid period (plus grace for Stripe licences). Null only before Stripe told us the period.
  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date | null;

  // Start of the current credit period (renewal date); words are metered per period.
  @Column({ type: 'timestamp', nullable: true })
  creditsPeriodStart: Date | null;

  @Column({ length: 255 })
  email: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  customerName: string | null;

  @Column({ type: 'varchar', length: 10, default: 'manual' })
  source: PluginLicenseSource;

  // Super-admin note, e.g. the realtysoft.eu order or invoice number.
  @Column({ type: 'varchar', length: 500, nullable: true })
  notes: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  stripeCustomerId: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, unique: true })
  stripeSubscriptionId: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, unique: true })
  stripeCheckoutSessionId: string | null;

  // Stripe `created` (unix seconds) of the last event applied; older events are not applied again.
  @Column({ type: 'int', nullable: true })
  lastStripeEventAt: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
