import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { Location, LocationTemplateUnmatched } from '../../database/entities';
import { AiEnrichmentService } from '../ai-enrichment/ai-enrichment.service';
import { LocationTemplateService } from './location-template.service';
import { locationKey } from './location-name';
import { AiProposal, autoApplicable, buildPrompt, buildQuestion, readAnswers, ReviewQuestion } from './unmatched-review';

// Names per AI call, and per run of "AI review" from Super Admin.
const BATCH = 20;
const PER_RUN = 40;

export interface DuplicateGroup {
  province: string;
  level: string;
  name: string;
  places: Array<{ id: number; path: string; status: string; clientRows: number; aliases: string[] }>;
}

/**
 * AI review of the "Unmatched from feeds" list (see unmatched-review.ts), the
 * one-click accept of its suggestions, and the list of names the template has
 * twice in one province.
 */
@Injectable()
export class UnmatchedReviewService implements OnModuleInit {
  private readonly logger = new Logger(UnmatchedReviewService.name);

  constructor(
    @InjectRepository(LocationTemplateUnmatched)
    private readonly unmatchedRepository: Repository<LocationTemplateUnmatched>,
    @InjectRepository(Location)
    private readonly locationRepository: Repository<Location>,
    private readonly template: LocationTemplateService,
    private readonly ai: AiEnrichmentService,
  ) {}

  // Feed imports hand their new unknown names here (see finishRun).
  onModuleInit(): void {
    this.template.setUnmatchedReviewer((entries, keyTenantId) => this.reviewAndApply(entries, keyTenantId));
  }

  /**
   * Ask the AI about these entries and store its answers. A failed call stores
   * nothing, so the same names are asked again next time (they used to be
   * marked as asked even when the call never went through).
   */
  async review(entries: LocationTemplateUnmatched[], keyTenantId?: number): Promise<{ answered: number; failed: number }> {
    const index = await this.template.loadIndex();
    const questions = entries
      .map((e) => buildQuestion(index, e))
      .filter((q): q is ReviewQuestion => !!q && (q.places.length > 0 || q.municipalities.length > 0));
    // Nothing to choose from: mark it asked so it isn't retried every sync.
    const noOptions = entries.filter((e) => !questions.some((q) => q.entry.id === e.id));
    if (noOptions.length) {
      await this.unmatchedRepository.update({ id: In(noOptions.map((e) => e.id)) }, { aiAttempted: true });
    }

    let answered = 0;
    let failed = 0;
    for (let i = 0; i < questions.length; i += BATCH) {
      const batch = questions.slice(i, i + BATCH);
      // The AI key: the importing client's own (else the platform's) during a
      // feed import; the platform's for Super Admin's review of the template.
      const answer = await this.ai.completeJson(keyTenantId ?? 0, buildPrompt(index, batch));
      if (!answer) {
        failed += batch.length;
        continue;
      }
      const proposals = readAnswers(index, batch, answer);
      for (const q of batch) {
        const p = proposals.get(q.entry.id);
        if (!p) continue;
        await this.unmatchedRepository.update({ id: q.entry.id }, { aiProposal: p, aiAttempted: true });
        (q.entry as LocationTemplateUnmatched).aiProposal = p;
        answered++;
      }
    }
    return { answered, failed };
  }

  /**
   * After a feed import: review the new names and apply, without waiting for a
   * person, only what is safe — another spelling of a place near the listings,
   * or a new town (marked "AI suggested"). Returns every client to re-sort.
   */
  async reviewAndApply(entries: LocationTemplateUnmatched[], keyTenantId: number): Promise<{ applied: number; tenantIds: number[] }> {
    await this.review(entries.slice(0, PER_RUN), keyTenantId);
    let applied = 0;
    const tenantIds = new Set<number>();
    for (const e of entries) {
      if (!e.aiProposal || !autoApplicable(e.aiProposal)) continue;
      const ok = await this.applyProposal(e, e.aiProposal, true).catch((err) => {
        this.logger.warn(`Could not apply AI suggestion for "${e.name}": ${(err as Error).message}`);
        return false;
      });
      if (!ok) continue;
      applied++;
      for (const t of e.tenantIds || []) tenantIds.add(t);
    }
    return { applied, tenantIds: [...tenantIds] };
  }

  /** Super Admin "AI review": the next open names nobody has asked about yet. */
  async reviewOpen(): Promise<{ answered: number; failed: number; remaining: number }> {
    const open = { dismissed: false, resolvedNodeId: IsNull() };
    const todo = await this.unmatchedRepository.find({
      where: { ...open, aiProposal: IsNull() },
      order: { occurrences: 'DESC' },
      take: PER_RUN,
    });
    const r = await this.review(todo);
    const remaining = await this.unmatchedRepository.count({ where: { ...open, aiProposal: IsNull() } });
    return { ...r, remaining };
  }

  async reviewOne(id: number): Promise<AiProposal | null> {
    const entry = await this.unmatchedRepository.findOne({ where: { id } });
    if (!entry) throw new NotFoundException('Unmatched entry not found');
    const r = await this.review([entry]);
    if (r.failed) throw new BadRequestException('The AI could not be reached. Try again in a minute.');
    return entry.aiProposal;
  }

  /** Accept the AI's suggestion for one name. */
  async accept(id: number): Promise<{ action: string; tenants: number; relocated: number; cleaned: number }> {
    const entry = await this.unmatchedRepository.findOne({ where: { id } });
    if (!entry) throw new NotFoundException('Unmatched entry not found');
    if (!entry.aiProposal?.action) throw new BadRequestException('There is no AI suggestion to accept');
    await this.applyProposal(entry, entry.aiProposal, false);
    const tenantIds = entry.aiProposal.action === 'dismiss' ? [] : entry.tenantIds || [];
    const r = await this.template.reapplyTenants(tenantIds);
    return { action: entry.aiProposal.action, tenants: new Set(tenantIds).size, ...r };
  }

  /** Accept every suggestion that isn't flagged as far from its listings. */
  async acceptAll(): Promise<{ accepted: number; tenants: number; relocated: number; cleaned: number }> {
    const entries = await this.unmatchedRepository.find({
      where: { dismissed: false, resolvedNodeId: IsNull(), aiProposal: Not(IsNull()) },
    });
    let accepted = 0;
    const tenantIds = new Set<number>();
    for (const e of entries) {
      const p = e.aiProposal;
      if (!p?.action || p.flagged) continue;
      const ok = await this.applyProposal(e, p, false).catch(() => false);
      if (!ok) continue;
      accepted++;
      if (p.action !== 'dismiss') for (const t of e.tenantIds || []) tenantIds.add(t);
    }
    const r = await this.template.reapplyTenants([...tenantIds]);
    return { accepted, tenants: tenantIds.size, ...r };
  }

  private async applyProposal(entry: LocationTemplateUnmatched, p: AiProposal, automatic: boolean): Promise<boolean> {
    if (p.action === 'dismiss') {
      await this.template.dismissUnmatched(entry.id, automatic ? 'ai' : 'person');
      return true;
    }
    if (p.action === 'same' && p.nodeId) {
      await this.template.linkUnmatchedAsAlias(entry.id, p.nodeId, automatic ? 'ai' : 'person');
      return true;
    }
    if (p.action === 'new' && p.nodeId) {
      await this.template.addTownForUnmatched(
        entry.id,
        p.nodeId,
        automatic ? 'ai_suggested' : 'ok',
        automatic ? `Added by AI for "${entry.name}" from a ${entry.provider} feed${p.reason ? `: ${p.reason}` : ''}.` : undefined,
      );
      return true;
    }
    return false;
  }

  /**
   * Places the template has twice in one province at the same level — mostly
   * from the original exports (Algorfa under Almoradí and under Algorfa). A
   * listing can only land on one of them, so these are where it can go wrong.
   */
  async duplicates(): Promise<DuplicateGroup[]> {
    const index = await this.template.loadIndex();
    const groups = new Map<string, DuplicateGroup & { ids: number[] }>();
    for (const n of index.byId.values()) {
      if (n.level !== 'municipality' && n.level !== 'town' && n.level !== 'urbanization') continue;
      const province = index.ancestor(n, 'province');
      const k = `${province?.id ?? 0}|${n.level}|${locationKey(n.name)}`;
      let g = groups.get(k);
      if (!g) {
        g = { province: province?.name ?? '', level: n.level, name: n.name, places: [], ids: [] };
        groups.set(k, g);
      }
      g.ids.push(n.id);
    }
    const dupes = [...groups.values()].filter((g) => g.ids.length > 1);
    const allIds = dupes.flatMap((g) => g.ids);
    const counts = new Map<number, number>();
    if (allIds.length) {
      const rows: Array<{ templateNodeId: number; c: string }> = await this.locationRepository
        .createQueryBuilder('l')
        .select('l.templateNodeId', 'templateNodeId')
        .addSelect('COUNT(*)', 'c')
        .where('l.templateNodeId IN (:...ids)', { ids: allIds })
        .groupBy('l.templateNodeId')
        .getRawMany();
      for (const r of rows) counts.set(Number(r.templateNodeId), Number(r.c));
    }
    return dupes
      .map(({ ids, ...g }) => ({
        ...g,
        places: ids.map((id) => {
          const n = index.byId.get(id)!;
          return {
            id,
            path: index.path(n).map((p) => p.name).join(' › '),
            status: n.status,
            clientRows: counts.get(id) ?? 0,
            aliases: n.aliases || [],
          };
        }),
      }))
      .sort((a, b) => a.province.localeCompare(b.province) || a.name.localeCompare(b.name));
  }
}
