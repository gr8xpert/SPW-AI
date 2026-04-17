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

// One-shot verification tokens. The raw token is emailed; the DB only stores
// sha256. A user can have multiple rows (e.g. when they request a resend);
// issuing a new one marks earlier unconsumed rows consumedAt=now so the old
// link dies. Successful verification flips User.emailVerifiedAt.
@Entity('email_verification_tokens')
@Index(['userId'])
export class EmailVerificationToken {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'char', length: 64, unique: true })
  tokenHash: string;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  consumedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
