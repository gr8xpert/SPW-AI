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

@Entity('location_groups')
@Index(['tenantId', 'slug'], { unique: true })
export class LocationGroup {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  tenantId: number;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Column({ type: 'json' })
  name: Record<string, string>; // { en: "Costa del Sol East", es: "Costa del Sol Este" }

  @Column({ length: 100 })
  slug: string;

  @Column({ type: 'json' })
  locationIds: number[]; // [1, 5, 12, 34]

  @Column({ default: 0 })
  sortOrder: number;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
