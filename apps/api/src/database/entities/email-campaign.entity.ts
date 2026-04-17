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
import { Contact } from './contact.entity';
import { encryptedColumn } from '../../common/crypto/secret-cipher';

export type EmailProvider = 'smtp' | 'mailgun' | 'sendgrid' | 'ses';
export type EmailEncryption = 'tls' | 'ssl' | 'none';

@Entity('tenant_email_configs')
export class TenantEmailConfig {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Column({ unique: true })
  tenantId: number;

  @Column({
    type: 'enum',
    enum: ['smtp', 'mailgun', 'sendgrid', 'ses'],
    default: 'smtp',
  })
  provider: EmailProvider;

  // SMTP settings
  @Column({ length: 255, nullable: true })
  smtpHost: string;

  @Column({ type: 'int', default: 587 })
  smtpPort: number;

  @Column({ length: 255, nullable: true })
  smtpUser: string;

  // Encrypted at rest via AES-256-GCM transformer. Column widened from
  // VARCHAR(255) → TEXT in SecretEncryptionWidening so long passwords +
  // ciphertext overhead still fit.
  @Column({ type: 'text', nullable: true, transformer: encryptedColumn })
  smtpPassword: string;

  @Column({
    type: 'enum',
    enum: ['tls', 'ssl', 'none'],
    default: 'tls',
  })
  smtpEncryption: EmailEncryption;

  // API settings (for Mailgun, SendGrid, SES). Encrypted at rest.
  @Column({ type: 'text', nullable: true, transformer: encryptedColumn })
  apiKey: string;

  @Column({ length: 255, nullable: true })
  apiDomain: string; // For Mailgun

  // Common settings
  @Column({ length: 255 })
  fromEmail: string;

  @Column({ length: 255, nullable: true })
  fromName: string;

  @Column({ length: 255, nullable: true })
  replyTo: string;

  @Column({ default: 500 })
  dailyLimit: number;

  @Column({ default: false })
  isVerified: boolean;

  @Column({ type: 'timestamp', nullable: true })
  verifiedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

export type EmailTemplateType = 'property_alert' | 'newsletter' | 'welcome' | 'custom';

@Entity('email_templates')
@Index(['tenantId', 'type'])
export class EmailTemplate {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Column()
  tenantId: number;

  @Column({ length: 100 })
  name: string;

  @Column({ length: 255 })
  subject: string;

  @Column({ type: 'mediumtext' })
  bodyHtml: string;

  @Column({ type: 'text', nullable: true })
  bodyText: string;

  @Column({
    type: 'enum',
    enum: ['property_alert', 'newsletter', 'welcome', 'custom'],
    default: 'custom',
  })
  type: EmailTemplateType;

  @Column({ length: 500, nullable: true })
  thumbnailUrl: string;

  @Column({ default: false })
  isDefault: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'paused' | 'sent' | 'cancelled';

@Entity('email_campaigns')
@Index(['tenantId', 'status'])
export class EmailCampaign {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Column()
  tenantId: number;

  @ManyToOne(() => EmailTemplate, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'templateId' })
  template: EmailTemplate;

  @Column()
  templateId: number;

  @Column({ length: 100 })
  name: string;

  @Column({ length: 255 })
  subject: string;

  @Column({
    type: 'enum',
    enum: ['draft', 'scheduled', 'sending', 'paused', 'sent', 'cancelled'],
    default: 'draft',
  })
  status: CampaignStatus;

  @Column({ type: 'json', nullable: true })
  recipientFilter: Record<string, any>;

  @Column({ type: 'json', nullable: true })
  featuredProperties: number[];

  @Column({ type: 'timestamp', nullable: true })
  scheduledAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  startedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  pausedAt: Date;

  @Column({ default: 0 })
  totalRecipients: number;

  @Column({ default: 0 })
  sentCount: number;

  @Column({ default: 0 })
  failedCount: number;

  @Column({ default: 0 })
  openCount: number;

  @Column({ default: 0 })
  clickCount: number;

  @Column({ default: 0 })
  unsubscribeCount: number;

  @Column({ default: 0 })
  bounceCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

export type EmailSendStatus = 'pending' | 'sent' | 'failed' | 'bounced' | 'complained';

@Entity('email_sends')
@Index(['campaignId', 'status'])
@Index(['contactId'])
export class EmailSend {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => EmailCampaign, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'campaignId' })
  campaign: EmailCampaign;

  @Column()
  campaignId: number;

  @ManyToOne(() => Contact, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contactId' })
  contact: Contact;

  @Column()
  contactId: number;

  @Column({
    type: 'enum',
    enum: ['pending', 'sent', 'failed', 'bounced', 'complained'],
    default: 'pending',
  })
  status: EmailSendStatus;

  @Column({ type: 'timestamp', nullable: true })
  sentAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  openedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  clickedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  unsubscribedAt: Date;

  @Column({ length: 50, nullable: true })
  bounceType: string;

  @Column({ type: 'text', nullable: true })
  errorMessage: string;

  @CreateDateColumn()
  createdAt: Date;
}
