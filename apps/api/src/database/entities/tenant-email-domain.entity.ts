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
import { encryptedColumn } from '../../common/crypto/secret-cipher';

// Per-tenant sender-domain verification (5R). Each tenant can claim one
// custom domain they want to send mail from (e.g. noreply@clientdomain.com);
// we generate a DKIM keypair, hand them the three DNS records they need to
// add (SPF / DKIM / DMARC), and later poll DNS to record when each one
// actually lands.
//
// Separate from TenantEmailConfig because that row holds the PROVIDER
// credentials (SMTP host/user/password) — two different concerns:
//   - TenantEmailConfig = "how do we connect to their mail gateway"
//   - TenantEmailDomain = "which sender domain do we sign mail as, and
//     has DNS been wired to trust us yet"
//
// One row per tenant (unique tenantId). If a tenant wants to change
// domains, the row is updated in place — which regenerates the DKIM
// keypair because the old one is now useless against a different domain.
@Entity('tenant_email_domains')
@Index(['domain'])
export class TenantEmailDomain {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Column({ unique: true })
  tenantId: number;

  // The FQDN the tenant wants to send from, stored lowercase. E.g.
  // "mail.clientdomain.com" — they can then send From: noreply@<domain>.
  @Column({ length: 255 })
  domain: string;

  // DKIM selector — the label that appears in the TXT record
  // "<selector>._domainkey.<domain>". We default to `spw1` so every
  // tenant's record lives at a predictable location; only ever different
  // if we needed a key rotation ("spw2") while leaving spw1 valid.
  @Column({ length: 50, default: 'spw1' })
  dkimSelector: string;

  // Public half of the DKIM keypair, PEM SubjectPublicKeyInfo. The
  // base64 body is what gets published to DNS. Not encrypted because
  // it IS public.
  @Column({ type: 'text' })
  dkimPublicKey: string;

  // Private half, PEM PKCS#8. Encrypted at rest via the same cipher used
  // by other secrets (enc:v1: prefix). Used to sign outbound mail once
  // the signing wire-up lands in a follow-up phase.
  @Column({ type: 'text', transformer: encryptedColumn })
  dkimPrivateKey: string;

  // Verification stamps — each set the moment a DNS lookup confirmed the
  // record contains the expected content. Null means "never verified".
  // We re-check on demand rather than on a timer; nothing invalidates
  // the stamps except a failed re-verify, so a once-good record that
  // later disappears stays "verified" until the tenant hits Verify
  // again. This is intentional — we don't want to auto-revoke a
  // tenant's sender reputation during a transient DNS blip.
  @Column({ type: 'timestamp', nullable: true })
  spfVerifiedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  dkimVerifiedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  dmarcVerifiedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
