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

export type LocationLevel = 'country' | 'province' | 'municipality' | 'town' | 'area';

@Entity('locations')
@Index(['tenantId', 'slug'], { unique: true })
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
    enum: ['country', 'province', 'municipality', 'town', 'area'],
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

  @Column({ default: 0 })
  propertyCount: number;

  @Column({ default: 0 })
  sortOrder: number;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
