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

    // 1) Email the webmaster who just got the assignment.
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

    // 2) Email the ticket creator (client) so they know work has started.
    // Client-facing copy — softer tone, doesn't reveal the webmaster's
    // internal email. Wrapped in its own try/catch so a missing creator
    // record can't block the webmaster notification above.
    const webmasterName = webmaster.name || 'a support agent';
    try {
      const creator = await this.userRepository.findOne({
        where: { id: ticket.userId },
        select: ['id', 'email', 'name'],
      });
      if (creator?.email) {
        await this.mailer.send({
          to: creator.email,
          subject: `[Update] ${ticket.ticketNumber}: assigned to support`,
          replyTo,
          html: `
            <h2>Your ticket has been assigned</h2>
            <p>Good news — your ticket <strong>${ticket.ticketNumber}</strong> has been picked up by <strong>${this.escapeHtml(webmasterName)}</strong> and is now in progress.</p>
            <table style="border-collapse:collapse;margin:16px 0">
              <tr><td style="padding:4px 12px 4px 0;color:#666">Ticket</td><td style="padding:4px 0"><strong>${ticket.ticketNumber}</strong></td></tr>
              <tr><td style="padding:4px 12px 4px 0;color:#666">Subject</td><td style="padding:4px 0">${ticket.subject}</td></tr>
              <tr><td style="padding:4px 12px 4px 0;color:#666">Status</td><td style="padding:4px 0">In progress</td></tr>
            </table>
            <p>You'll receive an email when they reply. You can also reply directly to this email — your response will be added to the ticket automatically.</p>
          `,
          text: `Your ticket ${ticket.ticketNumber} has been assigned to ${webmasterName} and is now in progress.\n\nSubject: ${ticket.subject}\nStatus: In progress\n\nReply directly to this email to add a message to the ticket.`,
        });
      }
    } catch (err) {
      this.logger.warn(
        `Failed to send assignment notification to creator of ticket ${ticket.ticketNumber}: ${(err as Error).message}`,
      );
    }

    // 3) Notify all super-admins (except the one who just did the
    // assignment, when identifiable). Keeps oncall staff aware of who's
    // handling what without needing to poll the admin panel.
    try {
      const superAdmins = await this.userRepository.find({
        where: { role: UserRole.SUPER_ADMIN, isActive: true },
        select: ['id', 'email', 'name'],
      });
      for (const admin of superAdmins) {
        // Skip the webmaster if they happen to also be a super-admin (edge
        // case — some ops staff wear both hats).
        if (admin.id === webmaster.id) continue;
        await this.mailer.send({
          to: admin.email,
          subject: `[FYI] ${ticket.ticketNumber} assigned to ${webmasterName}`,
          replyTo,
          html: `
            <h2>Ticket assignment</h2>
            <p>Ticket <strong>${ticket.ticketNumber}</strong> was assigned to <strong>${this.escapeHtml(webmasterName)}</strong>.</p>
            <table style="border-collapse:collapse;margin:16px 0">
              <tr><td style="padding:4px 12px 4px 0;color:#666">Subject</td><td style="padding:4px 0">${ticket.subject}</td></tr>
              <tr><td style="padding:4px 12px 4px 0;color:#666">Priority</td><td style="padding:4px 0">${ticket.priority}</td></tr>
              <tr><td style="padding:4px 12px 4px 0;color:#666">Tenant</td><td style="padding:4px 0">${ticket.tenantId}</td></tr>
            </table>
            <p style="color:#888;font-size:12px">You're getting this because you're a super-admin. All ticket updates go to super-admins for oncall awareness.</p>
          `,
          text: `Ticket ${ticket.ticketNumber} (${ticket.subject}) was assigned to ${webmasterName} on tenant ${ticket.tenantId}.`,
        });
      }
    } catch (err) {
      this.logger.warn(
        `Failed to send assignment FYI to super-admins for ticket ${ticket.ticketNumber}: ${(err as Error).message}`,
      );
    }

    this.logger.log(`Notified webmaster + creator + super-admins about assigned ticket ${ticket.ticketNumber}`);
  }

  async notifyTicketReply(
    ticket: Ticket,
    message: TicketMessage,
    senderName: string,
  ): Promise<void> {
    const preview = message.message.length > 300 ? message.message.slice(0, 300) + '...' : message.message;
    const subject = `[Re: ${ticket.ticketNumber}] ${ticket.subject}`;
    const replyTo = this.buildReplyToAddress(ticket.id) ?? undefined;

    // Collect everyone in the loop for this ticket. Order matters only
    // for dedupe below: creator first so their client-tone copy wins if
    // they somehow also match a staff role.
    const [creator, webmaster, superAdmins] = await Promise.all([
      this.userRepository.findOne({
        where: { id: ticket.userId },
        select: ['id', 'email', 'name', 'role'],
      }),
      ticket.assignedTo
        ? this.userRepository.findOne({
            where: { id: ticket.assignedTo },
            select: ['id', 'email', 'name', 'role'],
          })
        : Promise.resolve(null as User | null),
      this.userRepository.find({
        where: { role: UserRole.SUPER_ADMIN, isActive: true },
        select: ['id', 'email', 'name', 'role'],
      }),
    ]);

    // Deduplicate + exclude the sender so a super-admin who just replied
    // doesn't get their own message emailed back to them. Track emails
    // seen in a Set so if the creator is also a super-admin (edge case)
    // they only get one message with the CLIENT copy (softer tone).
    const sentTo = new Set<string>();
    if (message.userId) sentTo.add(String(message.userId));

    // 1) Creator gets the customer-facing copy. Skip if the creator IS
    // the sender (creator replied → don't email them back).
    if (creator?.email && !sentTo.has(String(creator.id))) {
      sentTo.add(String(creator.id));
      const isStaffMsg = message.isStaff;
      await this.mailer.send({
        to: creator.email,
        subject,
        replyTo,
        html: `
          <h2>New reply on your ticket</h2>
          <p><strong>${this.escapeHtml(senderName)}</strong> ${isStaffMsg ? 'from support' : ''} replied to your ticket <strong>${ticket.ticketNumber}</strong>.</p>
          <div style="background:#f5f5f5;padding:12px;border-radius:6px;margin:16px 0">
            <p style="margin:0;white-space:pre-wrap">${this.escapeHtml(preview)}</p>
          </div>
          <p>You can reply directly to this email — your response will be added to the ticket automatically.</p>
        `,
        text: `New reply on ticket ${ticket.ticketNumber}\n\n${senderName} replied:\n\n${preview}\n\nReply directly to this email to respond.`,
      });
    }

    // 2) Assigned webmaster gets a staff-facing copy (technical tone,
    // shows who replied and tenant context).
    if (webmaster?.email && !sentTo.has(String(webmaster.id))) {
      sentTo.add(String(webmaster.id));
      await this.mailer.send({
        to: webmaster.email,
        subject,
        replyTo,
        html: `
          <h2>Reply on ${ticket.ticketNumber}</h2>
          <p><strong>${this.escapeHtml(senderName)}</strong> ${message.isStaff ? '(staff)' : '(customer)'} replied to ticket <strong>${ticket.ticketNumber}</strong>.</p>
          <div style="background:#f5f5f5;padding:12px;border-radius:6px;margin:16px 0">
            <p style="margin:0;white-space:pre-wrap">${this.escapeHtml(preview)}</p>
          </div>
          <p>Reply directly to this email to respond.</p>
        `,
        text: `Reply on ${ticket.ticketNumber} from ${senderName} (${message.isStaff ? 'staff' : 'customer'}):\n\n${preview}\n\nReply directly to this email to respond.`,
      });
    }

    // 3) All super-admins get a staff-facing copy. Skips anyone already
    // notified above (creator, webmaster) or who is the sender. Keeps
    // ops staff in the loop on every ticket update — no need to poll the
    // admin panel to see activity.
    for (const admin of superAdmins) {
      if (sentTo.has(String(admin.id))) continue;
      sentTo.add(String(admin.id));
      await this.mailer.send({
        to: admin.email,
        subject,
        replyTo,
        html: `
          <h2>Reply on ${ticket.ticketNumber}</h2>
          <p><strong>${this.escapeHtml(senderName)}</strong> ${message.isStaff ? '(staff)' : '(customer)'} replied on tenant ${ticket.tenantId}.</p>
          <div style="background:#f5f5f5;padding:12px;border-radius:6px;margin:16px 0">
            <p style="margin:0;white-space:pre-wrap">${this.escapeHtml(preview)}</p>
          </div>
          <p style="color:#888;font-size:12px">You're getting this because you're a super-admin. All ticket updates go to super-admins for oncall awareness. Reply directly to add a message to the ticket.</p>
        `,
        text: `Reply on ${ticket.ticketNumber} (tenant ${ticket.tenantId}) from ${senderName} (${message.isStaff ? 'staff' : 'customer'}):\n\n${preview}\n\nReply to add a message.`,
      });
    }

    this.logger.log(
      `Reply notification fan-out for ${ticket.ticketNumber}: ${sentTo.size - 1} recipient(s), sender=${message.userId}`,
    );
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
