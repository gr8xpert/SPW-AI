import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { TimeEntry, Ticket, User } from '../../database/entities';
import { CreateTimeEntryDto, UpdateTimeEntryDto } from './dto';
import { UserRole } from '@spw/shared';

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
  constructor(
    @InjectRepository(TimeEntry)
    private timeEntryRepository: Repository<TimeEntry>,
    @InjectRepository(Ticket)
    private ticketRepository: Repository<Ticket>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
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
  async getUnpaidHoursSummary(): Promise<Array<{ userId: number; userName: string; unpaidHours: number }>> {
    const webmasters = await this.getWebmasters();

    const summary = await Promise.all(
      webmasters.map(async (wm) => {
        const entries = await this.timeEntryRepository.find({
          where: { userId: wm.id, isPaid: false },
        });
        const unpaidHours = entries.reduce((sum, e) => sum + Number(e.hours), 0);
        return {
          userId: wm.id,
          userName: wm.name || wm.email,
          unpaidHours,
        };
      }),
    );

    return summary.filter((s) => s.unpaidHours > 0);
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

    // Verify webmaster exists if assigning
    if (webmasterId !== null) {
      const webmaster = await this.userRepository.findOne({
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

    return this.ticketRepository.save(ticket);
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
}
