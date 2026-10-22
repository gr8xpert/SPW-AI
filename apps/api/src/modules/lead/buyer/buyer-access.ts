import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

// Who may see which buyers. The one place this rule lives: lists, the board,
// the record and every sub-route go through it.
//   - admin (agency owner / manager), webmaster (support) and super admin:
//     every buyer
//   - user (agent): buyers where they are the main agent or a related agent,
//     unless the tenant turned on "agents see each other's buyers"

export interface BuyerViewer {
  id: number;
  role: string;
  originalRole?: string;
}

const SEES_ALL = new Set(['super_admin', 'webmaster', 'admin']);

export function seesAllBuyers(viewer: BuyerViewer, agentsSeeAll: boolean): boolean {
  return agentsSeeAll || SEES_ALL.has(viewer.role) || viewer.originalRole === 'super_admin';
}

export function visibilityClause(
  viewer: BuyerViewer,
  agentsSeeAll: boolean,
  alias = 'lead',
): { sql: string; params: Record<string, unknown> } | null {
  if (seesAllBuyers(viewer, agentsSeeAll)) return null;
  return {
    sql: `(${alias}.assignedTo = :viewerId OR EXISTS (SELECT 1 FROM lead_agents la WHERE la.leadId = ${alias}.id AND la.userId = :viewerId))`,
    params: { viewerId: viewer.id },
  };
}

export function applyVisibility<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  viewer: BuyerViewer,
  agentsSeeAll: boolean,
  alias = 'lead',
): void {
  const clause = visibilityClause(viewer, agentsSeeAll, alias);
  if (clause) qb.andWhere(clause.sql, clause.params);
}
