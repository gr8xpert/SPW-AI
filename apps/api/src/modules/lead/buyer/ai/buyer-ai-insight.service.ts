import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { BuyerTask, BuyerViewing, Lead, LeadSuggestion, Location, Property } from '../../../../database/entities';
import { BuyerService, assertNotErased } from '../buyer.service';
import type { BuyerViewer } from '../buyer-access';
import { townOf } from '../buyer-intake';
import { BuyerAiService, type AiProposalResult } from './buyer-ai.service';
import { feedbackPrompt, messageBlock } from './buyer-ai-prompts';
import { classifyFeedback, feedbackPatterns, type FeedbackProperty, type FeedbackSuggestion } from './feedback-patterns';
import { floorFacts } from './note-rules';
import { cleanSummary, summaryHash, summaryPrompt, summaryText, wishlistWords, type SummaryInput } from './summary-input';

// At most one new summary per buyer this often, however often it changes.
export const SUMMARY_MIN_GAP_MS = 2 * 60_000;
const COMMENTS_SENT = 3000;
const MAX_DISMISSED = 100;
// Activity kinds worth summarising (not housekeeping).
const SUMMARY_SKIP = new Set(['assignment', 'import']);

export interface SummaryResult {
  lines: string[] | null;
  at: Date | null;
  // The buyer changed since the summary was written.
  stale: boolean;
  hasKey: boolean;
}

export interface FeedbackResult {
  suggestions: FeedbackSuggestion[];
  liked: number;
  rejected: number;
  // Comments the AI could read (reject reasons, viewing / page feedback).
  comments: number;
}

const en = (n: unknown): string => {
  if (typeof n === 'string') return n;
  const r = (n && typeof n === 'object' ? n : {}) as Record<string, string>;
  return r.en || Object.values(r).find(Boolean) || '';
};
const day = (d: Date | string | null | undefined): string => (d ? new Date(d).toISOString().slice(0, 10) : '');

// Buyer summary (cached until the buyer changes) and learning from feedback.
@Injectable()
export class BuyerAiInsightService {
  constructor(
    @InjectRepository(Lead) private readonly leads: Repository<Lead>,
    @InjectRepository(LeadSuggestion) private readonly suggestions: Repository<LeadSuggestion>,
    @InjectRepository(BuyerViewing) private readonly viewings: Repository<BuyerViewing>,
    @InjectRepository(BuyerTask) private readonly tasks: Repository<BuyerTask>,
    @InjectRepository(Property) private readonly properties: Repository<Property>,
    @InjectRepository(Location) private readonly locations: Repository<Location>,
    private readonly buyers: BuyerService,
    private readonly buyerAi: BuyerAiService,
  ) {}

  private async names(tenantId: number) {
    const lists = await this.buyerAi.lists(tenantId);
    return {
      lists,
      places: new Map(lists.proposal.places.map((p) => [p.id, en(p.name)])),
      types: new Map(lists.prompt.types.map((t) => [t.id, en(t.name)])),
      features: new Map(lists.prompt.features.map((f) => [f.id, en(f.name)])),
    };
  }

  // The summary's input, exactly as the model would read it.
  private async summaryInput(tenantId: number, viewer: BuyerViewer, lead: Lead & { mergedIds: number[] }): Promise<string> {
    const leadIds = [lead.id, ...lead.mergedIds];
    const [names, activities, suggestions, viewings, tasks] = await Promise.all([
      this.names(tenantId),
      this.buyers.activities(tenantId, viewer, lead.id),
      this.suggestions
        .createQueryBuilder('s')
        .leftJoin('s.property', 'p')
        .addSelect(['p.id', 'p.reference', 'p.title', 'p.locationId'])
        .where('s.leadId IN (:...leadIds)', { leadIds })
        .orderBy('s.id', 'ASC')
        .getMany(),
      this.viewings.find({ where: { leadId: In(leadIds) }, order: { startsAt: 'DESC' }, take: 8 }),
      this.tasks.find({ where: { leadId: In(leadIds), doneAt: IsNull() }, order: { dueAt: 'ASC' }, take: 5 }),
    ]);
    const stageNames = new Map<unknown, string>();
    if (lead.stage) stageNames.set(lead.stage.id, en(lead.stage.name));
    const label = (s: LeadSuggestion) => [s.property?.reference, en(s.property?.title), names.places.get(s.property?.locationId ?? 0)].filter(Boolean).join(' ');
    const interest = new Map(viewings.filter((v) => v.propertyId && v.interest).map((v) => [v.propertyId as number, v.interest as number]));
    const verdicts = suggestions.map((s) => ({ s, v: classifyFeedback(s, interest.get(s.propertyId) ?? null) }));

    const input: SummaryInput = {
      firstName: lead.firstName,
      stage: lead.stage ? en(lead.stage.name) : null,
      agent: lead.assignedToUser?.name ?? null,
      source: lead.source,
      createdAt: day(lead.createdAt),
      language: lead.language,
      wishlist: wishlistWords(lead.wishlist, names),
      rules: (lead.noteRules ?? []).map((r) => r.text),
      notes: lead.notes,
      activities: activities
        .filter((a) => !SUMMARY_SKIP.has(a.type))
        .slice(0, 15)
        .map((a) => ({ date: day(a.createdAt), type: a.type, text: a.type === 'status_change' ? `stage changed` : a.description })),
      feedback: {
        sent: suggestions.filter((s) => s.sentAt).length,
        liked: verdicts.filter((x) => x.v === 'liked').map((x) => label(x.s)),
        rejected: verdicts.filter((x) => x.v === 'rejected').map((x) => ({ label: label(x.s), reason: x.s.rejectReason })),
      },
      viewings: viewings.map((v) => ({ date: day(v.startsAt), status: v.status, interest: v.interest, feedback: v.feedback })),
      tasks: tasks.map((t) => ({ due: day(t.dueAt) || null, title: t.title })),
    };
    return summaryText(input);
  }

  // The record's summary. Returns the cached one when nothing changed (no
  // AI call); writes a new one when it is missing or stale, the agency has a
  // key and the last one is over 2 minutes old — or always with `force`.
  async summary(tenantId: number, viewer: BuyerViewer, id: number, force = false): Promise<SummaryResult> {
    const lead = await this.buyers.get(tenantId, viewer, id);
    const hasKey = (await this.buyerAi.status(tenantId)).hasKey;
    const cached = (): SummaryResult => ({
      lines: lead.aiSummary ? lead.aiSummary.split('\n') : null,
      at: lead.aiSummaryAt,
      stale: !!lead.aiSummary && lead.aiSummaryHash !== hash,
      hasKey,
    });
    if (lead.erasedAt) return { lines: null, at: null, stale: false, hasKey };
    const text = await this.summaryInput(tenantId, viewer, lead);
    const hash = summaryHash(text);
    if (!force && lead.aiSummary && lead.aiSummaryHash === hash) return cached();
    if (!hasKey) {
      if (force) await this.buyerAi.requireKey(tenantId);
      return cached();
    }
    const recent = lead.aiSummaryAt && Date.now() - +new Date(lead.aiSummaryAt) < SUMMARY_MIN_GAP_MS;
    if (!force && recent) return cached();

    const raw = await this.buyerAi.ask(
      tenantId,
      'summary',
      [
        { role: 'system', content: summaryPrompt(day(new Date())) },
        { role: 'user', content: `<<<\n${text.replace(/>>>/g, '> > >')}\n>>>` },
      ],
      { maxTokens: 600, temperature: 0.3 },
    );
    const lines = cleanSummary(raw);
    if (!lines) return cached();
    const at = new Date();
    // Not a change to the buyer: updatedAt / lastActivityAt stay as they were.
    await this.leads
      .createQueryBuilder()
      .update(Lead)
      .set({ aiSummary: lines.join('\n'), aiSummaryHash: hash, aiSummaryAt: at, updatedAt: () => 'updatedAt' })
      .where('id = :id AND tenantId = :tenantId', { id: lead.id, tenantId })
      .execute();
    return { lines, at, stale: false, hasKey };
  }

  private async feedbackData(tenantId: number, lead: Lead & { mergedIds: number[] }) {
    const leadIds = [lead.id, ...lead.mergedIds];
    const [suggestions, viewings] = await Promise.all([
      this.suggestions.find({ where: { leadId: In(leadIds) }, select: ['id', 'propertyId', 'status', 'likedAt', 'rejectedAt', 'rejectReason'] }),
      this.viewings.find({ where: { leadId: In(leadIds) }, select: ['id', 'propertyId', 'interest', 'feedback', 'startsAt'], order: { startsAt: 'ASC' } }),
    ]);
    // A viewing's interest counts for its property (the latest one wins).
    const interest = new Map<number, number>();
    for (const v of viewings) if (v.propertyId && v.interest) interest.set(v.propertyId, v.interest);
    const verdict = new Map<number, 'liked' | 'rejected'>();
    for (const s of suggestions) {
      const v = classifyFeedback(s, interest.get(s.propertyId) ?? null);
      if (v) verdict.set(s.propertyId, v);
    }
    for (const [pid, i] of interest) if (!verdict.has(pid) && (i >= 4 || i <= 2)) verdict.set(pid, i >= 4 ? 'liked' : 'rejected');
    const comments = [
      ...suggestions.filter((s) => s.rejectReason?.trim()).map((s) => `Rejected a property: ${s.rejectReason}`),
      ...viewings.filter((v) => v.feedback?.trim()).map((v) => `After a viewing${v.interest ? ` (interest ${v.interest}/5)` : ''}: ${v.feedback}`),
    ];
    return { verdict, comments };
  }

  // Learns from feedback by counting: free, no key needed.
  async feedback(tenantId: number, viewer: BuyerViewer, id: number): Promise<FeedbackResult> {
    const lead = await this.buyers.get(tenantId, viewer, id);
    const { verdict, comments } = await this.feedbackData(tenantId, lead);
    const activityComments = (await this.buyers.activities(tenantId, viewer, id)).filter((a) => a.type === 'buyer_feedback' && a.description?.trim()).length;
    const ids = [...verdict.keys()];
    if (!ids.length) return { suggestions: [], liked: 0, rejected: 0, comments: comments.length + activityComments };
    const [rows, names, places] = await Promise.all([
      this.properties.find({ where: { tenantId, id: In(ids) }, select: ['id', 'features', 'floor', 'propertyTypeId', 'locationId'] }),
      this.buyerAi.lists(tenantId),
      this.locations.find({ where: { tenantId }, select: ['id', 'parentId', 'level'] }),
    ]);
    const all = (n: unknown) => (n && typeof n === 'object' ? Object.values(n as Record<string, string>) : typeof n === 'string' ? [n] : []);
    const typeNames = new Map(names.prompt.types.map((t) => [t.id, all(t.name)]));
    const featureNames = new Map(names.prompt.features.map((f) => [f.id, all(f.name)]));
    const byId = new Map(places.map((p) => [p.id, { id: p.id, parentId: p.parentId, level: p.level }]));
    const props: FeedbackProperty[] = rows.map((p) => ({
      id: p.id,
      verdict: verdict.get(p.id)!,
      features: Array.isArray(p.features) ? p.features.map(Number) : null,
      floor: floorFacts(p.floor, p.propertyTypeId ? typeNames.get(p.propertyTypeId) ?? [] : [], (p.features ?? []).flatMap((f) => featureNames.get(Number(f)) ?? [])),
      propertyTypeId: p.propertyTypeId,
      townId: p.locationId ? townOf(p.locationId, byId) : null,
    }));
    return {
      suggestions: feedbackPatterns(props, lead.wishlist, lead.noteRules ?? [], lead.aiDismissed ?? []),
      liked: props.filter((p) => p.verdict === 'liked').length,
      rejected: props.filter((p) => p.verdict === 'rejected').length,
      comments: comments.length + activityComments,
    };
  }

  // The buyer's own words on what they were shown, read by AI.
  async readComments(tenantId: number, viewer: BuyerViewer, id: number): Promise<AiProposalResult> {
    const lead = await this.buyers.get(tenantId, viewer, id);
    assertNotErased(lead);
    const { comments } = await this.feedbackData(tenantId, lead);
    const pageNotes = (await this.buyers.activities(tenantId, viewer, id))
      .filter((a) => a.type === 'buyer_feedback' && a.description?.trim())
      .map((a) => `On the buyer page: ${a.description}`);
    const all = [...comments, ...pageNotes];
    if (!all.length) throw new BadRequestException({ code: 'NO_COMMENTS', message: 'The buyer has not written any comments yet.' });
    await this.buyerAi.requireKey(tenantId);
    const lists = await this.buyerAi.lists(tenantId);
    const raw = await this.buyerAi.ask(
      tenantId,
      'feedback',
      [
        { role: 'system', content: feedbackPrompt(lists.prompt) },
        { role: 'user', content: messageBlock('COMMENTS', all.map((c) => `- ${c}`).join('\n'), COMMENTS_SENT) },
      ],
      { maxTokens: 600 },
    );
    return this.buyerAi.proposalFor(lead, raw, lists);
  }

  async dismiss(tenantId: number, viewer: BuyerViewer, id: number, key: string): Promise<{ dismissed: string[] }> {
    const lead = await this.buyers.get(tenantId, viewer, id);
    const dismissed = [...new Set([...(lead.aiDismissed ?? []), key])].slice(-MAX_DISMISSED);
    await this.leads
      .createQueryBuilder()
      .update(Lead)
      .set({ aiDismissed: dismissed, updatedAt: () => 'updatedAt' })
      .where('id = :id AND tenantId = :tenantId', { id: lead.id, tenantId })
      .execute();
    return { dismissed };
  }
}
