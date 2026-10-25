import { BuyerChangeLogService } from './buyer-change-log.service';
import { answerChanges, diffFields, wishlistChanges } from './change-log';
import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, MoreThanOrEqual, Repository } from 'typeorm';
import type { BuyerWishlist, PreferredContact } from '@spm/shared';
import { Lead, LeadActivity, Location, Property, User } from '../../../database/entities';
import type { LeadSource } from '../../../database/entities/lead.entity';
import { ContactService } from '../../contact/contact.service';
import { BuyerStageService } from './buyer-stage.service';
import { BuyerSettingsService } from './buyer-settings.service';
import { BuyerQuestionService } from './buyer-question.service';
import { splitName } from './buyer-defaults';
import { answersFromForm } from './buyer-question-defaults';
import { cleanWishlist, isEmptyWishlist } from './buyer-match';
import { guessWishlist, mergeGuess, pickRotationAgent, townOf, type PlaceRow } from './buyer-intake';

// Buyers arriving from a client's website: an enquiry, an emailed favourites
// list, or the wishlist form. One buyer per email (the contact), so a second
// visit lands on the same record. New buyers get an agent from the Buyer
// Match settings. Runs for every tenant; only the dashboard is behind the
// add-on.

const GUESS_FIELDS: (keyof Property)[] = [
  'id', 'reference', 'title', 'listingType', 'propertyTypeId', 'locationId', 'price', 'priceTo', 'priceOnRequest', 'bedrooms', 'currency',
];

// The same visitor sending the wishlist form again this soon is a double
// click or a back-and-resend: the buyer is updated, nothing is sent twice.
const FORM_REPEAT_MS = 2 * 60 * 1000;

export interface WebsiteEnquiry {
  email: string;
  name?: string;
  phone?: string;
  message?: string;
  propertyIds: number[];
  source: LeadSource;
  // favorites = the wishlist "email my favourites" form.
  kind: 'enquiry' | 'favorites';
  pageUrl?: string;
  recipient?: string;
  // A lead form's answers (Facebook): fill the Buyer questions they match.
  formAnswers?: { question: string; answer: string }[];
}

export interface WishlistFormInput {
  email: string;
  firstName: string;
  lastName?: string;
  phone?: string;
  preferredContact?: PreferredContact;
  language?: string;
  notes?: string;
  wishlist: Record<string, unknown>;
  answers?: Record<string, unknown>;
  pageUrl?: string;
  pageLanguage: string;
}

export interface IntakeResult {
  lead: Lead;
  created: boolean;
  // The wishlist form sent again within FORM_REPEAT_MS.
  repeat?: boolean;
}

@Injectable()
export class BuyerIntakeService {
  private readonly logger = new Logger(BuyerIntakeService.name);

  constructor(
    @InjectRepository(Lead) private readonly leads: Repository<Lead>,
    @InjectRepository(LeadActivity) private readonly activities: Repository<LeadActivity>,
    @InjectRepository(Property) private readonly properties: Repository<Property>,
    @InjectRepository(Location) private readonly locations: Repository<Location>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly contactService: ContactService,
    private readonly stageService: BuyerStageService,
    private readonly settingsService: BuyerSettingsService,
    private readonly questionService: BuyerQuestionService,
    private readonly changeLog: BuyerChangeLogService,
  ) {}

  async upsertFromWebsite(tenantId: number, input: WebsiteEnquiry): Promise<IntakeResult> {
    const props = input.propertyIds.length
      ? await this.properties.find({ where: { tenantId, id: In([...new Set(input.propertyIds)]) }, select: GUESS_FIELDS })
      : [];
    const first = input.kind === 'enquiry' ? props[0] : undefined;
    const { lead, created } = await this.findOrCreate(tenantId, {
      email: input.email,
      name: input.name,
      phone: input.phone,
      source: input.source,
      propertyId: first?.id ?? null,
    });

    // Only blanks are filled: the agent may have corrected the name or phone.
    if (!created) {
      const patch: Partial<Lead> = {};
      if (!lead.phone && input.phone) patch.phone = input.phone;
      if (!lead.firstName && !lead.lastName && input.name) Object.assign(patch, splitName(input.name));
      if (Object.keys(patch).length) await this.leads.update(lead.id, patch);
      await this.changeLog.record(tenantId, lead.id, null, 'website', diffFields(lead as unknown as Record<string, unknown>, patch as Record<string, unknown>, ['phone', 'firstName', 'lastName']));
    } else {
      await this.changeLog.record(tenantId, lead.id, null, 'website', [{ field: 'created', from: null, to: input.kind === 'favorites' ? 'favourites email' : 'enquiry' }]);
    }

    const guessed = await this.guess(lead, props);
    const metadata: Record<string, unknown> =
      input.kind === 'favorites'
        ? {
            kind: 'favorites',
            propertyId: null,
            propertyIds: props.map((p) => p.id),
            references: props.map((p) => p.reference),
            recipient: input.recipient ?? null,
            source: input.source,
          }
        : {
            propertyId: first?.id ?? null,
            reference: first?.reference ?? null,
            title: first?.title ?? null,
            source: input.source,
            pageUrl: input.pageUrl ?? null,
          };
    if (guessed) metadata.guessedWishlist = true;
    await this.log(lead.id, 'enquiry', input.message?.trim() || null, metadata);
    if (input.formAnswers?.length) await this.fillAnswers(tenantId, lead.id, input.formAnswers);
    if (created) await this.autoAssign(tenantId, lead.id);
    return { lead, created };
  }

  // Form answers onto the Buyer questions the buyer hasn't answered yet.
  // Never fails the intake: the answers are in the enquiry either way.
  private async fillAnswers(tenantId: number, leadId: number, form: { question: string; answer: string }[]): Promise<void> {
    try {
      const fresh = await this.leads.findOne({ where: { id: leadId }, select: ['id', 'answers'] });
      const current = fresh?.answers ?? {};
      const found = answersFromForm(await this.questionService.list(tenantId), form, current);
      if (!Object.keys(found).length) return;
      const answers = { ...current, ...found };
      await this.leads.update(leadId, { answers });
      await this.changeLog.record(tenantId, leadId, null, 'website', answerChanges(current, answers));
    } catch (err) {
      this.logger.warn(`Form answers for lead ${leadId} not matched: ${(err as Error).message}`);
    }
  }

  // The visitor's own wishlist: it replaces whatever the buyer had, along
  // with the answers to the form's questions and the contact fields.
  async submitWishlistForm(tenantId: number, input: WishlistFormInput): Promise<IntakeResult> {
    const name = [input.firstName, input.lastName].filter(Boolean).join(' ');
    const { lead, created } = await this.findOrCreate(tenantId, {
      email: input.email,
      name,
      phone: input.phone,
      source: 'website',
      propertyId: null,
    });

    const questions = (await this.questionService.list(tenantId)).filter((q) => q.isActive && q.showOnForm);
    const formKeys = new Set(questions.map((q) => q.qkey));
    const given = await this.questionService.clean(tenantId, input.answers ?? {});
    const answers: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(lead.answers ?? {})) if (!formKeys.has(k)) answers[k] = v;
    for (const [k, v] of Object.entries(given)) if (formKeys.has(k)) answers[k] = v;

    const wishlist = await this.ownWishlist(tenantId, cleanWishlist({ ...input.wishlist, guessed: false }));
    const patch: Partial<Lead> = {
      wishlist: isEmptyWishlist(wishlist) && !wishlist.sendMatchesTo ? null : wishlist,
      answers: Object.keys(answers).length ? answers : null,
      lastActivityAt: new Date(),
    };
    // The form is public and proves nothing but knowing an email address, so
    // on an existing buyer it only fills blanks: it never overwrites the
    // name, phone, contact preference or language an agent has. What the
    // visitor typed is kept in the activity for the agent to see.
    const blank = (v: unknown) => created || v === null || v === undefined || v === '';
    if (blank(lead.firstName) && blank(lead.lastName)) {
      patch.firstName = input.firstName;
      patch.lastName = input.lastName || null;
    }
    if (input.phone && blank(lead.phone)) patch.phone = input.phone;
    if (input.preferredContact && blank(lead.preferredContact)) patch.preferredContact = input.preferredContact;
    if (blank(lead.language)) patch.language = input.language || input.pageLanguage;
    // "How did you find us" also fills Referred by, when it's empty.
    const found = answers.found_us?.[0];
    if (!lead.referredBy && found) {
      const option = questions.find((q) => q.qkey === 'found_us')?.options.find((o) => o.key === found);
      const label = option ? option.label.en || Object.values(option.label)[0] : null;
      if (label) patch.referredBy = label.slice(0, 150);
    }
    await this.leads.update(lead.id, patch);
    await this.changeLog.record(
      tenantId,
      lead.id,
      null,
      'website',
      created
        ? [{ field: 'created', from: null, to: 'wishlist form' }, ...wishlistChanges(null, patch.wishlist), ...answerChanges(null, patch.answers)]
        : [
            ...diffFields(lead as unknown as Record<string, unknown>, patch as Record<string, unknown>, ['firstName', 'lastName', 'phone', 'preferredContact', 'language', 'referredBy']),
            ...wishlistChanges(lead.wishlist, patch.wishlist),
            ...answerChanges(lead.answers, patch.answers),
          ],
    );

    const repeat =
      !created &&
      (await this.activities.count({
        where: { leadId: lead.id, type: 'wishlist_form', createdAt: MoreThanOrEqual(new Date(Date.now() - FORM_REPEAT_MS)) },
      })) > 0;
    if (!repeat) {
      await this.log(lead.id, 'wishlist_form', input.notes?.trim() || null, {
        previousWishlist: lead.wishlist ?? null,
        wishlist: patch.wishlist,
        answers: patch.answers,
        // As typed on the form (applied only where the buyer had nothing).
        contact: {
          firstName: input.firstName,
          lastName: input.lastName ?? null,
          phone: input.phone ?? null,
          preferredContact: input.preferredContact ?? null,
          language: input.language ?? null,
        },
        pageUrl: input.pageUrl ?? null,
        language: input.pageLanguage,
      });
    }
    if (created) await this.autoAssign(tenantId, lead.id);
    const fresh = await this.leads.findOne({ where: { id: lead.id }, relations: ['assignedToUser'] });
    return { lead: fresh ?? lead, created, repeat };
  }

  // Only this client's own places, types and features: the form is public.
  private async ownWishlist(tenantId: number, w: BuyerWishlist): Promise<BuyerWishlist> {
    const out: BuyerWishlist = { ...w };
    const fields: ['locationIds' | 'propertyTypeIds' | 'featureIds', string][] = [
      ['locationIds', 'locations'], ['propertyTypeIds', 'property_types'], ['featureIds', 'features'],
    ];
    for (const [key, table] of fields) {
      const ids = w[key];
      if (!ids?.length) continue;
      const rows: { id: number }[] = await this.dataSource.query(`SELECT id FROM ${table} WHERE tenantId = ? AND id IN (?)`, [tenantId, ids]);
      const own = new Set(rows.map((r) => Number(r.id)));
      const kept = ids.filter((id) => own.has(id));
      if (kept.length) out[key] = kept;
      else delete out[key];
    }
    return out;
  }

  private async findOrCreate(
    tenantId: number,
    c: { email: string; name?: string; phone?: string; source: LeadSource; propertyId: number | null },
  ): Promise<{ lead: Lead; created: boolean }> {
    const contact = await this.contactService.findOrCreate(tenantId, {
      email: c.email.trim().toLowerCase(),
      name: c.name || undefined,
      phone: c.phone || undefined,
      source: 'inquiry',
      sourcePropertyId: c.propertyId ?? undefined,
    });
    const existing = await this.leads.findOne({ where: { tenantId, contactId: contact.id, mergedIntoId: IsNull() } });
    if (existing) {
      // A new form from someone whose enquiry was marked handled: waiting again.
      if (existing.isNewLead && existing.newLeadHandledAt) {
        await this.leads.update(existing.id, { newLeadHandledAt: null });
        existing.newLeadHandledAt = null;
      }
      return { lead: existing, created: false };
    }
    const lead = await this.leads.save(
      this.leads.create({
        tenantId,
        contactId: contact.id,
        propertyId: c.propertyId,
        source: c.source,
        status: 'new',
        stageId: await this.stageService.defaultStageId(tenantId),
        ...splitName(c.name),
        phone: c.phone ?? null,
        budgetCurrency: 'EUR',
        lastActivityAt: new Date(),
        // Waits on New Leads until someone picks a role.
        isNewLead: true,
      }),
    );
    return { lead, created: true };
  }

  // A guessed wishlist, only when the buyer has none yet or only an earlier
  // guess (merged with it). An agent's or the visitor's own is never touched.
  private async guess(lead: Lead, props: Property[]): Promise<boolean> {
    const current = lead.wishlist ? cleanWishlist(lead.wishlist) : null;
    const hasOwn = !!current && !isEmptyWishlist(current) && !current.guessed;
    if (hasOwn || !props.length) return false;
    const places = await this.ancestry(lead.tenantId, props.map((p) => p.locationId));
    const next = guessWishlist(props, (id) => (id == null ? null : townOf(id, places)));
    if (!next) return false;
    const wishlist: BuyerWishlist = current?.guessed ? mergeGuess(current, next) : next;
    await this.leads.update(lead.id, { wishlist });
    await this.changeLog.record(lead.tenantId, lead.id, null, 'website', wishlistChanges(lead.wishlist, wishlist));
    return true;
  }

  // The listings' places and everything above them (at most six levels).
  private async ancestry(tenantId: number, ids: (number | null)[]): Promise<Map<number, PlaceRow>> {
    const byId = new Map<number, PlaceRow>();
    let want = [...new Set(ids.filter((id): id is number => id != null))];
    for (let depth = 0; want.length && depth < 6; depth++) {
      const rows = await this.locations.find({ where: { tenantId, id: In(want) }, select: ['id', 'parentId', 'level'] });
      for (const r of rows) byId.set(r.id, { id: r.id, parentId: r.parentId, level: r.level });
      want = rows
        .filter((r) => r.level === 'urbanization' && r.parentId != null && !byId.has(r.parentId))
        .map((r) => r.parentId as number);
    }
    return byId;
  }

  // A new website buyer's agent. Default mode: the default agent. Round-robin:
  // the rotation agent longest without an automatic buyer, else the default
  // agent. Inactive users are skipped; nobody fits = unassigned. The pick and
  // its log entry happen under a MySQL lock, so the two API processes never
  // read the same "who's next".
  async autoAssign(tenantId: number, leadId: number): Promise<number | null> {
    const settings = await this.settingsService.get(tenantId);
    const active = new Set(
      (await this.users.find({ where: { tenantId, isActive: true, canLogin: true, worksBuyers: true, role: In(['admin', 'user']) }, select: ['id'] })).map((u) => u.id),
    );
    const fallback = settings.defaultAgentId && active.has(settings.defaultAgentId) ? settings.defaultAgentId : null;
    const rotation = settings.rotationAgentIds.filter((id) => active.has(id));
    if (settings.assignMode === 'default' || !rotation.length) {
      if (!fallback) return null;
      await this.setAgent(this.dataSource.manager, leadId, fallback, 'default');
      return fallback;
    }

    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    const lock = `spm_buyer_rr_${tenantId}`;
    try {
      await runner.query('SELECT GET_LOCK(?, 5)', [lock]);
      const rows: { agent: string | null; at: number | string }[] = await runner.query(
        `SELECT JSON_UNQUOTE(JSON_EXTRACT(a.metadata, '$.to')) AS agent, MAX(a.id) AS at
           FROM lead_activities a INNER JOIN leads l ON l.id = a.leadId
          WHERE l.tenantId = ? AND a.type = 'assignment' AND JSON_EXTRACT(a.metadata, '$.auto') = CAST('true' AS JSON)
          GROUP BY agent`,
        [tenantId],
      );
      const last = new Map<number, number>();
      for (const r of rows) if (r.agent) last.set(Number(r.agent), Number(r.at));
      const agent = pickRotationAgent(rotation, last);
      if (agent) await this.setAgent(runner.manager, leadId, agent, 'round_robin');
      return agent;
    } catch (err) {
      this.logger.warn(`Round-robin for tenant ${tenantId} failed: ${(err as Error).message}`);
      return null;
    } finally {
      await runner.query('SELECT RELEASE_LOCK(?)', [lock]).catch(() => undefined);
      await runner.release();
    }
  }

  private async setAgent(manager: DataSource['manager'], leadId: number, agentId: number, mode: 'default' | 'round_robin'): Promise<void> {
    await manager.update(Lead, { id: leadId }, { assignedTo: agentId });
    await manager.save(
      manager.create(LeadActivity, {
        leadId,
        userId: null,
        type: 'assignment',
        description: null,
        metadata: { from: null, to: agentId, auto: true, mode },
      }),
    );
  }

  private async log(leadId: number, type: LeadActivity['type'], description: string | null, metadata: Record<string, unknown>): Promise<void> {
    await this.activities.save(this.activities.create({ leadId, userId: null, type, description, metadata }));
    await this.leads.update(leadId, { lastActivityAt: new Date() });
  }
}
