import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ticket, TicketMessage, TicketStatus, User } from '../../database/entities';
import { UserRole } from '@spm/shared';
import { CreateTicketDto, UpdateTicketDto, CreateMessageDto } from './dto';
import { TicketNotificationService } from './ticket-notification.service';

@Injectable()
export class TicketService {
  private readonly logger = new Logger(TicketService.name);

  constructor(
    @InjectRepository(Ticket)
    private ticketRepository: Repository<Ticket>,
    @InjectRepository(TicketMessage)
    private messageRepository: Repository<TicketMessage>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private readonly notifications: TicketNotificationService,
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

    const message = this.messageRepository.create({
      ticket: { id: savedTicket.id } as Ticket,
      userId,
      message: dto.message,
      attachments: (dto.attachments as any) || null,
      isStaff: false,
    });

    await this.messageRepository.save(message);

    const fullTicket = await this.findOne(tenantId, savedTicket.id);

    this.notifications.notifyTicketCreated(fullTicket, dto.message).catch((err) =>
      this.logger.error(`Failed to send ticket creation notification: ${err.message}`),
    );

    return fullTicket;
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

    query
      .loadRelationCountAndMap('ticket.messagesCount', 'ticket.messages')
      .orderBy('ticket.createdAt', 'DESC');

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

    query
      .loadRelationCountAndMap('ticket.messagesCount', 'ticket.messages')
      .orderBy('ticket.createdAt', 'DESC');

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

  async findOneForSuperAdmin(id: number): Promise<Ticket> {
    const ticket = await this.ticketRepository.findOne({
      where: { id },
      relations: ['tenant', 'user', 'assignedToUser', 'messages', 'messages.user'],
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

    const previousAssignee = ticket.assignedTo;
    if (dto.assignedTo !== undefined) {
      ticket.assignedTo = dto.assignedTo;
    }

    const saved = await this.ticketRepository.save(ticket);

    // WebmasterService.assignTicket fires the assignment email from its own
    // endpoint, but PUT /api/dashboard/tickets/:id and PUT /api/super-admin/
    // tickets/:tenantId/:id/assign both flow through here — without this
    // dispatch, those paths silently skip the webmaster notification.
    if (
      dto.assignedTo !== undefined &&
      dto.assignedTo !== null &&
      dto.assignedTo !== previousAssignee
    ) {
      const webmaster = await this.userRepository.findOne({
        where: { id: dto.assignedTo },
        select: ['id', 'email', 'name'],
      });
      if (webmaster) {
        this.notifications.notifyTicketAssigned(saved, webmaster).catch((err) =>
          this.logger.error(`Failed to send assignment notification: ${err.message}`),
        );
      }
    }

    return saved;
  }

  // Add a message on behalf of an inbound email. The caller has already
  // authenticated the sender (matching From → user record) and validated the
  // reply-to token, so we skip the tenant-scope check here and trust the
  // ticketId directly. Auto-detects isStaff from the sender's role.
  async createInboundMessage(
    ticketId: number,
    sender: User,
    text: string,
  ): Promise<TicketMessage | null> {
    const ticket = await this.ticketRepository.findOne({ where: { id: ticketId } });
    if (!ticket) return null;

    // Only platform-level roles are staff. Tenant admins (role='admin')
    // are customers even when replying to their own ticket — matches the
    // dashboard controller's classification so message polarity stays
    // consistent across web-UI replies and email replies.
    const isStaff =
      sender.role === UserRole.SUPER_ADMIN || sender.role === UserRole.WEBMASTER;

    const insertResult = await this.messageRepository
      .createQueryBuilder()
      .insert()
      .into(TicketMessage)
      .values({
        ticketId: ticket.id,
        userId: sender.id,
        message: text,
        attachments: null as any,
        isStaff,
        isInternal: false,
      })
      .execute();

    const savedMessage = await this.messageRepository.findOne({
      where: { id: insertResult.generatedMaps[0].id as number },
      relations: ['user'],
    });

    const updateFields: Partial<Ticket> = { lastReplyAt: new Date() };
    if (isStaff && !ticket.firstResponseAt) updateFields.firstResponseAt = new Date();
    if (isStaff && ticket.status === 'open') updateFields.status = 'in_progress' as TicketStatus;
    else if (!isStaff && ticket.status === 'waiting_customer')
      updateFields.status = 'in_progress' as TicketStatus;
    await this.ticketRepository.update(ticket.id, updateFields);

    if (savedMessage) {
      const senderName = sender.name || sender.email;
      this.notifications.notifyTicketReply(ticket, savedMessage, senderName).catch((err) =>
        this.logger.error(`Failed to send reply notification: ${err.message}`),
      );
    }

    return savedMessage;
  }

  async addMessage(
    tenantId: number,
    ticketId: number,
    userId: number,
    dto: CreateMessageDto,
    isStaff: boolean,
  ): Promise<TicketMessage> {
    const ticket = await this.ticketRepository.findOne({
      where: { id: ticketId, tenantId },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');

    const insertResult = await this.messageRepository
      .createQueryBuilder()
      .insert()
      .into(TicketMessage)
      .values({
        ticketId: ticket.id,
        userId,
        message: dto.message,
        attachments: (dto.attachments as any) || null,
        isStaff,
        isInternal: dto.isInternal || false,
      })
      .execute();

    const savedMessage = await this.messageRepository.findOne({
      where: { id: insertResult.generatedMaps[0].id as number },
      relations: ['user'],
    });

    const updateFields: Partial<Ticket> = { lastReplyAt: new Date() };

    if (isStaff && !ticket.firstResponseAt) {
      updateFields.firstResponseAt = new Date();
    }

    if (isStaff && ticket.status === 'open') {
      updateFields.status = 'in_progress' as TicketStatus;
    } else if (!isStaff && ticket.status === 'waiting_customer') {
      updateFields.status = 'in_progress' as TicketStatus;
    }

    await this.ticketRepository.update(ticket.id, updateFields);

    if (savedMessage && !dto.isInternal) {
      const senderName = savedMessage.user?.name || savedMessage.user?.email || (isStaff ? 'Support' : 'Customer');
      this.notifications.notifyTicketReply(ticket, savedMessage, senderName).catch((err) =>
        this.logger.error(`Failed to send reply notification: ${err.message}`),
      );
    }

    return savedMessage!;
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
