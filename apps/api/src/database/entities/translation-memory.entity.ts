import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export type TranslationMemoryKind = 'label' | 'feature' | 'property_type';
export type TranslationMemorySource = 'ai' | 'admin' | 'seed';

// One translation of a label, feature or property type, shared by every
// client: translated once (by AI, or corrected in Super Admin) and reused,
// so new clients and feed imports don't pay for the same words again.
@Entity('translation_memory')
@Index('uq_translation_memory', ['kind', 'sourceKey', 'lang'], { unique: true })
export class TranslationMemory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 20 })
  kind: TranslationMemoryKind;

  // The English text, trimmed and lower-cased ("swimming pool").
  @Column({ length: 255, charset: 'utf8mb4', collation: 'utf8mb4_bin' })
  sourceKey: string;

  @Column({ length: 10 })
  lang: string;

  @Column({ type: 'text' })
  text: string;

  // 'admin' entries are corrections: AI and seeding never overwrite them.
  @Column({ length: 10, default: 'ai' })
  source: TranslationMemorySource;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
