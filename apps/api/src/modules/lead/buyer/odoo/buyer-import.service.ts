import { BuyerChangeLogService } from '../buyer-change-log.service';
import { answerChanges, diffFields, wishlistChanges, type FieldChange } from '../change-log';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import {
  Contact, Feature, Lead, LeadActivity, LeadAgent, LeadSuggestion, Location, Property, PropertyType, User,
} from '../../../../database/entities';
import { ContactService } from '../../../contact/contact.service';
import { BuyerStageService } from '../buyer-stage.service';
import { BuyerQuestionService } from '../buyer-question.service';
import { stageKindToStatus } from '../buyer-defaults';
import { readOdooSheet, type OdooBuyer } from './odoo-parse';
import { importNotes, mapOdooBuyer, OdooMatchers, type Choice, type ImportMapping, type MappedBuyer, type MatchKind } from './odoo-match';

// The Odoo Buyers import: preview (what would happen, what didn't match)
// and apply (same file + the admin's mapping). Idempotent on the Odoo ID
// (leads.importRef): importing the same file again updates the same buyers.

// A buyer with no email in Odoo still needs a contact row (email is the
// buyer's key). This address can't receive mail and is never subscribed.
const placeholderEmail = (odooId: string) => `odoo-${odooId.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 60)}@no-email.invalid`;

const NO_EMAIL_NOTE = 'No email in Odoo.';

const PREVIEW_ROWS = 500;

export interface PreviewResult {
  total: number;
  toCreate: number;
  toUpdate: number;
  noEmail: number;
  unknownHeaders: string[];
  missingColumns: string[];
  buyers: { row: number; odooId: string; name: string; email: string | null; action: 'create' | 'update'; buyerId: number | null; unmatched: number }[];
  unmatched: { kind: MatchKind; key: string; value: string; column: string; count: number }[];
  choices: Partial<Record<MatchKind, Choice[]>>;
  missingReferences: { reference: string; count: number }[];
  suggestions: number;
}

export interface ApplyResult {
  created: number;
  updated: number;
  suggestions: number;
  missingReferences: { reference: string; count: number }[];
  notMatched: number;
  errors: { row: number; odooId: string; message: string }[];
}

@Injectable()
export class BuyerImportService {
  private readonly logger = new Logger(BuyerImportService.name);

  constructor(
    @InjectRepository(Lead) private readonly leads: Repository<Lead>,
    @InjectRepository(LeadActivity) private readonly activities: Repository<LeadActivity>,
    @InjectRepository(LeadAgent) private readonly leadAgents: Repository<LeadAgent>,
    @InjectRepository(LeadSuggestion) private readonly suggestions: Repository<LeadSuggestion>,
    @InjectRepository(Contact) private readonly contacts: Repository<Contact>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Location) private readonly locations: Repository<Location>,
    @InjectRepository(PropertyType) private readonly types: Repository<PropertyType>,
    @InjectRepository(Feature) private readonly features: Repository<Feature>,
    @InjectRepository(Property) private readonly properties: Repository<Property>,
    private readonly contactService: ContactService,
    private readonly stageService: BuyerStageService,
    private readonly questionService: BuyerQuestionService,
    private readonly changeLog: BuyerChangeLogService,
  ) {}

  private async matchers(tenantId: number): Promise<OdooMatchers> {
    const [agents, locations, types, features, stages, questions] = await Promise.all([
      this.users.find({ where: { tenantId, isActive: true, canLogin: true, role: In(['admin', 'user']) }, select: ['id', 'name', 'email'] }),
      this.locations.find({ where: { tenantId }, select: ['id', 'name', 'aliases', 'level'] }),
      this.types.find({ where: { tenantId }, select: ['id', 'name'] }),
      this.features.find({ where: { tenantId }, select: ['id', 'name'] }),
      this.stageService.list(tenantId),
      this.questionService.list(tenantId),
    ]);
    return new OdooMatchers({
      agents: agents.map((a) => ({ id: a.id, name: a.name, email: a.email })),
      locations: locations.map((l) => ({ id: l.id, name: l.name, aliases: l.aliases, level: l.level })),
      types: types.map((t) => ({ id: t.id, name: t.name })),
      features: features.map((f) => ({ id: f.id, name: f.name })),
      stages: stages.map((s) => ({ id: s.id, name: s.name, kind: s.kind, sortOrder: s.sortOrder })),
      questions: questions.map((q) => ({ qkey: q.qkey, options: q.options })),
    });
  }

  // The tenant's buyers these Odoo rows land on: by email first, then by
  // Odoo ID. Merged-away leads never count.
  private async existing(tenantId: number, mapped: MappedBuyer[]): Promise<Map<string, Lead>> {
    const emails = [...new Set(mapped.map((b) => b.email ?? placeholderEmail(b.odooId)))];
    const byEmail = new Map<string, Lead>();
    if (emails.length) {
      const rows = await this.leads
        .createQueryBuilder('lead')
        .innerJoinAndSelect('lead.contact', 'contact')
        .where('lead.tenantId = :tenantId', { tenantId })
        .andWhere('lead.mergedIntoId IS NULL')
        .andWhere('contact.email IN (:...emails)', { emails })
        .getMany();
      for (const r of rows) byEmail.set(r.contact.email.toLowerCase(), r);
    }
    const refs = mapped.map((b) => b.odooId);
    const byRef = new Map<string, Lead>();
    if (refs.length) {
      for (const r of await this.leads.find({ where: { tenantId, importRef: In(refs), mergedIntoId: IsNull() } })) byRef.set(r.importRef!, r);
    }
    const out = new Map<string, Lead>();
    for (const b of mapped) {
      const lead = byEmail.get(b.email ?? placeholderEmail(b.odooId)) ?? byRef.get(b.odooId);
      if (lead) out.set(b.odooId, lead);
    }
    return out;
  }

  // Suggested-property references → this tenant's listings (reference or agent reference).
  private async propertyRefs(tenantId: number, mapped: MappedBuyer[]): Promise<Map<string, number>> {
    const refs = [...new Set(mapped.flatMap((b) => b.suggestions.flatMap((s) => [s.reference, s.agentReference]).filter((r): r is string => !!r)))];
    const out = new Map<string, number>();
    if (!refs.length) return out;
    const rows = await this.properties
      .createQueryBuilder('p')
      .select(['p.id', 'p.reference', 'p.agentReference'])
      .where('p.tenantId = :tenantId', { tenantId })
      .andWhere('(p.reference IN (:...refs) OR p.agentReference IN (:...refs))', { refs })
      .getMany();
    for (const p of rows) {
      out.set(p.reference.toLowerCase(), p.id);
      if (p.agentReference && !out.has(p.agentReference.toLowerCase())) out.set(p.agentReference.toLowerCase(), p.id);
    }
    return out;
  }

  private static propertyFor(s: MappedBuyer['suggestions'][number], refs: Map<string, number>): number | undefined {
    return (s.reference && refs.get(s.reference.toLowerCase())) || (s.agentReference && refs.get(s.agentReference.toLowerCase())) || undefined;
  }

  private static missing(mapped: MappedBuyer[], refs: Map<string, number>): { reference: string; count: number }[] {
    const counts = new Map<string, number>();
    for (const b of mapped) {
      for (const s of b.suggestions) {
        if (BuyerImportService.propertyFor(s, refs)) continue;
        const ref = s.reference || s.agentReference;
        if (ref) counts.set(ref, (counts.get(ref) ?? 0) + 1);
      }
    }
    return [...counts].map(([reference, count]) => ({ reference, count }));
  }

  private async load(tenantId: number, buffer: Buffer, mapping: ImportMapping) {
    const sheet = await readOdooSheet(buffer);
    const m = await this.matchers(tenantId);
    const mapped = sheet.buyers.map((b: OdooBuyer) => mapOdooBuyer(b, m, mapping));
    return { sheet, m, mapped };
  }

  async preview(tenantId: number, buffer: Buffer): Promise<PreviewResult> {
    const { sheet, m, mapped } = await this.load(tenantId, buffer, {});
    const existing = await this.existing(tenantId, mapped);
    const refs = await this.propertyRefs(tenantId, mapped);
    const unmatched = new Map<string, PreviewResult['unmatched'][number]>();
    for (const b of mapped) {
      for (const u of b.unmatched) {
        const id = `${u.kind}|${u.key}`;
        const seen = unmatched.get(id);
        if (seen) seen.count++;
        else unmatched.set(id, { ...u, count: 1 });
      }
    }
    const kinds = [...new Set([...unmatched.values()].map((u) => u.kind))];
    const choices: PreviewResult['choices'] = {};
    for (const k of kinds) choices[k] = m.choices(k);
    return {
      total: mapped.length,
      toCreate: mapped.filter((b) => !existing.has(b.odooId)).length,
      toUpdate: mapped.filter((b) => existing.has(b.odooId)).length,
      noEmail: mapped.filter((b) => !b.email).length,
      unknownHeaders: sheet.unknownHeaders,
      missingColumns: sheet.missingColumns,
      buyers: mapped.slice(0, PREVIEW_ROWS).map((b) => ({
        row: b.row,
        odooId: b.odooId,
        name: b.name,
        email: b.email,
        action: existing.has(b.odooId) ? 'update' : 'create',
        buyerId: existing.get(b.odooId)?.id ?? null,
        unmatched: b.unmatched.length,
      })),
      unmatched: [...unmatched.values()].sort((a, b) => a.kind.localeCompare(b.kind) || b.count - a.count),
      choices,
      missingReferences: BuyerImportService.missing(mapped, refs),
      suggestions: mapped.reduce((n, b) => n + b.suggestions.filter((s) => BuyerImportService.propertyFor(s, refs)).length, 0),
    };
  }

  async apply(tenantId: number, buffer: Buffer, mapping: ImportMapping, userId: number): Promise<ApplyResult> {
    const { mapped } = await this.load(tenantId, buffer, mapping);
    const existing = await this.existing(tenantId, mapped);
    const refs = await this.propertyRefs(tenantId, mapped);
    const stages = await this.stageService.list(tenantId);
    const defaultStage = await this.stageService.defaultStageId(tenantId);
    const result: ApplyResult = { created: 0, updated: 0, suggestions: 0, missingReferences: BuyerImportService.missing(mapped, refs), notMatched: 0, errors: [] };

    for (const b of mapped) {
      try {
        const found = existing.get(b.odooId);
        const lead = found ?? (await this.create(tenantId, b, defaultStage));
        const changes = await this.update(tenantId, lead, b, stages);
        await this.changeLog.record(tenantId, lead.id, userId, 'import', found ? changes : [{ field: 'created', from: null, to: 'Odoo import' }]);
        await this.syncAgents(lead.id, b);
        result.suggestions += await this.syncSuggestions(tenantId, lead.id, b, refs, userId);
        await this.activities.save(
          this.activities.create({
            leadId: lead.id,
            userId,
            type: 'import',
            description: null,
            metadata: { source: 'odoo', importRef: b.odooId, created: !found, notMatched: b.notMatched.length },
          }),
        );
        if (found) result.updated++;
        else result.created++;
        result.notMatched += b.notMatched.length;
      } catch (err) {
        this.logger.warn(`Odoo import row ${b.row} (${b.odooId}) failed: ${(err as Error).message}`);
        result.errors.push({ row: b.row, odooId: b.odooId, message: (err as Error).message });
      }
    }
    return result;
  }

  private async create(tenantId: number, b: MappedBuyer, defaultStage: number | null): Promise<Lead> {
    let contact: Contact;
    if (b.email) {
      contact = await this.contactService.findOrCreate(tenantId, {
        email: b.email,
        name: b.name,
        phone: (b.fields.phone as string) || undefined,
        source: 'import',
      });
    } else {
      const email = placeholderEmail(b.odooId);
      contact =
        (await this.contacts.findOne({ where: { tenantId, email } })) ??
        (await this.contacts.save(this.contacts.create({ tenantId, email, name: b.name, source: 'import', subscribed: false })));
    }
    const lead = await this.leads.save(
      this.leads.create({
        tenantId,
        contactId: contact.id,
        source: 'other',
        status: 'new',
        stageId: defaultStage,
        importRef: b.odooId,
        budgetCurrency: 'EUR',
        lastActivityAt: new Date(),
      }),
    );
    // Keep Odoo's creation date (the buyer's real age in the pipeline).
    if (b.createdAt) {
      await this.leads.createQueryBuilder().update().set({ createdAt: b.createdAt } as never).where('id = :id', { id: lead.id }).execute();
    }
    return lead;
  }

  // Only the keys Odoo gave are written (never save() a loaded lead).
  private async update(tenantId: number, lead: Lead, b: MappedBuyer, stages: { id: number; kind: string }[]): Promise<FieldChange[]> {
    const patch: Partial<Lead> = { ...(b.fields as Partial<Lead>), importRef: b.odooId, lastActivityAt: new Date() };
    if (b.wishlist) patch.wishlist = b.wishlist;
    if (Object.keys(b.answers).length) patch.answers = { ...(lead.answers ?? {}), ...b.answers };
    if (b.agentId) patch.assignedTo = b.agentId;
    const stage = b.stageId ? stages.find((s) => s.id === b.stageId) : undefined;
    if (stage) {
      patch.stageId = stage.id;
      patch.status = stageKindToStatus(stage.kind as never, lead.status);
      if (patch.status === 'won' && lead.status !== 'won') patch.wonAt = new Date();
      if (patch.status === 'lost' && lead.status !== 'lost') patch.lostAt = new Date();
    }
    patch.notes = importNotes(lead.notes, {
      odooNotes: b.email ? b.odooNotes : [NO_EMAIL_NOTE, b.odooNotes].filter(Boolean).join('\n'),
      notMatched: b.notMatched,
    });
    await this.leads.update({ id: lead.id, tenantId }, patch);
    return [
      ...diffFields(lead as unknown as Record<string, unknown>, patch as Record<string, unknown>, [...Object.keys(b.fields), 'assignedTo', 'stageId', 'notes']),
      ...(patch.wishlist ? wishlistChanges(lead.wishlist, patch.wishlist) : []),
      ...(patch.answers ? answerChanges(lead.answers, patch.answers) : []),
    ];
  }

  private async syncAgents(leadId: number, b: MappedBuyer): Promise<void> {
    if (!b.relatedAgentIds.length) return;
    await this.leadAgents.delete({ leadId });
    await this.leadAgents.insert(b.relatedAgentIds.map((userId) => ({ leadId, userId })));
  }

  // Upserts on (lead, property): Odoo's status, visit date and note win.
  private async syncSuggestions(tenantId: number, leadId: number, b: MappedBuyer, refs: Map<string, number>, userId: number): Promise<number> {
    let n = 0;
    for (const s of b.suggestions) {
      const propertyId = BuyerImportService.propertyFor(s, refs);
      if (!propertyId) continue;
      const values = {
        status: s.status,
        note: s.note,
        visitDate: s.visitDate ? new Date(`${s.visitDate}T10:00:00Z`) : null,
      };
      const row = await this.suggestions.findOne({ where: { leadId, propertyId } });
      if (row) await this.suggestions.update(row.id, values);
      else await this.suggestions.save(this.suggestions.create({ tenantId, leadId, propertyId, createdBy: userId, ...values }));
      n++;
    }
    return n;
  }
}
