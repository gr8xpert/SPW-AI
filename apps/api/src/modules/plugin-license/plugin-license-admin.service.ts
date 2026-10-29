import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository } from 'typeorm';
import { AuditLog, PluginActivation, PluginLicense } from '../../database/entities';
import { CreatePluginLicenseDto, UpdatePluginLicenseDto } from './dto/plugin-license-admin.dto';
import { PluginLicenseMailer } from './plugin-license-mailer.service';
import { pluginError, PluginLicenseService } from './plugin-license.service';
import { PLUGIN_PLANS, PLUGIN_PRODUCT, generatePluginKey, hashPluginKey, pluginPlan } from './plugin-plans';

// Super admin -> Plugin licences: issue keys after confirming payment on realtysoft.eu, and look after
// them (extend, change plan, free a site, revoke, replace the key). Every change is audit-logged.

export type AdminLicenseStatus = 'active' | 'expired' | 'revoked';
export type AdminStatusFilter = AdminLicenseStatus | 'expiring' | 'all';

export interface AdminLicenseRow {
  id: number;
  plan: string;
  planLabel: string;
  status: AdminLicenseStatus;
  source: string;
  email: string;
  customerName: string | null;
  notes: string | null;
  last4: string;
  sitesAllowed: number;
  sitesUsed: number;
  lastSeenAt: string | null;
  expiresAt: string | null;
  credits: { words_allowed: number; words_used: number; resets_at: string } | null;
  createdAt: string;
}

const DAY = 86_400_000;
const PAGE_SIZE = 25;

@Injectable()
export class PluginLicenseAdminService {
  constructor(
    @InjectRepository(PluginLicense) private readonly licenses: Repository<PluginLicense>,
    @InjectRepository(PluginActivation) private readonly activations: Repository<PluginActivation>,
    @InjectRepository(AuditLog) private readonly audit: Repository<AuditLog>,
    private readonly licenseService: PluginLicenseService,
    private readonly mailer: PluginLicenseMailer,
  ) {}

  plans() {
    return Object.values(PLUGIN_PLANS);
  }

  async list(q: string, status: AdminStatusFilter, page: number) {
    const now = new Date();
    const qb = this.licenses.createQueryBuilder('l').where('l.product = :product', { product: PLUGIN_PRODUCT });
    const term = (q || '').trim();
    if (term) {
      qb.andWhere(
        new Brackets((w) => {
          w.where('l.email LIKE :like', { like: `%${term}%` })
            .orWhere('l.customerName LIKE :like')
            .orWhere('l.notes LIKE :like')
            .orWhere('l.last4 = :last4', { last4: term.toUpperCase().slice(-4) })
            .orWhere('l.keyHash = :hash', { hash: hashPluginKey(term) });
        }),
      );
    }
    if (status === 'revoked') qb.andWhere("l.status = 'revoked'");
    if (status === 'active') qb.andWhere("l.status = 'active' AND (l.expiresAt IS NULL OR l.expiresAt > :now)", { now });
    if (status === 'expired') qb.andWhere("l.status <> 'revoked' AND (l.status = 'expired' OR l.expiresAt <= :now)", { now });
    if (status === 'expiring') {
      qb.andWhere("l.status = 'active' AND l.expiresAt > :now AND l.expiresAt <= :soon", { now, soon: new Date(now.getTime() + 30 * DAY) });
    }
    const safePage = Math.max(1, page || 1);
    const [rows, total] = await qb
      .orderBy('l.createdAt', 'DESC')
      .skip((safePage - 1) * PAGE_SIZE)
      .take(PAGE_SIZE)
      .getManyAndCount();
    return { items: await this.toRows(rows), total, page: safePage, pageSize: PAGE_SIZE, summary: await this.summary() };
  }

  async detail(id: number) {
    const license = await this.find(id);
    const [row] = await this.toRows([license]);
    const sites = await this.activations.find({ where: { licenseId: id }, order: { lastSeenAt: 'DESC' } });
    const history = await this.audit.find({
      where: { entityType: 'plugin_license', entityId: id },
      relations: ['user'],
      order: { createdAt: 'DESC' },
      take: 30,
    });
    return {
      license: row,
      sites: sites.map((s) => ({ id: s.id, siteUrl: s.siteUrl, pluginVersion: s.pluginVersion, lastSeenAt: s.lastSeenAt, activatedAt: s.activatedAt })),
      history: history.map((h) => ({
        id: h.id,
        event: (h.metadata?.event as string) ?? h.action,
        by: h.user ? h.user.email : null,
        details: h.metadata ?? null,
        createdAt: h.createdAt,
      })),
    };
  }

  async create(dto: CreatePluginLicenseDto, userId: number) {
    const plan = pluginPlan(dto.plan)!;
    const key = generatePluginKey();
    const license = await this.licenses.save(
      this.licenses.create({
        product: PLUGIN_PRODUCT,
        keyHash: key.hash,
        last4: key.last4,
        plan: plan.id,
        sitesAllowed: dto.sitesAllowed ?? plan.sites,
        wordsAllowed: plan.words,
        status: 'active',
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : addMonths(new Date(), dto.months ?? 12),
        creditsPeriodStart: plan.words ? wholeSecond(new Date()) : null,
        email: dto.email.trim().toLowerCase(),
        customerName: dto.customerName?.trim() || null,
        notes: dto.notes?.trim() || null,
        source: 'manual',
      }),
    );
    const emailed = dto.sendEmail ? await this.mailer.sendKey(license, key.rawKey) : false;
    await this.log(userId, license.id, 'create', { event: 'issued', plan: plan.id, sites: license.sitesAllowed, expiresAt: license.expiresAt, emailed });
    const [row] = await this.toRows([license]);
    return { license: row, key: key.rawKey, emailed };
  }

  async update(id: number, dto: UpdatePluginLicenseDto, userId: number) {
    const license = await this.find(id);
    const patch: Partial<PluginLicense> = {};
    if (dto.plan && dto.plan !== license.plan) {
      const plan = pluginPlan(dto.plan)!;
      patch.plan = plan.id;
      patch.sitesAllowed = plan.sites;
      patch.wordsAllowed = plan.words;
      if (plan.words && !license.creditsPeriodStart) patch.creditsPeriodStart = wholeSecond(new Date());
    }
    if (dto.sitesAllowed !== undefined) patch.sitesAllowed = dto.sitesAllowed;
    if (dto.expiresAt !== undefined) patch.expiresAt = new Date(dto.expiresAt);
    if (dto.email !== undefined) patch.email = dto.email.trim().toLowerCase();
    if (dto.customerName !== undefined) patch.customerName = dto.customerName?.trim() || null;
    if (dto.notes !== undefined) patch.notes = dto.notes?.trim() || null;
    if (patch.expiresAt && license.status === 'expired' && patch.expiresAt.getTime() > Date.now()) patch.status = 'active';
    if (!Object.keys(patch).length) return this.detail(id);
    await this.licenses.update(id, patch);
    await this.log(userId, id, 'update', { event: 'edited' }, diff(license, patch));
    return this.detail(id);
  }

  /** Adds months to the later of today and the current expiry (an expired licence restarts today). */
  async extend(id: number, months: number, userId: number) {
    const license = await this.find(id);
    const base = license.expiresAt && license.expiresAt.getTime() > Date.now() ? license.expiresAt : new Date();
    const expiresAt = addMonths(base, months);
    const patch: Partial<PluginLicense> = { expiresAt, ...(license.status === 'expired' ? { status: 'active' as const } : {}) };
    await this.licenses.update(id, patch);
    await this.log(userId, id, 'update', { event: 'extended', months, expiresAt }, diff(license, patch));
    return this.detail(id);
  }

  async setRevoked(id: number, revoked: boolean, userId: number) {
    const license = await this.find(id);
    const status = revoked ? 'revoked' : 'active';
    if (license.status !== status) {
      await this.licenses.update(id, { status });
      await this.log(userId, id, 'update', { event: revoked ? 'revoked' : 'restored' }, { status: { before: license.status, after: status } });
    }
    return this.detail(id);
  }

  /** New key for the same licence; the old key stops working. Activated sites keep their slots. */
  async regenerateKey(id: number, sendEmail: boolean, userId: number) {
    const license = await this.find(id);
    const key = generatePluginKey();
    await this.licenses.update(id, { keyHash: key.hash, last4: key.last4 });
    const updated = { ...license, keyHash: key.hash, last4: key.last4 } as PluginLicense;
    const emailed = sendEmail ? await this.mailer.sendKey(updated, key.rawKey, { replacement: true }) : false;
    await this.log(userId, id, 'update', { event: 'key replaced', oldLast4: license.last4, newLast4: key.last4, emailed });
    return { ...(await this.detail(id)), key: key.rawKey, emailed };
  }

  async removeSite(id: number, activationId: number, userId: number) {
    await this.find(id);
    const site = await this.activations.findOne({ where: { id: activationId, licenseId: id } });
    if (!site) throw new NotFoundException('That site is not activated on this licence.');
    await this.activations.delete(site.id);
    await this.log(userId, id, 'update', { event: 'site removed', siteUrl: site.siteUrl });
    return this.detail(id);
  }

  /* ------------------------------------------------------------------ helpers */

  private async find(id: number): Promise<PluginLicense> {
    const license = await this.licenses.findOne({ where: { id, product: PLUGIN_PRODUCT } });
    if (!license) throw pluginError(HttpStatus.NOT_FOUND, 'not_found', 'Licence not found.');
    return license;
  }

  private async summary() {
    const now = new Date();
    const soon = new Date(now.getTime() + 30 * DAY);
    const raw = await this.licenses
      .createQueryBuilder('l')
      .select("SUM(l.status = 'active' AND (l.expiresAt IS NULL OR l.expiresAt > :now))", 'active')
      .addSelect("SUM(l.status = 'active' AND l.expiresAt > :now AND l.expiresAt <= :soon)", 'expiring')
      .addSelect("SUM(l.status <> 'revoked' AND (l.status = 'expired' OR l.expiresAt <= :now))", 'expired')
      .addSelect("SUM(l.status = 'revoked')", 'revoked')
      .where('l.product = :product', { product: PLUGIN_PRODUCT, now, soon })
      .getRawOne();
    const sites = await this.activations.count();
    return {
      active: Number(raw?.active ?? 0),
      expiring: Number(raw?.expiring ?? 0),
      expired: Number(raw?.expired ?? 0),
      revoked: Number(raw?.revoked ?? 0),
      sites,
    };
  }

  private async toRows(licenses: PluginLicense[]): Promise<AdminLicenseRow[]> {
    if (!licenses.length) return [];
    const stats: { licenseId: number; used: string; lastSeen: Date | null }[] = await this.activations
      .createQueryBuilder('a')
      .select('a.licenseId', 'licenseId')
      .addSelect('COUNT(*)', 'used')
      .addSelect('MAX(a.lastSeenAt)', 'lastSeen')
      .where({ licenseId: In(licenses.map((l) => l.id)) })
      .groupBy('a.licenseId')
      .getRawMany();
    const byId = new Map(stats.map((s) => [Number(s.licenseId), s]));
    return Promise.all(
      licenses.map(async (l) => {
        const s = byId.get(l.id);
        return {
          id: l.id,
          plan: l.plan,
          planLabel: pluginPlan(l.plan)?.label ?? l.plan,
          status: effectiveStatus(l),
          source: l.source,
          email: l.email,
          customerName: l.customerName,
          notes: l.notes,
          last4: l.last4,
          sitesAllowed: l.sitesAllowed,
          sitesUsed: Number(s?.used ?? 0),
          lastSeenAt: s?.lastSeen ? new Date(s.lastSeen).toISOString() : null,
          expiresAt: l.expiresAt ? l.expiresAt.toISOString() : null,
          credits: l.wordsAllowed ? await this.licenseService.creditsView(l) : null,
          createdAt: l.createdAt.toISOString(),
        };
      }),
    );
  }

  private async log(
    userId: number,
    licenseId: number,
    action: 'create' | 'update',
    metadata: Record<string, unknown>,
    changes: Record<string, { before: unknown; after: unknown }> | null = null,
  ) {
    await this.audit.save(this.audit.create({ tenantId: null, userId, action, entityType: 'plugin_license', entityId: licenseId, metadata, changes }));
  }
}

export function effectiveStatus(l: Pick<PluginLicense, 'status' | 'expiresAt'>): AdminLicenseStatus {
  if (l.status === 'revoked') return 'revoked';
  if (l.status === 'expired' || (l.expiresAt && l.expiresAt.getTime() <= Date.now())) return 'expired';
  return 'active';
}

function addMonths(from: Date, months: number): Date {
  const d = new Date(from.getTime());
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

// TIMESTAMP columns drop milliseconds; credit periods are looked up by exact start time.
function wholeSecond(d: Date): Date {
  return new Date(Math.floor(d.getTime() / 1000) * 1000);
}

function diff(before: PluginLicense, patch: Partial<PluginLicense>) {
  const out: Record<string, { before: unknown; after: unknown }> = {};
  for (const [k, v] of Object.entries(patch)) out[k] = { before: (before as any)[k] ?? null, after: v ?? null };
  return out;
}
