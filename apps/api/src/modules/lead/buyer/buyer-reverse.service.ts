import { BadRequestException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { TenantSettings } from '@spm/shared';
import { Lead, LeadSuggestion, Property, Tenant } from '../../../database/entities';
import { siteListingTypes, siteMinPrices } from '../../property/site-limits';
import { applyVisibility, type BuyerViewer } from './buyer-access';
import { BuyerSettingsService, normalizeBuyerSettings } from './buyer-settings.service';
import { cleanWishlist, scoreProperty } from './buyer-match';
import { BuyerNearMissService } from './buyer-near-miss.service';
import { BuyerSendService } from './buyer-send.service';
import { wishlistAccepts } from './reverse-match';

// Buyers this tool looks at, at most (bigger agencies: the newest active ones).
const MAX_BUYERS = 5000;
const MAX_SEND = 200;

export interface ReverseBuyer {
  id: number;
  name: string | null;
  email: string | null;
  agent: { id: number; name: string | null } | null;
  score: number;
  missed: string[];
  // Already sent this property, or rejected it: Send to all skips them.
  sent: boolean;
  rejected: boolean;
}

export interface ReverseResult {
  property: { id: number; reference: string; live: boolean };
  total: number;
  // Matching buyers who have not had it yet.
  fresh: number;
  buyers: ReverseBuyer[];
}

export interface ReverseSendResult {
  sent: number;
  skipped: number;
  failed: number;
  results: { leadId: number; status: 'sent' | 'skipped' | 'failed'; reason?: string }[];
}

// "N buyers match this property": every open buyer whose wishlist's
// must-haves the listing meets (website search rules), best score first.
@Injectable()
export class BuyerReverseService {
  constructor(
    @InjectRepository(Lead) private readonly leads: Repository<Lead>,
    @InjectRepository(Property) private readonly properties: Repository<Property>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    @InjectRepository(LeadSuggestion) private readonly suggestions: Repository<LeadSuggestion>,
    private readonly settingsService: BuyerSettingsService,
    private readonly nearMiss: BuyerNearMissService,
    private readonly sender: BuyerSendService,
  ) {}

  async forProperty(tenantId: number, viewer: BuyerViewer | null, propertyId: number): Promise<ReverseResult> {
    const p = await this.properties.findOne({
      where: { id: propertyId, tenantId },
      select: [
        'id', 'reference', 'listingType', 'locationId', 'propertyTypeId', 'price', 'priceTo', 'priceOnRequest', 'status', 'isPublished',
        'bedrooms', 'bedroomsTo', 'bathrooms', 'bathroomsTo', 'buildSize', 'buildSizeTo', 'plotSize', 'plotSizeTo', 'features',
      ],
    });
    if (!p) throw new NotFoundException('Property not found');
    const live = p.status === 'active' && !!p.isPublished;
    const result: ReverseResult = { property: { id: p.id, reference: p.reference, live }, total: 0, fresh: 0, buyers: [] };
    if (!live) return result;

    const tenant = await this.tenants.findOne({ where: { id: tenantId }, select: ['id', 'settings'] });
    const settings = (tenant?.settings || {}) as TenantSettings;
    const { weights } = normalizeBuyerSettings(settings.buyerMatch);
    const qb = this.leads
      .createQueryBuilder('lead')
      .leftJoin('lead.stage', 'stage')
      .leftJoin('lead.contact', 'contact')
      .addSelect(['contact.id', 'contact.email'])
      .leftJoin('lead.assignedToUser', 'agent')
      .addSelect(['agent.id', 'agent.name'])
      .where('lead.tenantId = :tenantId', { tenantId })
      .andWhere('lead.mergedIntoId IS NULL')
      .andWhere('lead.wishlist IS NOT NULL')
      .andWhere("(stage.id IS NULL OR stage.kind = 'open')");
    if (viewer) applyVisibility(qb, viewer, (await this.settingsService.get(tenantId)).agentsSeeAll);
    const buyers = await qb.orderBy('lead.lastActivityAt', 'DESC').addOrderBy('lead.id', 'DESC').take(MAX_BUYERS).getMany();

    // Expanded places/types, once per distinct wish (many buyers share towns).
    const memo = new Map<string, Set<number> | null>();
    const expand = async (ids: number[] | undefined, table: 'locations' | 'property_types') => {
      if (!ids?.length) return null;
      const key = `${table}:${[...ids].sort((a, b) => a - b).join(',')}`;
      if (!memo.has(key)) memo.set(key, await this.nearMiss.expand(tenantId, ids, table));
      return memo.get(key) ?? null;
    };
    const ctxBase = { siteTypes: siteListingTypes(settings), minPrices: siteMinPrices(settings) as Record<string, number> | null };

    const matched: ReverseBuyer[] = [];
    for (const b of buyers) {
      const w = cleanWishlist(b.wishlist);
      const ctx = { ...ctxBase, places: await expand(w.locationIds, 'locations'), types: await expand(w.propertyTypeIds, 'property_types') };
      if (!wishlistAccepts(w, { ...p, priceOnRequest: !!p.priceOnRequest, isPublished: !!p.isPublished }, ctx)) continue;
      const s = scoreProperty(w, p, weights);
      matched.push({
        id: b.id,
        name: [b.firstName, b.lastName].filter(Boolean).join(' ') || null,
        email: b.contact?.email ?? null,
        agent: b.assignedToUser ? { id: b.assignedToUser.id, name: b.assignedToUser.name } : null,
        score: s.score,
        missed: s.missed,
        sent: false,
        rejected: false,
      });
    }
    if (matched.length) {
      const rows = await this.suggestions.find({ where: { tenantId, propertyId: p.id, leadId: In(matched.map((m) => m.id)) } });
      const by = new Map(rows.map((r) => [r.leadId, r]));
      for (const m of matched) {
        const r = by.get(m.id);
        m.rejected = !!r && (!!r.rejectedAt || r.status === 'not_interested');
        m.sent = !!r?.sentAt;
      }
    }
    matched.sort((a, b) => Number(a.sent || a.rejected) - Number(b.sent || b.rejected) || b.score - a.score || b.id - a.id);
    return { ...result, total: matched.length, fresh: matched.filter((m) => !m.sent && !m.rejected).length, buyers: matched };
  }

  // Sends the property to each chosen buyer (default: every match not yet
  // sent it) with the normal email: their language, tracked, never twice.
  async sendToAll(tenantId: number, viewer: BuyerViewer, propertyId: number, leadIds?: number[]): Promise<ReverseSendResult> {
    const list = await this.forProperty(tenantId, viewer, propertyId);
    if (!list.property.live) throw new BadRequestException({ code: 'NOT_LIVE', message: 'This property is not on the website' });
    const pool = new Map(list.buyers.map((b) => [b.id, b]));
    const targets = (leadIds?.length ? [...new Set(leadIds)] : list.buyers.filter((b) => !b.sent && !b.rejected).map((b) => b.id)).slice(0, MAX_SEND);
    const out: ReverseSendResult = { sent: 0, skipped: 0, failed: 0, results: [] };
    for (const leadId of targets) {
      const b = pool.get(leadId);
      if (!b) {
        out.skipped++;
        out.results.push({ leadId, status: 'skipped', reason: 'NOT_A_MATCH' });
        continue;
      }
      if (b.sent || b.rejected) {
        out.skipped++;
        out.results.push({ leadId, status: 'skipped', reason: b.rejected ? 'REJECTED' : 'ALREADY_SENT' });
        continue;
      }
      const lead = await this.leads.findOne({ where: { id: leadId, tenantId }, select: ['id', 'wishlist'], relations: {} });
      const to = cleanWishlist(lead?.wishlist).sendMatchesTo ?? 'buyer';
      const recipients: ('buyer' | 'agent')[] = to === 'both' ? ['buyer', 'agent'] : [to];
      try {
        await this.sender.send(tenantId, viewer, leadId, { propertyIds: [propertyId], recipients });
        out.sent++;
        out.results.push({ leadId, status: 'sent' });
      } catch (err) {
        const code = err instanceof HttpException ? ((err.getResponse() as { code?: string })?.code ?? err.message) : (err as Error).message;
        const skip = code === 'NO_RECIPIENT' || code === 'ALL_ALREADY_SENT';
        if (skip) out.skipped++;
        else out.failed++;
        out.results.push({ leadId, status: skip ? 'skipped' : 'failed', reason: code });
      }
    }
    return out;
  }
}
