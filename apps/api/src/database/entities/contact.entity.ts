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
import { Property } from './property.entity';

export type ContactSource = 'inquiry' | 'newsletter' | 'import' | 'manual' | 'api';

export interface ContactPreferences {
  language?: string;
  locations?: number[];
  types?: number[];
  minPrice?: number;
  maxPrice?: number;
}

@Entity('contacts')
@Index(['tenantId', 'email'], { unique: true })
@Index(['tenantId', 'subscribed'])
export class Contact {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Column()
  tenantId: number;

  @Column({ length: 255 })
  email: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone: string | null;

  @Column({
    type: 'enum',
    enum: ['inquiry', 'newsletter', 'import', 'manual', 'api'],
    default: 'manual',
  })
  source: ContactSource;

  @ManyToOne(() => Property, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'sourcePropertyId' })
  sourceProperty: Property;

  @Column({ type: 'int', nullable: true })
  sourcePropertyId: number | null;

  @Column({ type: 'json', nullable: true })
  preferences: ContactPreferences | null;

  @Column({ type: 'json', nullable: true })
  tags: string[] | null;

  @Column({ default: true })
  subscribed: boolean;

  @Column({ type: 'timestamp', nullable: true })
  unsubscribedAt: Date | null;

  @Column({ default: 0 })
  bounceCount: number;

  @Column({ type: 'timestamp', nullable: true })
  lastEmailAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  lastOpenAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  lastClickAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
