import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';

export interface PlanFeatures {
  feeds: boolean;
  campaigns: boolean;
  analytics: boolean;
  apiAccess: boolean;
  customBranding: boolean;
}

@Entity('plans')
export class Plan {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 100 })
  name: string;

  @Column({ length: 100, unique: true })
  slug: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  priceMonthly: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  priceYearly: number | null;

  @Column({ default: 100 })
  maxProperties: number;

  @Column({ default: 5 })
  maxUsers: number;

  // Per-tenant public-API rate limit (requests per minute). Enforced by
  // ApiKeyThrottlerGuard against the sha256(api-key) bucket. Plans without a
  // row default to 60/min at the guard layer.
  @Column({ default: 60 })
  ratePerMinute: number;

  @Column({ type: 'json', nullable: true })
  features: PlanFeatures | null;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany('Tenant', 'plan')
  tenants: any[];
}
