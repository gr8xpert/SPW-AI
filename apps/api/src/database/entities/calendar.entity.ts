import { Entity, Column, PrimaryGeneratedColumn, PrimaryColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { encryptedColumn } from '../../common/crypto/secret-cipher';

export interface CalendlyMember {
  email: string;
  name: string | null;
  schedulingUrl: string | null;
}

// Calendly (migration 1777460000000): the agency's connected account. The
// personal access token and the webhook signing key are encrypted at rest
// and never sent back to the dashboard. hookToken is the secret part of the
// webhook URL that tells which agency a booking is for.
@Entity('calendly_connections')
@Index('uq_calendly_connections_tenant', ['tenantId'], { unique: true })
@Index('uq_calendly_connections_hook', ['hookToken'], { unique: true })
export class CalendlyConnection {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  tenantId: number;

  @Column({ type: 'text', select: false, transformer: encryptedColumn })
  accessToken: string;

  @Column({ type: 'text', select: false, transformer: encryptedColumn })
  signingKey: string;

  @Column({ type: 'varchar', length: 64 })
  hookToken: string;

  @Column({ type: 'varchar', length: 255 })
  organizationUri: string;

  @Column({ type: 'varchar', length: 255 })
  ownerUri: string;

  @Column({ type: 'varchar', length: 255 })
  ownerEmail: string;

  // Null = no webhook (Calendly's free plan): links only, no automatic bookings.
  @Column({ type: 'varchar', length: 255, nullable: true })
  webhookUri: string | null;

  @Column({ type: 'enum', enum: ['organization', 'user'], default: 'organization' })
  scope: 'organization' | 'user';

  // The Calendly users and their booking pages, matched to agents by email.
  @Column({ type: 'json', nullable: true })
  members: CalendlyMember[] | null;

  @Column({ type: 'datetime', nullable: true })
  lastEventAt: Date | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  lastError: string | null;

  @Column({ type: 'int', default: 0 })
  bookings: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

// An agent's private calendar feed (.ics) of their viewings; the token is
// the whole secret, so it can be replaced.
@Entity('calendar_feeds')
@Index('uq_calendar_feeds_token', ['token'], { unique: true })
export class CalendarFeed {
  @PrimaryColumn()
  userId: number;

  @Column()
  tenantId: number;

  @Column({ type: 'varchar', length: 64 })
  token: string;

  @CreateDateColumn()
  createdAt: Date;
}
