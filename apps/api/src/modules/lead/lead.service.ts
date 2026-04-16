import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lead, LeadActivity, LeadStatus } from '../../database/entities';
import { ContactService } from '../contact/contact.service';
import { LeadScoringService } from './lead-scoring.service';
import { CreateLeadDto, UpdateLeadDto, CreateActivityDto } from './dto';

@Injectable()
export class LeadService {
  constructor(
    @InjectRepository(Lead)
    private leadRepository: Repository<Lead>,
    @InjectRepository(LeadActivity)
    private activityRepository: Repository<LeadActivity>,
    private contactService: ContactService,
    private scoringService: LeadScoringService,
  ) {}

  async create(
    tenantId: number,
    userId: number,
    dto: CreateLeadDto,
  ): Promise<Lead> {
    // Find or create contact
    const contact = await this.contactService.findOrCreate(tenantId, {
      email: dto.email,
      name: dto.name,
      phone: dto.phone,
      source: 'inquiry',
      sourcePropertyId: dto.propertyId,
    });

    const lead = this.leadRepository.create({
      tenantId,
      contactId: contact.id,
      propertyId: dto.propertyId,
      source: dto.source || 'widget_inquiry',
      status: 'new',
      assignedTo: dto.assignedTo,
      budgetMin: dto.budgetMin,
      budgetMax: dto.budgetMax,
      budgetCurrency: dto.budgetCurrency || 'EUR',
      preferredLocations: dto.preferredLocations,
      preferredTypes: dto.preferredTypes,
    });

    const savedLead = await this.leadRepository.save(lead);

    // Create initial activity if message provided
    if (dto.message) {
      await this.addActivity(tenantId, savedLead.id, userId, {
        type: 'note',
        description: `Initial inquiry: ${dto.message}`,
      });
    }

    return this.findOne(tenantId, savedLead.id);
  }

  async findAll(
    tenantId: number,
    options: {
      status?: LeadStatus;
      assignedTo?: number;
      page?: number;
      limit?: number;
    } = {},
  ): Promise<{ data: Lead[]; total: number }> {
    const { status, assignedTo, page = 1, limit = 20 } = options;

    const query = this.leadRepository
      .createQueryBuilder('lead')
      .leftJoinAndSelect('lead.contact', 'contact')
      .leftJoinAndSelect('lead.property', 'property')
      .leftJoinAndSelect('lead.assignedToUser', 'assignedTo')
      .where('lead.tenantId = :tenantId', { tenantId });

    if (status) {
      query.andWhere('lead.status = :status', { status });
    }

    if (assignedTo) {
      query.andWhere('lead.assignedTo = :assignedTo', { assignedTo });
    }

    query.orderBy('lead.createdAt', 'DESC');

    const [data, total] = await query
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total };
  }

  async findByPipeline(tenantId: number): Promise<Record<LeadStatus, Lead[]>> {
    const leads = await this.leadRepository.find({
      where: { tenantId },
      relations: ['contact', 'property', 'assignedToUser'],
      order: { createdAt: 'DESC' },
    });

    const pipeline: Record<LeadStatus, Lead[]> = {
      new: [],
      contacted: [],
      qualified: [],
      viewing_scheduled: [],
      offer_made: [],
      negotiating: [],
      won: [],
      lost: [],
    };

    for (const lead of leads) {
      pipeline[lead.status].push(lead);
    }

    return pipeline;
  }

  async findOne(tenantId: number, id: number): Promise<Lead> {
    const lead = await this.leadRepository.findOne({
      where: { id, tenantId },
      relations: ['contact', 'property', 'assignedToUser', 'activities', 'activities.user'],
    });

    if (!lead) {
      throw new NotFoundException('Lead not found');
    }

    // Calculate and update score
    const score = this.scoringService.calculateScore(lead, lead.activities);
    if (score !== lead.score) {
      lead.score = score;
      await this.leadRepository.save(lead);
    }

    return lead;
  }

  async update(
    tenantId: number,
    id: number,
    userId: number,
    dto: UpdateLeadDto,
  ): Promise<Lead> {
    const lead = await this.findOne(tenantId, id);
    const oldStatus = lead.status;

    // Handle status changes
    if (dto.status && dto.status !== oldStatus) {
      if (dto.status === 'won') {
        lead.wonAt = new Date();
        lead.wonPropertyId = dto.wonPropertyId ?? null;
        lead.wonAmount = dto.wonAmount ?? null;
      } else if (dto.status === 'lost') {
        lead.lostAt = new Date();
        lead.lostReason = dto.lostReason ?? null;
      }

      // Log status change activity
      await this.addActivity(tenantId, id, userId, {
        type: 'status_change',
        description: `Status changed from ${oldStatus} to ${dto.status}`,
        metadata: { oldStatus, newStatus: dto.status },
      });
    }

    // Handle assignment changes
    if (dto.assignedTo !== undefined && dto.assignedTo !== lead.assignedTo) {
      await this.addActivity(tenantId, id, userId, {
        type: 'assignment',
        description: `Lead assigned to user ${dto.assignedTo}`,
        metadata: { oldAssignee: lead.assignedTo, newAssignee: dto.assignedTo },
      });
    }

    // Update lead
    Object.assign(lead, {
      status: dto.status,
      assignedTo: dto.assignedTo,
      budgetMin: dto.budgetMin,
      budgetMax: dto.budgetMax,
      budgetCurrency: dto.budgetCurrency,
      preferredLocations: dto.preferredLocations,
      preferredTypes: dto.preferredTypes,
      preferredFeatures: dto.preferredFeatures,
      preferredBedroomsMin: dto.preferredBedroomsMin,
      preferredBedroomsMax: dto.preferredBedroomsMax,
      notes: dto.notes,
      nextFollowUp: dto.nextFollowUp ? new Date(dto.nextFollowUp) : lead.nextFollowUp,
    });

    return this.leadRepository.save(lead);
  }

  async addActivity(
    tenantId: number,
    leadId: number,
    userId: number,
    dto: CreateActivityDto,
  ): Promise<LeadActivity> {
    const lead = await this.findOne(tenantId, leadId);

    const activity = this.activityRepository.create({
      leadId: lead.id,
      userId,
      type: dto.type,
      description: dto.description,
      metadata: dto.metadata,
    });

    const savedActivity = await this.activityRepository.save(activity);

    // Update last contact time for relevant activity types
    if (['call', 'email', 'sms', 'viewing', 'meeting'].includes(dto.type)) {
      lead.lastContactAt = new Date();
      await this.leadRepository.save(lead);
    }

    // Recalculate score
    const activities = await this.activityRepository.find({
      where: { leadId: lead.id },
    });
    lead.score = this.scoringService.calculateScore(lead, activities);
    await this.leadRepository.save(lead);

    return savedActivity;
  }

  async getActivities(
    tenantId: number,
    leadId: number,
  ): Promise<LeadActivity[]> {
    await this.findOne(tenantId, leadId); // Verify lead exists

    return this.activityRepository.find({
      where: { leadId },
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });
  }

  async getStats(tenantId: number): Promise<{
    total: number;
    byStatus: Record<string, number>;
    conversionRate: number;
    avgScore: number;
  }> {
    const leads = await this.leadRepository.find({
      where: { tenantId },
    });

    const byStatus: Record<string, number> = {};
    let totalScore = 0;

    for (const lead of leads) {
      byStatus[lead.status] = (byStatus[lead.status] || 0) + 1;
      totalScore += lead.score;
    }

    const totalLeads = leads.length || 1;
    const wonLeads = byStatus['won'] || 0;

    return {
      total: leads.length,
      byStatus,
      conversionRate: Math.round((wonLeads / totalLeads) * 100),
      avgScore: Math.round(totalScore / totalLeads),
    };
  }
}
