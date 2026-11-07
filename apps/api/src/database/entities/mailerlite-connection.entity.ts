import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { encryptedColumn } from '../../common/crypto/secret-cipher';

export type MailerliteSyncState = 'idle' | 'queued' | 'running' | 'failed' | 'needs_attention';
export type MailerliteGroupMode = 'contacts_and_tags' | 'contacts_only';

// A client's own MailerLite account (2026-11-05): contacts and tags go there,
// unsubscribes and bounces come back by webhook. One row per tenant. The row
// survives a disconnect (secrets cleared) so the consent record stays until
// the next connect.
@Entity('mailerlite_connections')
@Index('uq_mailerlite_connections_tenant', ['tenantId'], { unique: true })
@Index('uq_mailerlite_connections_hook', ['hookToken'], { unique: true })
export class MailerliteConnection {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  tenantId: number;

  // Encrypted at rest; only read when asked for with addSelect.
  @Column({ type: 'text', nullable: true, select: false, transformer: encryptedColumn })
  apiKey: string | null;

  @Column({ type: 'text', nullable: true, select: false, transformer: encryptedColumn })
  webhookSecret: string | null;

  // In the webhook URL: says which client an incoming event is for.
  @Column({ type: 'varchar', length: 64, nullable: true })
  hookToken: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  webhookId: string | null;

  @Column({ type: 'varchar', length: 20, default: 'contacts_and_tags' })
  groupMode: MailerliteGroupMode;

  // MailerLite group name → group id, as of the last sync.
  @Column({ type: 'json', nullable: true })
  groupIds: Record<string, string> | null;

  // Key of the custom field that holds the contact's language.
  @Column({ type: 'varchar', length: 100, nullable: true })
  languageField: string | null;

  @Column({ default: false })
  enabled: boolean;

  @Column({ type: 'datetime', nullable: true })
  consentAt: Date | null;

  @Column({ type: 'int', nullable: true })
  consentByUserId: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  consentByEmail: string | null;

  @Column({ type: 'varchar', length: 20, default: 'idle' })
  state: MailerliteSyncState;

  @Column({ type: 'varchar', length: 500, nullable: true })
  lastError: string | null;

  // The run in progress: a crash or restart carries on after runCursor.
  @Column({ type: 'datetime', precision: 6, nullable: true })
  runStartedAt: Date | null;

  // Only contacts changed since this time; null = everybody.
  @Column({ type: 'datetime', precision: 6, nullable: true })
  runSince: Date | null;

  @Column({ type: 'int', default: 0 })
  runCursor: number;

  // Moves with each page; a queued or running state with an old one is stuck.
  @Column({ type: 'datetime', nullable: true })
  heartbeatAt: Date | null;

  // Numbers of the run in progress, else of the last run.
  @Column({ type: 'int', default: 0 })
  countAdded: number;

  @Column({ type: 'int', default: 0 })
  countUpdated: number;

  @Column({ type: 'int', default: 0 })
  countUnchanged: number;

  @Column({ type: 'int', default: 0 })
  countSkipped: number;

  @Column({ type: 'int', default: 0 })
  countFailed: number;

  @Column({ type: 'datetime', nullable: true })
  lastSyncAt: Date | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  lastSyncStartedAt: Date | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  lastFullSyncAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  lastEventAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
