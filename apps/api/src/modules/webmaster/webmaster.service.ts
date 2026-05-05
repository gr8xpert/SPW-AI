import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { TimeEntry, Ticket, User, Tenant } from '../../database/entities';
import { CreateTimeEntryDto, UpdateTimeEntryDto, CreateWebmasterDto, UpdateWebmasterDto } from './dto';
import { UserRole } from '@spm/shared';
import { TicketNotificationService } from '../ticket/ticket-notification.service';
import * as bcrypt from 'bcrypt';

export interface TimeEntrySummary {
  totalHours: number;
  paidHours: number;
  unpaidHours: number;
  entries: TimeEntry[];
}

export interface WebmasterStats {
  totalHoursThisMonth: number;
  totalHoursAllTime: number;
  activeTickets: number;
  completedTickets: number;
}

@Injectable()
export class WebmasterService {
  private readonly logger = new Logger(WebmasterService.name);

  constructor(
    @InjectRepository(TimeEntry)
    private timeEntryRepository: Repository<TimeEntry>,
    @InjectRepository(Ticket)
    private ticketRepository: Repository<Ticket>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Tenant)
    private tenantRepository: Repository<Tenant>,
    private readonly ticketNotifications: TicketNotificationService,
  ) {}

  /**
   * Get all webmasters (super admin function)
   */
  async getWebmasters(): Promise<User[]> {
    return this.userRepository.find({
      where: { role: UserRole.WEBMASTER },
      select: ['id', 'email', 'name', 'isActive', 'lastLoginAt', 'createdAt'],
      order: { name: 'ASC' },
    });
  }

  /**
   * Get webmaster dashboard stats
   */
  async getWebmasterStats(userId: number): Promise<WebmasterStats> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Hours this month
    const monthlyEntries = await this.timeEntryRepository.find({
      where: {
        userId,
        createdAt: MoreThanOrEqual(startOfMonth),
      },
    });

    const totalHoursThisMonth = monthlyEntries.reduce(
      (sum, entry) => sum + Number(entry.hours),
      0,
    );

    // All time hours
    const allEntries = await this.timeEntryRepository.find({
      where: { userId },
    });

    const totalHoursAllTime = allEntries.reduce(
      (sum, entry) => sum + Number(entry.hours),
      0,
    );

    // Active tickets assigned to this webmaster
    const activeTickets = await this.ticketRepository.count({
      where: {
        assignedTo: userId,
        status: 'in_progress',
      },
    });

    // Completed tickets (resolved or closed)
    const completedTickets = await this.ticketRepository.count({
      where: [
        { assignedTo: userId, status: 'resolved' },
        { assignedTo: userId, status: 'closed' },
      ],
    });

    return {
      totalHoursThisMonth,
      totalHoursAllTime,
      activeTickets,
      completedTickets,
    };
  }

  /**
   * Get tickets assigned to a webmaster
   */
  async getAssignedTickets(userId: number): Promise<Ticket[]> {
    return this.ticketRepository.find({
      where: { assignedTo: userId },
      relations: ['tenant', 'user'],
      order: {
        priority: 'DESC',
        createdAt: 'DESC',
      },
    });
  }

  /**
   * Book time entry for a ticket
   */
  async createTimeEntry(
    userId: number,
    dto: CreateTimeEntryDto,
  ): Promise<TimeEntry> {
    // Verify ticket exists and is assigned to this webmaster
    const ticket = await this.ticketRepository.findOne({
      where: { id: dto.ticketId },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    if (ticket.assignedTo !== userId) {
      throw new ForbiddenException('Ticket is not assigned to you');
    }

    const timeEntry = this.timeEntryRepository.create({
      ticketId: dto.ticketId,
      userId,
      hours: dto.hours,
      description: dto.description,
      workDate: dto.workDate ? new Date(dto.workDate) : new Date(),
      isPaid: false,
    });

    return this.timeEntryRepository.save(timeEntry);
  }

  /**
   * Update a time entry
   */
  async updateTimeEntry(
    userId: number,
    entryId: number,
    dto: UpdateTimeEntryDto,
  ): Promise<TimeEntry> {
    const entry = await this.timeEntryRepository.findOne({
      where: { id: entryId, userId },
    });

    if (!entry) {
      throw new NotFoundException('Time entry not found');
    }

    if (entry.isPaid) {
      throw new BadRequestException('Cannot modify paid time entries');
    }

    if (dto.hours !== undefined) entry.hours = dto.hours;
    if (dto.description !== undefined) entry.description = dto.description;
    if (dto.workDate !== undefined) entry.workDate = new Date(dto.workDate);

    return this.timeEntryRepository.save(entry);
  }

  /**
   * Delete a time entry
   */
  async deleteTimeEntry(userId: number, entryId: number): Promise<void> {
    const entry = await this.timeEntryRepository.findOne({
      where: { id: entryId, userId },
    });

    if (!entry) {
      throw new NotFoundException('Time entry not found');
    }

    if (entry.isPaid) {
      throw new BadRequestException('Cannot delete paid time entries');
    }

    await this.timeEntryRepository.delete(entryId);
  }

  /**
   * Get time entries for a webmaster
   */
  async getTimeEntries(
    userId: number,
    dateFrom?: string,
    dateTo?: string,
  ): Promise<TimeEntrySummary> {
    const where: any = { userId };

    if (dateFrom && dateTo) {
      where.createdAt = Between(new Date(dateFrom), new Date(dateTo));
    } else if (dateFrom) {
      where.createdAt = MoreThanOrEqual(new Date(dateFrom));
    } else if (dateTo) {
      where.createdAt = LessThanOrEqual(new Date(dateTo));
    }

    const entries = await this.timeEntryRepository.find({
      where,
      relations: ['ticket', 'ticket.tenant'],
      order: { createdAt: 'DESC' },
    });

    const totalHours = entries.reduce((sum, e) => sum + Number(e.hours), 0);
    const paidHours = entries
      .filter((e) => e.isPaid)
      .reduce((sum, e) => sum + Number(e.hours), 0);
    const unpaidHours = totalHours - paidHours;

    return {
      totalHours,
      paidHours,
      unpaidHours,
      entries,
    };
  }

  /**
   * Get time entries for a specific ticket
   */
  async getTicketTimeEntries(ticketId: number): Promise<TimeEntry[]> {
    return this.timeEntryRepository.find({
      where: { ticketId },
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Mark time entries as paid (super admin function)
   */
  async markEntriesAsPaid(entryIds: number[]): Promise<number> {
    const result = await this.timeEntryRepository.update(
      entryIds,
      { isPaid: true },
    );
    return result.affected || 0;
  }

  /**
   * Get unpaid hours summary by webmaster (super admin function)
   */
  async getUnpaidHoursSummary(): Promise<Array<{ userId: number; userName: string; totalHours: number; entryCount: number }>> {
    const webmasters = await this.getWebmasters();

    const summary = await Promise.all(
      webmasters.map(async (wm) => {
        const entries = await this.timeEntryRepository.find({
          where: { userId: wm.id, isPaid: false },
        });
        const totalHours = entries.reduce((sum, e) => sum + Number(e.hours), 0);
        return {
          userId: wm.id,
          userName: wm.name || wm.email,
          totalHours,
          entryCount: entries.length,
        };
      }),
    );

    return summary.filter((s) => s.totalHours > 0);
  }

  /**
   * Assign ticket to webmaster
   */
  async assignTicket(
    ticketId: number,
    webmasterId: number | null,
  ): Promise<Ticket> {
    const ticket = await this.ticketRepository.findOne({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    let webmaster: User | null = null;
    if (webmasterId !== null) {
      webmaster = await this.userRepository.findOne({
        where: { id: webmasterId, role: UserRole.WEBMASTER },
      });

      if (!webmaster) {
        throw new NotFoundException('Webmaster not found');
      }
    }

    (ticket as any).assignedTo = webmasterId;
    if (webmasterId !== null && ticket.status === 'open') {
      ticket.status = 'in_progress';
    }

    const saved = await this.ticketRepository.save(ticket);

    if (webmaster) {
      this.ticketNotifications.notifyTicketAssigned(saved, webmaster).catch((err) =>
        this.logger.error(`Failed to send assignment notification: ${err.message}`),
      );
    }

    return saved;
  }

  /**
   * Reassign ticket back to super admin (complete webmaster work)
   */
  async completeTicketWork(
    ticketId: number,
    userId: number,
  ): Promise<Ticket> {
    const ticket = await this.ticketRepository.findOne({
      where: { id: ticketId, assignedTo: userId },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found or not assigned to you');
    }

    // Set to waiting for super admin review
    ticket.status = 'waiting_customer';

    return this.ticketRepository.save(ticket);
  }

  /**
   * Create a new webmaster account (super admin function)
   */
  async createWebmaster(dto: CreateWebmasterDto): Promise<User> {
    const existing = await this.userRepository.findOne({
      where: { email: dto.email.toLowerCase() },
    });
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }

    const platform = await this.tenantRepository.findOne({ where: { slug: 'platform' } });
    if (!platform) {
      throw new BadRequestException('Platform tenant not found — run seed first');
    }

    const passwordHash = await bcrypt.hash(dto.password, 13);
    const user = this.userRepository.create({
      tenantId: platform.id,
      email: dto.email.toLowerCase(),
      name: dto.name,
      passwordHash,
      role: UserRole.WEBMASTER,
      isActive: true,
      emailVerifiedAt: new Date(),
    });

    const saved = await this.userRepository.save(user);
    const { passwordHash: _, ...result } = saved as any;
    return result;
  }

  /**
   * Update a webmaster account (super admin function)
   */
  async updateWebmaster(id: number, dto: UpdateWebmasterDto): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id, role: UserRole.WEBMASTER },
    });
    if (!user) {
      throw new NotFoundException('Webmaster not found');
    }

    if (dto.name !== undefined) user.name = dto.name;
    if (dto.email !== undefined) user.email = dto.email.toLowerCase();
    if (dto.isActive !== undefined) user.isActive = dto.isActive;
    if (dto.password) {
      user.passwordHash = await bcrypt.hash(dto.password, 13);
    }

    const saved = await this.userRepository.save(user);
    const { passwordHash: _, ...result } = saved as any;
    return result;
  }
}
