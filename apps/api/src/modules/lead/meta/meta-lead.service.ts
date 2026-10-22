import { BadRequestException, BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { MetaLeadSource } from '../../../database/entities';
import { BuyerIntakeService } from '../buyer/buyer-intake.service';
import { toIntake, validPageId, type GraphLead } from './meta-lead';

// Facebook / Instagram lead forms (milestone K), by polling the Graph API:
// the agency gives its Page id and a long-lived Page access token; every 15
// minutes the new leads of every lead form of the Page become buyers through
// the website intake (one buyer per email, agent assignment, an enquiry
// activity with every answer). Polling needs no Meta app review per client;
// a webhook would.

const DEFAULT_GRAPH = 'https://graph.facebook.com/v21.0';
const FIRST_RUN_DAYS = 30;
const OVERLAP_S = 120;
const MAX_FORM_PAGES = 5;
const MAX_LEAD_PAGES = 10;
const TIMEOUT_MS = 15_000;
const LEAD_FIELDS = 'id,created_time,field_data,platform,ad_name,campaign_name,form_id';

export interface MetaSettingsView {
  pageId: string | null;
  pageName: string | null;
  enabled: boolean;
  hasToken: boolean;
  lastLeadAt: Date | null;
  lastRunAt: Date | null;
  lastError: string | null;
  imported: number;
}

class GraphError extends Error {}

@Injectable()
export class MetaLeadService {
  private readonly logger = new Logger(MetaLeadService.name);

  constructor(
    @InjectRepository(MetaLeadSource) private readonly sources: Repository<MetaLeadSource>,
    @InjectDataSource() private readonly db: DataSource,
    private readonly intake: BuyerIntakeService,
    private readonly config: ConfigService,
  ) {}

  // Set by the server's .env only (never by a client), so a client can't
  // point the API at another host.
  private graphBase(): string {
    return (this.config.get<string>('META_GRAPH_URL') || process.env.META_GRAPH_URL || DEFAULT_GRAPH).replace(/\/+$/, '');
  }

  private view(s: MetaLeadSource | null, hasToken: boolean): MetaSettingsView {
    return {
      pageId: s?.pageId ?? null,
      pageName: s?.pageName ?? null,
      enabled: !!s?.enabled,
      hasToken,
      lastLeadAt: s?.lastLeadAt ?? null,
      lastRunAt: s?.lastRunAt ?? null,
      lastError: s?.lastError ?? null,
      imported: s?.imported ?? 0,
    };
  }

  private async load(tenantId: number): Promise<MetaLeadSource | null> {
    return this.sources.createQueryBuilder('s').addSelect('s.accessToken').where('s.tenantId = :tenantId', { tenantId }).getOne();
  }

  async get(tenantId: number): Promise<MetaSettingsView> {
    const s = await this.load(tenantId);
    return this.view(s, !!s?.accessToken);
  }

  // accessToken: undefined/'' = keep the stored one, null = remove it.
  async save(tenantId: number, dto: { pageId?: string; accessToken?: string | null; enabled?: boolean }): Promise<MetaSettingsView> {
    const current = await this.load(tenantId);
    const pageId = dto.pageId ?? current?.pageId;
    if (!validPageId(pageId)) throw new BadRequestException({ code: 'BAD_PAGE_ID', message: 'The Page id is the number in your Facebook Page settings (Page transparency)' });
    const token = dto.accessToken === null ? null : dto.accessToken?.trim() ? dto.accessToken.trim() : current?.accessToken ?? null;
    if (token && (token.length > 1000 || /\s/.test(token))) throw new BadRequestException({ code: 'BAD_TOKEN', message: 'That does not look like an access token' });
    const enabled = dto.enabled ?? current?.enabled ?? false;
    if (enabled && !token) throw new BadRequestException({ code: 'NO_TOKEN', message: 'Add the Page access token first' });
    const pageChanged = !!current && current.pageId !== pageId;
    // update(), not save(): save() compares with a fresh read that leaves out
    // the token (select: false), so removing the token was never written.
    if (current) {
      await this.sources.update(
        { id: current.id },
        { pageId, accessToken: token, enabled, ...(pageChanged ? { pageName: null, lastLeadAt: null, lastError: null } : {}) },
      );
    } else {
      await this.sources.insert({ tenantId, pageId, accessToken: token, enabled });
    }
    return this.get(tenantId);
  }

  private async graph<T>(path: string, token: string, params: Record<string, string> = {}): Promise<T> {
    const url = `${this.graphBase()}/${path}${Object.keys(params).length ? `?${new URLSearchParams(params)}` : ''}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      // The token goes in the header, so it never lands in an access log.
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, signal: ctrl.signal, redirect: 'error' });
      const body = (await res.json().catch(() => null)) as (T & { error?: { message?: string; code?: number } }) | null;
      if (!res.ok || !body || body.error) {
        const msg = body?.error?.message || `Facebook answered ${res.status}`;
        throw new GraphError(String(msg).replace(/access_token=[^&\s]+/g, 'access_token=…').slice(0, 300));
      }
      return body;
    } catch (err) {
      if (err instanceof GraphError) throw err;
      throw new GraphError((err as Error).name === 'AbortError' ? 'Facebook did not answer in time' : 'Could not reach Facebook');
    } finally {
      clearTimeout(timer);
    }
  }

  // Every page of a Graph list, by its own `after` cursor (never by the
  // `next` URL Meta sends back, so the host can't change).
  private async all<T>(path: string, token: string, params: Record<string, string>, maxPages: number): Promise<T[]> {
    const out: T[] = [];
    let after: string | undefined;
    for (let i = 0; i < maxPages; i++) {
      const page = await this.graph<{ data?: T[]; paging?: { cursors?: { after?: string }; next?: string } }>(path, token, { ...params, ...(after ? { after } : {}) });
      out.push(...(page.data ?? []));
      after = page.paging?.next ? page.paging.cursors?.after : undefined;
      if (!after || !/^[\w=-]{1,500}$/.test(after)) break;
    }
    return out;
  }

  async test(tenantId: number): Promise<{ ok: true; pageName: string; forms: number }> {
    const s = await this.load(tenantId);
    if (!s?.accessToken || !validPageId(s.pageId)) throw new BadRequestException({ code: 'NOT_SET_UP', message: 'Save the Page id and access token first' });
    try {
      const page = await this.graph<{ id: string; name?: string }>(s.pageId, s.accessToken, { fields: 'id,name' });
      const forms = await this.all<{ id: string }>(`${s.pageId}/leadgen_forms`, s.accessToken, { fields: 'id,name,status', limit: '100' }, MAX_FORM_PAGES);
      const pageName = String(page.name ?? '').slice(0, 255) || null;
      await this.sources.update({ id: s.id }, { pageName, lastError: null });
      return { ok: true, pageName: pageName ?? s.pageId, forms: forms.length };
    } catch (err) {
      await this.sources.update({ id: s.id }, { lastError: (err as Error).message });
      throw new BadGatewayException({ code: 'META_ERROR', message: (err as Error).message });
    }
  }

  // New leads of every form since the last run. Returns how many buyers came in.
  async importTenant(tenantId: number, now = new Date()): Promise<{ imported: number; skipped: number }> {
    const s = await this.load(tenantId);
    if (!s?.accessToken || !validPageId(s.pageId)) throw new BadRequestException({ code: 'NOT_SET_UP', message: 'Save the Page id and access token first' });
    const since = s.lastLeadAt ? Math.floor(+s.lastLeadAt / 1000) - OVERLAP_S : Math.floor(+now / 1000) - FIRST_RUN_DAYS * 86_400;
    let imported = 0;
    let skipped = 0;
    let newest = s.lastLeadAt ? +s.lastLeadAt : 0;
    try {
      const forms = await this.all<{ id: string; name?: string }>(`${s.pageId}/leadgen_forms`, s.accessToken, { fields: 'id,name,status', limit: '100' }, MAX_FORM_PAGES);
      for (const form of forms) {
        if (!/^\d{1,40}$/.test(String(form.id))) continue;
        const leads = await this.all<GraphLead>(`${form.id}/leads`, s.accessToken, {
          fields: LEAD_FIELDS,
          limit: '100',
          filtering: JSON.stringify([{ field: 'time_created', operator: 'GREATER_THAN', value: since }]),
        }, MAX_LEAD_PAGES);
        for (const raw of leads) {
          const lead = toIntake(raw, form.name);
          if (lead?.createdAt && +lead.createdAt > newest) newest = +lead.createdAt;
          const id = lead?.leadgenId ?? (typeof raw?.id === 'string' && /^\d{1,40}$/.test(raw.id) ? raw.id : null);
          if (!id) continue;
          // Claim first: the same lead is never imported twice, even by two runs at once.
          const claim = await this.db.query('INSERT IGNORE INTO meta_leads (leadgenId, tenantId) VALUES (?, ?)', [id, tenantId]);
          if (!claim.affectedRows) continue;
          if (!lead) {
            skipped++;
            continue;
          }
          const { lead: buyer } = await this.intake.upsertFromWebsite(tenantId, {
            email: lead.email,
            name: lead.name,
            phone: lead.phone,
            message: lead.message,
            propertyIds: [],
            source: lead.source,
            kind: 'enquiry',
          });
          // Meta lead forms always carry the advertiser's privacy policy.
          await this.db.query("UPDATE leads SET consentAt = COALESCE(consentAt, ?), consentSource = COALESCE(consentSource, 'form') WHERE id = ?", [lead.createdAt ?? now, buyer.id]);
          await this.db.query('UPDATE meta_leads SET leadId = ? WHERE leadgenId = ?', [buyer.id, id]);
          imported++;
        }
      }
      await this.sources.update({ id: s.id }, { lastRunAt: now, lastError: null, imported: () => `imported + ${imported}`, ...(newest ? { lastLeadAt: new Date(newest) } : {}) } as never);
      return { imported, skipped };
    } catch (err) {
      await this.sources.update({ id: s.id }, { lastRunAt: now, lastError: (err as Error).message, ...(newest ? { lastLeadAt: new Date(newest) } : {}) });
      if (err instanceof GraphError) throw new BadGatewayException({ code: 'META_ERROR', message: err.message });
      throw err;
    }
  }

  // The 15-minute job: every connected agency, one after the other.
  async importAll(): Promise<number> {
    const rows = await this.sources.find({ where: { enabled: true }, select: ['tenantId'] });
    let total = 0;
    for (const r of rows) {
      try {
        total += (await this.importTenant(r.tenantId)).imported;
      } catch (err) {
        this.logger.warn(`Meta leads, tenant ${r.tenantId}: ${(err as Error).message}`);
      }
    }
    return total;
  }
}
