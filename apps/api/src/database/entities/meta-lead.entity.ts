import { Entity, Column, PrimaryGeneratedColumn, PrimaryColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { encryptedColumn } from '../../common/crypto/secret-cipher';

// Facebook / Instagram lead forms (milestone K, migration 1777310000000):
// the agency's connected Page. The Page access token is encrypted at rest
// and never sent back to the dashboard.
@Entity('meta_lead_sources')
@Index('uq_meta_lead_sources_tenant', ['tenantId'], { unique: true })
export class MetaLeadSource {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  tenantId: number;

  @Column({ type: 'varchar', length: 30 })
  pageId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  pageName: string | null;

  @Column({ type: 'text', nullable: true, select: false, transformer: encryptedColumn })
  accessToken: string | null;

  @Column({ default: false })
  enabled: boolean;

  // Newest lead seen; the next run asks Meta only for leads after it.
  @Column({ type: 'datetime', nullable: true })
  lastLeadAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  lastRunAt: Date | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  lastError: string | null;

  @Column({ type: 'int', default: 0 })
  imported: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

// Lead ids already imported: a lead is never turned into a buyer twice,
// even when two runs overlap.
@Entity('meta_leads')
export class MetaLead {
  @PrimaryColumn({ type: 'varchar', length: 40 })
  leadgenId: string;

  @Column()
  tenantId: number;

  @Column({ type: 'int', nullable: true })
  leadId: number | null;

  @CreateDateColumn()
  createdAt: Date;
}
