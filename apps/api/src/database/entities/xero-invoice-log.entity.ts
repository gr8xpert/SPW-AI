import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

// Ledger of every Stripe → Xero invoice-sync attempt. One row per attempt
// so retries stay traceable. Kept separate from CreditTransaction because
// this table is about the OUTBOUND accounting-sync side (a service call
// to n8n), while credit_transactions is the internal balance ledger. The
// two rows for a single purchase share `stripeSessionId`.
//
// Status transitions:
//   pending   — row inserted, POST to n8n has not returned success yet
//   sent      — n8n acknowledged receipt (2xx)
//   confirmed — n8n called back /api/internal/xero/invoice-created with
//               a Xero invoice id
//   failed    — POST to n8n errored or n8n returned non-2xx; retry cron
//               reschedules up to XERO_SYNC_MAX_RETRIES
@Entity('xero_invoice_log')
@Index('idx_xero_log_status', ['status', 'createdAt'])
@Index('idx_xero_log_tenant', ['tenantId', 'createdAt'])
@Index('idx_xero_log_session', ['stripeSessionId'])
export class XeroInvoiceLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  tenantId: number;

  // Stripe checkout session id (cs_xxx) — the natural join key between
  // credit_transactions.paymentReference and this table. Nullable only in
  // case we ever want to log a manual retrigger with no session in scope.
  @Column({ type: 'varchar', length: 128, nullable: true })
  stripeSessionId: string | null;

  @Column({ type: 'varchar', length: 16 })
  status: 'pending' | 'sent' | 'confirmed' | 'failed';

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  hours: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amountEur: number;

  @Column({ type: 'varchar', length: 8 })
  currency: string;

  // Populated by the n8n callback once Xero returns an invoice id. The
  // dashboard turns this into a deep-link so accounting can click through
  // from the sync log to the actual Xero record.
  @Column({ type: 'varchar', length: 64, nullable: true })
  xeroInvoiceId: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  error: string | null;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ type: 'timestamp', nullable: true })
  lastAttemptAt: Date | null;

  // Snapshot of the payload we posted so a retry uses the exact same
  // body — Xero contact matching depends on stable field values.
  @Column({ type: 'json', nullable: true })
  requestBody: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
