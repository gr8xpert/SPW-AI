import { Entity, Column, PrimaryGeneratedColumn, Index, UpdateDateColumn } from 'typeorm';

// Words translated through the SPM AI credits proxy, per licence and credit period, plus what the
// AI provider cost us (micro-dollars) so the platform-wide monthly budget can be enforced.
@Entity('plugin_credit_usage')
@Index('uq_plugin_credit_usage_period', ['licenseId', 'periodStart'], { unique: true })
export class PluginCreditUsage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  licenseId: number;

  @Column({ type: 'timestamp' })
  periodStart: Date;

  @Column({ type: 'int', default: 0 })
  wordsUsed: number;

  @Column({ type: 'bigint', default: 0 })
  costMicros: string;

  @UpdateDateColumn()
  updatedAt: Date;
}
