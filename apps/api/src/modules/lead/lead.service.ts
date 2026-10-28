import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lead, LeadActivity } from '../../database/entities';

// Website-form helpers and the dashboard home tile. Since Buyer Match a
// lead is a buyer record, one per email; website visitors arrive through
// BuyerIntakeService (./buyer) and the dashboard side lives there too.
@Injectable()
export class LeadService {
  constructor(
    @InjectRepository(Lead)
    private leadRepository: Repository<Lead>,
    @InjectRepository(LeadActivity)
    private activityRepository: Repository<LeadActivity>,
  ) {}

  // The website key a lead first enquired on (see Lead.apiKeyId). Only set
  // once, so a buyer who later enquires on the main site keeps their first site.
  async markWebsiteKey(leadId: number, apiKeyId: number | null | undefined): Promise<void> {
    if (!apiKeyId) return;
    await this.leadRepository
      .createQueryBuilder()
      .update(Lead)
      .set({ apiKeyId })
      .where('id = :leadId AND apiKeyId IS NULL', { leadId })
      .execute();
  }

  // Duplicate-inquiry guard used by the public widget endpoints (review
  // P1-09). Returns an existing lead created within `windowMs` for the same
  // (tenantId, email, propertyId) so a refresh-spamming visitor or a
  // double-clicked submit button doesn't pile up identical leads — and the
  // tenant doesn't get N copies of the same notification email.
  //
  // propertyId is part of the dedupe key, so the same visitor can legitimately
  // inquire about two different listings within the window.
  async findRecentDuplicateInquiry(
    tenantId: number,
    email: string,
    propertyId: number | null | undefined,
    windowMs: number,
  ): Promise<Lead | null> {
    if (!email) return null;
    const threshold = new Date(Date.now() - windowMs);
    const email_ = email.toLowerCase();
    // An enquiry on an existing buyer is an activity, not a new lead row.
    const activity = await this.activityRepository
      .createQueryBuilder('a')
      .innerJoin('a.lead', 'lead')
      .innerJoin('lead.contact', 'contact')
      .where('lead.tenantId = :tenantId', { tenantId })
      .andWhere('contact.email = :email', { email: email_ })
      .andWhere('a.type = :type', { type: 'enquiry' })
      .andWhere('a.createdAt >= :threshold', { threshold })
      .andWhere(
        propertyId == null ? "JSON_EXTRACT(a.metadata, '$.propertyId') IS NULL" : "JSON_EXTRACT(a.metadata, '$.propertyId') = :propertyId",
        { propertyId },
      )
      .select(['a.id', 'a.leadId'])
      .getOne();
    if (activity) return this.leadRepository.findOne({ where: { id: activity.leadId } });

    const qb = this.leadRepository
      .createQueryBuilder('lead')
      .innerJoin('lead.contact', 'contact')
      .where('lead.tenantId = :tenantId', { tenantId })
      .andWhere('contact.email = :email', { email: email_ })
      .andWhere('lead.createdAt >= :threshold', { threshold });
    if (propertyId == null) {
      qb.andWhere('lead.propertyId IS NULL');
    } else {
      qb.andWhere('lead.propertyId = :propertyId', { propertyId });
    }
    return qb.orderBy('lead.createdAt', 'DESC').getOne();
  }

  // Dashboard home: buyers (one per email), not raw lead rows.
  async getStats(tenantId: number): Promise<{ total: number; open: number }> {
    const rows = await this.leadRepository
      .createQueryBuilder('lead')
      .select('COUNT(*)', 'total')
      .addSelect("SUM(CASE WHEN lead.status IN ('won','lost') THEN 0 ELSE 1 END)", 'open')
      .where('lead.tenantId = :tenantId', { tenantId })
      .andWhere('lead.mergedIntoId IS NULL')
      // Matches the Contacts list: new website leads count once sorted.
      .andWhere('lead.isNewLead = 0')
      .getRawOne<{ total: string; open: string | null }>();
    return { total: Number(rows?.total ?? 0), open: Number(rows?.open ?? 0) };
  }
}
