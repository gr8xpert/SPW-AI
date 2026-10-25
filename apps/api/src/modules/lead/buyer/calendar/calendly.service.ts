import { BadGatewayException, BadRequestException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { In, Repository } from 'typeorm';
import { BuyerViewing, CalendlyConnection, Lead, User, type CalendlyMember } from '../../../../database/entities';
import { BuyerService } from '../buyer.service';
import { BuyerIntakeService } from '../buyer-intake.service';
import type { BuyerViewer } from '../buyer-access';
import { bookingLink, bookingToken, leadFromToken, readInvitee, validSchedulingUrl, verifyCalendlySignature, type CalendlyBooking } from './calendly';

// Calendly (2026-10-25). The agency pastes a personal access token; we read
// its users' booking pages and subscribe a webhook. Each booking becomes a
// viewing on the right lead (by the signed link token, else by email; a new
// email becomes a New Lead), a cancel cancels it, a reschedule moves it.
// Calendly's free plan has no webhooks: then the booking links still work,
// only the bookings aren't filled in automatically.

const DEFAULT_API = 'https://api.calendly.com';
const TIMEOUT_MS = 15_000;
const EVENTS = ['invitee.created', 'invitee.canceled'];
const MAX_MEMBER_PAGES = 5;

export interface CalendlyView {
  connected: boolean;
  ownerEmail: string | null;
  // Bookings come in by themselves (a webhook is subscribed).
  automatic: boolean;
  scope: 'organization' | 'user' | null;
  members: (CalendlyMember & { agentId: number | null; agentName: string | null })[];
  lastEventAt: Date | null;
  lastError: string | null;
  bookings: number;
}

interface MembersPage {
  collection?: { user?: { email?: string; name?: string; scheduling_url?: string } }[];
  pagination?: { next_page_token?: string | null };
}

class CalendlyError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

@Injectable()
export class CalendlyService {
  private readonly logger = new Logger(CalendlyService.name);

  constructor(
    @InjectRepository(CalendlyConnection) private readonly connections: Repository<CalendlyConnection>,
    @InjectRepository(BuyerViewing) private readonly viewings: Repository<BuyerViewing>,
    @InjectRepository(Lead) private readonly leads: Repository<Lead>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly buyers: BuyerService,
    private readonly intake: BuyerIntakeService,
    private readonly config: ConfigService,
  ) {}

  // Set by the server's .env only (tests point it at a fake).
  private apiBase(): string {
    return (this.config.get<string>('CALENDLY_API_URL') || DEFAULT_API).replace(/\/+$/, '');
  }

  private async api<T>(method: 'GET' | 'POST' | 'DELETE', path: string, token: string, body?: unknown): Promise<T> {
    // Only paths on Calendly's API: a URI Calendly sent back is reduced to its path.
    const rel = path.startsWith('http') ? new URL(path).pathname + new URL(path).search : path;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${this.apiBase()}${rel}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
        redirect: 'error',
      });
      if (res.status === 204) return null as T;
      const json = (await res.json().catch(() => null)) as (T & { message?: string; title?: string; details?: { message?: string }[] }) | null;
      if (!res.ok) {
        const msg = json?.details?.[0]?.message || json?.message || json?.title || `Calendly answered ${res.status}`;
        throw new CalendlyError(String(msg).slice(0, 300), res.status);
      }
      return json as T;
    } catch (err) {
      if (err instanceof CalendlyError) throw err;
      throw new CalendlyError((err as Error).name === 'AbortError' ? 'Calendly did not answer in time' : 'Could not reach Calendly', 0);
    } finally {
      clearTimeout(timer);
    }
  }

  private async load(tenantId: number, secrets = false): Promise<CalendlyConnection | null> {
    const qb = this.connections.createQueryBuilder('c').where('c.tenantId = :tenantId', { tenantId });
    if (secrets) qb.addSelect(['c.accessToken', 'c.signingKey']);
    return qb.getOne();
  }

  async get(tenantId: number): Promise<CalendlyView> {
    const c = await this.load(tenantId);
    const members = c?.members ?? [];
    const emails = members.map((m) => m.email);
    const agents = emails.length ? await this.users.find({ where: { tenantId, email: In(emails) }, select: ['id', 'name', 'email'] }) : [];
    return {
      connected: !!c,
      ownerEmail: c?.ownerEmail ?? null,
      automatic: !!c?.webhookUri,
      scope: c?.scope ?? null,
      members: members.map((m) => {
        const a = agents.find((u) => u.email.toLowerCase() === m.email);
        return { ...m, agentId: a?.id ?? null, agentName: a ? a.name || a.email : null };
      }),
      lastEventAt: c?.lastEventAt ?? null,
      lastError: c?.lastError ?? null,
      bookings: c?.bookings ?? 0,
    };
  }

  // The account's users and their booking pages; only the account itself
  // when the token's user may not list the organisation.
  private async members(token: string, me: { email: string; name?: string; scheduling_url?: string }, org: string): Promise<CalendlyMember[]> {
    const self: CalendlyMember = { email: me.email.toLowerCase(), name: me.name ?? null, schedulingUrl: validSchedulingUrl(me.scheduling_url) ? me.scheduling_url : null };
    const out: CalendlyMember[] = [];
    try {
      let pageToken: string | null = null;
      for (let i = 0; i < MAX_MEMBER_PAGES; i++) {
        const q: URLSearchParams = new URLSearchParams({ organization: org, count: '100', ...(pageToken ? { page_token: pageToken } : {}) });
        const page: MembersPage = await this.api<MembersPage>('GET', `/organization_memberships?${q}`, token);
        for (const m of page.collection ?? []) {
          const email = m.user?.email?.toLowerCase();
          if (email && !out.some((o) => o.email === email)) {
            out.push({ email, name: m.user?.name ?? null, schedulingUrl: validSchedulingUrl(m.user?.scheduling_url) ? m.user!.scheduling_url! : null });
          }
        }
        pageToken = page.pagination?.next_page_token ?? null;
        if (!pageToken || !/^[\w-]{1,200}$/.test(pageToken)) break;
      }
    } catch (err) {
      this.logger.warn(`Calendly members not listed, using the account only: ${(err as Error).message}`);
    }
    return out.length ? out : [self];
  }

  // Webhook for the whole organisation, else for the token's own user; null
  // when the plan has no webhooks (the message is kept as lastError).
  private async subscribe(token: string, org: string, user: string, hookToken: string, signingKey: string): Promise<{ uri: string | null; scope: 'organization' | 'user'; error: string | null }> {
    const apiUrl = (this.config.get<string>('API_URL') || '').replace(/\/+$/, '');
    if (!/^https?:\/\//.test(apiUrl)) return { uri: null, scope: 'organization', error: 'API_URL is not set on the server' };
    const url = `${apiUrl}/api/webhooks/calendly/${hookToken}`;
    let error: string | null = null;
    for (const scope of ['organization', 'user'] as const) {
      try {
        const res = await this.api<{ resource?: { uri?: string } }>('POST', '/webhook_subscriptions', token, {
          url, events: EVENTS, organization: org, scope, ...(scope === 'user' ? { user } : {}), signing_key: signingKey,
        });
        if (res?.resource?.uri) return { uri: res.resource.uri, scope, error: null };
      } catch (err) {
        error = (err as Error).message;
      }
    }
    return { uri: null, scope: 'organization', error };
  }

  async connect(tenantId: number, rawToken: string): Promise<CalendlyView> {
    const token = rawToken.trim();
    if (!token || token.length > 2000 || /\s/.test(token)) throw new BadRequestException({ code: 'BAD_TOKEN', message: 'That does not look like a Calendly personal access token' });
    let me: { uri: string; email: string; name?: string; scheduling_url?: string; current_organization: string };
    try {
      me = (await this.api<{ resource: typeof me }>('GET', '/users/me', token)).resource;
    } catch (err) {
      const e = err as CalendlyError;
      throw new BadGatewayException({ code: 'CALENDLY_ERROR', message: e.status === 401 ? 'Calendly did not accept this token' : e.message });
    }
    if (!me?.uri || !me.email || !me.current_organization) throw new BadGatewayException({ code: 'CALENDLY_ERROR', message: 'Calendly sent an unexpected answer' });

    await this.disconnect(tenantId); // a reconnect replaces the old webhook
    const hookToken = randomBytes(24).toString('hex');
    const signingKey = randomBytes(32).toString('base64url');
    const members = await this.members(token, me, me.current_organization);
    const hook = await this.subscribe(token, me.current_organization, me.uri, hookToken, signingKey);
    await this.connections.insert({
      tenantId,
      accessToken: token,
      signingKey,
      hookToken,
      organizationUri: me.current_organization.slice(0, 255),
      ownerUri: me.uri.slice(0, 255),
      ownerEmail: me.email.toLowerCase().slice(0, 255),
      webhookUri: hook.uri?.slice(0, 255) ?? null,
      scope: hook.scope,
      members,
      lastError: hook.error ? `Bookings won't come in by themselves: ${hook.error}`.slice(0, 500) : null,
    });
    return this.get(tenantId);
  }

  // Booking pages again (new agents in Calendly).
  async refresh(tenantId: number): Promise<CalendlyView> {
    const c = await this.load(tenantId, true);
    if (!c) throw new NotFoundException({ code: 'NOT_CONNECTED', message: 'Connect Calendly first' });
    try {
      const me = (await this.api<{ resource: { email: string; name?: string; scheduling_url?: string } }>('GET', '/users/me', c.accessToken)).resource;
      await this.connections.update({ id: c.id }, { members: await this.members(c.accessToken, me, c.organizationUri) });
    } catch (err) {
      throw new BadGatewayException({ code: 'CALENDLY_ERROR', message: (err as Error).message });
    }
    return this.get(tenantId);
  }

  async disconnect(tenantId: number): Promise<void> {
    const c = await this.load(tenantId, true);
    if (!c) return;
    if (c.webhookUri) {
      await this.api('DELETE', c.webhookUri, c.accessToken).catch((err) => this.logger.warn(`Calendly webhook not removed: ${(err as Error).message}`));
    }
    await this.connections.delete({ id: c.id });
  }

  // The lead's agent's booking page (else the viewer's, else the account's),
  // with the buyer's name, email and the lead token filled in.
  async linkFor(tenantId: number, viewer: BuyerViewer, leadId: number): Promise<{ url: string; agent: string | null }> {
    const lead = await this.buyers.get(tenantId, viewer, leadId);
    const link = await this.linkForLead(tenantId, lead, viewer.id);
    if (!link) {
      const connected = await this.connections.exists({ where: { tenantId } });
      throw new NotFoundException(connected
        ? { code: 'NO_BOOKING_PAGE', message: 'No Calendly booking page for this agent' }
        : { code: 'NOT_CONNECTED', message: 'Calendly is not connected' });
    }
    return link;
  }

  // Same, for a lead already loaded (New Leads load their own); null when
  // Calendly isn't connected or nobody involved has a booking page.
  async linkForLead(
    tenantId: number,
    lead: Pick<Lead, 'id' | 'firstName' | 'lastName'> & { contact?: { email?: string | null } | null; assignedToUser?: { email?: string | null } | null },
    viewerId: number,
  ): Promise<{ url: string; agent: string | null } | null> {
    const c = await this.load(tenantId, true);
    if (!c) return null;
    const viewerUser = await this.users.findOne({ where: { id: viewerId }, select: ['id', 'email'] });
    const wanted = [lead.assignedToUser?.email, viewerUser?.email, c.ownerEmail].filter((e): e is string => !!e).map((e) => e.toLowerCase());
    const member = wanted.map((e) => (c.members ?? []).find((m) => m.email === e && m.schedulingUrl)).find(Boolean);
    if (!member?.schedulingUrl) return null;
    const name = [lead.firstName, lead.lastName].filter(Boolean).join(' ');
    return {
      url: bookingLink(member.schedulingUrl, { name, email: lead.contact?.email ?? null, token: bookingToken(c.signingKey, tenantId, lead.id) }),
      agent: member.name,
    };
  }

  // ── Webhook ────────────────────────────────────────────────────────────

  async handleWebhook(hookToken: string, signature: string | undefined, rawBody: string, body: unknown): Promise<{ ok: true; handled: string }> {
    if (!/^[0-9a-f]{48}$/.test(hookToken)) throw new NotFoundException();
    const c = await this.connections
      .createQueryBuilder('c')
      .addSelect('c.signingKey')
      .where('c.hookToken = :hookToken', { hookToken })
      .getOne();
    if (!c) throw new NotFoundException();
    // Calendly signs the body as sent; JSON.stringify of the parsed body is
    // the same text when no raw body is kept.
    const ok = verifyCalendlySignature(signature, rawBody, c.signingKey) || verifyCalendlySignature(signature, JSON.stringify(body ?? null), c.signingKey);
    if (!ok) throw new UnauthorizedException({ code: 'BAD_SIGNATURE', message: 'Bad signature' });

    const booking = readInvitee(body);
    if (!booking) return { ok: true, handled: 'ignored' };
    try {
      const handled = booking.kind === 'created' ? await this.booked(c, booking) : await this.canceled(c, booking);
      await this.connections.update({ id: c.id }, {
        lastEventAt: new Date(),
        lastError: null,
        ...(handled === 'booked' ? { bookings: () => 'bookings + 1' } : {}),
      } as never);
      return { ok: true, handled };
    } catch (err) {
      await this.connections.update({ id: c.id }, { lastError: `A booking could not be saved: ${(err as Error).message}`.slice(0, 500) });
      throw err;
    }
  }

  private async agentFor(tenantId: number, hostEmails: string[]): Promise<number | null> {
    if (!hostEmails.length) return null;
    const u = await this.users.findOne({ where: { tenantId, email: In(hostEmails) }, select: ['id'] });
    return u?.id ?? null;
  }

  // The lead a booking belongs to: the link's token, else the email (a new
  // email becomes a New Lead through the website intake).
  private async leadFor(c: CalendlyConnection, b: CalendlyBooking): Promise<{ lead: Lead; created: boolean }> {
    let id = leadFromToken(c.signingKey, c.tenantId, b.token);
    let created = false;
    for (let hops = 0; id && hops < 5; hops++) {
      const l = await this.leads.findOne({ where: { id, tenantId: c.tenantId }, select: ['id', 'mergedIntoId', 'erasedAt'] });
      if (!l || l.erasedAt) {
        id = null;
        break;
      }
      if (!l.mergedIntoId) break;
      id = l.mergedIntoId;
    }
    if (!id) {
      const message = [`Booked in Calendly: ${b.title}`, ...b.answers.map((a) => `${a.question}: ${a.answer}`)].join('\n');
      const intake = await this.intake.upsertFromWebsite(c.tenantId, {
        email: b.email, name: b.name ?? undefined, phone: b.phone ?? undefined, message, propertyIds: [], source: 'calendly', kind: 'enquiry', formAnswers: b.answers,
      });
      id = intake.lead.id;
      created = intake.created;
    }
    const lead = await this.leads.findOne({ where: { id, tenantId: c.tenantId } });
    if (!lead) throw new NotFoundException('Lead not found');
    return { lead, created };
  }

  private async booked(c: CalendlyConnection, b: CalendlyBooking): Promise<string> {
    // Calendly retries: a booking already saved is not saved twice.
    if (await this.viewings.findOne({ where: { tenantId: c.tenantId, externalRef: b.inviteeUri }, select: ['id'] })) return 'duplicate';
    const agentId = await this.agentFor(c.tenantId, b.hostEmails);

    // A reschedule moves the viewing the old booking made.
    const old = b.oldInviteeUri ? await this.viewings.findOne({ where: { tenantId: c.tenantId, externalRef: b.oldInviteeUri } }) : null;
    if (old) {
      await this.viewings.update({ id: old.id }, {
        externalRef: b.inviteeUri, startsAt: b.startsAt, durationMin: b.durationMin, status: 'planned', reminderSentAt: null,
        ...(agentId ? { agentId } : {}), ...(b.location ? { meetingPoint: b.location } : {}),
      });
      await this.buyers.log(old.leadId, agentId, 'viewing_planned', null, { viewingId: old.id, title: old.title, startsAt: b.startsAt, source: 'calendly', rescheduled: true });
      return 'rescheduled';
    }

    const { lead, created } = await this.leadFor(c, b);
    // The buyer chose this agent: a new lead is theirs (over the automatic
    // assignment), an existing one only when nobody has it yet.
    if (agentId && (created || !lead.assignedTo) && lead.assignedTo !== agentId) {
      await this.leads.update({ id: lead.id }, { assignedTo: agentId });
      lead.assignedTo = agentId;
    }
    const row = await this.viewings.save(
      this.viewings.create({
        tenantId: c.tenantId,
        leadId: lead.id,
        title: b.title,
        startsAt: b.startsAt,
        durationMin: b.durationMin,
        agentId: agentId ?? lead.assignedTo ?? null,
        meetingPoint: b.location,
        status: 'planned',
        createdBy: null,
        externalRef: b.inviteeUri,
      }),
    );
    // Booked with the agent: counts as contact on the Lead Report.
    await this.buyers.log(lead.id, row.agentId, 'viewing_planned', null, { viewingId: row.id, title: row.title, startsAt: row.startsAt, source: 'calendly' }, true);
    return 'booked';
  }

  private async canceled(c: CalendlyConnection, b: CalendlyBooking): Promise<string> {
    // A reschedule cancels the old booking first; the new one moves the viewing.
    if (b.rescheduled) return 'reschedule-pending';
    const v = await this.viewings.findOne({ where: { tenantId: c.tenantId, externalRef: b.inviteeUri } });
    if (!v) return 'unknown';
    if (v.status === 'cancelled') return 'duplicate';
    await this.viewings.update({ id: v.id }, { status: 'cancelled', ...(b.cancelReason && !v.feedback ? { feedback: b.cancelReason } : {}) });
    await this.buyers.log(v.leadId, null, 'note', `Calendly booking cancelled${b.cancelReason ? `: ${b.cancelReason}` : ''}`, { viewingId: v.id, source: 'calendly' });
    return 'canceled';
  }
}
