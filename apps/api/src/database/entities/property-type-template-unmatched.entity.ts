import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

// A property type a feed sent that the template has no entry for. Listed in
// Super Admin so the template can grow.
@Entity('property_type_template_unmatched')
@Index('uq_property_type_template_unmatched_key', ['matchKey'], { unique: true })
export class PropertyTypeTemplateUnmatched {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 300 })
  matchKey: string;

  @Column({ length: 30 })
  provider: string;

  @Column({ length: 150 })
  name: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  code: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  parentName: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  parentCode: string | null;

  // Template group the listings were put under meanwhile (null: none known).
  @Column({ type: 'int', nullable: true })
  placedUnderNodeId: number | null;

  @Column({ type: 'json', nullable: true })
  tenantIds: number[] | null;

  @Column({ default: 0 })
  occurrences: number;

  @Column({ type: 'int', nullable: true })
  resolvedNodeId: number | null;

  @Column({ default: false })
  dismissed: boolean;

  @Column({ default: false })
  aiAttempted: boolean;

  @CreateDateColumn()
  firstSeenAt: Date;

  @UpdateDateColumn()
  lastSeenAt: Date;
}
