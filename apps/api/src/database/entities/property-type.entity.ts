import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { Tenant } from './tenant.entity';

@Entity('property_types')
@Index(['tenantId', 'slug'], { unique: true })
@Index(['parentId'])
export class PropertyType {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  tenantId: number;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Column({ type: 'int', nullable: true })
  parentId: number | null;

  @ManyToOne(() => PropertyType, (pt) => pt.children, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'parentId' })
  parent: PropertyType | null;

  @OneToMany(() => PropertyType, (pt) => pt.parent)
  children: PropertyType[];

  @Column({ type: 'json' })
  name: Record<string, string>; // { en: "Villa", es: "Villa" }

  @Column({ length: 100 })
  slug: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  icon: string | null;

  @Column({ default: 0 })
  sortOrder: number;

  @Column({ default: true })
  isActive: boolean;

  // True when AI enrichment set parentId on this row. Skips user-manual edits on re-runs.
  @Column({ default: false })
  aiAssigned: boolean;

  // The platform property-type template node this row stands for; feed imports
  // find the row through it wherever the client put it.
  @Column({ type: 'int', nullable: true })
  templateNodeId: number | null;

  // Set when the client moves, renames or creates this type in their
  // dashboard; the template then never re-parents or renames it.
  @Column({ default: false })
  userLocked: boolean;

  // Feed names this row stands for ("n:<nameKey>"), kept when the client
  // renames or merges it, so imports don't create the old name again.
  @Column({ type: 'json', nullable: true })
  feedKeys: string[] | null;

  @CreateDateColumn()
  createdAt: Date;
}
