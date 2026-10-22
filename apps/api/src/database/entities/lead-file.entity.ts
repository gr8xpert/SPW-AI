import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, CreateDateColumn, Index } from 'typeorm';
import { Tenant } from './tenant.entity';
import { Lead } from './lead.entity';
import { User } from './user.entity';

// A document on a buyer (ID scan, reservation PDF…). The bytes live in
// media_files / R2 through UploadService; this row ties them to the buyer.
@Entity('lead_files')
@Index(['leadId'])
export class LeadFile {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Column()
  tenantId: number;

  @ManyToOne(() => Lead, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'leadId' })
  lead: Lead;

  @Column()
  leadId: number;

  @Column({ type: 'int', nullable: true })
  mediaFileId: number | null;

  @Column({ length: 255 })
  name: string;

  @Column({ length: 100 })
  mimeType: string;

  @Column({ type: 'int', default: 0 })
  size: number;

  @Column({ length: 1000 })
  url: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'uploadedBy' })
  uploadedByUser: User | null;

  @Column({ type: 'int', nullable: true })
  uploadedBy: number | null;

  @CreateDateColumn()
  createdAt: Date;
}
