import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';

export type PropertyTypeTemplateStatus = 'ok' | 'needs_review' | 'ai_suggested';

// One node of the platform-wide property-type template: a group (Apartment,
// House, Plot, Commercial; parentId null) or a type inside it. Feed imports
// match a listing's type by the provider's code (Resales SubtypeId1, e.g.
// "1-4"), then by name or alias, and every tenant's own type rows link back to
// the node they stand for (PropertyType.templateNodeId). Edited from Super Admin.
@Entity('property_type_template_nodes')
@Index(['parentId'])
@Index(['nameKey'])
export class PropertyTypeTemplateNode {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', nullable: true })
  parentId: number | null;

  @ManyToOne(() => PropertyTypeTemplateNode, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'parentId' })
  parent: PropertyTypeTemplateNode | null;

  // English name.
  @Column({ length: 150 })
  name: string;

  @Column({ length: 150 })
  nameKey: string;

  // Resales type codes this node stands for ("1-4"; Beach Bar has two).
  @Column({ type: 'json', nullable: true })
  codes: string[] | null;

  // { es: "Villa - Chalet", ... } — applied to clients' type names on sync.
  @Column({ type: 'json', nullable: true })
  translations: Record<string, string> | null;

  // Other spellings feeds use ("Finca - Cortijo", "Apartments").
  @Column({ type: 'json', nullable: true })
  aliases: string[] | null;

  @Column({ default: 0 })
  sortOrder: number;

  @Column({ type: 'enum', enum: ['ok', 'needs_review', 'ai_suggested'], default: 'ok' })
  status: PropertyTypeTemplateStatus;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
