import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Lead } from './lead.entity';
import { User } from './user.entity';

// A related agent on a buyer. The main agent is leads.assignedTo; related
// agents can also see the buyer when agents only see their own.
@Entity('lead_agents')
@Index(['leadId', 'userId'], { unique: true })
@Index(['userId'])
export class LeadAgent {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Lead, (lead) => lead.agents, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'leadId' })
  lead: Lead;

  @Column()
  leadId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: number;
}
