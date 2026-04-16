import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ticket, TicketMessage, TicketStatus } from '../../database/entities';
import { CreateTicketDto, UpdateTicketDto, CreateMessageDto } from './dto';

@Injectable()
export class TicketService {
  constructor(
    @InjectRepository(Ticket)
    private ticketRepository: Repository<Ticket>,
    @InjectRepository(TicketMessage)
    private messageRepository: Repository<TicketMessage>,
  ) {}

  private async generateTicketNumber(): Promise<string> {
    const count = await this.ticketRepository.count();
    return `TKT-${String(count + 1).padStart(6, '0')}`;
  }

  async create(tenantId: number, userId: number, dto: CreateTicketDto): Promise<Ticket> {
    const ticketNumber = await this.generateTicketNumber();

    const ticket = this.ticketRepository.create({
      tenantId,
      userId,
      ticketNumber,
      subject: dto.subject,
      priority: dto.priority || 'medium',
      category: dto.category || 'general',
      status: 'open',
    });

    const savedTicket = await this.ticketRepository.save(ticket);

    // Create initial message
    const message = this.messageRepository.create({
      ticketId: savedTicket.id,
      userId,
      message: dto.message,
      isStaff: false,
    });

    await this.messageRepository.save(message);

    return this.findOne(tenantId, savedTicket.id);
  }

  async findAll(
    tenantId: number,
    options: {
      status?: TicketStatus;
      userId?: number;
      page?: number;
      limit?: number;
    } = {},
  ): Promise<{ data: Ticket[]; total: number }> {
    const { status, userId, page = 1, limit = 20 } = options;

    const query = this.ticketRepository
      .createQueryBuilder('ticket')
      .leftJoinAndSelect('ticket.user', 'user')
      .leftJoinAndSelect('ticket.assignedToUser', 'assignedTo')
      .where('ticket.tenantId = :tenantId', { tenantId });

    if (status) {
      query.andWhere('ticket.status = :status', { status });
    }

    if (userId) {
      query.andWhere('ticket.userId = :userId', { userId });
    }

    query.orderBy('ticket.createdAt', 'DESC');

    const [data, total] = await query
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total };
  }

  async findAllForSuperAdmin(
    options: {
      status?: TicketStatus;
      tenantId?: number;
      page?: number;
      limit?: number;
    } = {},
  ): Promise<{ data: Ticket[]; total: number }> {
    const { status, tenantId, page = 1, limit = 20 } = options;

    const query = this.ticketRepository
      .createQueryBuilder('ticket')
      .leftJoinAndSelect('ticket.tenant', 'tenant')
      .leftJoinAndSelect('ticket.user', 'user')
      .leftJoinAndSelect('ticket.assignedToUser', 'assignedTo');

    if (status) {
      query.andWhere('ticket.status = :status', { status });
    }

    if (tenantId) {
      query.andWhere('ticket.tenantId = :tenantId', { tenantId });
    }

    query.orderBy('ticket.createdAt', 'DESC');

    const [data, total] = await query
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total };
  }

  async findOne(tenantId: number, id: number): Promise<Ticket> {
    const ticket = await this.ticketRepository.findOne({
      where: { id, tenantId },
      relations: ['user', 'assignedToUser', 'messages', 'messages.user'],
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    return ticket;
  }

  async update(
    tenantId: number,
    id: number,
    dto: UpdateTicketDto,
    userId: number,
    isSuperAdmin: boolean,
  ): Promise<Ticket> {
    const ticket = await this.findOne(tenantId, id);

    // Only super admin can update status and assignment
    if (!isSuperAdmin && (dto.status || dto.assignedTo !== undefined)) {
      throw new ForbiddenException('Only admins can update ticket status or assignment');
    }

    if (dto.status) {
      ticket.status = dto.status;

      if (dto.status === 'resolved') {
        ticket.resolvedAt = new Date();
      } else if (dto.status === 'closed') {
        ticket.closedAt = new Date();
      }
    }

    if (dto.priority) {
      ticket.priority = dto.priority;
    }

    if (dto.assignedTo !== undefined) {
      ticket.assignedTo = dto.assignedTo;
    }

    return this.ticketRepository.save(ticket);
  }

  async addMessage(
    tenantId: number,
    ticketId: number,
    userId: number,
    dto: CreateMessageDto,
    isStaff: boolean,
  ): Promise<TicketMessage> {
    const ticket = await this.findOne(tenantId, ticketId);

    const message = this.messageRepository.create({
      ticketId: ticket.id,
      userId,
      message: dto.message,
      attachments: dto.attachments,
      isStaff,
      isInternal: dto.isInternal || false,
    });

    const savedMessage = await this.messageRepository.save(message);

    // Update ticket last reply time
    ticket.lastReplyAt = new Date();

    // Track first response time
    if (isStaff && !ticket.firstResponseAt) {
      ticket.firstResponseAt = new Date();
    }

    // Update status based on who replied
    if (isStaff && ticket.status === 'open') {
      ticket.status = 'in_progress';
    } else if (!isStaff && ticket.status === 'waiting_customer') {
      ticket.status = 'in_progress';
    }

    await this.ticketRepository.save(ticket);

    return savedMessage;
  }

  async getStats(tenantId?: number): Promise<{
    open: number;
    inProgress: number;
    waitingCustomer: number;
    resolved: number;
    closed: number;
  }> {
    const query = this.ticketRepository.createQueryBuilder('ticket');

    if (tenantId) {
      query.where('ticket.tenantId = :tenantId', { tenantId });
    }

    const stats = await query
      .select('ticket.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('ticket.status')
      .getRawMany();

    const result = {
      open: 0,
      inProgress: 0,
      waitingCustomer: 0,
      resolved: 0,
      closed: 0,
    };

    for (const stat of stats) {
      const key = stat.status.replace('_', '') as keyof typeof result;
      if (stat.status === 'in_progress') {
        result.inProgress = parseInt(stat.count);
      } else if (stat.status === 'waiting_customer') {
        result.waitingCustomer = parseInt(stat.count);
      } else {
        result[stat.status as keyof typeof result] = parseInt(stat.count);
      }
    }

    return result;
  }
}
