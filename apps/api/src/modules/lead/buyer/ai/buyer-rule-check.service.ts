import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { NoteRule, RuleNumberField } from '@spm/shared';
import { Feature, PropertyType } from '../../../../database/entities';
import { PropertySearchService } from '../../../property/property-search.service';
import { checkRules, floorFacts, rulePenalty, type RuleFacts } from './note-rules';

// The listing columns a rule check reads, added to a match query's select.
export const RULE_COLUMNS = [
  'p.floor', 'p.price', 'p.priceTo', 'p.priceOnRequest', 'p.propertyTypeId', 'p.locationId', 'p.features',
  'p.bedrooms', 'p.bedroomsTo', 'p.bathrooms', 'p.bathroomsTo', 'p.buildSize', 'p.buildSizeTo', 'p.plotSize', 'p.plotSizeTo',
  'p.terraceSize', 'p.terraceSizeTo', 'p.gardenSize', 'p.builtYear', 'p.distanceToBeach', 'p.communityFees',
];

type Row = Record<string, unknown>;

export interface RuleOutcome {
  // The score after the penalty.
  score: number;
  ruleBreaks: Pick<NoteRule, 'id' | 'text' | 'strength'>[];
  // Hard rules the listing's data can't answer ("floor not known").
  ruleUnknown: Pick<NoteRule, 'id' | 'text' | 'strength'>[];
}

const val = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const span = (from: unknown, to?: unknown): { low: number; high: number } | null => {
  const low = val(from);
  if (low === null) return null;
  const high = val(to);
  return { low, high: high !== null && high > low ? high : low };
};
const allNames = (n: unknown): string[] => (n && typeof n === 'object' ? Object.values(n as Record<string, string>).filter((x) => typeof x === 'string') : []);
const brief = (r: NoteRule) => ({ id: r.id, text: r.text, strength: r.strength });

// Checks match candidates against a buyer's rules (Matched, Near misses).
@Injectable()
export class BuyerRuleCheckService {
  constructor(
    @InjectRepository(PropertyType) private readonly types: Repository<PropertyType>,
    @InjectRepository(Feature) private readonly features: Repository<Feature>,
    private readonly search: PropertySearchService,
  ) {}

  // A checker for these rules, or null when there are none. Loads only what
  // the rules need (type/feature names for floors, place/type trees).
  async checker(tenantId: number, rules: NoteRule[] | null | undefined): Promise<((p: Row, score: number) => RuleOutcome) | null> {
    if (!rules?.length) return null;
    const needsFloor = rules.some((r) => r.kind === 'floor');
    const [typeNames, featureNames] = needsFloor
      ? await Promise.all([
        this.types.find({ where: { tenantId }, select: ['id', 'name'] }).then((rows) => new Map(rows.map((t) => [t.id, allNames(t.name)]))),
        this.features.find({ where: { tenantId }, select: ['id', 'name'] }).then((rows) => new Map(rows.map((f) => [f.id, allNames(f.name)]))),
      ])
      : [new Map<number, string[]>(), new Map<number, string[]>()];
    const places = new Map<number, Set<number>>();
    const typeTree = new Map<number, Set<number>>();
    for (const r of rules) {
      if (r.kind === 'place') places.set(r.locationId, new Set(await this.search.expandDescendants(tenantId, r.locationId, 'locations')));
      if (r.kind === 'type') typeTree.set(r.propertyTypeId, new Set(await this.search.expandDescendants(tenantId, r.propertyTypeId, 'property_types')));
    }

    return (p: Row, score: number): RuleOutcome => {
      const features = Array.isArray(p.features) ? (p.features as unknown[]).map(Number) : null;
      const typeId = p.propertyTypeId == null ? null : Number(p.propertyTypeId);
      const numbers: RuleFacts['numbers'] = {
        price: p.priceOnRequest ? null : span(p.price, p.priceTo),
        bedrooms: span(p.bedrooms, p.bedroomsTo),
        bathrooms: span(p.bathrooms, p.bathroomsTo),
        buildSize: span(p.buildSize, p.buildSizeTo),
        plotSize: span(p.plotSize, p.plotSizeTo),
        terraceSize: span(p.terraceSize, p.terraceSizeTo),
        gardenSize: span(p.gardenSize),
        builtYear: span(p.builtYear),
        distanceToBeach: span(p.distanceToBeach),
        communityFees: span(p.communityFees),
      } satisfies Record<RuleNumberField, unknown>;
      const facts: RuleFacts = {
        floor: needsFloor
          ? floorFacts(typeof p.floor === 'string' ? p.floor : null, typeId ? typeNames.get(typeId) ?? [] : [], (features ?? []).flatMap((id) => featureNames.get(id) ?? []))
          : { ground: null, top: null },
        features,
        propertyTypeId: typeId,
        locationId: p.locationId == null ? null : Number(p.locationId),
        numbers,
        within: { places, types: typeTree },
      };
      const { broken, unknown } = checkRules(rules, facts);
      return {
        score: rulePenalty(score, broken),
        ruleBreaks: broken.map(brief),
        ruleUnknown: unknown.filter((r) => r.strength === 'hard').map(brief),
      };
    };
  }
}
