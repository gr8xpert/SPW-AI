import { Entity, Column, PrimaryColumn } from 'typeorm';

// One row per client per day, counting AI searches. It exists so a site can
// be given a daily ceiling: the feature spends the client's own OpenRouter
// credit, and a script hitting the endpoint in a loop would otherwise spend it
// all before anyone noticed. Kept in the database rather than Redis so the
// count survives a restart and the dashboard can show what a day cost.
@Entity('ai_search_usage')
export class AiSearchUsage {
  @PrimaryColumn()
  tenantId: number;

  // The day in the server's timezone, as YYYY-MM-DD.
  @PrimaryColumn({ type: 'date' })
  day: string;

  @Column({ type: 'int', default: 0 })
  count: number;
}
