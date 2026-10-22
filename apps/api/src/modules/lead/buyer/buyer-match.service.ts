import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { BuyerWishlist, NoteRule, TenantSettings } from '@spm/shared';
import { Property, Tenant } from '../../../database/entities';
import { PropertySearchService } from '../../property/property-search.service';
import type { SearchPropertyDto } from '../../property/dto';
import { siteListingTypes, siteMinPrices } from '../../property/site-limits';
import { normalizeBuyerSettings } from './buyer-settings.service';
import { cleanWishlist, isEmptyWishlist, matchListingTypes, scoreProperty } from './buyer-match';
import { selectCard, toCard, type BuyerPropertyCard } from './buyer-property-card';
import { wishReasons, type WishReason } from './near-miss';
import { BuyerRuleCheckService, RULE_COLUMNS, type RuleOutcome } from './ai/buyer-rule-check.service';

// At most this many listings (newest first) are scored per match.
export const MATCH_CANDIDATES = 500;

export interface MatchItem extends BuyerPropertyCard {
  score: number;
  met: string[];
  missed: string[];
  // The missed wishes in words-to-be ("1 bedroom short", "no Pool").
  reasons: WishReason[];
  suggested: boolean;
  // The buyer's rules from the notes it breaks / can't be checked against (Phase 3).
  ruleBreaks?: RuleOutcome['ruleBreaks'];
  ruleUnknown?: RuleOutcome['ruleUnknown'];
  // Set (with showAll) on a property already sent to the buyer or rejected.
  hiddenReason?: 'sent' | 'rejected';
}

export interface MatchResult {
  data: MatchItem[];
  // Listings meeting every must-have (may be more than were scored).
  total: number;
  // True when total > MATCH_CANDIDATES: only the newest were scored.
  capped: boolean;
  page: number;
  limit: number;
  // The wishlist narrows nothing: no search was run.
  empty: boolean;
  // Matching properties left out because they were already sent or
  // rejected (0 with showAll).
  hiddenCount: number;
}

@Injectable()
export class BuyerMatchService {
  constructor(
    @InjectRepository(Property)
    private readonly propertyRepository: Repository<Property>,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    private readonly search: PropertySearchService,
    private readonly ruleCheck: BuyerRuleCheckService,
  ) {}

  // Pure on the wishlist (no buyer involved), so alerts and reverse match
  // in Phase 2 can call it too.
  async match(
    tenantId: number,
    rawWishlist: BuyerWishlist | null | undefined,
    opts: { page?: number; limit?: number; suggestedIds?: Set<number>; hidden?: Map<number, 'sent' | 'rejected'>; showAll?: boolean; rules?: NoteRule[] | null } = {},
  ): Promise<MatchResult> {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 25));
    const none: MatchResult = { data: [], total: 0, capped: false, page, limit, empty: false, hiddenCount: 0 };
    const w = cleanWishlist(rawWishlist);
    if (isEmptyWishlist(w)) return { ...none, empty: true };

    const tenant = await this.tenantRepository.findOne({ where: { id: tenantId }, select: ['id', 'settings'] });
    if (!tenant) throw new NotFoundException('Tenant not found');
    const settings = (tenant.settings || {}) as TenantSettings;
    const types = matchListingTypes(w, siteListingTypes(settings));
    if (types && !types.length) return none;

    // Must-haves, with the website search's own rules (active, published,
    // the site's listing types and price floors, places and types with
    // everything below them).
    const qb = this.propertyRepository
      .createQueryBuilder('p')
      .where('p.tenantId = :tenantId', { tenantId })
      .andWhere('p.status = :status', { status: 'active' })
      .andWhere('p.isPublished = :published', { published: true });
    await this.search.applyFilters(
      qb,
      {
        siteListingTypes: types ?? undefined,
        siteMinPrices: siteMinPrices(settings) ?? undefined,
        locationIds: w.locationIds,
        propertyTypeIds: w.propertyTypeIds,
      } as SearchPropertyDto,
      tenantId,
    );
    // Budget: the listing's price (or its from–to range) overlaps the
    // budget. A listing without a price can't be judged, so it doesn't match.
    if (w.budgetMin || w.budgetMax) {
      qb.andWhere('p.priceOnRequest = 0 AND p.price > 0');
      if (w.budgetMin) qb.andWhere('COALESCE(NULLIF(p.priceTo, 0), p.price) >= :budgetMin', { budgetMin: w.budgetMin });
      if (w.budgetMax) qb.andWhere('p.price <= :budgetMax', { budgetMax: w.budgetMax });
    }

    // Never send twice: what was sent or rejected stays out unless showAll.
    let hiddenCount = 0;
    const hiddenIds = opts.hidden && !opts.showAll ? [...opts.hidden.keys()] : [];
    if (hiddenIds.length) {
      const before = await qb.getCount();
      qb.andWhere('p.id NOT IN (:...hiddenIds)', { hiddenIds });
      hiddenCount = before - (await qb.getCount());
    }

    const total = await qb.getCount();
    if (!total) return { ...none, hiddenCount };
    const check = await this.ruleCheck.checker(tenantId, opts.rules);
    const candidates = await qb
      .select([...new Set([
        'p.id', 'p.createdAt', 'p.bedrooms', 'p.bedroomsTo', 'p.bathrooms', 'p.bathroomsTo',
        'p.buildSize', 'p.buildSizeTo', 'p.plotSize', 'p.plotSizeTo', 'p.features',
        ...(check ? RULE_COLUMNS : []),
      ])])
      .orderBy('p.createdAt', 'DESC')
      .addOrderBy('p.id', 'DESC')
      .take(MATCH_CANDIDATES)
      .getMany();

    const { weights } = normalizeBuyerSettings(settings.buyerMatch);
    const scored = candidates
      .map((p) => {
        const s = scoreProperty(w, p, weights);
        // Rules from the notes lower the score; the listing stays in the list.
        const rules = check ? check(p as unknown as Record<string, unknown>, s.score) : null;
        return { id: p.id, createdAt: +new Date(p.createdAt), ...s, ...(rules ?? {}) };
      })
      .sort((a, b) => b.score - a.score || b.createdAt - a.createdAt || b.id - a.id);
    const pageRows = scored.slice((page - 1) * limit, page * limit);
    const cards = await this.cards(tenantId, pageRows.map((r) => r.id));
    const data = pageRows
      .map((r) => {
        const card = cards.get(r.id);
        if (!card) return null;
        const item: MatchItem = {
          ...card, score: r.score, met: r.met, missed: r.missed, reasons: wishReasons(r.missed, w, card), suggested: !!opts.suggestedIds?.has(r.id),
        };
        if ('ruleBreaks' in r) Object.assign(item, { ruleBreaks: r.ruleBreaks, ruleUnknown: r.ruleUnknown });
        const hiddenReason = opts.showAll ? opts.hidden?.get(r.id) : undefined;
        if (hiddenReason) item.hiddenReason = hiddenReason;
        return item;
      })
      .filter((x): x is MatchItem => !!x);

    return { data, total, capped: total > MATCH_CANDIDATES, page, limit, empty: false, hiddenCount };
  }

  async cards(tenantId: number, ids: number[]): Promise<Map<number, BuyerPropertyCard>> {
    if (!ids.length) return new Map();
    const rows = await selectCard(this.propertyRepository.createQueryBuilder('p'))
      .where('p.tenantId = :tenantId', { tenantId })
      .andWhere('p.id IN (:...cardIds)', { cardIds: ids })
      .getMany();
    return new Map(rows.map((p) => [p.id, toCard(p)]));
  }
}
