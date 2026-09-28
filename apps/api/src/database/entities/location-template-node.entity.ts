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
