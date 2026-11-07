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
import type { ExportListingScope } from './feed-export.entity';

// The portal formats an extra export feed can be written in.
// 'fotocasa' = Kyero v3 with the extra fields Fotocasa's import reads.
export const EXPORT_FEED_FORMATS = ['kyero', 'fotocasa', 'thinkspain', 'apits'] as const;
export type ExportFeedFormat = (typeof EXPORT_FEED_FORMATS)[number];

// A client's extra URL feed (Feed Export -> Feeds). A client can have as many
// as it likes, each with its own format, listings and URL — like "Kyero",
// "Kyero Own Properties" and "Unpublished" side by side. The built-in
// idealista / Rightmove / Kyero / JSON feeds stay on feed_export_configs.
@Entity('export_feeds')
@Index(['tenantId'])
export class ExportFeed {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Column()
  tenantId: number;

  @Column({ length: 120 })
  title: string;

  @Column({ type: 'varchar', length: 20 })
  format: ExportFeedFormat;

  @Column({ default: true })
  isEnabled: boolean;

  // In the URL path: portals can only fetch a URL.
  @Column({ length: 64, unique: true })
  feedKey: string;

  @Column({ default: false })
  includeUnpublished: boolean;

  @Column({ type: 'varchar', length: 8, default: 'all' })
  listingScope: ExportListingScope;

  // The hand-picked listings when listingScope is 'selected'.
  @Column({ type: 'json', nullable: true })
  propertyIds: number[] | null;

  // Languages for titles, descriptions and features, in order. Empty = every
  // language the format takes.
  @Column({ type: 'json', nullable: true })
  languages: string[] | null;

  // "https://site.com/en/property/{segment}" — {segment} or {ref}. Empty = no link.
  @Column({ type: 'varchar', length: 500, default: '' })
  propertyUrlPattern: string;

  // Locations / types ({ locations, types }), carried over from the old Kyero
  // XML tab. A picked place or type brings everything below it.
  @Column({ type: 'json', nullable: true })
  propertyFilter: Record<string, any> | null;

  @Column({ type: 'timestamp', nullable: true })
  lastGeneratedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
