import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

// A location a feed sent that the template has no entry for. Listed in Super
// Admin so the template can grow; resolved when a matching node is added (by
// hand or by AI), dismissed when it isn't a real place.
@Entity('location_template_unmatched')
@Index('uq_location_template_unmatched_key', ['matchKey'], { unique: true })
export class LocationTemplateUnmatched {
  @PrimaryGeneratedColumn()
  id: number;

  // province|area|name|subName keys — one row per distinct place.
  @Column({ length: 400 })
  matchKey: string;

  @Column({ length: 30 })
  provider: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  province: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  area: string | null;

  // The feed's most specific name that failed to match, and the one below it.
  @Column({ length: 150 })
  name: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  subName: string | null;

  // Template node the property was placed under instead (e.g. the area).
  @Column({ type: 'int', nullable: true })
  placedUnderNodeId: number | null;

  @Column({ type: 'json', nullable: true })
  tenantIds: number[] | null;

  // Listings carrying this location on the most recent sync that saw it.
  @Column({ default: 0 })
  occurrences: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  lat: number | null;

  @Column({ type: 'decimal', precision: 11, scale: 7, nullable: true })
  lng: number | null;

  @Column({ type: 'int', nullable: true })
  resolvedNodeId: number | null;

  @Column({ default: false })
  dismissed: boolean;

  // AI was already asked where this belongs — don't ask again every sync.
  // Only set when the AI actually answered; a failed call is retried.
  @Column({ default: false })
  aiAttempted: boolean;

  // What sorting this entry changed, so Undo can reverse exactly that:
  // an alias added to a place (only if it wasn't there already), a town
  // created for it, or a dismiss. Null while the entry is open.
  @Column({ type: 'json', nullable: true })
  resolution: {
    kind: 'alias' | 'new' | 'dismiss';
    nodeId?: number;
    alias?: string;
    aliasAdded?: boolean;
    createdNode?: boolean;
    by: 'person' | 'ai';
    at: string;
  } | null;

  // The AI review's answer (see unmatched-review.ts), shown in Super Admin
  // with an Accept button.
  @Column({ type: 'json', nullable: true })
  aiProposal: {
    action: 'same' | 'new' | 'dismiss' | null;
    nodeId?: number;
    target?: string;
    reason?: string;
    km?: number | null;
    flagged?: boolean;
    at: string;
  } | null;

  @CreateDateColumn()
  firstSeenAt: Date;

  @UpdateDateColumn()
  lastSeenAt: Date;
}
