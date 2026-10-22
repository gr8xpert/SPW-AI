import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

// One email of properties delivered to a buyer or their agent. Its id is
// what the tracking links in the buyer's copy sign (no personal data).
@Entity('buyer_sends')
@Index(['leadId', 'id'])
@Index(['tenantId'])
export class BuyerSend {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  tenantId: number;

  @Column()
  leadId: number;

  @Column({ type: 'enum', enum: ['buyer', 'agent'] })
  recipient: 'buyer' | 'agent';

  @Column({ type: 'enum', enum: ['selection', 'alert'], default: 'selection' })
  kind: 'selection' | 'alert';

  @Column({ type: 'json' })
  propertyIds: number[];

  @Column({ type: 'varchar', length: 5, default: 'en' })
  lang: string;

  @Column({ type: 'int', nullable: true })
  createdBy: number | null;

  @Column({ type: 'datetime', nullable: true })
  openedAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  clickedAt: Date | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;
}
