import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { BuyerRole } from '@spm/shared';
import { Lead, LeadActivity } from '../../../database/entities';
import { applyVisibility, BuyerViewer } from './buyer-access';
import { BuyerSettingsService } from './buyer-settings.service';
import { BuyerChangeLogService } from './buyer-change-log.service';

// New Leads: people a website form (enquiry, wishlist, Meta) created and
// nobody has given a role yet. Picking a role moves them into Contacts;
// spam is deleted outright. Open to every client, Buyer Match or not.

const FORM_TYPES: LeadActivity['type'][] = ['enquiry', 'wishlist_form'];

export interface NewLeadItem {
  id: number;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  source: Lead['source'];
  createdAt: Date;
  agent: { id: number; name: string | null } | null;
  // The form(s) they sent, newest first.
  forms: { type: LeadActivity['type']; message: string | null; metadata: Record<string, unknown> | null; createdAt: Date }[];
}

@Injectable()
export class NewLeadService {
  constructor(
    @InjectRepository(Lead) private readonly leads: Repository<Lead>,
    @InjectRepository(LeadActivity) private readonly activities: Repository<LeadActivity>,
    private readonly settingsService: BuyerSettingsService,
    private readonly changeLog: BuyerChangeLogService,
  ) {}

  private async base(tenantId: number, viewer: BuyerViewer) {
    const { agentsSeeAll } = await this.settingsService.get(tenantId);
    const qb = this.leads
      .createQueryBuilder('lead')
      .where('lead.tenantId = :tenantId', { tenantId })
      .andWhere('lead.isNewLead = 1')
      .andWhere('lead.mergedIntoId IS NULL')
      .andWhere('lead.erasedAt IS NULL');
    applyVisibility(qb, viewer, agentsSeeAll);
    return qb;
  }

  async count(tenantId: number, viewer: BuyerViewer): Promise<{ count: number }> {
    return { count: await (await this.base(tenantId, viewer)).getCount() };
  }

  async list(tenantId: number, viewer: BuyerViewer, page = 1, limit = 20): Promise<{ data: NewLeadItem[]; total: number; page: number; limit: number }> {
    const [rows, total] = await (await this.base(tenantId, viewer))
      .leftJoin('lead.contact', 'contact')
      .addSelect(['contact.id', 'contact.email'])
      .leftJoin('lead.assignedToUser', 'agent')
      .addSelect(['agent.id', 'agent.name'])
      .orderBy('lead.createdAt', 'DESC')
      .addOrderBy('lead.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const forms = rows.length
      ? await this.activities.find({
          where: { leadId: In(rows.map((r) => r.id)), type: In(FORM_TYPES) },
          order: { createdAt: 'DESC' },
          select: ['id', 'leadId', 'type', 'description', 'metadata', 'createdAt'],
        })
      : [];
    const byLead = new Map<number, NewLeadItem['forms']>();
    for (const f of forms) {
      const list = byLead.get(f.leadId) ?? [];
      list.push({ type: f.type, message: f.description, metadata: f.metadata, createdAt: f.createdAt });
      byLead.set(f.leadId, list);
    }

    const data = rows.map((l) => ({
      id: l.id,
      firstName: l.firstName,
      lastName: l.lastName,
      email: l.contact?.email ?? null,
      phone: l.phone ?? l.mobile ?? null,
      source: l.source,
      createdAt: l.createdAt,
      agent: l.assignedToUser ? { id: l.assignedToUser.id, name: l.assignedToUser.name } : null,
      forms: byLead.get(l.id) ?? [],
    }));
    return { data, total, page, limit };
  }

  private async findNew(tenantId: number, viewer: BuyerViewer, id: number): Promise<Lead> {
    const lead = await (await this.base(tenantId, viewer)).andWhere('lead.id = :id', { id }).getOne();
    if (!lead) throw new NotFoundException('This lead was already sorted or removed');
    return lead;
  }

  // The role decides what the person is; from here on they are a contact.
  async assignRole(tenantId: number, viewer: BuyerViewer, id: number, role: BuyerRole): Promise<{ id: number; role: BuyerRole }> {
    const lead = await this.findNew(tenantId, viewer, id);
    await this.leads.update(lead.id, { role, isNewLead: false });
    await this.changeLog.record(tenantId, lead.id, viewer.id, 'dashboard', [
      { field: 'role', from: lead.role, to: role },
      { field: 'newLead', from: 'new lead', to: 'contact' },
    ]);
    return { id: lead.id, role };
  }

  // Spam or a test: the record goes (its activities cascade). Only while it
  // is still a new lead, so a real contact can never be deleted from here.
  async remove(tenantId: number, viewer: BuyerViewer, id: number): Promise<{ deleted: number }> {
    const lead = await this.findNew(tenantId, viewer, id);
    if (!lead.isNewLead) throw new BadRequestException('Only new leads can be deleted here');
    await this.leads.delete({ id: lead.id, tenantId });
    return { deleted: lead.id };
  }
}
