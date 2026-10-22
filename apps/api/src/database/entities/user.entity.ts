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
import { Tenant } from './tenant.entity';
import { encryptedColumn } from '../../common/crypto/secret-cipher';
import { UserRoleType, UserRole } from '@spm/shared';
import { Exclude } from 'class-transformer';

@Entity('users')
@Index(['tenantId', 'email'], { unique: true })
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  tenantId: number;

  @ManyToOne(() => Tenant, (tenant) => tenant.users, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Column({ length: 255 })
  email: string;

  @Column({ length: 255 })
  @Exclude()
  passwordHash: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name: string | null;

  @Column({
    type: 'enum',
    enum: [UserRole.SUPER_ADMIN, UserRole.WEBMASTER, UserRole.ADMIN, UserRole.USER],
    default: UserRole.USER,
  })
  role: UserRoleType;

  @Column({ type: 'json', nullable: true })
  permissions: string[] | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  avatarUrl: string | null;

  // Two-factor login (milestone J, migration 1777300000000 widened it):
  // encrypted at rest, never selected unless asked for.
  @Column({ type: 'varchar', length: 255, nullable: true, select: false, transformer: encryptedColumn })
  @Exclude()
  twoFactorSecret: string | null;

  @Column({ default: false })
  twoFactorEnabled: boolean;

  @Column({ type: 'timestamp', nullable: true })
  emailVerifiedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  lastLoginAt: Date | null;

  // Buyer Match: the agent's daily email (milestone I); each user can turn it off.
  @Column({ type: 'boolean', default: true })
  buyerDigest: boolean;

  // The language this user sees the dashboard in (migration 1777370000000);
  // null = English.
  @Column({ type: 'varchar', length: 5, nullable: true })
  dashboardLanguage: string | null;

  // Recovery codes are bcrypt hashes, each removed once used. Five wrong
  // codes in a row lock two-factor login for 15 minutes.
  @Column({ type: 'json', nullable: true, select: false })
  twoFactorRecovery: string[] | null;

  @Column({ type: 'tinyint', unsigned: true, default: 0 })
  twoFactorFailures: number;

  @Column({ type: 'datetime', nullable: true })
  twoFactorLockedUntil: Date | null;

  // Agents page (migration 1777340000000): the website card details, the two
  // switches and people without a dashboard login (placeholder email).
  @Column({ type: 'varchar', length: 120, nullable: true })
  title: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  whatsapp: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  publicEmail: string | null;

  @Column({ type: 'boolean', default: false })
  showOnWebsite: boolean;

  @Column({ type: 'boolean', default: true })
  worksBuyers: boolean;

  @Column({ type: 'boolean', default: true })
  canLogin: boolean;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
