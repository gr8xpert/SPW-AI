import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'crypto';
import { Repository } from 'typeorm';
import { User, Ticket, TicketMessage } from '../../database/entities';
import { SystemMailerService } from '../mail/system-mailer.service';
import { UserRole } from '@spm/shared';

@Injectable()
export class TicketNotificationService {
  private readonly logger = new Logger(TicketNotificationService.name);

  constructor(
    private readonly mailer: SystemMailerService,
    private readonly config: ConfigService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  // Reply-To for a ticket email. n8n (or Postmark/Mailgun inbound) parses
  // `ticket+<id>.<hmac>@<domain>` and posts to /api/internal/tickets/inbound.
  // The hmac binds the address to the ticket id — a leaked/stale address
  // can't be aimed at a different ticket. Returns null when the inbound
  // pipeline is disabled; outgoing mail then omits Reply-To.
  buildReplyToAddress(ticketId: number): string | null {
    const enabled = this.config.get<string>('INBOUND_EMAIL_ENABLED') === 'true';
    if (!enabled) return null;
    const domain = this.config.get<string>('INBOUND_EMAIL_DOMAIN');
    const secret = this.config.get<string>('INBOUND_EMAIL_HMAC_SECRET');
    if (!domain || !secret) return null;
    const token = crypto.createHmac('sha256', secret).update(String(ticketId)).digest('hex').slice(0, 12);
    return `ticket+${ticketId}.${token}@${domain}`;
  }

  async notifyTicketCreated(ticket: Ticket, firstMessage: string): Promise<void> {
    const superAdmins = await this.userRepository.find({
      where: { role: UserRole.SUPER_ADMIN, isActive: true },
      select: ['id', 'email', 'name'],
    });

    if (superAdmins.length === 0) {
      this.logger.warn('No active super admins to notify about new ticket');
      return;
    }

    const creatorName = ticket.user?.name || ticket.user?.email || 'A customer';
    const subject = `[New Ticket] ${ticket.ticketNumber}: ${ticket.subject}`;
    const preview = firstMessage.length > 300 ? firstMessage.slice(0, 300) + '...' : firstMessage;
    const replyTo = this.buildReplyToAddress(ticket.id) ?? undefined;

    for (const admin of superAdmins) {
      await this.mailer.send({
        to: admin.email,
        subject,
        replyTo,
        html: `
          <h2>New Support Ticket</h2>
          <p><strong>${creatorName}</strong> submitted a new ticket.</p>
          <table style="border-collapse:collapse;margin:16px 0">
            <tr><td style="padding:4px 12px 4px 0;color:#666">Ticket</td><td style="padding:4px 0"><strong>${ticket.ticketNumber}</strong></td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#666">Subject</td><td style="padding:4px 0">${ticket.subject}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#666">Priority</td><td style="padding:4px 0">${ticket.priority}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#666">Category</td><td style="padding:4px 0">${ticket.category}</td></tr>
          </table>
          <div style="background:#f5f5f5;padding:12px;border-radius:6px;margin:16px 0">
            <p style="margin:0;white-space:pre-wrap">${this.escapeHtml(preview)}</p>
          </div>
          <p>Please assign this ticket to a webmaster in the admin panel.</p>
        `,
        text: `New Support Ticket\n\n${creatorName} submitted ticket ${ticket.ticketNumber}: ${ticket.subject}\nPriority: ${ticket.priority}\nCategory: ${ticket.category}\n\n${preview}\n\nPlease assign this ticket to a webmaster.`,
      });
    }

    this.logger.log(`Notified ${superAdmins.length} super admin(s) about ticket ${ticket.ticketNumber}`);
  }

  async notifyTicketAssigned(ticket: Ticket, webmaster: User): Promise<void> {
    const subject = `[Ticket Assigned] ${ticket.ticketNumber}: ${ticket.subject}`;
    const replyTo = this.buildReplyToAddress(ticket.id) ?? undefined;

    await this.mailer.send({
      to: webmaster.email,
      subject,
      replyTo,
      html: `
        <h2>Ticket Assigned to You</h2>
        <p>You have been assigned a support ticket.</p>
        <table style="border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:4px 12px 4px 0;color:#666">Ticket</td><td style="padding:4px 0"><strong>${ticket.ticketNumber}</strong></td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#666">Subject</td><td style="padding:4px 0">${ticket.subject}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#666">Priority</td><td style="padding:4px 0">${ticket.priority}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#666">Category</td><td style="padding:4px 0">${ticket.category}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#666">Tenant</td><td style="padding:4px 0">${ticket.tenantId}</td></tr>
        </table>
        <p>Please review and respond to the customer.</p>
      `,
      text: `Ticket Assigned to You\n\nTicket ${ticket.ticketNumber}: ${ticket.subject}\nPriority: ${ticket.priority}\nCategory: ${ticket.category}\nTenant: ${ticket.tenantId}\n\nPlease review and respond.`,
    });

    this.logger.log(`Notified webmaster ${webmaster.email} about assigned ticket ${ticket.ticketNumber}`);
  }

  async notifyTicketReply(
    ticket: Ticket,
    message: TicketMessage,
    senderName: string,
  ): Promise<void> {
    const preview = message.message.length > 300 ? message.message.slice(0, 300) + '...' : message.message;
    const subject = `[Re: ${ticket.ticketNumber}] ${ticket.subject}`;
    const replyTo = this.buildReplyToAddress(ticket.id) ?? undefined;

    if (message.isStaff) {
      const creator = await this.userRepository.findOne({
        where: { id: ticket.userId },
        select: ['id', 'email', 'name'],
      });
      if (!creator) return;

      await this.mailer.send({
        to: creator.email,
        subject,
        replyTo,
        html: `
          <h2>New Reply on Your Ticket</h2>
          <p><strong>${this.escapeHtml(senderName)}</strong> replied to your ticket <strong>${ticket.ticketNumber}</strong>.</p>
          <div style="background:#f5f5f5;padding:12px;border-radius:6px;margin:16px 0">
            <p style="margin:0;white-space:pre-wrap">${this.escapeHtml(preview)}</p>
          </div>
          <p>You can reply directly to this email — your response will be added to the ticket automatically.</p>
        `,
        text: `New Reply on Ticket ${ticket.ticketNumber}\n\n${senderName} replied:\n\n${preview}\n\nReply directly to this email to respond.`,
      });
    } else {
      if (ticket.assignedTo) {
        const webmaster = await this.userRepository.findOne({
          where: { id: ticket.assignedTo },
          select: ['id', 'email', 'name'],
        });
        if (webmaster) {
          await this.mailer.send({
            to: webmaster.email,
            subject,
            replyTo,
            html: `
              <h2>Customer Reply on ${ticket.ticketNumber}</h2>
              <p><strong>${this.escapeHtml(senderName)}</strong> replied to ticket <strong>${ticket.ticketNumber}</strong>.</p>
              <div style="background:#f5f5f5;padding:12px;border-radius:6px;margin:16px 0">
                <p style="margin:0;white-space:pre-wrap">${this.escapeHtml(preview)}</p>
              </div>
              <p>Reply directly to this email to respond to the customer.</p>
            `,
            text: `Customer Reply on ${ticket.ticketNumber}\n\n${senderName} replied:\n\n${preview}\n\nReply directly to this email to respond.`,
          });
        }
      } else {
        const superAdmins = await this.userRepository.find({
          where: { role: UserRole.SUPER_ADMIN, isActive: true },
          select: ['id', 'email'],
        });
        for (const admin of superAdmins) {
          await this.mailer.send({
            to: admin.email,
            subject,
            replyTo,
            html: `
              <h2>Customer Reply on ${ticket.ticketNumber}</h2>
              <p><strong>${this.escapeHtml(senderName)}</strong> replied to an unassigned ticket.</p>
              <div style="background:#f5f5f5;padding:12px;border-radius:6px;margin:16px 0">
                <p style="margin:0;white-space:pre-wrap">${this.escapeHtml(preview)}</p>
              </div>
              <p>This ticket is unassigned. Please assign it to a webmaster.</p>
            `,
            text: `Customer Reply on ${ticket.ticketNumber} (unassigned)\n\n${senderName} replied:\n\n${preview}`,
          });
        }
      }
    }
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
