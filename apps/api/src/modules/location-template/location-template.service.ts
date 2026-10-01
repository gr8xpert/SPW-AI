import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import {
  Location,
  LocationLevel,
  LocationTemplateNode,
  LocationTemplateUnmatched,
  Property,
} from '../../database/entities';
import { LocationService } from '../location/location.service';
import { levelIndex, locationKey, locationSlug, LOCATION_LEVELS, TemplateLevel } from './location-name';
import {
  FeedLocationInput,
  resolveLocation,
  TemplateIndex,
  TemplateNodeLite,
  validCoords,
} from './location-template.resolver';
import {
  CreateTemplateNodeDto,
  MoveTemplateNodeDto,
  UpdateTemplateNodeDto,
} from './dto/location-template.dto';
import { checkCoords, CoordNode, findOutliers, normalizePostcode } from './template-coords';
import { distanceKm } from '../location/location-points';

// What a feed says about a listing's location, as stored on the property.
export type FeedLocationRecord = FeedLocationInput & { provider?: string };

interface UnmatchedTally {
  provider: string;
  province: string | null;
  area: string | null;
  name: string;
  subName: string | null;
  placedUnderNodeId: number;
  count: number;
  latSum: number;
  lngSum: number;
  geoCount: number;
}

// Working state for one import run (or one re-apply) of one tenant. The
// template and the tenant's location rows are read once and kept in memory, so
// placing 1,000+ listings costs database writes only where something changes.
export interface TemplateRunContext {
  tenantId: number;
  provider: string;
  index: TemplateIndex;
  rows: Map<number, Location>;
  byTemplateId: Map<number, Location>;
  placed: Map<string, number>;
  unmatched: Map<string, UnmatchedTally>;
  recordUnmatched: boolean;
  stats: { created: number; adopted: number; moved: number; renamed: number };
}

// Most unknown towns AI is asked to place per run; the rest wait for the next.
// A system-set point further than this from where its place should be is wrong.
const ROW_POINT_MAX_KM = 15;

@Injectable()
export class LocationTemplateService {
  private readonly logger = new Logger(LocationTemplateService.name);

  constructor(
    @InjectRepository(LocationTemplateNode)
    private readonly nodeRepository: Repository<LocationTemplateNode>,
    @InjectRepository(LocationTemplateUnmatched)
    private readonly unmatchedRepository: Repository<LocationTemplateUnmatched>,
    @InjectRepository(Location)
    private readonly locationRepository: Repository<Location>,
    @InjectRepository(Property)
    private readonly propertyRepository: Repository<Property>,
    // bulkMove merges a moved row into a same-slug sibling (properties and
    // children included) instead of hitting the unique index.
    private readonly locationService: LocationService,
  ) {}

  // ===================================================================
  // Placing listings (feed imports and re-apply)
  // ===================================================================

  async loadIndex(): Promise<TemplateIndex> {
    const nodes = await this.nodeRepository.find({
      select: ['id', 'parentId', 'level', 'name', 'nameKey', 'aliases', 'status', 'lat', 'lng'],
    });
    return new TemplateIndex(nodes as TemplateNodeLite[]);
  }

  // Null when the template is empty, so callers keep the old behaviour.
  async createRunContext(
    tenantId: number,
    provider: string,
    options: { recordUnmatched?: boolean } = {},
  ): Promise<TemplateRunContext | null> {
    const index = await this.loadIndex();
    if (index.size === 0) return null;
    const ctx: TemplateRunContext = {
      tenantId,
      provider,
      index,
      rows: new Map(),
      byTemplateId: new Map(),
      placed: new Map(),
      unmatched: new Map(),
      recordUnmatched: options.recordUnmatched !== false,
      stats: { created: 0, adopted: 0, moved: 0, renamed: 0 },
    };
    await this.reloadRows(ctx);
    return ctx;
  }

  private async reloadRows(ctx: TemplateRunContext): Promise<void> {
    const rows = await this.locationRepository.find({ where: { tenantId: ctx.tenantId } });
    ctx.rows = new Map(rows.map((r) => [r.id, r]));
    ctx.byTemplateId = new Map();
    for (const r of rows) {
      if (r.templateNodeId != null && !ctx.byTemplateId.has(r.templateNodeId)) ctx.byTemplateId.set(r.templateNodeId, r);
    }
  }

  // The tenant location id a listing belongs to, creating or re-arranging the
  // tenant's rows to follow the template. Null when the template can't place it
  // (not even its province is known) — the caller then falls back.
  async placeListing(
    ctx: TemplateRunContext,
    loc: FeedLocationInput,
    geo?: { lat?: number | null; lng?: number | null },
  ): Promise<number | null> {
    const memoKey = [loc.province, loc.area, loc.municipality, loc.town, loc.urbanization].map(locationKey).join('|');
    const resolution = resolveLocation(ctx.index, loc);
    if (!resolution) return null;

    if (resolution.unmatched && ctx.recordUnmatched) this.tally(ctx, loc, resolution.anchor.id, resolution.unmatched, geo);

    const cached = ctx.placed.get(memoKey);
    if (cached && ctx.rows.has(cached)) return cached;

    let parentId: number | null = null;
    for (const node of ctx.index.path(resolution.anchor)) {
      parentId = (await this.ensureTemplateRow(ctx, node, parentId)).id;
    }
    for (const extra of resolution.extras) {
      parentId = (await this.ensureExtraRow(ctx, extra, parentId!)).id;
    }
    ctx.placed.set(memoKey, parentId!);
    return parentId;
  }

  private tally(
    ctx: TemplateRunContext,
    loc: FeedLocationInput,
    anchorId: number,
    unmatched: { name: string; subName: string | null },
    geo?: { lat?: number | null; lng?: number | null },
  ): void {
    const key = [ctx.provider, locationKey(loc.province), locationKey(loc.area), locationKey(unmatched.name), locationKey(unmatched.subName)].join('|');
    let t = ctx.unmatched.get(key);
    if (!t) {
      t = {
        provider: ctx.provider,
        province: loc.province?.trim() || null,
        area: loc.area?.trim() || null,
        name: unmatched.name,
        subName: unmatched.subName,
        placedUnderNodeId: anchorId,
        count: 0,
        latSum: 0,
        lngSum: 0,
        geoCount: 0,
      };
      ctx.unmatched.set(key, t);
    }
    t.count++;
    const lat = Number(geo?.lat);
    const lng = Number(geo?.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0) {
      t.latSum += lat;
      t.lngSum += lng;
      t.geoCount++;
    }
  }

  // The tenant row standing for a template node, found through its link
  // wherever the client put it. Unlinked rows from older imports with the same
  // name are adopted (and re-parented) rather than duplicated, so their
  // properties, translations and ids carry over.
  private async ensureTemplateRow(
    ctx: TemplateRunContext,
    node: TemplateNodeLite,
    expectedParentId: number | null,
  ): Promise<Location> {
    let row = ctx.byTemplateId.get(node.id);
    if (row && !ctx.rows.has(row.id)) row = undefined;
    if (!row) {
      row = this.findAdoptable(ctx, node, expectedParentId);
      if (row) ctx.stats.adopted++;
    }

    if (!row) {
      return this.createRow(ctx, {
        name: node.name,
        level: node.level,
        parentId: expectedParentId,
        templateNodeId: node.id,
        coords: ctx.index.coords(node),
      });
    }

    const updates: Partial<Location> = {};
    if (row.templateNodeId !== node.id) updates.templateNodeId = node.id;
    // Map position for listings without their own GPS. A point the template
    // holds for this very place is the reference and replaces whatever the
    // system put there before (geocoder, parent's point); a borrowed one (the
    // parent's, children's average) fills a row that has nothing, and replaces
    // a system-set point that is nowhere near the place (an old geocoder hit on
    // a namesake town, say). A position the client typed in is never touched.
    if (!row.coordsLocked) {
      const own = placeCoords(node.lat, node.lng);
      const borrowed = own ? null : ctx.index.coords(node);
      const rowOk =
        validCoords(row.lat, row.lng) &&
        (!borrowed || distanceKm(Number(row.lat), Number(row.lng), borrowed.lat, borrowed.lng) <= ROW_POINT_MAX_KM);
      const c = own ?? (rowOk ? null : borrowed);
      if (c && !sameSpot(row, c)) {
        updates.lat = c.lat;
        updates.lng = c.lng;
      }
    }

    if (!row.userLocked) {
      if (row.parentId !== expectedParentId) {
        row = await this.moveRow(ctx, row, expectedParentId, node.id);
        ctx.stats.moved++;
      }
      if (row.level !== node.level) updates.level = node.level as LocationLevel;
      const current = row.name || {};
      if ((current.en || '') !== node.name) {
        updates.name = {
          ...current,
          en: node.name,
          // Keep a real Spanish translation; replace one that only copied the English.
          es: !current.es || current.es === current.en ? node.name : current.es,
        };
        ctx.stats.renamed++;
      }
    }

    if (Object.keys(updates).length) {
      await this.locationRepository.update({ id: row.id, tenantId: ctx.tenantId }, updates);
      Object.assign(row, updates);
    }
    ctx.byTemplateId.set(node.id, row);
    return row;
  }

  private findAdoptable(
    ctx: TemplateRunContext,
    node: TemplateNodeLite,
    expectedParentId: number | null,
  ): Location | undefined {
    const keys = new Set([node.nameKey, ...(node.aliases || []).map(locationKey)]);
    const candidates = [...ctx.rows.values()].filter(
      (r) => r.templateNodeId == null && keys.has(locationKey(r.name?.en)),
    );
    if (!candidates.length) return undefined;

    const underParent = candidates.filter((r) => r.parentId === expectedParentId);
    let pool = underParent;
    if (!pool.length) {
      if (levelIndex(node.level) <= levelIndex('area')) {
        // Region/province/area rows may sit anywhere (e.g. a province imported
        // before regions existed sits at the root).
        pool = candidates.filter((r) => levelIndex(r.level) <= levelIndex('area'));
      } else {
        // Municipality and below: only rows already inside the same area (or
        // province) of this tenant — "El Chaparral" of Mijas must not adopt
        // the Torrevieja one.
        const scope = this.scopeRow(ctx, node);
        pool = scope ? candidates.filter((r) => this.isDescendant(ctx, r, scope.id)) : [];
      }
    }
    return pool.sort(
      (a, b) =>
        Number(b.level === node.level) - Number(a.level === node.level) || a.id - b.id,
    )[0];
  }

  private scopeRow(ctx: TemplateRunContext, node: TemplateNodeLite): Location | undefined {
    for (const level of ['area', 'province'] as TemplateLevel[]) {
      const anc = ctx.index.ancestor(node, level);
      const row = anc ? ctx.byTemplateId.get(anc.id) : undefined;
      if (row) return row;
    }
    return undefined;
  }

  private isDescendant(ctx: TemplateRunContext, row: Location, ancestorId: number): boolean {
    let cur: Location | undefined = row;
    const seen = new Set<number>();
    while (cur && cur.parentId != null && !seen.has(cur.id)) {
      seen.add(cur.id);
      if (cur.parentId === ancestorId) return true;
      cur = ctx.rows.get(cur.parentId);
    }
    return false;
  }

  private async moveRow(
    ctx: TemplateRunContext,
    row: Location,
    parentId: number | null,
    templateNodeId: number,
  ): Promise<Location> {
    const twin = [...ctx.rows.values()].find(
      (r) => r.id !== row.id && r.parentId === parentId && r.slug === row.slug,
    );
    if (!twin) {
      await this.locationRepository.update({ id: row.id, tenantId: ctx.tenantId }, { parentId });
      row.parentId = parentId;
      return row;
    }
    // A same-slug row already sits there: fold this one into it (properties and
    // children move across) and keep the survivor linked.
    await this.locationService.bulkMove(ctx.tenantId, [row.id], parentId);
    await this.reloadRows(ctx);
    const survivor = ctx.rows.get(twin.id)!;
    if (survivor.templateNodeId !== templateNodeId) {
      await this.locationRepository.update({ id: survivor.id, tenantId: ctx.tenantId }, { templateNodeId });
      survivor.templateNodeId = templateNodeId;
    }
    ctx.placed.clear();
    return survivor;
  }

  private async ensureExtraRow(
    ctx: TemplateRunContext,
    extra: { name: string; level: TemplateLevel },
    parentId: number,
  ): Promise<Location> {
    const key = locationKey(extra.name);
    const existing = [...ctx.rows.values()].find(
      (r) => r.parentId === parentId && locationKey(r.name?.en) === key,
    );
    if (existing) {
      // Rows from before the level rule (an "urbanization" straight under a
      // province) are corrected, unless the client chose the level themselves.
      if (existing.level !== extra.level && !existing.userLocked) {
        existing.level = extra.level;
        await this.locationRepository.update({ id: existing.id, tenantId: ctx.tenantId }, { level: extra.level });
      }
      return existing;
    }
    // A place the template doesn't know sits where its parent is until it's added.
    const parent = ctx.rows.get(parentId);
    return this.createRow(ctx, {
      name: extra.name,
      level: extra.level,
      parentId,
      templateNodeId: null,
      coords: parent ? validCoords(parent.lat, parent.lng) : null,
    });
  }

  private async createRow(
    ctx: TemplateRunContext,
    data: {
      name: string;
      level: TemplateLevel;
      parentId: number | null;
      templateNodeId: number | null;
      coords?: { lat: number; lng: number } | null;
    },
  ): Promise<Location> {
    const slug = locationSlug(data.name) || 'location';
    // Same slug under the same parent (unique index): reuse that row.
    const clash = [...ctx.rows.values()].find((r) => r.parentId === data.parentId && r.slug === slug);
    if (clash) {
      if (data.templateNodeId != null && clash.templateNodeId == null) {
        await this.locationRepository.update({ id: clash.id, tenantId: ctx.tenantId }, { templateNodeId: data.templateNodeId });
        clash.templateNodeId = data.templateNodeId;
        ctx.byTemplateId.set(data.templateNodeId, clash);
      }
      return clash;
    }
    let row: Location;
    try {
      row = await this.locationRepository.save(
        this.locationRepository.create({
          tenantId: ctx.tenantId,
          name: { en: data.name, es: data.name },
          slug,
          level: data.level as LocationLevel,
          parentId: data.parentId,
          templateNodeId: data.templateNodeId,
          lat: data.coords?.lat ?? null,
          lng: data.coords?.lng ?? null,
        }),
      );
    } catch (err) {
      // Another import of the same tenant created it a moment ago.
      const existing = await this.locationRepository.findOne({
        where: { tenantId: ctx.tenantId, slug, parentId: data.parentId === null ? IsNull() : data.parentId },
      });
      if (!existing) throw err;
      row = existing;
    }
    ctx.rows.set(row.id, row);
    if (data.templateNodeId != null) ctx.byTemplateId.set(data.templateNodeId, row);
    ctx.stats.created++;
    return row;
  }

  // The AI review of unknown names (UnmatchedReviewService registers itself
  // here, which keeps the two services free of a circular dependency).
  private unmatchedReviewer:
    | ((entries: LocationTemplateUnmatched[], keyTenantId: number) => Promise<{ applied: number; tenantIds: number[] }>)
    | null = null;
  setUnmatchedReviewer(fn: NonNullable<LocationTemplateService['unmatchedReviewer']>): void {
    this.unmatchedReviewer = fn;
  }

  // After an import: record unknown locations, let the AI review sort the new
  // ones it is sure of (another spelling of a template place near the
  // listings, or a new town in a municipality), re-place the listings of EVERY
  // client that sent those names — not just this one — and remove location
  // rows the template made redundant.
  async finishRun(ctx: TemplateRunContext): Promise<{ unmatched: number; aiPlaced: number; relocated: number; cleaned: number }> {
    const entries = await this.saveUnmatched(ctx);
    const fresh = entries.filter((e) => !e.dismissed && !e.aiAttempted && e.resolvedNodeId == null);
    const review = this.unmatchedReviewer && fresh.length
      ? await this.unmatchedReviewer(fresh, ctx.tenantId).catch((err) => {
          this.logger.warn(`AI review of unknown locations failed for tenant=${ctx.tenantId}: ${(err as Error).message}`);
          return { applied: 0, tenantIds: [] as number[] };
        })
      : { applied: 0, tenantIds: [] as number[] };
    const aiPlaced = review.applied;
    let relocated = 0;
    if (aiPlaced > 0) relocated = (await this.reapplyTenants([ctx.tenantId, ...review.tenantIds])).relocated;
    const cleaned = await this.cleanupRedundantRows(ctx.tenantId);
    if (ctx.stats.created || ctx.stats.adopted || ctx.stats.moved || entries.length || aiPlaced || cleaned) {
      this.logger.log(
        `Location template tenant=${ctx.tenantId}: created=${ctx.stats.created} adopted=${ctx.stats.adopted} ` +
          `moved=${ctx.stats.moved} renamed=${ctx.stats.renamed} unmatched=${entries.length} aiPlaced=${aiPlaced} ` +
          `relocated=${relocated} cleaned=${cleaned}`,
      );
    }
    return { unmatched: entries.length, aiPlaced, relocated, cleaned };
  }

  private async saveUnmatched(ctx: TemplateRunContext): Promise<LocationTemplateUnmatched[]> {
    const saved: LocationTemplateUnmatched[] = [];
    for (const [matchKey, t] of ctx.unmatched) {
      let row = await this.unmatchedRepository.findOne({ where: { matchKey } });
      if (!row) {
        row = this.unmatchedRepository.create({ matchKey, provider: t.provider, dismissed: false, aiAttempted: false });
      }
      row.province = t.province;
      row.area = t.area;
      row.name = t.name.slice(0, 150);
      row.subName = t.subName?.slice(0, 150) ?? null;
      row.placedUnderNodeId = t.placedUnderNodeId;
      row.occurrences = t.count;
      row.tenantIds = [...new Set([...(row.tenantIds || []), ctx.tenantId])];
      if (t.geoCount) {
        row.lat = Number((t.latSum / t.geoCount).toFixed(7));
        row.lng = Number((t.lngSum / t.geoCount).toFixed(7));
      }
      // Still unmatched, so any node it was marked as resolved by no longer
      // covers it.
      row.resolvedNodeId = null;
      saved.push(await this.unmatchedRepository.save(row));
    }
    return saved;
  }

  // Re-places every feed listing of a tenant from the names stored on it, so
  // template changes apply without waiting for the next sync.
  async reapplyTenant(tenantId: number): Promise<{ relocated: number; cleaned: number; listings: number }> {
    const ctx = await this.createRunContext(tenantId, 'reapply', { recordUnmatched: false });
    if (!ctx) return { relocated: 0, cleaned: 0, listings: 0 };
    const listings = await this.propertyRepository.find({
      where: { tenantId, feedLocation: Not(IsNull()) },
      select: ['id', 'locationId', 'lockedFields', 'feedLocation', 'lat', 'lng'],
    });
    let relocated = 0;
    for (const p of listings) {
      if ((p.lockedFields || []).includes('locationId')) continue;
      const target = await this.placeListing(ctx, p.feedLocation as FeedLocationInput, { lat: p.lat, lng: p.lng });
      if (target && target !== p.locationId) {
        await this.propertyRepository.update({ id: p.id, tenantId }, { locationId: target });
        relocated++;
      }
    }
    const cleaned = await this.cleanupRedundantRows(tenantId);
    return { relocated, cleaned, listings: listings.length };
  }

  async reapplyAll(): Promise<{ tenants: number; relocated: number; cleaned: number }> {
    const rows: Array<{ tenantId: number }> = await this.propertyRepository.manager.query(
      'SELECT DISTINCT tenantId FROM properties WHERE feedLocation IS NOT NULL',
    );
    let relocated = 0;
    let cleaned = 0;
    for (const { tenantId } of rows) {
      try {
        const r = await this.reapplyTenant(Number(tenantId));
        relocated += r.relocated;
        cleaned += r.cleaned;
      } catch (err) {
        this.logger.warn(`Re-apply failed for tenant=${tenantId}: ${(err as Error).message}`);
      }
    }
    return { tenants: rows.length, relocated, cleaned };
  }

  // Deletes municipality/town/urbanization rows left empty after listings moved
  // to template-linked rows — e.g. an older import's "Arroyo de la Miel"
  // municipality. Only rows no template node stands behind, that the client
  // never arranged by hand, with no listing anywhere below them, and inside a
  // province or area the template already manages.
  async cleanupRedundantRows(tenantId: number): Promise<number> {
    const rows = await this.locationRepository.find({ where: { tenantId } });
    const counts: Array<{ locationId: number; cnt: string }> = await this.locationRepository.manager.query(
      'SELECT locationId, COUNT(*) AS cnt FROM properties WHERE tenantId = ? AND locationId IS NOT NULL GROUP BY locationId',
      [tenantId],
    );
    const direct = new Map(counts.map((c) => [Number(c.locationId), Number(c.cnt)]));
    const byId = new Map(rows.map((r) => [r.id, r]));
    const children = new Map<number, Location[]>();
    for (const r of rows) {
      if (r.parentId == null) continue;
      const list = children.get(r.parentId) || [];
      list.push(r);
      children.set(r.parentId, list);
    }
    const subtreeCount = new Map<number, number>();
    const countOf = (r: Location): number => {
      if (subtreeCount.has(r.id)) return subtreeCount.get(r.id)!;
      const total = (direct.get(r.id) || 0) + (children.get(r.id) || []).reduce((s, c) => s + countOf(c), 0);
      subtreeCount.set(r.id, total);
      return total;
    };
    const insideManagedArea = (r: Location): boolean => {
      let cur = r.parentId != null ? byId.get(r.parentId) : undefined;
      const seen = new Set<number>();
      while (cur && !seen.has(cur.id)) {
        seen.add(cur.id);
        if (cur.templateNodeId != null && (cur.level === 'area' || cur.level === 'province')) return true;
        cur = cur.parentId != null ? byId.get(cur.parentId) : undefined;
      }
      return false;
    };
    const doomed = rows.filter(
      (r) =>
        r.templateNodeId == null &&
        !r.userLocked &&
        ['municipality', 'town', 'urbanization'].includes(r.level) &&
        countOf(r) === 0 &&
        insideManagedArea(r) &&
        (children.get(r.id) || []).every((c) => c.templateNodeId == null && !c.userLocked),
    );
    if (!doomed.length) return 0;
    // Children first so no row is orphaned; a doomed parent's whole subtree is doomed too.
    const doomedIds = new Set(doomed.map((r) => r.id));
    const ordered = doomed.sort((a, b) => levelIndex(b.level) - levelIndex(a.level));
    for (let i = 0; i < ordered.length; i += 200) {
      await this.locationRepository.delete({ tenantId, id: In(ordered.slice(i, i + 200).map((r) => r.id)) });
    }
    return doomedIds.size;
  }

  // ===================================================================
  // Super Admin
  // ===================================================================

  async list(): Promise<{
    nodes: LocationTemplateNode[];
    unmatchedOpen: number;
    usage: Record<number, number>;
  }> {
    const nodes = await this.nodeRepository.find({ order: { sortOrder: 'ASC', name: 'ASC' } });
    const unmatchedOpen = await this.unmatchedRepository.count({ where: { dismissed: false, resolvedNodeId: IsNull() } });
    // How many client location rows link to each node — shown so an edit's
    // reach is visible before making it.
    const usageRows: Array<{ templateNodeId: number; cnt: string }> = await this.locationRepository.manager.query(
      'SELECT templateNodeId, COUNT(*) AS cnt FROM locations WHERE templateNodeId IS NOT NULL GROUP BY templateNodeId',
    );
    const usage: Record<number, number> = {};
    for (const u of usageRows) usage[Number(u.templateNodeId)] = Number(u.cnt);
    return { nodes, unmatchedOpen, usage };
  }

  async create(dto: CreateTemplateNodeDto): Promise<LocationTemplateNode> {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Name is required');
    let parent: LocationTemplateNode | null = null;
    if (dto.parentId != null) {
      parent = await this.nodeRepository.findOne({ where: { id: dto.parentId } });
      if (!parent) throw new NotFoundException('Parent not found');
      // Strict hierarchy: Region › Province › Area › Municipality › Town ›
      // Urbanization, each exactly one level below its parent.
      if (levelIndex(dto.level) !== levelIndex(parent.level) + 1) {
        throw new BadRequestException(levelMismatch(parent.level));
      }
    } else if (dto.level !== 'region') {
      throw new BadRequestException('Only regions can be at the top level');
    }
    const nameKey = locationKey(name);
    const twin = await this.nodeRepository.findOne({
      where: { parentId: dto.parentId == null ? IsNull() : dto.parentId, nameKey },
    });
    if (twin) throw new ConflictException(`"${twin.name}" already exists here`);
    return this.nodeRepository.save(
      this.nodeRepository.create({
        parentId: dto.parentId ?? null,
        level: dto.level,
        name,
        nameKey,
        aliases: this.cleanAliases(dto.aliases, name),
        postcode: normalizePostcode(dto.postcode),
        ...(() => {
          const c = checkCoords(dto.lat, dto.lng);
          if (!c.ok && c.problem) throw new BadRequestException(`Coordinates refused: ${c.problem}`);
          return c.ok ? { lat: c.lat, lng: c.lng, coordsConfirmed: true } : { lat: null, lng: null };
        })(),
        status: 'ok',
        note: null,
      }),
    );
  }

  async update(id: number, dto: UpdateTemplateNodeDto): Promise<LocationTemplateNode> {
    const node = await this.nodeRepository.findOne({ where: { id } });
    if (!node) throw new NotFoundException('Location not found');
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('Name is required');
      const nameKey = locationKey(name);
      if (nameKey !== node.nameKey) {
        const twin = await this.nodeRepository.findOne({
          where: { parentId: node.parentId == null ? IsNull() : node.parentId, nameKey },
        });
        if (twin && twin.id !== id) throw new ConflictException(`"${twin.name}" already exists here`);
        // Keep the old spelling matching: feeds may still send it.
        dto.aliases = [...(dto.aliases ?? node.aliases ?? []), node.name];
      }
      node.name = name;
      node.nameKey = nameKey;
    }
    if (dto.aliases !== undefined) node.aliases = this.cleanAliases(dto.aliases, node.name);
    if (dto.postcode !== undefined) node.postcode = normalizePostcode(dto.postcode);
    if (dto.lat !== undefined || dto.lng !== undefined) {
      const lat = dto.lat !== undefined ? dto.lat : node.lat;
      const lng = dto.lng !== undefined ? dto.lng : node.lng;
      const c = checkCoords(lat, lng);
      if (c.ok) {
        node.lat = c.lat;
        node.lng = c.lng;
        // A person entered it (or confirmed it): the old complaint is answered,
        // and the distance check won't second-guess it.
        node.coordsIssue = null;
        node.coordsConfirmed = true;
      } else if (c.problem) {
        throw new BadRequestException(`Coordinates refused: ${c.problem}`);
      } else {
        node.lat = null;
        node.lng = null;
        node.coordsConfirmed = false;
      }
    }
    if (dto.level !== undefined && dto.level !== node.level) {
      await this.assertLevelFits(node, dto.level, node.parentId);
      node.level = dto.level;
    }
    if (dto.status !== undefined) {
      node.status = dto.status;
      if (dto.status === 'ok') node.note = null;
    }
    if (dto.note !== undefined) node.note = dto.note?.trim() || null;
    return this.nodeRepository.save(node);
  }

  async move(id: number, dto: MoveTemplateNodeDto): Promise<LocationTemplateNode> {
    const node = await this.nodeRepository.findOne({ where: { id } });
    if (!node) throw new NotFoundException('Location not found');
    const parentId = dto.parentId ?? null;
    if (parentId === node.parentId) return node;
    if (parentId != null) {
      const index = await this.loadIndex();
      const target = index.byId.get(parentId);
      if (!target) throw new NotFoundException('Target not found');
      if (index.path(target).some((n) => n.id === id)) {
        throw new BadRequestException('A location cannot move inside itself');
      }
    }
    await this.assertLevelFits(node, node.level, parentId);
    const twin = await this.nodeRepository.findOne({
      where: { parentId: parentId == null ? IsNull() : parentId, nameKey: node.nameKey },
    });
    if (twin && twin.id !== id) throw new ConflictException(`"${twin.name}" already exists there — edit or delete one of them first`);
    node.parentId = parentId;
    return this.nodeRepository.save(node);
  }

  private async assertLevelFits(node: LocationTemplateNode, level: TemplateLevel, parentId: number | null): Promise<void> {
    if (parentId == null) {
      if (level !== 'region') throw new BadRequestException('Only regions can be at the top level');
    } else {
      const parent = await this.nodeRepository.findOne({ where: { id: parentId } });
      if (!parent) throw new NotFoundException('Target not found');
      if (levelIndex(level) !== levelIndex(parent.level) + 1) {
        throw new BadRequestException(levelMismatch(parent.level));
      }
    }
    const children = await this.nodeRepository.find({ where: { parentId: node.id }, select: ['level'] });
    if (children.some((c) => levelIndex(c.level) !== levelIndex(level) + 1)) {
      throw new BadRequestException(`The places inside it would no longer be one level below a ${level}`);
    }
  }

  // Deletes the node and everything under it. Client rows linked to any of them
  // lose the link (they're kept); the next sync re-places their listings.
  async remove(id: number): Promise<{ deleted: number }> {
    const index = await this.loadIndex();
    const node = index.byId.get(id);
    if (!node) throw new NotFoundException('Location not found');
    const ids = [...index.byId.values()].filter((n) => index.isUnder(n, node)).map((n) => n.id);
    for (let i = 0; i < ids.length; i += 500) {
      await this.locationRepository.update({ templateNodeId: In(ids.slice(i, i + 500)) }, { templateNodeId: null });
    }
    await this.nodeRepository.delete({ id });
    return { deleted: ids.length };
  }

  private cleanAliases(aliases: string[] | null | undefined, name: string): string[] | null {
    const nameKey = locationKey(name);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const a of aliases || []) {
      const t = String(a).trim();
      const k = locationKey(t);
      if (!k || k === nameKey || seen.has(k)) continue;
      seen.add(k);
      out.push(t.slice(0, 150));
    }
    return out.length ? out : null;
  }

  async listUnmatched(): Promise<Array<LocationTemplateUnmatched & { placedUnder: string }>> {
    const rows = await this.unmatchedRepository.find({
      where: { dismissed: false, resolvedNodeId: IsNull() },
      order: { occurrences: 'DESC', lastSeenAt: 'DESC' },
      take: 500,
    });
    const index = await this.loadIndex();
    return rows.map((r) => {
      const anchor = r.placedUnderNodeId != null ? index.byId.get(r.placedUnderNodeId) : undefined;
      return { ...r, placedUnder: anchor ? index.path(anchor).map((n) => n.name).join(' > ') : '' };
    });
  }

  async dismissUnmatched(id: number, by: 'person' | 'ai' = 'person'): Promise<void> {
    await this.unmatchedRepository.update(
      { id },
      { dismissed: true, resolution: { kind: 'dismiss', by, at: new Date().toISOString() } },
    );
  }

  /** Names sorted recently (newest first), each with what Undo would reverse. */
  async listSortedUnmatched(): Promise<Array<LocationTemplateUnmatched & { placedUnder: string; target: string }>> {
    const rows = await this.unmatchedRepository.find({
      where: { resolution: Not(IsNull()) },
      order: { lastSeenAt: 'DESC' },
      take: 300,
    });
    const index = await this.loadIndex();
    const pathOf = (id: number | null | undefined) => {
      const n = id != null ? index.byId.get(id) : undefined;
      return n ? index.path(n).map((p) => p.name).join(' › ') : '';
    };
    return rows.map((r) => ({ ...r, placedUnder: pathOf(r.placedUnderNodeId), target: pathOf(r.resolution?.nodeId) }));
  }

  /**
   * Reverses what sorting this entry changed — removes the alias it added, the
   * town it created, or the dismiss — puts it back in the open list (its AI
   * suggestion kept) and re-sorts the clients that sent it.
   */
  async undoUnmatched(id: number): Promise<{ undone: string; tenants: number; relocated: number; cleaned: number }> {
    const row = await this.unmatchedRepository.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Unmatched entry not found');
    const res = row.resolution;
    if (!res) throw new BadRequestException('Nothing to undo for this name');

    if (res.kind === 'alias' && res.nodeId && res.aliasAdded) {
      const node = await this.nodeRepository.findOne({ where: { id: res.nodeId } });
      if (node) {
        const key = locationKey(res.alias ?? row.name);
        node.aliases = this.cleanAliases((node.aliases || []).filter((a) => locationKey(a) !== key), node.name);
        await this.nodeRepository.save(node);
      }
    }
    if (res.kind === 'new' && res.nodeId && res.createdNode) {
      const inside = await this.nodeRepository.count({ where: { parentId: res.nodeId } });
      if (inside > 0) {
        throw new BadRequestException('Places were added inside that town since — move or delete them first');
      }
      if (await this.nodeRepository.findOne({ where: { id: res.nodeId } })) await this.remove(res.nodeId);
    }
    await this.unmatchedRepository.update({ id }, { dismissed: false, resolvedNodeId: null, resolution: null });

    const tenantIds = res.kind === 'dismiss' ? [] : [...new Set(row.tenantIds || [])];
    const r = await this.reapplyTenants(tenantIds);
    return { undone: res.kind, tenants: tenantIds.length, ...r };
  }

  /**
   * "ADSUBIA is L'Atzúbia": the feed's spelling becomes an alias of an
   * existing template place, so every client's feed matches it from now on.
   * The clients that sent it are re-applied straight away, which moves their
   * listings onto the right place and clears the stray row the miss created.
   */
  async mapUnmatched(
    id: number,
    nodeId: number,
  ): Promise<{ alias: string; node: string; tenants: number; relocated: number; cleaned: number }> {
    const { row, node } = await this.linkUnmatchedAsAlias(id, nodeId);
    const tenantIds = [...new Set(row.tenantIds || [])];
    const r = await this.reapplyTenants(tenantIds);
    return { alias: row.name, node: node.name, tenants: tenantIds.length, ...r };
  }

  /** The unmatched name becomes an alias of an existing place (no re-apply). */
  async linkUnmatchedAsAlias(
    id: number,
    nodeId: number,
    by: 'person' | 'ai' = 'person',
  ): Promise<{ row: LocationTemplateUnmatched; node: LocationTemplateNode }> {
    const row = await this.unmatchedRepository.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Unmatched entry not found');
    const node = await this.nodeRepository.findOne({ where: { id: nodeId } });
    if (!node) throw new NotFoundException('Location not found');
    const key = locationKey(row.name);
    // Undo only removes a spelling this action added, never one already there.
    const aliasAdded = key !== node.nameKey && !(node.aliases || []).some((a) => locationKey(a) === key);
    node.aliases = this.cleanAliases([...(node.aliases || []), row.name], node.name);
    await this.nodeRepository.save(node);
    await this.unmatchedRepository.update(
      { id },
      {
        resolvedNodeId: node.id,
        resolution: { kind: 'alias', nodeId: node.id, alias: row.name, aliasAdded, by, at: new Date().toISOString() },
      },
    );
    return { row, node };
  }

  /**
   * The unmatched name becomes a new town inside a template municipality (no
   * re-apply). From an automatic AI run it is marked "AI suggested" for review.
   */
  async addTownForUnmatched(
    id: number,
    municipalityId: number,
    status: 'ok' | 'ai_suggested',
    note?: string,
  ): Promise<{ row: LocationTemplateUnmatched; node: LocationTemplateNode }> {
    const row = await this.unmatchedRepository.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Unmatched entry not found');
    const municipality = await this.nodeRepository.findOne({ where: { id: municipalityId } });
    if (!municipality || municipality.level !== 'municipality') throw new BadRequestException('Pick a municipality');
    const nameKey = locationKey(row.name);
    let node =
      (await this.nodeRepository.findOne({ where: { parentId: municipality.id, nameKey } })) ??
      // The name is the municipality itself, spelled differently.
      (municipality.nameKey === nameKey ? municipality : null);
    const createdNode = !node;
    if (!node) {
      node = await this.nodeRepository.save(
        this.nodeRepository.create({
          parentId: municipality.id,
          level: 'town',
          name: row.name.trim().slice(0, 150),
          nameKey,
          lat: row.lat,
          lng: row.lng,
          status,
          note: note ?? null,
        }),
      );
    }
    await this.unmatchedRepository.update(
      { id },
      {
        resolvedNodeId: node.id,
        resolution: {
          kind: 'new',
          nodeId: node.id,
          createdNode,
          by: status === 'ai_suggested' ? 'ai' : 'person',
          at: new Date().toISOString(),
        },
      },
    );
    return { row, node };
  }

  async reapplyTenants(tenantIds: number[]): Promise<{ relocated: number; cleaned: number }> {
    let relocated = 0;
    let cleaned = 0;
    for (const tenantId of [...new Set(tenantIds)]) {
      const r = await this.reapplyTenant(tenantId);
      relocated += r.relocated;
      cleaned += r.cleaned;
    }
    return { relocated, cleaned };
  }

  // ===================================================================
  // CSV
  // ===================================================================

  async exportCsv(): Promise<string> {
    const index = await this.loadIndex();
    const full = await this.nodeRepository.find();
    const byId = new Map(full.map((n) => [n.id, n]));
    const hasChildren = new Set(full.filter((n) => n.parentId != null).map((n) => n.parentId!));
    const header = ['Region', 'Province', 'Area', 'Municipality', 'Town', 'Urbanization', 'Postcode', 'Long', 'Lat', 'Aliases', 'Status', 'Note'];
    const lines = [header.map(csvCell).join(',')];
    const leaves = full.filter((n) => !hasChildren.has(n.id));
    const rows = leaves.map((leaf) => {
      const path = index.path(index.byId.get(leaf.id)!);
      const cols: Record<string, string> = {};
      for (const p of path) cols[p.level] = p.name;
      return [
        ...LOCATION_LEVELS.map((l) => cols[l] || ''),
        leaf.postcode || '',
        leaf.lng != null ? String(leaf.lng) : '',
        leaf.lat != null ? String(leaf.lat) : '',
        (byId.get(leaf.id)?.aliases || []).join('; '),
        leaf.status,
        leaf.note || '',
      ];
    });
    rows.sort((a, b) => a.slice(0, 6).join('|').localeCompare(b.slice(0, 6).join('|')));
    for (const r of rows) lines.push(r.map(csvCell).join(','));
    return lines.join('\r\n');
  }

  // Adds every place in the CSV that the template doesn't have yet, and fills
  // in postcodes and coordinates the template is missing. Same columns as the
  // export (Odoo exports work too). Never deletes, moves, or overwrites a value
  // the template already has. Coordinates are checked before they are used;
  // ones that fail are left out and the reason recorded on the place.
  async importCsv(text: string): Promise<{
    rows: number;
    created: number;
    skipped: number;
    coordsFilled: number;
    postcodesFilled: number;
    refused: number;
    missingCoords: number;
    notPlaced: number;
    notPlacedSample: string[];
  }> {
    const records = parseCsv(text);
    if (records.length < 2) throw new BadRequestException('The file has no rows');
    const header = records[0].map((h) => locationKey(h));
    const col = (name: string) => header.indexOf(name);
    const levelCols = LOCATION_LEVELS.map((l) => col(l));
    if (levelCols[0] < 0 || levelCols[1] < 0) throw new BadRequestException('Expected at least Region and Province columns');
    const iPost = col('postcode');
    const iLat = col('lat');
    const iLng = col('long') >= 0 ? col('long') : col('lng');
    const iAliases = col('aliases');

    const all = await this.nodeRepository.find();
    const byId = new Map(all.map((n) => [n.id, n]));
    // Every spelling of every place. A list like this one is usually arranged
    // differently from the template ("Costa Blanca" for "Costa Blanca South"),
    // so places are found by name inside their province, never by full path.
    const byKey = new Map<string, LocationTemplateNode[]>();
    const remember = (n: LocationTemplateNode) => {
      for (const k of new Set([n.nameKey, ...(n.aliases || []).map(locationKey)])) {
        if (!k) continue;
        const list = byKey.get(k) || [];
        list.push(n);
        byKey.set(k, list);
      }
    };
    all.forEach(remember);
    const ancestors = (n: LocationTemplateNode): LocationTemplateNode[] => {
      const out: LocationTemplateNode[] = [];
      let cur = n.parentId != null ? byId.get(n.parentId) : undefined;
      const seen = new Set<number>();
      while (cur && !seen.has(cur.id)) {
        seen.add(cur.id);
        out.push(cur);
        cur = cur.parentId != null ? byId.get(cur.parentId) : undefined;
      }
      return out;
    };
    // The one place called `name` at one of `levels` inside `scope`; when there
    // are several, the one whose own ancestors carry the row's other names.
    const findOne = (
      name: string,
      levels: TemplateLevel[],
      scope: LocationTemplateNode | null,
      hints: string[],
    ): { node?: LocationTemplateNode; ambiguous?: boolean } => {
      let found = (byKey.get(locationKey(name)) || []).filter(
        (n) => levels.includes(n.level) && (!scope || ancestors(n).some((a) => a.id === scope.id)),
      );
      for (const hint of hints.map(locationKey).filter(Boolean)) {
        if (found.length < 2) break;
        const narrowed = found.filter((n) => ancestors(n).some((a) => a.nameKey === hint || (a.aliases || []).some((x) => locationKey(x) === hint)));
        if (narrowed.length) found = narrowed;
      }
      if (found.length > 1) {
        const sameLevel = found.filter((n) => n.level === levels[0]);
        if (sameLevel.length) found = sameLevel;
      }
      return found.length === 1 ? { node: found[0] } : { ambiguous: found.length > 1 };
    };

    let created = 0;
    let skipped = 0;
    let coordsFilled = 0;
    let postcodesFilled = 0;
    const notPlaced: string[] = [];
    const changed = new Set<LocationTemplateNode>();
    for (const rec of records.slice(1)) {
      const names = levelCols.map((i) => (i >= 0 ? odooCell(rec[i]) : ''));
      let deepest = -1;
      names.forEach((n, i) => { if (n) deepest = i; });
      if (!names[1] || deepest < 2) {
        skipped++;
        continue;
      }
      const label = names.filter(Boolean).join(' > ');
      const province = findOne(names[1], ['province'], null, [names[0]]).node;
      if (!province) {
        notPlaced.push(`${label} (province not in the template)`);
        continue;
      }
      const leafName = names[deepest];
      const leafLevel = LOCATION_LEVELS[deepest];
      // The row's own names, nearest first, to tell same-named places apart.
      const hints = names.slice(2, deepest).reverse();
      const placeLevels: TemplateLevel[] = [leafLevel, ...(['town', 'urbanization', 'municipality'] as TemplateLevel[]).filter((l) => l !== leafLevel)];
      const hit = findOne(leafName, levelIndex(leafLevel) >= levelIndex('municipality') ? placeLevels : [leafLevel], province, hints);
      let node = hit.node;
      if (!node && hit.ambiguous) {
        notPlaced.push(`${label} (several places have this name)`);
        continue;
      }
      if (!node) {
        // New to the template: added only under a parent it already has, so a
        // differently arranged list can't grow a second "Costa Blanca".
        let parentIdx = deepest - 1;
        while (parentIdx > 1 && !names[parentIdx]) parentIdx--;
        const parent =
          parentIdx <= 1
            ? province
            : findOne(names[parentIdx], [LOCATION_LEVELS[parentIdx]], province, names.slice(2, parentIdx).reverse()).node;
        if (!parent || levelIndex(parent.level) >= levelIndex(leafLevel)) {
          notPlaced.push(`${label} (no "${names[parentIdx]}" to put it in)`);
          continue;
        }
        node = await this.nodeRepository.save(
          this.nodeRepository.create({
            parentId: parent.id,
            level: leafLevel,
            name: leafName.slice(0, 150),
            nameKey: locationKey(leafName),
            aliases: iAliases >= 0 ? this.cleanAliases((rec[iAliases] || '').split(';'), leafName) : null,
            status: 'ok',
          }),
        );
        byId.set(node.id, node);
        remember(node);
        created++;
      }

      // Postcode and point belong to the deepest place on the row.
      const postcode = iPost >= 0 ? normalizePostcode(rec[iPost]) : null;
      if (!node.postcode && postcode) {
        node.postcode = postcode;
        postcodesFilled++;
        changed.add(node);
      } else if (node.postcode && normalizePostcode(node.postcode) !== node.postcode) {
        // "3812" stored by an earlier import: the leading zero back.
        node.postcode = normalizePostcode(node.postcode);
        changed.add(node);
      }
      if (iLat >= 0 && iLng >= 0 && !checkCoords(node.lat, node.lng).ok) {
        const c = checkCoords(rec[iLat], rec[iLng]);
        if (c.ok) {
          node.lat = c.lat;
          node.lng = c.lng;
          node.coordsIssue = null;
          coordsFilled++;
          changed.add(node);
        } else if (c.problem && !node.coordsIssue) {
          node.coordsIssue = `CSV value refused: ${c.problem}`.slice(0, 300);
          changed.add(node);
        }
      }
    }
    for (const n of changed) {
      await this.nodeRepository.update(
        { id: n.id },
        { postcode: n.postcode, lat: n.lat, lng: n.lng, coordsIssue: n.coordsIssue },
      );
    }

    // What came in may be fine on its own and still wrong next to its
    // neighbours (a town 200 km from the rest of its municipality).
    const audit = await this.checkAllCoords();
    return { rows: records.length - 1, created, skipped, coordsFilled, postcodesFilled, notPlaced: notPlaced.length, notPlacedSample: notPlaced.slice(0, 100), ...audit };
  }

  // Goes over every place's point: clears the ones that are impossible (swapped,
  // outside Spain) or far from the rest of their municipality, recording why,
  // and counts the towns still without one. Nothing is guessed or filled in.
  async checkAllCoords(): Promise<{ refused: number; missingCoords: number }> {
    const nodes = await this.nodeRepository.find();
    const refuse = new Map<number, string>();
    for (const n of nodes) {
      const c = checkCoords(n.lat, n.lng);
      if (!c.ok && c.problem) refuse.set(n.id, c.problem);
    }
    const clean: CoordNode[] = nodes.map((n) => (refuse.has(n.id) ? { ...n, lat: null, lng: null } : n));
    for (const o of findOutliers(clean)) refuse.set(o.id, o.problem);

    for (const [id, problem] of refuse) {
      await this.nodeRepository.update({ id }, { lat: null, lng: null, coordsIssue: `Refused ${problem}`.slice(0, 300) });
    }
    const leafIds = new Set(nodes.map((n) => n.id));
    for (const n of nodes) if (n.parentId != null) leafIds.delete(n.parentId);
    const missingCoords = nodes.filter(
      (n) => leafIds.has(n.id) && levelIndex(n.level) >= levelIndex('municipality') && (refuse.has(n.id) || !checkCoords(n.lat, n.lng).ok),
    ).length;
    return { refused: refuse.size, missingCoords };
  }

  // Folds a duplicate place into the one that stays: its spelling becomes an
  // alternative spelling of the survivor, the places inside it move across (or
  // fold into a same-named one already there), and every client's location for
  // it is merged into their location for the survivor, listings included.
  // `keep` says whose postcode and point win; the other side only fills blanks.
  async merge(
    sourceId: number,
    targetId: number,
    keep: 'target' | 'source' = 'target',
  ): Promise<{ merged: number; clientRowsMerged: number; clientRowsRelinked: number }> {
    if (sourceId === targetId) throw new BadRequestException('Pick a different place to merge into');
    const index = await this.loadIndex();
    const srcLite = index.byId.get(sourceId);
    const tgtLite = index.byId.get(targetId);
    if (!srcLite || !tgtLite) throw new NotFoundException('Location not found');
    if (index.isUnder(tgtLite, srcLite)) throw new BadRequestException('A place cannot be merged into a place inside it');

    const tally = { merged: 0, clientRowsMerged: 0, clientRowsRelinked: 0 };
    await this.mergeNode(sourceId, targetId, keep, tally);
    return tally;
  }

  private async mergeNode(
    sourceId: number,
    targetId: number,
    keep: 'target' | 'source',
    tally: { merged: number; clientRowsMerged: number; clientRowsRelinked: number },
  ): Promise<void> {
    const source = await this.nodeRepository.findOne({ where: { id: sourceId } });
    const target = await this.nodeRepository.findOne({ where: { id: targetId } });
    if (!source || !target) return;

    const kids = await this.nodeRepository.find({ where: { parentId: source.id } });
    const tooHigh = kids.find((k) => levelIndex(k.level) <= levelIndex(target.level));
    if (tooHigh) {
      throw new BadRequestException(`"${tooHigh.name}" (${tooHigh.level}) cannot sit inside a ${target.level} — move it first`);
    }

    // 1. The survivor's own fields.
    const first = keep === 'source' ? source : target;
    const second = keep === 'source' ? target : source;
    const point = placeCoords(first.lat, first.lng) ?? placeCoords(second.lat, second.lng);
    target.aliases = this.cleanAliases([...(target.aliases || []), source.name, ...(source.aliases || [])], target.name);
    target.postcode = first.postcode || second.postcode || null;
    target.lat = point?.lat ?? null;
    target.lng = point?.lng ?? null;
    target.coordsIssue = point ? null : target.coordsIssue || source.coordsIssue || null;
    // Chosen by a person in the merge dialog.
    target.coordsConfirmed = !!point;
    await this.nodeRepository.save(target);

    // 2. Places inside the duplicate.
    for (const kid of kids) {
      const twin = await this.nodeRepository.findOne({ where: { parentId: target.id, nameKey: kid.nameKey } });
      if (twin) await this.mergeNode(kid.id, twin.id, 'target', tally);
      else await this.nodeRepository.update({ id: kid.id }, { parentId: target.id });
    }

    // 3. Clients' rows for the duplicate.
    const rows = await this.locationRepository.find({ where: { templateNodeId: source.id } });
    for (const row of rows) {
      const survivor = await this.locationRepository.findOne({
        where: { tenantId: row.tenantId, templateNodeId: target.id },
      });
      if (survivor && survivor.id !== row.id) {
        await this.locationService.mergeInto(row.tenantId, row, survivor);
        tally.clientRowsMerged++;
      } else {
        await this.locationRepository.update({ id: row.id, tenantId: row.tenantId }, { templateNodeId: target.id });
        tally.clientRowsRelinked++;
      }
    }

    // 4. Feed places that were waiting on the duplicate.
    await this.unmatchedRepository.update({ placedUnderNodeId: source.id }, { placedUnderNodeId: target.id });
    await this.unmatchedRepository.update({ resolvedNodeId: source.id }, { resolvedNodeId: target.id });

    await this.nodeRepository.delete({ id: source.id });
    tally.merged++;
  }
}

function levelMismatch(parentLevel: TemplateLevel): string {
  const next = LOCATION_LEVELS[levelIndex(parentLevel) + 1];
  const a = (w: string) => (/^[aeiou]/.test(w) ? `an ${w}` : `a ${w}`);
  return next
    ? `Inside ${a(parentLevel)} only ${a(next)} fits (Region › Province › Area › Municipality › Town › Urbanization)`
    : `Nothing goes inside ${a(parentLevel)}`;
}

function sameSpot(row: { lat: unknown; lng: unknown }, c: { lat: number; lng: number }): boolean {
  return Number(row.lat).toFixed(5) === c.lat.toFixed(5) && Number(row.lng).toFixed(5) === c.lng.toFixed(5);
}

// A template point good enough to put on a map: present, in Spain, not swapped.
function placeCoords(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  const c = checkCoords(lat, lng);
  return c.ok ? { lat: c.lat, lng: c.lng } : null;
}

function csvCell(v: string): string {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Odoo exports translatable fields as "{'en_US': 'Málaga'}".
function odooCell(v: string | undefined): string {
  const s = String(v ?? '').trim();
  // Python quotes a value holding an apostrophe with double quotes:
  // {'en_US': "Vall d'Albaida"}.
  const m = s.match(/^\{\s*['"][a-zA-Z_]+['"]\s*:\s*(['"])(.*)\1\s*\}$/);
  return (m ? m[2] : s).replace(/\s+/g, ' ').trim();
}

// RFC 4180 CSV: quoted fields, doubled quotes, commas/newlines inside quotes.
export function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((f) => f !== '')) out.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== '')) out.push(row);
  return out;
}
