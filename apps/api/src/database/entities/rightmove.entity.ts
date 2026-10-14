import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  JoinColumn,
} from 'typeorm';
import { Tenant } from './tenant.entity';

// Rightmove's own list of places (their "gazetteer"). Region, sub-region and
// town sent in a listing must match a row here, or Rightmove can't place it.
// Shared by every client; a Super Admin imports it from Rightmove's file.
@Entity('rightmove_locations')
@Index(['countryCode', 'townKey'])
export class RightmoveLocation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 2, default: 'ES' })
  countryCode: string;

  @Column({ type: 'varchar', length: 120 })
  region: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  subRegion: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  town: string | null;

  // Lowercase, no accents: how names are matched ("Benalmádena" → "benalmadena").
  @Column({ type: 'varchar', length: 120 })
  townKey: string;
}

export type RightmoveListingState = 'live' | 'removed' | 'error';

// What SPM last sent Rightmove for one listing. A listing is sent again only
// when what would be sent changes — Rightmove sanctions needless reloads.
@Entity('rightmove_listings')
@Index(['tenantId', 'agentRef'], { unique: true })
export class RightmoveListing {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Column()
  tenantId: number;

  // No foreign key: the row must outlive a deleted property so the listing
  // can still be taken off Rightmove.
  @Column({ type: 'int', nullable: true })
  propertyId: number | null;

  @Column({ type: 'varchar', length: 80 })
  agentRef: string;

  @Column({ type: 'varchar', length: 12, default: 'live' })
  state: RightmoveListingState;

  @Column({ type: 'bigint', nullable: true })
  rightmoveId: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  rightmoveUrl: string | null;

  // Hash of the last payload Rightmove accepted (update_date left out).
  @Column({ type: 'varchar', length: 64, nullable: true })
  payloadHash: string | null;

  @Column({ type: 'timestamp', nullable: true })
  lastPushedAt: Date | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  lastError: string | null;

  @Column({ type: 'json', nullable: true })
  warnings: Array<{ code: string; description: string }> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

export type RightmovePushAction = 'send' | 'remove' | 'list';

// One Rightmove call. Kept for the dashboard's push log; old rows are pruned.
@Entity('rightmove_push_logs')
@Index(['tenantId', 'createdAt'])
export class RightmovePushLog {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Column()
  tenantId: number;

  @Column({ type: 'varchar', length: 8 })
  action: RightmovePushAction;

  @Column({ type: 'varchar', length: 80, nullable: true })
  agentRef: string | null;

  @Column({ default: false })
  success: boolean;

  @Column({ default: false })
  dryRun: boolean;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  message: string | null;

  @Column({ type: 'json', nullable: true })
  errors: Array<{ code: string; description: string }> | null;

  @Column({ type: 'json', nullable: true })
  warnings: Array<{ code: string; description: string }> | null;

  @Column({ type: 'int', nullable: true })
  responseTimeMs: number | null;

  @CreateDateColumn()
  createdAt: Date;
}
