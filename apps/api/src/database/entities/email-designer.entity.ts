import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Tenant } from './tenant.entity';
import { EmailTemplate } from './email-campaign.entity';

// AI email designer (2026-10-23): template history, the designer chat, the
// client's brand notes and their email image library. All rows are per client.

export type VersionSource = 'ai' | 'manual' | 'restore' | 'layout';

@Entity('email_template_versions')
@Index(['templateId', 'id'])
export class EmailTemplateVersion {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  tenantId: number;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Column()
  templateId: number;

  @ManyToOne(() => EmailTemplate, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'templateId' })
  template: EmailTemplate;

  @Column({ type: 'mediumtext' })
  bodyHtml: string;

  @Column({ length: 255 })
  subject: string;

  @Column({ type: 'enum', enum: ['ai', 'manual', 'restore', 'layout'] })
  source: VersionSource;

  @CreateDateColumn()
  createdAt: Date;
}

@Entity('email_template_ai_messages')
@Index(['templateId', 'id'])
export class EmailTemplateAiMessage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  tenantId: number;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Column()
  templateId: number;

  @ManyToOne(() => EmailTemplate, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'templateId' })
  template: EmailTemplate;

  @Column({ type: 'enum', enum: ['user', 'assistant'] })
  role: 'user' | 'assistant';

  @Column({ type: 'text' })
  content: string;

  // The version this turn produced (assistant turns that changed the design).
  @Column({ type: 'int', nullable: true })
  versionId: number | null;

  @CreateDateColumn()
  createdAt: Date;
}

@Entity('tenant_brand_memory')
export class TenantBrandMemory {
  @PrimaryColumn()
  tenantId: number;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Column({ type: 'json' })
  notes: string[];

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('email_images')
@Index(['tenantId', 'contentHash'], { unique: true })
export class EmailImage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  tenantId: number;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Column({ length: 64 })
  contentHash: string;

  @Column({ length: 500 })
  url: string;

  @Column({ length: 100 })
  mimeType: string;

  @Column({ type: 'int' })
  width: number;

  @Column({ type: 'int' })
  height: number;

  @Column({ type: 'int' })
  bytes: number;

  // Used in a campaign that was sent: never cleaned up (old emails show it).
  @Column({ default: false })
  pinned: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lastUsedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
