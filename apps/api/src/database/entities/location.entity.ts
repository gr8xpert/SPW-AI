import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { Tenant } from './tenant.entity';

export type LocationLevel =
  | 'region'
  | 'province'
  | 'area'
  | 'municipality'
  | 'town'
  | 'urbanization';

/** A town or area outline, as GeoJSON. */
export interface LocationBoundary {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: number[][][] | number[][][][];
}

@Entity('locations')
@Index('uq_locations_tenant_parent_slug', ['tenantId', 'parentId', 'slug'], { unique: true })
@Index(['tenantId', 'level'])
@Index(['parentId'])
export class Location {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  tenantId: number;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Column({ type: 'int', nullable: true })
  parentId: number | null;

  @ManyToOne(() => Location, (location) => location.children, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'parentId' })
  parent: Location | null;

  @OneToMany(() => Location, (location) => location.parent)
  children: Location[];

  @Column({
    type: 'enum',
    enum: ['region', 'province', 'area', 'municipality', 'town', 'urbanization'],
  })
  level: LocationLevel;

  @Column({ type: 'json' })
  name: Record<string, string>; // { en: "Marbella", es: "Marbella" }

  @Column({ length: 100 })
  slug: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  externalId: string | null; // ID from feed provider

  @Column({ type: 'decimal', precision: 10, scale: 8, nullable: true })
  lat: number | null;

  @Column({ type: 'decimal', precision: 11, scale: 8, nullable: true })
  lng: number | null;

  // The town's outline, as a GeoJSON geometry, simplified to a few hundred
  // points. Feed listings carry no coordinates of their own, so the map shows
  // the shape of the place with a count on it rather than pretending to know
  // which street each property is on.
  //
  // Hidden by default: an outline is a few hundred coordinate pairs, and the
  // widget's location tree and every property detail response load this table
  // whole. Only the map asks for it, and asks explicitly (addSelect).
  @Column({ type: 'json', nullable: true, select: false })
  boundary: LocationBoundary | null;

  @Column({ default: 0 })
  propertyCount: number;

  @Column({ default: 0 })
  sortOrder: number;

  @Column({ default: true })
  isActive: boolean;

  // True when AI enrichment created or reparented this row. Lets the
  // enrichment job skip rows the user manually edited on re-runs.
  @Column({ default: false })
  aiAssigned: boolean;

  // The platform location-template node this row stands for. Feed imports find
  // a tenant's row through this link wherever it sits in their tree, so the
  // client's own arrangement survives syncs.
  @Column({ type: 'int', nullable: true })
  templateNodeId: number | null;

  // Set when the client moves or renames this row in their dashboard; the
  // template then never re-parents or renames it.
  @Column({ default: false })
  userLocked: boolean;

  // Set when the client types this place's coordinates in their dashboard; the
  // template's point then never replaces them.
  @Column({ default: false })
  coordsLocked: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
