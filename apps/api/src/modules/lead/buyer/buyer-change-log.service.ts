import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  BuyerStage, Feature, LeadChange, Location, PropertyType, User,
  type LeadChangeItem, type LeadChangeSource,
} from '../../../database/entities';
import { BuyerQuestionService } from './buyer-question.service';
import type { FieldChange } from './change-log';

const LONG_TEXT = 500;
const PAGE = 50;

// Id fields and where their names come from.
const ID_FIELDS: Record<string, 'user' | 'users' | 'stage' | 'locations' | 'types' | 'features'> = {
  assignedTo: 'user',
  agentIds: 'users',
  stageId: 'stage',
  'wishlist.locationIds': 'locations',
  'wishlist.propertyTypeIds': 'types',
  'wishlist.featureIds': 'features',
};

function en(name: Record<string, string> | null | undefined): string {
  return (name && (name.en || Object.values(name).find(Boolean))) || '';
}

export interface ChangeLogEntry {
  id: number;
  source: LeadChangeSource;
  createdAt: Date;
  user: { id: number; name: string | null } | null;
  changes: LeadChangeItem[];
}

// The buyer change log: who changed what, when, from → to. Values are
// stored as display text (names, not ids) so history stays readable after
// a stage, agent or town is renamed or removed.
@Injectable()
export class BuyerChangeLogService {
  private readonly logger = new Logger(BuyerChangeLogService.name);

  constructor(
    @InjectRepository(LeadChange)
    private readonly changeRepository: Repository<LeadChange>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(BuyerStage)
    private readonly stageRepository: Repository<BuyerStage>,
    @InjectRepository(Location)
    private readonly locationRepository: Repository<Location>,
    @InjectRepository(PropertyType)
    private readonly typeRepository: Repository<PropertyType>,
    @InjectRepository(Feature)
    private readonly featureRepository: Repository<Feature>,
    private readonly questions: BuyerQuestionService,
  ) {}

  // Never fails the save it describes: a log error is only logged.
  async record(tenantId: number, leadId: number, userId: number | null, source: LeadChangeSource, changes: FieldChange[]): Promise<void> {
    if (!changes.length) return;
    try {
      const items = await this.describe(tenantId, changes);
      await this.changeRepository.insert({ tenantId, leadId, userId, source, changes: items });
    } catch (err) {
      this.logger.warn(`Change log for buyer ${leadId} failed: ${(err as Error).message}`);
    }
  }

  async list(tenantId: number, leadIds: number[], page = 1): Promise<{ data: ChangeLogEntry[]; total: number; page: number }> {
    const [rows, total] = await this.changeRepository.findAndCount({
      where: { tenantId, leadId: In(leadIds) },
      relations: { user: true },
      order: { id: 'DESC' },
      skip: (page - 1) * PAGE,
      take: PAGE,
    });
    return {
      data: rows.map((r) => ({
        id: r.id,
        source: r.source,
        createdAt: r.createdAt,
        user: r.user ? { id: r.user.id, name: r.user.name } : null,
        changes: r.changes,
      })),
      total,
      page,
    };
  }

  private async describe(tenantId: number, changes: FieldChange[]): Promise<LeadChangeItem[]> {
    const ids: Record<string, Set<number>> = { user: new Set(), stage: new Set(), locations: new Set(), types: new Set(), features: new Set() };
    for (const c of changes) {
      const kind = ID_FIELDS[c.field];
      if (!kind) continue;
      const bucket = kind === 'users' ? 'user' : kind;
      for (const v of [c.from, c.to]) for (const id of idsOf(v)) ids[bucket].add(id);
    }
    const names = {
      user: await this.names(this.userRepository, tenantId, ids.user, (u: User) => u.name || u.email),
      stage: await this.names(this.stageRepository, tenantId, ids.stage, (s: BuyerStage) => en(s.name)),
      locations: await this.names(this.locationRepository, tenantId, ids.locations, (l: Location) => en(l.name)),
      types: await this.names(this.typeRepository, tenantId, ids.types, (t: PropertyType) => en(t.name)),
      features: await this.names(this.featureRepository, tenantId, ids.features, (f: Feature) => en(f.name)),
    };
    const answerFields = changes.filter((c) => c.field.startsWith('answers.'));
    const options = new Map<string, Map<string, string>>();
    if (answerFields.length) {
      for (const q of await this.questions.list(tenantId)) {
        options.set(q.qkey, new Map(q.options.map((o) => [o.key, en(o.label)])));
      }
    }

    return changes.map((c) => {
      const kind = ID_FIELDS[c.field];
      const field = c.field === 'stageId' ? 'stage' : c.field;
      if (kind) {
        const bucket = kind === 'users' ? 'user' : kind;
        const label = (v: unknown) => text(idsOf(v).map((id) => names[bucket].get(id) || `#${id}`));
        return { field, from: label(c.from), to: label(c.to) };
      }
      if (c.field.startsWith('answers.')) {
        const opts = options.get(c.field.slice(8));
        const label = (v: unknown) => text((Array.isArray(v) ? v : v ? [v] : []).map((k) => opts?.get(String(k)) || String(k)));
        return { field, from: label(c.from), to: label(c.to) };
      }
      return { field, from: text(c.from), to: text(c.to) };
    });
  }

  private async names<T extends { id: number }>(
    repo: Repository<T>,
    tenantId: number,
    ids: Set<number>,
    label: (row: T) => string,
  ): Promise<Map<number, string>> {
    if (!ids.size) return new Map();
    const rows = await repo.find({ where: { tenantId, id: In([...ids]) } as never });
    return new Map(rows.map((r) => [r.id, label(r)]));
  }
}

function idsOf(v: unknown): number[] {
  const list = Array.isArray(v) ? v : v === null || v === undefined || v === '' ? [] : [v];
  return list.map(Number).filter((n) => Number.isInteger(n) && n > 0);
}

// A value as the History tab shows it. null = empty.
function text(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (Array.isArray(v)) {
    if (!v.length) return null;
    return cut(v.map((x) => (x && typeof x === 'object' ? (x as { name?: string }).name || JSON.stringify(x) : String(x))).join(', '));
  }
  if (v instanceof Date) return isNaN(+v) ? null : v.toISOString().slice(0, 10);
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (typeof v === 'object') return cut(JSON.stringify(v));
  if (typeof v === 'string' && /^-?\d+\.\d+$/.test(v)) return String(Number(v));
  return cut(String(v));
}

function cut(s: string): string {
  return s.length > LONG_TEXT ? `${s.slice(0, LONG_TEXT - 1)}…` : s;
}
