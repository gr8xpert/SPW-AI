import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DEFAULT_BUYER_MATCH_SETTINGS } from '@spm/shared';
import type { BuyerAlertSettings, BuyerMatchSettings, BuyerMatchWeights, BuyerNearMissSettings, TenantSettings } from '@spm/shared';
import { Tenant } from '../../../database/entities';

// What a settings PUT may carry: every field optional, weights partly.
export type BuyerSettingsPatch = Partial<Omit<BuyerMatchSettings, 'weights' | 'nearMiss' | 'alerts'>> & {
  weights?: Partial<BuyerMatchWeights>;
  nearMiss?: Partial<BuyerNearMissSettings>;
  alerts?: Partial<BuyerAlertSettings>;
};

// tenants.settings.buyerMatch. Written here, not through
// PUT /tenant/settings, so a Buyer Match change does not bump the widget's
// syncVersion (nothing on the website depends on it).
@Injectable()
export class BuyerSettingsService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
  ) {}

  async get(tenantId: number): Promise<BuyerMatchSettings> {
    const tenant = await this.tenantRepository.findOne({ where: { id: tenantId }, select: ['id', 'settings'] });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return normalizeBuyerSettings((tenant.settings as TenantSettings | null)?.buyerMatch);
  }

  async update(tenantId: number, patch: BuyerSettingsPatch): Promise<BuyerMatchSettings> {
    const tenant = await this.tenantRepository.findOne({ where: { id: tenantId }, select: ['id', 'settings'] });
    if (!tenant) throw new NotFoundException('Tenant not found');
    if (patch.propertyUrlPatterns !== undefined) assertUrlPatterns(patch.propertyUrlPatterns);
    if (patch.buyerPageUrls !== undefined) assertPageUrls(patch.buyerPageUrls);
    const settings = (tenant.settings || {}) as TenantSettings;
    const current = normalizeBuyerSettings(settings.buyerMatch);
    const { weights, nearMiss, alerts, ...rest } = stripUndefined(patch);
    if (alerts?.digestTime !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(alerts.digestTime))) {
      throw new BadRequestException({ code: 'BAD_DIGEST_TIME', message: 'digestTime must be HH:MM' });
    }
    const next = normalizeBuyerSettings({
      ...current,
      ...rest,
      nearMiss: { ...current.nearMiss, ...stripUndefined(nearMiss || {}) },
      alerts: { ...current.alerts, ...stripUndefined(alerts || {}) },
      weights: { ...current.weights, ...stripUndefined(weights || {}) } as BuyerMatchWeights,
    });
    await this.tenantRepository.update(tenantId, { settings: { ...settings, buyerMatch: next } as TenantSettings });
    return next;
  }
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

const PATTERN_KEY = /^(default|[a-z]{2})$/;

export function validUrlPattern(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 500 &&
    /^https?:\/\/\S+$/i.test(value.trim()) &&
    (value.includes('{segment}') || value.includes('{ref}'))
  );
}

// A pattern typed wrong should be told, not silently dropped.
function assertUrlPatterns(raw: unknown): void {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new BadRequestException({ code: 'BAD_URL_PATTERN', message: 'propertyUrlPatterns must be an object' });
  }
  for (const [lang, value] of Object.entries(raw)) {
    if (value === '' || value === null) continue; // cleared
    if (!PATTERN_KEY.test(lang) || !validUrlPattern(value)) {
      throw new BadRequestException({
        code: 'BAD_URL_PATTERN',
        details: { lang },
        message: `The property URL for "${lang}" must start with http(s):// and contain {segment} or {ref}`,
      });
    }
  }
}

// A buyer page address: a plain http(s) page (the code is added as ?t=).
export function validPageUrl(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 500 && /^https?:\/\/[^\s{}]+$/i.test(value.trim());
}

function assertPageUrls(raw: unknown): void {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new BadRequestException({ code: 'BAD_PAGE_URL', message: 'buyerPageUrls must be an object' });
  }
  for (const [lang, value] of Object.entries(raw)) {
    if (value === '' || value === null) continue;
    if (!PATTERN_KEY.test(lang) || !validPageUrl(value)) {
      throw new BadRequestException({
        code: 'BAD_PAGE_URL',
        details: { lang },
        message: `The buyer page address for "${lang}" must be a full link starting with http(s)://`,
      });
    }
  }
}

function weight(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(10, Math.max(0, Math.round(n))) : fallback;
}

// MySQL JSON gives booleans back as 0/1 in places; coerce every field.
export function normalizeBuyerSettings(raw: Partial<BuyerMatchSettings> | undefined | null): BuyerMatchSettings {
  const d = DEFAULT_BUYER_MATCH_SETTINGS;
  const r = raw || {};
  const ids = (v: unknown) => (Array.isArray(v) ? v.map(Number).filter((n) => Number.isInteger(n) && n > 0) : []);
  const staleDays = Number(r.staleDays);
  const w = (r.weights || {}) as Partial<BuyerMatchWeights>;
  const featureOverrides: Record<string, number> = {};
  if (w.featureOverrides && typeof w.featureOverrides === 'object' && !Array.isArray(w.featureOverrides)) {
    for (const [id, v] of Object.entries(w.featureOverrides)) {
      const n = Number(v);
      if (/^[1-9]\d*$/.test(id) && Number.isFinite(n)) featureOverrides[id] = weight(n, 0);
    }
  }
  const propertyUrlPatterns: Record<string, string> = {};
  if (r.propertyUrlPatterns && typeof r.propertyUrlPatterns === 'object' && !Array.isArray(r.propertyUrlPatterns)) {
    for (const [lang, v] of Object.entries(r.propertyUrlPatterns)) {
      if (PATTERN_KEY.test(lang) && validUrlPattern(v)) propertyUrlPatterns[lang] = v.trim();
    }
  }
  const buyerPageUrls: Record<string, string> = {};
  if (r.buyerPageUrls && typeof r.buyerPageUrls === 'object' && !Array.isArray(r.buyerPageUrls)) {
    for (const [lang, v] of Object.entries(r.buyerPageUrls)) {
      if (PATTERN_KEY.test(lang) && validPageUrl(v)) buyerPageUrls[lang] = v.trim();
    }
  }
  const nm = (r.nearMiss || {}) as Partial<BuyerNearMissSettings>;
  const al = (r.alerts || {}) as Partial<BuyerAlertSettings>;
  const clamp = (v: unknown, lo: number, hi: number, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : fallback;
  };
  return {
    buyerPageUrls,
    viewingReminderMinutes: clamp(r.viewingReminderMinutes, 0, 1440, d.viewingReminderMinutes),
    agentDigestTime: typeof r.agentDigestTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(r.agentDigestTime) ? r.agentDigestTime : d.agentDigestTime,
    hotScore: clamp(r.hotScore, 1, 50, d.hotScore),
    firstContactHours: clamp(r.firstContactHours, 1, 720, d.firstContactHours),
    nearMiss: {
      enabled: nm.enabled === undefined ? d.nearMiss.enabled : !!nm.enabled,
      budgetPercent: clamp(nm.budgetPercent, 0, 50, d.nearMiss.budgetPercent),
      nearbyKm: clamp(nm.nearbyKm, 0, 100, d.nearMiss.nearbyKm),
    },
    alerts: {
      enabled: al.enabled === undefined ? d.alerts.enabled : !!al.enabled,
      delivery: al.delivery === 'instant' ? 'instant' : 'digest',
      digestTime: typeof al.digestTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(al.digestTime) ? al.digestTime : d.alerts.digestTime,
      priceDropPercent: clamp(al.priceDropPercent, 1, 90, d.alerts.priceDropPercent),
    },
    assignMode: r.assignMode === 'round_robin' ? 'round_robin' : 'default',
    defaultAgentId: Number.isInteger(Number(r.defaultAgentId)) && Number(r.defaultAgentId) > 0 ? Number(r.defaultAgentId) : null,
    rotationAgentIds: ids(r.rotationAgentIds),
    agentsSeeAll: r.agentsSeeAll === undefined ? d.agentsSeeAll : !!r.agentsSeeAll,
    staleDays: Number.isInteger(staleDays) && staleDays >= 1 && staleDays <= 365 ? staleDays : d.staleDays,
    weights: {
      bedrooms: weight(w.bedrooms, d.weights.bedrooms),
      bathrooms: weight(w.bathrooms, d.weights.bathrooms),
      buildSize: weight(w.buildSize, d.weights.buildSize),
      plotSize: weight(w.plotSize, d.weights.plotSize),
      feature: weight(w.feature, d.weights.feature),
      featureOverrides,
    },
    propertyUrlPatterns,
  };
}
