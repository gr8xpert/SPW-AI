import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

// Append-only log of every super-admin → client impersonation session and
// the requests made during it. One "start" row per session (with endedAt
// stamped on Return-to-admin) plus one row per HTTP request via the
// ImpersonationAuditInterceptor. Kept as a separate table (not folded into
// audit_logs) so retention + query patterns can differ: this table trades
// storage for a complete forensic trail on any "did super-admin do X?"
// question, while audit_logs stays focused on business events.
@Entity('impersonation_audit')
@Index('idx_impersonation_super_admin', ['superAdminUserId', 'createdAt'])
@Index('idx_impersonation_tenant', ['tenantId', 'createdAt'])
export class ImpersonationAudit {
  @PrimaryGeneratedColumn()
  id: number;

  // Session identifier — same value on the initial 'start' row and every
  // request row that follows within that session. Randomly generated at
  // start; carried in the JWT payload so the interceptor can stamp it
  // without another lookup.
  @Column({ type: 'char', length: 32 })
  @Index()
  sessionId: string;

  // The actual super_admin taking the action. Never changes across a
  // session even as they "become" the client.
  @Column({ type: 'int' })
  superAdminUserId: number;

  // The tenant they are viewing as.
  @Column({ type: 'int' })
  tenantId: number;

  // The client-side user id the token was minted for (typically the
  // tenant's ADMIN). Nullable on the 'start' row if no ADMIN existed at
  // that moment (edge case; a tenant should always have one).
  @Column({ type: 'int', nullable: true })
  impersonatedUserId: number | null;

  // 'start' | 'end' | 'request'. 'start' rows carry endedAt=null until the
  // super-admin returns; 'end' rows are separately emitted so a crashed
  // session (no 'end') is still visible. 'request' rows carry method+path.
  @Column({ type: 'varchar', length: 16 })
  action: 'start' | 'end' | 'request';

  @Column({ type: 'varchar', length: 8, nullable: true })
  method: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  path: string | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ipAddress: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  userAgent: string | null;

  @Column({ type: 'timestamp', nullable: true })
  endedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
