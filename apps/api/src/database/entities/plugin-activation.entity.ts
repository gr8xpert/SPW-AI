import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

// One row per website a plugin licence is activated on. siteUrl is normalised by the plugin
// (host + path, lowercase, no scheme, no www). Deactivating deletes the row and frees the slot.
@Entity('plugin_activations')
@Index('uq_plugin_activations_site', ['licenseId', 'siteUrl'], { unique: true })
export class PluginActivation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  licenseId: number;

  @Column({ length: 255 })
  siteUrl: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  pluginVersion: string | null;

  @CreateDateColumn()
  activatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastSeenAt: Date | null;
}
