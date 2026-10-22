import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { BuyerWishlist, NoteRule, TenantSettings } from '@spm/shared';
import { Location, Property, Tenant } from '../../../database/entities';
import { PropertySearchService } from '../../property/property-search.service';
import type { SearchPropertyDto } from '../../property/dto';
import { siteListingTypes, siteMinPrices } from '../../property/site-limits';
import { normalizeBuyerSettings } from './buyer-settings.service';
import { cleanWishlist, isEmptyWishlist, matchListingTypes, scoreProperty } from './buyer-match';
import { BuyerMatchService, MATCH_CANDIDATES } from './buyer-match.service';
import type { BuyerPropertyCard } from './buyer-property-card';
import { BuyerRuleCheckService, RULE_COLUMNS, type RuleOutcome } from './ai/buyer-rule-check.service';
import { nearbyTowns, nearMissOf, wishReasons, type NearMissReason, type Place, type WishReason } from './near-miss';

export interface NearMissItem extends BuyerPropertyCard {
  miss: NearMissReason;
  score: number;
  met: string[];
  missed: string[];
  reasons: WishReason[];
  suggested: boolean;
  ruleBreaks?: RuleOutcome['ruleBreaks'];
  ruleUnknown?: RuleOutcome['ruleUnknown'];
  hiddenReason?: 'sent' | 'rejected';
}

export interface NearMissResult {
  data: NearMissItem[];
  total: number;
  page: number;
  limit: number;
  // The wishlist narrows nothing, or near misses are off in settings.
  empty: boolean;
  enabled: boolean;
  hiddenCount: number;
}

function en(name: unknown): string {
  const n = (name && typeof name === 'object' ? name : {}) as Record<string, string>;
  return n.en || Object.values(n).find(Boolean) || '';
}

// Listings that miss one must-have of the wishlist by a little (see
// near-miss.ts), with the same website rules as Matched.
@Injectable()
export class BuyerNearMissService {
  constructor(
    @InjectRepository(Property) private readonly properties: Repository<Property>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    @InjectRepository(Location) private readonly locations: Repository<Location>,
    private readonly search: PropertySearchService,
    private readonly matchService: BuyerMatchService,
    private readonly ruleCheck: BuyerRuleCheckService,
  ) {}

  async places(tenantId: number): Promise<Map<number, Place>> {
    const rows = await this.locations.find({ where: { tenantId }, select: ['id', 'parentId', 'level', 'lat', 'lng', 'name'] });
    return new Map(rows.map((r) => [r.id, { id: r.id, parentId: r.parentId, level: r.level, lat: r.lat, lng: r.lng, name: en(r.name) }]));
  }

  // Each wished place with everything below it (and its other spellings),
  // exactly as the website search expands it.
  async expand(tenantId: number, ids: number[] | undefined, table: 'locations' | 'property_types'): Promise<Set<number> | null> {
    if (!ids?.length) return null;
    const out = new Set<number>();
    for (const id of ids) for (const x of await this.search.expandDescendants(tenantId, id, table)) out.add(x);
    return out;
  }

  async nearMisses(
    tenantId: number,
    raw: BuyerWishlist | null | undefined,
    opts: { page?: number; limit?: number; suggestedIds?: Set<number>; hidden?: Map<number, 'sent' | 'rejected'>; showAll?: boolean; rules?: NoteRule[] | null } = {},
  ): Promise<NearMissResult> {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 25));
    const none: NearMissResult = { data: [], total: 0, page, limit, empty: false, enabled: true, hiddenCount: 0 };
    const w = cleanWishlist(raw);
    if (isEmptyWishlist(w)) return { ...none, empty: true };

    const tenant = await this.tenants.findOne({ where: { id: tenantId }, select: ['id', 'settings'] });
    if (!tenant) throw new NotFoundException('Tenant not found');
    const settings = (tenant.settings || {}) as TenantSettings;
    const bm = normalizeBuyerSettings(settings.buyerMatch);
    if (!bm.nearMiss.enabled) return { ...none, enabled: false };
    const t = bm.nearMiss;
    const types = matchListingTypes(w, siteListingTypes(settings));
    if (types && !types.length) return none;

    const byId = await this.places(tenantId);
    const nearby = w.locationIds?.length ? nearbyTowns(w.locationIds, byId, t.nearbyKm) : new Map();
    const relaxBudget = t.budgetPercent > 0 && !!(w.budgetMin || w.budgetMax);
    if (!relaxBudget && !nearby.size) return none;

    const qb = this.properties
      .createQueryBuilder('p')
      .where('p.tenantId = :tenantId', { tenantId })
      .andWhere('p.status = :status', { status: 'active' })
      .andWhere('p.isPublished = :published', { published: true });
    await this.search.applyFilters(
      qb,
      {
        siteListingTypes: types ?? undefined,
        siteMinPrices: siteMinPrices(settings) ?? undefined,
        locationIds: w.locationIds?.length ? [...w.locationIds, ...nearby.keys()] : undefined,
        propertyTypeIds: w.propertyTypeIds,
      } as SearchPropertyDto,
      tenantId,
    );
    if (w.budgetMin || w.budgetMax) {
      const pct = relaxBudget ? t.budgetPercent / 100 : 0;
      qb.andWhere('p.priceOnRequest = 0 AND p.price > 0');
      if (w.budgetMin) qb.andWhere('COALESCE(NULLIF(p.priceTo, 0), p.price) >= :nmMin', { nmMin: w.budgetMin * (1 - pct) });
      if (w.budgetMax) qb.andWhere('p.price <= :nmMax', { nmMax: w.budgetMax * (1 + pct) });
    }

    const check = await this.ruleCheck.checker(tenantId, opts.rules);
    const rows = await qb
      .select([...new Set([
        ...(check ? RULE_COLUMNS : []),
        'p.id', 'p.createdAt', 'p.locationId', 'p.price', 'p.priceTo', 'p.priceOnRequest',
        'p.bedrooms', 'p.bedroomsTo', 'p.bathrooms', 'p.bathroomsTo', 'p.buildSize', 'p.buildSizeTo', 'p.plotSize', 'p.plotSizeTo', 'p.features',
      ])])
      .orderBy('p.createdAt', 'DESC')
      .addOrderBy('p.id', 'DESC')
      .take(MATCH_CANDIDATES)
      .getMany();

    const wished = await this.expand(tenantId, w.locationIds, 'locations');
    const ctx = { inWished: (id: number | null) => !wished || (id != null && wished.has(id)), nearby, byId };
    const size = (m: NearMissReason) =>
      m.code === 'nearby' ? (m.km ?? t.nearbyKm) / Math.max(1, t.nearbyKm) : m.amount / Math.max(1, (m.code === 'over_budget' ? w.budgetMax : w.budgetMin) ?? 1) / Math.max(0.01, t.budgetPercent / 100);
    const all = rows
      .map((p) => {
        const miss = nearMissOf(w, { price: p.price, priceTo: p.priceTo, priceOnRequest: !!p.priceOnRequest, locationId: p.locationId }, ctx, t);
        if (!miss) return null;
        const s = scoreProperty(w, p, bm.weights);
        return { p, miss, ...s, ...(check ? check(p as unknown as Record<string, unknown>, s.score) : {}) };
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => size(a.miss) - size(b.miss) || b.score - a.score || b.p.id - a.p.id);

    // Never send twice: what was sent or rejected stays out unless showAll.
    const hide = opts.hidden && !opts.showAll ? opts.hidden : null;
    const misses = hide ? all.filter((r) => !hide.has(r.p.id)) : all;
    const hiddenCount = all.length - misses.length;
    const pageRows = misses.slice((page - 1) * limit, page * limit);
    const cards = await this.matchService.cards(tenantId, pageRows.map((r) => r.p.id));
    const data = pageRows
      .map((r) => {
        const card = cards.get(r.p.id);
        if (!card) return null;
        const item: NearMissItem = {
          ...card,
          miss: r.miss,
          score: r.score,
          met: r.met,
          missed: r.missed,
          reasons: wishReasons(r.missed, w, r.p),
          suggested: !!opts.suggestedIds?.has(r.p.id),
        };
        if ('ruleBreaks' in r) Object.assign(item, { ruleBreaks: r.ruleBreaks, ruleUnknown: r.ruleUnknown });
        const hr = opts.showAll ? opts.hidden?.get(r.p.id) : undefined;
        if (hr) item.hiddenReason = hr;
        return item;
      })
      .filter((x): x is NearMissItem => !!x);
    return { data, total: misses.length, page, limit, empty: false, enabled: true, hiddenCount };
  }
}
