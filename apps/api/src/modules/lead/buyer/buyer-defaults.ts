import type { LeadStatus } from '../../../database/entities/lead.entity';

// Pure Buyer Match defaults, shared by the BuyerMatchCore migration (which
// seeds stages for existing tenants) and BuyerStageService (which seeds them
// for tenants created later). Changing a default here does not touch
// tenants that already have stages.

export type StageKind = 'open' | 'won' | 'lost';

export interface DefaultStage {
  name: Record<string, string>;
  color: string;
  kind: StageKind;
}

export const DEFAULT_STAGES: DefaultStage[] = [
  { name: { en: 'New lead', es: 'Nuevo contacto' }, color: '#3b82f6', kind: 'open' },
  { name: { en: 'Contacted', es: 'Contactado' }, color: '#06b6d4', kind: 'open' },
  { name: { en: 'Requirements mapped', es: 'Requisitos definidos' }, color: '#8b5cf6', kind: 'open' },
  { name: { en: 'Selection sent', es: 'Selección enviada' }, color: '#a855f7', kind: 'open' },
  { name: { en: 'Viewing', es: 'Visita' }, color: '#f59e0b', kind: 'open' },
  { name: { en: 'Offer / reservation', es: 'Oferta / reserva' }, color: '#f97316', kind: 'open' },
  { name: { en: 'Notary', es: 'Notaría' }, color: '#14b8a6', kind: 'open' },
  { name: { en: 'Won', es: 'Ganado' }, color: '#22c55e', kind: 'won' },
  { name: { en: 'Lost', es: 'Perdido' }, color: '#94a3b8', kind: 'lost' },
];

// Old lead status → index into DEFAULT_STAGES (migration only).
const STATUS_INDEX: Record<LeadStatus, number> = {
  new: 0,
  contacted: 1,
  qualified: 2,
  viewing_scheduled: 4,
  offer_made: 5,
  negotiating: 5,
  won: 7,
  lost: 8,
};

export function statusToStageIndex(status: LeadStatus): number {
  return STATUS_INDEX[status] ?? 0;
}

// `leads.status` stays in step with the stage so lead scoring, the website
// health check and webhooks keep working: won/lost follow the stage kind,
// and moving back to an open stage reopens a won/lost lead as "contacted".
export function stageKindToStatus(kind: StageKind, current: LeadStatus): LeadStatus {
  if (kind === 'won' || kind === 'lost') return kind;
  return current === 'won' || current === 'lost' ? 'contacted' : current;
}

export function splitName(full?: string | null): { firstName: string | null; lastName: string | null } {
  const parts = (full || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: null, lastName: null };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') || null };
}
