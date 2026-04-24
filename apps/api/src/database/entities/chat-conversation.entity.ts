import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  JoinColumn,
} from 'typeorm';
import { Tenant } from './tenant.entity';
import { ChatMessage } from './chat-message.entity';

export type ChatConversationStatus = 'active' | 'closed';

@Entity('chat_conversations')
@Index(['tenantId', 'sessionId'])
@Index(['tenantId', 'status', 'createdAt'])
export class ChatConversation {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Column()
  tenantId: number;

  @Column({ type: 'varchar', length: 64 })
  sessionId: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  propertyReference: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  language: string | null;

  @Column({
    type: 'enum',
    enum: ['active', 'closed'],
    default: 'active',
  })
  status: ChatConversationStatus;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, any> | null;

  @Column({ type: 'int', default: 0 })
  messageCount: number;

  @Column({ type: 'tinyint', default: 0 })
  adminEmailed: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lastMessageAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => ChatMessage, (m) => m.conversation)
  messages: ChatMessage[];
}
