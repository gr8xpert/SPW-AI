import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';

// Rotation + reuse detection: every refresh shares a `familyId` with the
// original login. On a successful rotation, the old row is marked with
// revokedReason='rotated' and `replacedByHash` points at the new row.
// If a client ever presents a token whose row is already revoked, the
// entire family is revoked — that's the reuse signal.
export type RefreshTokenRevokedReason = 'rotated' | 'reused' | 'logout';

@Entity('refresh_tokens')
@Index(['familyId', 'revokedAt'])
@Index(['userId'])
export class RefreshToken {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  tenantId: number;

  // Same id across every rotation chained from a single login.
  @Column({ type: 'char', length: 32 })
  familyId: string;

  // sha256(rawRefreshJwt). Raw token never hits disk.
  @Column({ type: 'char', length: 64, unique: true })
  tokenHash: string;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  revokedAt: Date | null;

  @Column({
    type: 'enum',
    enum: ['rotated', 'reused', 'logout'],
    nullable: true,
  })
  revokedReason: RefreshTokenRevokedReason | null;

  // Breadcrumb for auditing the rotation chain.
  @Column({ type: 'char', length: 64, nullable: true })
  replacedByHash: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
