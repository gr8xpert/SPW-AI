import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  CreateDateColumn,
  Index,
  JoinColumn,
} from 'typeorm';
import { ChatConversation } from './chat-conversation.entity';

export type ChatMessageRole = 'system' | 'user' | 'assistant' | 'tool';

@Entity('chat_messages')
@Index(['conversationId', 'createdAt'])
export class ChatMessage {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => ChatConversation, (c) => c.messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversationId' })
  conversation: ChatConversation;

  @Column()
  conversationId: number;

  @Column({
    type: 'enum',
    enum: ['system', 'user', 'assistant', 'tool'],
  })
  role: ChatMessageRole;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  toolName: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  toolCallId: string | null;

  @Column({ type: 'int', nullable: true })
  tokenCount: number | null;

  @CreateDateColumn()
  createdAt: Date;
}
