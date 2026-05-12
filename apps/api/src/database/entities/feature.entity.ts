import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Tenant } from './tenant.entity';

export type FeatureCategory =
  | 'interior'
  | 'exterior'
  | 'community'
  | 'climate'
  | 'views'
  | 'security'
  | 'parking'
  | 'other';

@Entity('features')
@Index(['tenantId', 'category'])
export class Feature {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  tenantId: number;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Column({
    type: 'enum',
    enum: ['interior', 'exterior', 'community', 'climate', 'views', 'security', 'parking', 'other'],
  })
  category: FeatureCategory;

  @Column({ type: 'json' })
  name: Record<string, string>; // { en: "Swimming Pool", es: "Piscina" }

  @Column({ type: 'varchar', length: 100, nullable: true })
  icon: string | null;

  @Column({ default: 0 })
  sortOrder: number;

  @Column({ default: true })
  isActive: boolean;

  // True when AI enrichment set category on this row. Skips user-manual edits on re-runs.
  @Column({ default: false })
  aiAssigned: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
