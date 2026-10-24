import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { TenantSettings } from '@spm/shared';
import {
  BuyerSend, LeadSuggestion, LeadSuggestionEvent, Tenant,
  type SuggestionEventSource,
} from '../../../../database/entities';
import { FormMailService } from '../../form-mail.service';
import { BuyerMatchService } from '../buyer-match.service';
import { normalizeBuyerSettings } from '../buyer-settings.service';
import { propertyLink } from '../buyer-mail';
import { linkSecret, signLinkToken, verifyLinkToken } from './link-token';
import { applyEvent, statusAfter, type TimelineEvent, type TimelineState } from './timeline';

// A repeat click on the same link within this long is not logged again.
const CLICK_REPEAT_MS = 60_000;

const STATE_KEYS: (keyof TimelineState)[] = [
  'sentAt', 'openedAt', 'clickedAt', 'likedAt', 'rejectedAt', 'rejectReason', 'viewingAt', 'offerAt',
];

export interface EmailTracking {
  pixelUrl: string;
  link: (propertyId: number) => string;
  // The buyer's "unsubscribe" link (milestone J).
  unsubscribeUrl?: string;
}

export interface TimelineEntry {
  id: number;
  event: TimelineEvent;
  source: SuggestionEventSource;
  note: string | null;
  createdAt: Date;
  user: { id: number; name: string | null } | null;
}

// What happened to each property after it was sent: the email's open
// pixel and click links (signed send ids, no personal data), the buyer
// page's reactions (milestone F) and the agent's own marks.
@Injectable()
export class BuyerTrackingService {
  private readonly logger = new Logger(BuyerTrackingService.name);
  private readonly key: Buffer;

  constructor(
    @InjectRepository(BuyerSend)
    private readonly sendRepository: Repository<BuyerSend>,
    @InjectRepository(LeadSuggestion)
    private readonly suggestionRepository: Repository<LeadSuggestion>,
    @InjectRepository(LeadSuggestionEvent)
    private readonly eventRepository: Repository<LeadSuggestionEvent>,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    private readonly matchService: BuyerMatchService,
    private readonly formMail: FormMailService,
    private readonly config: ConfigService,
  ) {
    this.key = linkSecret();
  }

  private apiBase(): string {
    return (this.config.get<string>('API_URL') || 'http://localhost:3001').replace(/\/+$/, '');
  }

  async createSend(args: {
    tenantId: number;
    leadId: number;
    recipient: 'buyer' | 'agent';
    kind?: 'selection' | 'alert';
    channel?: 'email' | 'whatsapp';
    propertyIds: number[];
    lang: string;
    userId: number | null;
  }): Promise<BuyerSend> {
    return this.sendRepository.save(
      this.sendRepository.create({
        tenantId: args.tenantId,
        leadId: args.leadId,
        recipient: args.recipient,
        kind: args.kind ?? 'selection',
        channel: args.channel ?? 'email',
        propertyIds: args.propertyIds,
        lang: args.lang,
        createdBy: args.userId,
      }),
    );
  }

  async dropSend(id: number): Promise<void> {
    await this.sendRepository.delete({ id });
  }

  // The pixel and link builders for one tracked email.
  trackingFor(sendId: number, leadId?: number): EmailTracking {
    const base = this.apiBase();
    return {
      pixelUrl: `${base}/api/t/o/${signLinkToken(this.key, 'o', sendId)}`,
      link: (propertyId: number) => `${base}/api/t/c/${signLinkToken(this.key, 'c', sendId, propertyId)}`,
      ...(leadId ? { unsubscribeUrl: this.unsubscribeUrl(leadId) } : {}),
    };
  }

  unsubscribeUrl(leadId: number): string {
    return `${this.apiBase()}/api/t/u/${signLinkToken(this.key, 'u', leadId)}`;
  }

  // The buyer id of an unsubscribe link, or null when it was not signed by us.
  unsubscribeLead(token: string): number | null {
    return verifyLinkToken(this.key, 'u', token)?.sendId ?? null;
  }

  // Moves the timeline of these properties for one buyer. Only rows that
  // exist (the property was suggested or sent) are touched. An event that
  // changes nothing (a second open) is not logged.
  async record(args: {
    tenantId: number;
    leadId: number;
    propertyIds: number[];
    event: TimelineEvent;
    source: SuggestionEventSource;
    sendId?: number | null;
    userId?: number | null;
    note?: string | null;
    at?: Date;
  }): Promise<number> {
    if (!args.propertyIds.length) return 0;
    const at = args.at ?? new Date();
    const rows = await this.suggestionRepository.find({
      where: { tenantId: args.tenantId, leadId: args.leadId, propertyId: In([...new Set(args.propertyIds)]) },
    });
    let changed = 0;
    for (const row of rows) {
      const before = pick(row);
      const after = applyEvent(before, args.event, at, args.note);
      const patch: Partial<LeadSuggestion> = {};
      for (const k of STATE_KEYS) {
        const a = after[k];
        const b = before[k];
        if ((a instanceof Date ? +a : a) !== (b instanceof Date ? +new Date(b) : b)) (patch as Record<string, unknown>)[k] = a;
      }
      const status = statusAfter(row.status, args.event);
      if (status !== row.status) patch.status = status;

      let log = Object.keys(patch).length > 0 || ['liked', 'rejected', 'viewing', 'offer'].includes(args.event);
      if (!log && args.event === 'clicked') {
        const last = await this.eventRepository.findOne({
          where: { leadId: args.leadId, propertyId: row.propertyId },
          order: { id: 'DESC' },
        });
        log = !(last && last.event === 'clicked' && at.getTime() - new Date(last.createdAt).getTime() < CLICK_REPEAT_MS);
      }
      if (Object.keys(patch).length) await this.suggestionRepository.update({ id: row.id }, patch);
      if (log) {
        await this.eventRepository.insert({
          tenantId: args.tenantId,
          leadId: args.leadId,
          propertyId: row.propertyId,
          sendId: args.sendId ?? null,
          event: args.event,
          source: args.source,
          userId: args.userId ?? null,
          note: args.note?.trim() ? args.note.trim().slice(0, 500) : null,
        });
        changed++;
      }
    }
    return changed;
  }

  // The open pixel. Never throws: a mail client only ever gets the gif.
  async open(token: string): Promise<void> {
    try {
      const t = verifyLinkToken(this.key, 'o', token);
      if (!t) return;
      const send = await this.sendRepository.findOne({ where: { id: t.sendId } });
      if (!send || send.recipient !== 'buyer') return;
      const now = new Date();
      if (!send.openedAt) await this.sendRepository.update({ id: send.id }, { openedAt: now });
      await this.record({ tenantId: send.tenantId, leadId: send.leadId, propertyIds: send.propertyIds || [], event: 'opened', source: 'email', sendId: send.id, at: now });
    } catch (err) {
      this.logger.warn(`Open tracking failed: ${(err as Error).message}`);
    }
  }

  // A property link in the email. Returns where to send the buyer: the
  // property's page on the client's site, else the client's website.
  // null = unknown or forged link.
  async click(token: string): Promise<string | null> {
    const t = verifyLinkToken(this.key, 'c', token);
    if (!t || !t.propertyId) return null;
    const send = await this.sendRepository.findOne({ where: { id: t.sendId } });
    if (!send || !(send.propertyIds || []).map(Number).includes(t.propertyId)) return null;
    const tenant = await this.tenantRepository.findOne({ where: { id: send.tenantId } });
    if (!tenant) return null;

    if (send.recipient === 'buyer') {
      try {
        const now = new Date();
        await this.sendRepository.update({ id: send.id }, { clickedAt: send.clickedAt ?? now, openedAt: send.openedAt ?? now });
        const source = send.channel === 'whatsapp' ? 'whatsapp' : 'email';
        await this.record({ tenantId: send.tenantId, leadId: send.leadId, propertyIds: [t.propertyId], event: 'clicked', source, sendId: send.id, at: now });
      } catch (err) {
        this.logger.warn(`Click tracking failed: ${(err as Error).message}`);
      }
    }

    const settings = (tenant.settings || {}) as TenantSettings;
    const card = (await this.matchService.cards(tenant.id, [t.propertyId])).get(t.propertyId);
    const url = card
      ? propertyLink(card, send.lang || 'en', normalizeBuyerSettings(settings.buyerMatch).propertyUrlPatterns, (settings as { slugFormat?: unknown }).slugFormat)
      : null;
    return url || this.formMail.sender(tenant).website || null;
  }

  async timeline(tenantId: number, leadId: number, propertyId: number): Promise<TimelineEntry[]> {
    const rows = await this.eventRepository.find({
      where: { tenantId, leadId, propertyId },
      relations: { user: true },
      order: { id: 'ASC' },
    });
    return rows.map((r) => ({
      id: r.id,
      event: r.event,
      source: r.source,
      note: r.note,
      createdAt: r.createdAt,
      user: r.user ? { id: r.user.id, name: r.user.name } : null,
    }));
  }

  async suggestion(tenantId: number, id: number): Promise<LeadSuggestion> {
    const row = await this.suggestionRepository.findOne({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('Suggestion not found');
    return row;
  }
}

function pick(row: LeadSuggestion): TimelineState {
  const d = (v: Date | string | null) => (v ? new Date(v) : null);
  return {
    sentAt: d(row.sentAt),
    openedAt: d(row.openedAt),
    clickedAt: d(row.clickedAt),
    likedAt: d(row.likedAt),
    rejectedAt: d(row.rejectedAt),
    rejectReason: row.rejectReason ?? null,
    viewingAt: d(row.viewingAt),
    offerAt: d(row.offerAt),
  };
}
