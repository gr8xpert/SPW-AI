import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';

// A client website that talks to the API: the WordPress plugin (on every
// sync check, ~every 10 minutes) or the widget itself (browser origin of the
// widget-config request). Shown on the client's Website Health page, so a
// site that stopped connecting is noticed.
@Entity('site_checkins')
@Index('uq_site_checkins_site', ['tenantId', 'siteUrl', 'source'], { unique: true })
export class SiteCheckin {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  tenantId: number;

  // Scheme + host (+ path for sub-folder installs), no trailing slash.
  @Column({ length: 255 })
  siteUrl: string;

  @Column({ type: 'enum', enum: ['plugin', 'widget'] })
  source: 'plugin' | 'widget';

  @Column({ type: 'varchar', length: 20, nullable: true })
  pluginVersion: string | null;

  @Column({ type: 'timestamp' })
  firstSeenAt: Date;

  @Column({ type: 'timestamp' })
  lastSeenAt: Date;
}
