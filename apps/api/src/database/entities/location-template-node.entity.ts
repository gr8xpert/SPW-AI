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
import type { AutoFillRecord } from '../../modules/location-template/template-autofill';

export type LocationTemplateStatus = 'ok' | 'needs_review' | 'ai_suggested';

// One node of the platform-wide location template: Region > Province > Area >
// Municipality > Town > Urbanization. Not tenant-scoped — geography is the same
// for every agency. Feed imports place each property by matching its location
// names against this tree, and every tenant's own location rows link back to
// the node they stand for (Location.templateNodeId). Edited from Super Admin.
@Entity('location_template_nodes')
@Index(['parentId'])
@Index(['nameKey'])
export class LocationTemplateNode {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', nullable: true })
  parentId: number | null;

  @ManyToOne(() => LocationTemplateNode, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'parentId' })
  parent: LocationTemplateNode | null;

  @Column({
    type: 'enum',
    enum: ['region', 'province', 'area', 'municipality', 'town', 'urbanization'],
  })
  level: 'region' | 'province' | 'area' | 'municipality' | 'town' | 'urbanization';

  @Column({ length: 150 })
  name: string;

  // locationKey(name) — what matching compares.
  @Column({ length: 150 })
  nameKey: string;

  // Other spellings feeds use for this place ("Higueron", "El Higuerón").
  @Column({ type: 'json', nullable: true })
  aliases: string[] | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  postcode: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  lat: number | null;

  @Column({ type: 'decimal', precision: 11, scale: 7, nullable: true })
  lng: number | null;

  // Why this place's coordinates were refused (swapped, outside Spain, far
  // from the rest of its municipality). The bad value is cleared so no map
  // uses it; this stays until someone enters a correct one.
  @Column({ type: 'varchar', length: 300, nullable: true })
  coordsIssue: string | null;

  // A person entered or accepted this point: the distance check trusts it.
  @Column({ default: false })
  coordsConfirmed: boolean;

  // What the automatic fill (map geocoder, then AI) put here, so it shows as
  // auto-filled and can be undone. See template-autofill.ts.
  @Column({ type: 'json', nullable: true })
  autoFill: AutoFillRecord | null;

  @Column({ default: 0 })
  sortOrder: number;

  @Column({ type: 'enum', enum: ['ok', 'needs_review', 'ai_suggested'], default: 'ok' })
  status: LocationTemplateStatus;

  // Why it needs review, or where an AI suggestion came from.
  @Column({ type: 'varchar', length: 500, nullable: true })
  note: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
