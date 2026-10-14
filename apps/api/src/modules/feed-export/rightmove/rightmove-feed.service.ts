import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  FeedExportConfig,
  Location,
  PropertyType,
  RightmoveListing,
  RightmoveLocation,
  RightmovePushLog,
} from '../../../database/entities';
import { FeedExportService } from '../feed-export.service';
import { parseCsv } from '../../location-template/location-template.service';
import { SetRightmoveTownDto, UpdateRightmoveSettingsDto, UpdateRightmoveTypesDto } from '../dto';
import { displayName } from '../idealista/idealista-builder';
import { RightmoveClient } from './rightmove-client';
import { RIGHTMOVE_TYPES } from './rightmove-catalog';
import { placeKey, resolvePlace, resolveRightmoveType } from './rightmove-builder';
import { RightmoveSyncService, rightmoveSettings } from './rightmove-sync.service';

// Feed Export → Rightmove card, plus the Super Admin place-list import.
@Injectable()
export class RightmoveFeedService {
  constructor(
    private readonly feedExport: FeedExportService,
    private readonly sync: RightmoveSyncService,
    private readonly client: RightmoveClient,
    @InjectRepository(FeedExportConfig)
    private readonly configRepository: Repository<FeedExportConfig>,
    @InjectRepository(PropertyType)
    private readonly typeRepository: Repository<PropertyType>,
    @InjectRepository(Location)
    private readonly locationRepository: Repository<Location>,
    @InjectRepository(RightmoveLocation)
    private readonly placeRepository: Repository<RightmoveLocation>,
    @InjectRepository(RightmoveListing)
    private readonly listingRepository: Repository<RightmoveListing>,
    @InjectRepository(RightmovePushLog)
    private readonly logRepository: Repository<RightmovePushLog>,
  ) {}

  // ============ Dashboard ============

  async getOverview(tenantId: number, canSetIds: boolean) {
    const config = await this.configRepository.findOne({ where: { tenantId } });
    const types = await this.sync.loadTypes(tenantId);
    const [counts, placeCount, lastLog] = await Promise.all([
      this.listingRepository
        .createQueryBuilder('l')
        .select('l.state', 'state')
        .addSelect('COUNT(*)', 'n')
        .where('l.tenantId = :tenantId', { tenantId })
        .groupBy('l.state')
        .getRawMany<{ state: string; n: string }>(),
      this.placeRepository.count(),
      this.logRepository.findOne({ where: { tenantId }, order: { createdAt: 'DESC' } }),
    ]);
    const byState = Object.fromEntries(counts.map((c) => [c.state, Number(c.n)]));
    return {
      settings: rightmoveSettings(config),
      canSetIds,
      live: this.client.isLive,
      placeCount,
      onRightmove: byState.live ?? 0,
      withErrors: byState.error ?? 0,
      lastActivity: lastLog?.createdAt ?? null,
      typeOptions: RIGHTMOVE_TYPES,
      // Same row shape as the idealista types table, so the table is shared.
      types: [...types.values()]
        .map((t) => {
          const effective = resolveRightmoveType(t.id, types);
          return {
            id: t.id,
            parentId: t.parentId,
            name: displayName(t.name),
            idealistaType: t.rightmoveType,
            effectiveType: effective.value,
            source: effective.source,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  // The network/branch IDs pick which Rightmove branch SPM's one certificate
  // writes to, so a client could aim it at another agency's branch. Only a
  // Super Admin (directly or impersonating) may set them, and a branch can
  // belong to one client only.
  async updateSettings(tenantId: number, dto: UpdateRightmoveSettingsDto, canSetIds: boolean) {
    const config = await this.feedExport.ensureConfig(tenantId);
    const current = rightmoveSettings(config);
    const idsChange =
      (dto.networkId !== undefined && dto.networkId !== current.networkId) ||
      (dto.branchId !== undefined && dto.branchId !== current.branchId);
    if (idsChange && !canSetIds) {
      throw new ForbiddenException('The Rightmove network and branch ID are set by SPM support — contact us to change them');
    }
    const branchId = dto.branchId !== undefined ? dto.branchId : current.branchId;
    if (idsChange && branchId != null) {
      const taken = await this.configRepository
        .createQueryBuilder('c')
        .where('c.tenantId != :tenantId', { tenantId })
        .andWhere("JSON_EXTRACT(c.rightmove, '$.branchId') = :branchId", { branchId })
        .getCount();
      if (taken) throw new BadRequestException(`Rightmove branch ${branchId} is already used by another client`);
    }
    const next = { ...current, ...stripUndefined(dto) };
    next.propertyIds = [...new Set(next.propertyIds || [])];
    config.rightmove = next;
    await this.configRepository.save(config);
    return { settings: next };
  }

  async updateTypes(tenantId: number, dto: UpdateRightmoveTypesDto) {
    const ids = dto.types.map((t) => t.id);
    if (!ids.length) return { updated: 0 };
    const owned = await this.typeRepository.find({ where: { tenantId, id: In(ids) }, select: ['id'] });
    const ownedIds = new Set(owned.map((t) => t.id));
    const foreign = ids.filter((id) => !ownedIds.has(id));
    if (foreign.length) throw new BadRequestException(`Unknown property type(s): ${foreign.join(', ')}`);
    for (const t of dto.types) {
      await this.typeRepository.update({ id: t.id, tenantId }, { rightmoveType: t.rightmoveType });
    }
    return { updated: dto.types.length };
  }

  // What would be sent, what is left out and why, and how it went last time.
  async check(tenantId: number) {
    const { settings, built, skipped } = await this.sync.build(tenantId);
    const warnings: string[] = [];
    if (!this.client.isLive) {
      warnings.push('No Rightmove certificate on the server yet — pushes are a dry run and nothing reaches Rightmove.');
    }
    if (!settings.networkId || !settings.branchId) warnings.push('No Rightmove network / branch ID yet — Rightmove gives them to the agency.');
    if (!settings.enabled) warnings.push('Rightmove is switched off — nothing is sent until it is on.');
    if (settings.mode === 'selected' && !settings.propertyIds.length) warnings.push('No listings picked yet.');

    const rows = await this.listingRepository.find({ where: { tenantId } });
    const byRef = new Map(rows.map((r) => [r.agentRef, r]));
    return {
      included: built.length,
      skipped: skipped.map((s) => ({ id: s.propertyId, reference: s.agentRef, reason: s.reason })),
      issues: built
        .filter((b) => b.issues.length || byRef.get(b.agentRef)?.lastError)
        .map((b) => {
          const err = byRef.get(b.agentRef)?.lastError;
          return { id: b.propertyId, reference: b.agentRef, issues: err ? [`Rightmove: ${err}`, ...b.issues] : b.issues };
        }),
      pending: built.filter((b) => {
        const row = byRef.get(b.agentRef);
        return !row || row.state !== 'live' || row.payloadHash !== b.hash;
      }).length,
      warnings,
      sample: built[0]?.payload ?? null,
    };
  }

  // Towns used by the listings in the feed, and the Rightmove place each goes to.
  async towns(tenantId: number) {
    const { settings, built, skipped } = await this.sync.build(tenantId);
    const ctx = await this.sync.loadContext(tenantId, settings);
    const listingIds = [...built, ...skipped].map((b) => b.propertyId);
    if (!listingIds.length) return { placeCount: ctx.gazetteer.size, towns: [] };
    const rows = await this.locationRepository
      .createQueryBuilder('l')
      .select('l.id', 'id')
      .addSelect('COUNT(p.id)', 'n')
      .innerJoin('properties', 'p', 'p.locationId = l.id')
      .where('l.tenantId = :tenantId', { tenantId })
      .andWhere('p.id IN (:...ids)', { ids: listingIds })
      .groupBy('l.id')
      .getRawMany<{ id: number; n: string }>();
    const towns = rows.map((r) => {
      const loc = ctx.locations.get(Number(r.id));
      const { place } = resolvePlace(Number(r.id), ctx);
      const parent = loc?.parentId != null ? ctx.locations.get(loc.parentId) : undefined;
      return {
        locationId: Number(r.id),
        name: displayName(loc?.name),
        parent: displayName(parent?.name),
        listings: Number(r.n),
        linked: loc?.rightmoveLocationId != null,
        place: place ? { id: place.id, label: placeLabel(place) } : null,
      };
    });
    towns.sort((a, b) => Number(!!a.place) - Number(!!b.place) || b.listings - a.listings);
    return { placeCount: ctx.gazetteer.size, towns };
  }

  async setTown(tenantId: number, dto: SetRightmoveTownDto) {
    const loc = await this.locationRepository.findOne({ where: { id: dto.locationId, tenantId }, select: ['id'] });
    if (!loc) throw new NotFoundException('Location not found');
    if (dto.rightmoveLocationId !== null && !(await this.placeRepository.exists({ where: { id: dto.rightmoveLocationId } }))) {
      throw new BadRequestException('Unknown Rightmove place');
    }
    await this.locationRepository.update({ id: dto.locationId, tenantId }, { rightmoveLocationId: dto.rightmoveLocationId });
    return { success: true };
  }

  async searchPlaces(search: string) {
    const key = placeKey(search);
    if (key.length < 2) return [];
    const rows = await this.placeRepository
      .createQueryBuilder('r')
      .where('r.townKey LIKE :like', { like: `%${key.replace(/[%_\\]/g, '\\$&')}%` })
      .orderBy('CHAR_LENGTH(r.townKey)', 'ASC')
      .take(30)
      .getMany();
    return rows.map((r) => ({ id: r.id, label: placeLabel(r) }));
  }

  async logs(tenantId: number) {
    const [logs, listings] = await Promise.all([
      this.logRepository.find({ where: { tenantId }, order: { createdAt: 'DESC' }, take: 100 }),
      this.listingRepository.find({ where: { tenantId, state: 'live' }, order: { lastPushedAt: 'DESC' }, take: 500 }),
    ]);
    return {
      logs,
      listings: listings.map((l) => ({
        agentRef: l.agentRef,
        propertyId: l.propertyId,
        rightmoveUrl: l.rightmoveUrl,
        lastPushedAt: l.lastPushedAt,
        warnings: l.warnings,
      })),
    };
  }

  pushNow(tenantId: number) {
    return this.sync.pushTenant(tenantId);
  }

  reconcile(tenantId: number) {
    return this.sync.reconcile(tenantId);
  }

  // ============ Super Admin: Rightmove's place list ============

  async placeStats() {
    return { count: await this.placeRepository.count() };
  }

  // Replaces the whole list. Columns are found by header (country, region,
  // sub region, town, alias); without a header the order is region,
  // sub-region, town — or town names alone, one per line. Region and
  // sub-region may be left out (the old Odoo feed's list is towns only): the
  // listing's own names are sent then. An alias row ("La Cala Golf" → town
  // "Mijas Golf") sends listings named by the alias as that town.
  async importPlaces(text: string) {
    const rows = parseTable(text);
    if (!rows.length) throw new BadRequestException('The file is empty');
    const header = rows[0].map((h) => placeKey(h));
    const find = (re: RegExp) => header.findIndex((h) => re.test(h));
    let col = {
      country: find(/^country/),
      region: find(/^region$|^region name/),
      sub: find(/^sub ?region/),
      town: find(/^town|^city|^location/),
      alias: find(/^alias|^also|^our name|^odoo/),
    };
    let body = rows.slice(1);
    if (col.region < 0 && col.town < 0) {
      const single = rows.every((r) => r.filter((f) => f.trim()).length <= 1);
      col = single
        ? { country: -1, region: -1, sub: -1, town: 0, alias: -1 }
        : { country: -1, region: 0, sub: 1, town: 2, alias: -1 };
      body = rows;
    }
    const seen = new Set<string>();
    const places: Array<Partial<RightmoveLocation>> = [];
    for (const r of body) {
      const country = (col.country >= 0 ? r[col.country] : 'ES')?.trim().toUpperCase() || 'ES';
      const code = country.length === 2 ? country : /spain|espa/i.test(country) ? 'ES' : '';
      if (code !== 'ES') continue;
      const region = (col.region >= 0 ? r[col.region] : '')?.trim() || '';
      const subRegion = (col.sub >= 0 ? r[col.sub] : '')?.trim() || null;
      const town = (col.town >= 0 ? r[col.town] : '')?.trim() || null;
      const alias = (col.alias >= 0 ? r[col.alias] : '')?.trim() || null;
      if (!region && !town) continue;
      const keys = [placeKey(town || subRegion || region), ...(alias && town ? [placeKey(alias)] : [])];
      for (const townKey of keys) {
        const dedupe = `${placeKey(region)}|${placeKey(subRegion)}|${townKey}`;
        if (!townKey || seen.has(dedupe)) continue;
        seen.add(dedupe);
        places.push({ countryCode: 'ES', region: region.slice(0, 120), subRegion: subRegion?.slice(0, 120) ?? null, town: town?.slice(0, 120) ?? null, townKey: townKey.slice(0, 120) });
      }
    }
    if (!places.length) throw new BadRequestException('No Spanish places found — expected columns region, sub region, town (or town names alone)');

    // Places already known keep their id, so towns clients linked by hand stay
    // linked; places gone from the file are deleted and their links cleared.
    const keyOf = (p: Partial<RightmoveLocation>) => `${placeKey(p.region)}|${placeKey(p.subRegion)}|${p.townKey}`;
    const existing = await this.placeRepository.find();
    const byKey = new Map(existing.map((e) => [keyOf(e), e]));
    const fresh = places.filter((p) => !byKey.has(keyOf(p)));
    const keep = new Set(places.map(keyOf));
    const gone = existing.filter((e) => !keep.has(keyOf(e))).map((e) => e.id);
    await this.placeRepository.manager.transaction(async (em) => {
      for (let i = 0; i < fresh.length; i += 500) await em.insert(RightmoveLocation, fresh.slice(i, i + 500));
      for (let i = 0; i < gone.length; i += 500) {
        const ids = gone.slice(i, i + 500);
        await em.update(Location, { rightmoveLocationId: In(ids) }, { rightmoveLocationId: null });
        await em.delete(RightmoveLocation, { id: In(ids) });
      }
    });
    return { imported: places.length, added: fresh.length, removed: gone.length };
  }
}

function placeLabel(p: { region: string; subRegion: string | null; town: string | null }): string {
  return [p.town, p.subRegion, p.region].filter(Boolean).join(', ');
}

// CSV, or tab / semicolon separated (no quoting) when the first line says so.
function parseTable(text: string): string[][] {
  const first = text.replace(/^﻿/, '').split(/\r?\n/, 1)[0] || '';
  const count = (ch: string) => first.split(ch).length - 1;
  if (count('\t') > count(',') || count(';') > count(',')) {
    const sep = count('\t') >= count(';') ? '\t' : ';';
    return text
      .replace(/^﻿/, '')
      .split(/\r?\n/)
      .map((l) => l.split(sep).map((f) => f.replace(/^"|"$/g, '')))
      .filter((r) => r.some((f) => f.trim()));
  }
  return parseCsv(text);
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}
