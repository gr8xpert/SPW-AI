import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, CreateDateColumn, Index } from 'typeorm';
import { Tenant } from './tenant.entity';

export type BuyerStageKind = 'open' | 'won' | 'lost';

// A column on the Buyer Match pipeline board. Each tenant edits its own
// stages; `kind` says whether a buyer in it is still open, won or lost
// (leads.status follows it).
@Entity('buyer_stages')
@Index(['tenantId', 'sortOrder'])
export class BuyerStage {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Column()
  tenantId: number;

  // { en: 'Viewing', es: 'Visita', … }
  @Column({ type: 'json' })
  name: Record<string, string>;

  @Column({ type: 'varchar', length: 9, nullable: true })
  color: string | null;

  @Column({ default: 0 })
  sortOrder: number;

  @Column({ type: 'enum', enum: ['open', 'won', 'lost'], default: 'open' })
  kind: BuyerStageKind;

  // Chance (%) a buyer in this stage buys; empty = spread by stage order
  // (see buyer/reports/reports.ts). Migration 1777300000000.
  @Column({ type: 'tinyint', unsigned: true, nullable: true })
  probability: number | null;

  @CreateDateColumn()
  createdAt: Date;
}
