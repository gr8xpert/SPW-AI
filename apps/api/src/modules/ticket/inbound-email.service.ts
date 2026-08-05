import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'crypto';
import { Repository } from 'typeorm';
import { User } from '../../database/entities';
import { TicketService } from './ticket.service';
import { stripQuotedReply } from './reply-parser.util';
import { InboundEmailDto } from './dto/inbound-email.dto';

export interface InboundResult {
  ok: boolean;
  reason?: 'invalid-token' | 'ticket-not-found' | 'sender-unknown' | 'empty-body';
  ticketId?: number;
  messageId?: number;
}

@Injectable()
export class InboundEmailService {
  private readonly logger = new Logger(InboundEmailService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly ticketService: TicketService,
    private readonly config: ConfigService,
  ) {}

  async ingest(payload: InboundEmailDto): Promise<InboundResult> {
    const parsed = this.parseTicketToken(payload.to);
    if (!parsed) {
      this.logger.warn(`Inbound rejected — invalid token in to=${payload.to}`);
      return { ok: false, reason: 'invalid-token' };
    }

    const senderEmail = payload.from.toLowerCase().trim();
    const sender = await this.userRepository.findOne({
      where: { email: senderEmail },
    });
    if (!sender) {
      // Unknown senders can't post to the ticket — otherwise anyone could
      // forge a From: header and drop messages into any ticket. Better to
      // drop and let ops investigate.
      this.logger.warn(
        `Inbound rejected — sender ${senderEmail} not in users table (ticket ${parsed.ticketId})`,
      );
      return { ok: false, reason: 'sender-unknown', ticketId: parsed.ticketId };
    }

    const body = stripQuotedReply(payload.text ?? this.htmlToPlain(payload.html ?? ''));
    if (!body) {
      this.logger.warn(`Inbound rejected — empty body after strip (ticket ${parsed.ticketId})`);
      return { ok: false, reason: 'empty-body', ticketId: parsed.ticketId };
    }

    const saved = await this.ticketService.createInboundMessage(parsed.ticketId, sender, body);
    if (!saved) {
      return { ok: false, reason: 'ticket-not-found', ticketId: parsed.ticketId };
    }

    this.logger.log(
      `Inbound message stored: ticket=${parsed.ticketId} sender=${senderEmail} messageId=${saved.id}`,
    );
    return { ok: true, ticketId: parsed.ticketId, messageId: saved.id };
  }

  // Parse `ticket+<id>.<hmac>@<domain>` out of a To-address. Returns null
  // for anything unrecognized or when the HMAC doesn't match. Case-
  // insensitive on the local-part prefix so mail servers that normalize
  // don't break threading.
  private parseTicketToken(to: string): { ticketId: number } | null {
    if (!to) return null;
    const match = to.match(/ticket\+(\d+)\.([a-f0-9]+)@/i);
    if (!match) return null;
    const ticketId = parseInt(match[1], 10);
    const presentedHmac = match[2].toLowerCase();
    if (!Number.isFinite(ticketId)) return null;

    const secret = this.config.get<string>('INBOUND_EMAIL_HMAC_SECRET');
    if (!secret) return null;
    const expected = crypto
      .createHmac('sha256', secret)
      .update(String(ticketId))
      .digest('hex')
      .slice(0, 12);

    // constant-time compare
    const a = Buffer.from(presentedHmac);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    return { ticketId };
  }

  // Fallback when the inbound provider only supplied HTML. Strips tags and
  // decodes a handful of common entities — good enough for signature/quote
  // detection downstream.
  private htmlToPlain(html: string): string {
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"');
  }
}
