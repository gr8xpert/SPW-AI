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
  Property,
  PropertyType,
  PropertyTypeTemplateNode,
  PropertyTypeTemplateUnmatched,
} from '../../database/entities';
import { AiEnrichmentService } from '../ai-enrichment/ai-enrichment.service';
import { locationKey, locationSlug } from '../location-template/location-name';
import { parseCsv } from '../location-template/location-template.service';
import {
  FeedTypeInput,
  isRealTypeName,
  resolveType,
  TypeNodeLite,
  TypeTemplateIndex,
} from './property-type-template.resolver';
import {
  CreateTypeNodeDto,
  MoveTypeNodeDto,
  UpdateTypeNodeDto,
} from './dto/property-type-template.dto';

interface TypeTally {
  provider: string;
  name: string;
  code: string | null;
  parentName: string | null;
  parentCode: string | null;
  placedUnderNodeId: number | null;
  count: number;
}

// Working state for one import (or re-apply) of one tenant: template and the
// tenant's type rows read once, written only where something changes.
export interface TypeRunContext {
  tenantId: number;
  provider: string;
  index: TypeTemplateIndex;
  translations: Map<number, Record<string, string>>;
  rows: Map<number, PropertyType>;
  byTemplateId: Map<number, PropertyType>;
  placed: Map<string, number>;
  unmatched: Map<string, TypeTally>;
  recordUnmatched: boolean;
  stats: { created: number; adopted: number; moved: number; renamed: number };
}

const AI_BATCH_LIMIT = 40;

@Injectable()
export class PropertyTypeTemplateService {
  private readonly logger = new Logger(PropertyTypeTemplateService.name);

  constructor(
    @InjectRepository(PropertyTypeTemplateNode)
    private readonly nodeRepository: Repository<PropertyTypeTemplateNode>,
    @InjectRepository(PropertyTypeTemplateUnmatched)
    private readonly unmatchedRepository: Repository<PropertyTypeTemplateUnmatched>,
    @InjectRepository(PropertyType)
    private readonly typeRepository: Repository<PropertyType>,
    @InjectRepository(Property)
    private readonly propertyRepository: Repository<Property>,
    private readonly aiEnrichmentService: AiEnrichmentService,
  ) {}

  // ===================================================================
  // Placing listings
  // ===================================================================

  private async loadNodes(): Promise<PropertyTypeTemplateNode[]> {
    return this.nodeRepository.find({ order: { sortOrder: 'ASC', id: 'ASC' } });
  }

  async loadIndex(): Promise<TypeTemplateIndex> {
    return new TypeTemplateIndex((await this.loadNodes()) as TypeNodeLite[]);
  }

  async createRunContext(
    tenantId: number,
    provider: string,
    options: { recordUnmatched?: boolean } = {},
  ): Promise<TypeRunContext | null> {
    const nodes = await this.loadNodes();
    if (!nodes.length) return null;
    const ctx: TypeRunContext = {
      tenantId,
      provider,
      index: new TypeTemplateIndex(nodes as TypeNodeLite[]),
      translations: new Map(nodes.map((n) => [n.id, { ...(n.translations || {}), en: n.name }])),
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

  private async reloadRows(ctx: TypeRunContext): Promise<void> {
    const rows = await this.typeRepository.find({ where: { tenantId: ctx.tenantId } });
    ctx.rows = new Map(rows.map((r) => [r.id, r]));
    ctx.byTemplateId = new Map();
    for (const r of rows) {
      if (r.templateNodeId != null && !ctx.byTemplateId.has(r.templateNodeId)) ctx.byTemplateId.set(r.templateNodeId, r);
    }
  }

  // The tenant type id a listing belongs to. Null when neither the type nor
  // its group is in the template; the caller then keeps the old behaviour.
  async placeListing(ctx: TypeRunContext, input: FeedTypeInput): Promise<number | null> {
    const memoKey = [input.code, input.parentCode, locationKey(input.name), locationKey(input.parentName)].join('|');
    const resolution = resolveType(ctx.index, input);

    if (ctx.recordUnmatched && (!resolution || resolution.unmatched) && isRealTypeName(input.name)) {
      this.tally(ctx, input, resolution?.node.id ?? null);
    }
    if (!resolution) return null;

    const cached = ctx.placed.get(memoKey);
    if (cached && ctx.rows.has(cached)) return cached;

    let parentId: number | null = null;
    for (const node of ctx.index.path(resolution.node)) {
      parentId = (await this.ensureTemplateRow(ctx, node, parentId)).id;
    }
    if (resolution.extraName) {
      parentId = (await this.ensureExtraRow(ctx, resolution.extraName, parentId!)).id;
    }
    ctx.placed.set(memoKey, parentId!);
    return parentId;
  }

  private tally(ctx: TypeRunContext, input: FeedTypeInput, placedUnderNodeId: number | null): void {
    const name = (input.name || '').trim();
    const key = [ctx.provider, input.code || '', locationKey(name), input.parentCode || '', locationKey(input.parentName)].join('|');
    let t = ctx.unmatched.get(key);
    if (!t) {
      t = {
        provider: ctx.provider,
        name,
        code: input.code?.trim() || null,
        parentName: input.parentName?.trim() || null,
        parentCode: input.parentCode?.trim() || null,
        placedUnderNodeId,
        count: 0,
      };
      ctx.unmatched.set(key, t);
    }
    t.count++;
  }

  // The tenant row for a template node, through its link wherever the client
  // put it; unlinked rows from older imports (or older AI grouping) with the
  // same name or an alias are adopted rather than duplicated.
  private async ensureTemplateRow(
    ctx: TypeRunContext,
    node: TypeNodeLite,
    expectedParentId: number | null,
  ): Promise<PropertyType> {
    let row = ctx.byTemplateId.get(node.id);
    if (row && !ctx.rows.has(row.id)) row = undefined;
    if (!row) {
      row = this.findAdoptable(ctx, node, expectedParentId);
      if (row) ctx.stats.adopted++;
    }
    const names = ctx.translations.get(node.id) || { en: node.name };
    if (!row) {
      return this.createRow(ctx, { names, parentId: expectedParentId, templateNodeId: node.id });
    }

    const updates: Partial<PropertyType> = {};
    if (row.templateNodeId !== node.id) updates.templateNodeId = node.id;
    if (!row.userLocked) {
      if (row.parentId !== expectedParentId) {
        updates.parentId = expectedParentId;
        ctx.stats.moved++;
      }
      // Template names win for the languages it has; the client's other
      // translations stay.
      const current = row.name || {};
      const merged = { ...current, ...names };
      if (Object.keys(names).some((l) => current[l] !== names[l])) {
        updates.name = merged;
        ctx.stats.renamed++;
      }
    }
    if (Object.keys(updates).length) {
      await this.typeRepository.update({ id: row.id, tenantId: ctx.tenantId }, updates);
      Object.assign(row, updates);
    }
    ctx.byTemplateId.set(node.id, row);
    return row;
  }

  private findAdoptable(ctx: TypeRunContext, node: TypeNodeLite, expectedParentId: number | null): PropertyType | undefined {
    const keys = new Set([node.nameKey, ...(node.aliases || []).map(locationKey)]);
    const candidates = [...ctx.rows.values()].filter(
      (r) => r.templateNodeId == null && keys.has(locationKey(r.name?.en)),
    );
    return candidates.sort(
      (a, b) =>
        Number(b.parentId === expectedParentId) - Number(a.parentId === expectedParentId) ||
        Number(locationKey(b.name?.en) === node.nameKey) - Number(locationKey(a.name?.en) === node.nameKey) ||
        a.id - b.id,
    )[0];
  }

  private async ensureExtraRow(ctx: TypeRunContext, name: string, parentId: number): Promise<PropertyType> {
    const key = locationKey(name);
    const existing = [...ctx.rows.values()].find((r) => r.templateNodeId == null && locationKey(r.name?.en) === key);
    if (existing) {
      if (!existing.userLocked && existing.parentId !== parentId) {
        await this.typeRepository.update({ id: existing.id, tenantId: ctx.tenantId }, { parentId });
        existing.parentId = parentId;
        ctx.stats.moved++;
      }
      return existing;
    }
    return this.createRow(ctx, { names: { en: name, es: name }, parentId, templateNodeId: null });
  }

  private async createRow(
    ctx: TypeRunContext,
    data: { names: Record<string, string>; parentId: number | null; templateNodeId: number | null },
  ): Promise<PropertyType> {
    // Slugs are unique per tenant (not per parent).
    const base = locationSlug(data.names.en) || 'type';
    const clash = [...ctx.rows.values()].find((r) => r.slug === base);
    if (clash && (clash.templateNodeId == null || clash.templateNodeId === data.templateNodeId)) {
      if (data.templateNodeId != null && clash.templateNodeId == null) {
        await this.typeRepository.update({ id: clash.id, tenantId: ctx.tenantId }, { templateNodeId: data.templateNodeId });
        clash.templateNodeId = data.templateNodeId;
        ctx.byTemplateId.set(data.templateNodeId, clash);
      }
      return clash;
    }
    let slug = base;
    for (let i = 2; [...ctx.rows.values()].some((r) => r.slug === slug); i++) slug = `${base}-${i}`;
    let row: PropertyType;
    try {
      row = await this.typeRepository.save(
        this.typeRepository.create({
          tenantId: ctx.tenantId,
          name: data.names,
          slug,
          parentId: data.parentId,
          templateNodeId: data.templateNodeId,
        }),
      );
    } catch (err) {
      const existing = await this.typeRepository.findOne({ where: { tenantId: ctx.tenantId, slug } });
      if (!existing) throw err;
      row = existing;
    }
    ctx.rows.set(row.id, row);
    if (data.templateNodeId != null) ctx.byTemplateId.set(data.templateNodeId, row);
    ctx.stats.created++;
    return row;
  }

  async finishRun(ctx: TypeRunContext): Promise<{ unmatched: number; aiPlaced: number; relocated: number; cleaned: number }> {
    const entries = await this.saveUnmatched(ctx);
    const aiPlaced = await this.askAiForUnmatched(ctx.tenantId, entries).catch((err) => {
      this.logger.warn(`AI placement of unknown types failed for tenant=${ctx.tenantId}: ${(err as Error).message}`);
      return 0;
    });
    let relocated = 0;
    if (aiPlaced > 0) relocated = (await this.reapplyTenant(ctx.tenantId)).relocated;
    const cleaned = await this.cleanupRedundantRows(ctx.tenantId);
    if (ctx.stats.created || ctx.stats.adopted || ctx.stats.moved || ctx.stats.renamed || entries.length || cleaned) {
      this.logger.log(
        `Type template tenant=${ctx.tenantId}: created=${ctx.stats.created} adopted=${ctx.stats.adopted} ` +
          `moved=${ctx.stats.moved} renamed=${ctx.stats.renamed} unmatched=${entries.length} aiPlaced=${aiPlaced} ` +
          `relocated=${relocated} cleaned=${cleaned}`,
      );
    }
    return { unmatched: entries.length, aiPlaced, relocated, cleaned };
  }

  private async saveUnmatched(ctx: TypeRunContext): Promise<PropertyTypeTemplateUnmatched[]> {
    const saved: PropertyTypeTemplateUnmatched[] = [];
    for (const [matchKey, t] of ctx.unmatched) {
      let row = await this.unmatchedRepository.findOne({ where: { matchKey } });
      if (!row) row = this.unmatchedRepository.create({ matchKey, provider: t.provider, dismissed: false, aiAttempted: false });
      row.name = t.name.slice(0, 150);
      row.code = t.code;
      row.parentName = t.parentName?.slice(0, 150) ?? null;
      row.parentCode = t.parentCode;
      row.placedUnderNodeId = t.placedUnderNodeId;
      row.occurrences = t.count;
      row.tenantIds = [...new Set([...(row.tenantIds || []), ctx.tenantId])];
      row.resolvedNodeId = null;
      saved.push(await this.unmatchedRepository.save(row));
    }
    return saved;
  }

  // An unknown type is placed by AI in one of the template's groups (never a
  // new group), saved as an "AI suggested" type, and asked about only once.
  private async askAiForUnmatched(tenantId: number, entries: PropertyTypeTemplateUnmatched[]): Promise<number> {
    const todo = entries.filter((e) => !e.dismissed && !e.aiAttempted).slice(0, AI_BATCH_LIMIT);
    if (!todo.length) return 0;
    const nodes = await this.loadNodes();
    const groups = nodes.filter((n) => n.parentId == null);
    if (!groups.length) return 0;

    const lines = todo.map(
      (e, i) => `${i + 1}. "${e.name}"${e.parentName ? ` (the feed says it belongs to "${e.parentName}")` : ''}`,
    );
    const prompt = `You classify real-estate property types into groups.

Groups: ${groups.map((g) => g.name).join('; ')}

For each type below, choose the group it belongs to FROM THE LIST ONLY, or null if it is not a property type or you are not confident.

${lines.join('\n')}

Reply ONLY with JSON: { "1": "<group or null>", "2": ..., ... }`;

    const answer = await this.aiEnrichmentService.completeJson(tenantId, prompt);
    await this.unmatchedRepository.update({ id: In(todo.map((e) => e.id)) }, { aiAttempted: true });
    if (!answer) return 0;

    let placed = 0;
    for (let i = 0; i < todo.length; i++) {
      const choice = answer[String(i + 1)];
      if (typeof choice !== 'string' || !choice.trim()) continue;
      const group = groups.find((g) => g.nameKey === locationKey(choice));
      if (!group) continue;
      const e = todo[i];
      const nameKey = locationKey(e.name);
      if (nameKey === group.nameKey) continue;
      let node = await this.nodeRepository.findOne({ where: { parentId: group.id, nameKey } });
      if (!node) {
        node = await this.nodeRepository.save(
          this.nodeRepository.create({
            parentId: group.id,
            name: e.name.trim().slice(0, 150),
            nameKey,
            codes: e.code ? [e.code] : null,
            translations: null,
            status: 'ai_suggested',
            note: `Suggested by AI for "${e.name}" from a ${e.provider} feed.`,
            sortOrder: 1000,
          }),
        );
        placed++;
      }
      await this.unmatchedRepository.update({ id: e.id }, { resolvedNodeId: node.id });
    }
    return placed;
  }

  async reapplyTenant(tenantId: number): Promise<{ relocated: number; cleaned: number; listings: number }> {
    const ctx = await this.createRunContext(tenantId, 'reapply', { recordUnmatched: false });
    if (!ctx) return { relocated: 0, cleaned: 0, listings: 0 };
    const listings = await this.propertyRepository.find({
      where: { tenantId, feedType: Not(IsNull()) },
      select: ['id', 'propertyTypeId', 'lockedFields', 'feedType'],
    });
    let relocated = 0;
    for (const p of listings) {
      if ((p.lockedFields || []).includes('propertyTypeId')) continue;
      const target = await this.placeListing(ctx, p.feedType as FeedTypeInput);
      if (target && target !== p.propertyTypeId) {
        await this.propertyRepository.update({ id: p.id, tenantId }, { propertyTypeId: target });
        relocated++;
      }
    }
    const cleaned = await this.cleanupRedundantRows(tenantId);
    return { relocated, cleaned, listings: listings.length };
  }

  async reapplyAll(): Promise<{ tenants: number; relocated: number; cleaned: number }> {
    const rows: Array<{ tenantId: number }> = await this.propertyRepository.manager.query(
      'SELECT DISTINCT tenantId FROM properties WHERE feedType IS NOT NULL',
    );
    let relocated = 0;
    let cleaned = 0;
    for (const { tenantId } of rows) {
      try {
        const r = await this.reapplyTenant(Number(tenantId));
        relocated += r.relocated;
        cleaned += r.cleaned;
      } catch (err) {
        this.logger.warn(`Type re-apply failed for tenant=${tenantId}: ${(err as Error).message}`);
      }
    }
    return { tenants: rows.length, relocated, cleaned };
  }

  // Deletes type rows no listing uses any more — the "New Development"
  // pseudo-type once its listings got their real type, a duplicate the
  // template's own row replaced, or an older AI group. Only rows no template
  // node stands behind, never arranged by the client, with no listing and no
  // child type, and only when they are one of those three kinds: a type a
  // client created by hand (a name the template doesn't know) is kept even
  // while nothing uses it. Only for tenants the template manages.
  async cleanupRedundantRows(tenantId: number): Promise<number> {
    const index = await this.loadIndex();
    const replaced = (r: PropertyType) =>
      r.aiAssigned || !isRealTypeName(r.name?.en) || index.findByName(r.name?.en).length > 0;
    let total = 0;
    for (let pass = 0; pass < 3; pass++) {
      const rows = await this.typeRepository.find({ where: { tenantId } });
      if (!rows.some((r) => r.templateNodeId != null)) return total;
      const used: Array<{ propertyTypeId: number }> = await this.typeRepository.manager.query(
        'SELECT DISTINCT propertyTypeId FROM properties WHERE tenantId = ? AND propertyTypeId IS NOT NULL',
        [tenantId],
      );
      const usedIds = new Set(used.map((u) => Number(u.propertyTypeId)));
      const parents = new Set(rows.filter((r) => r.parentId != null).map((r) => r.parentId!));
      const doomed = rows.filter(
        (r) => r.templateNodeId == null && !r.userLocked && !usedIds.has(r.id) && !parents.has(r.id) && replaced(r),
      );
      if (!doomed.length) return total;
      await this.typeRepository.delete({ tenantId, id: In(doomed.map((r) => r.id)) });
      total += doomed.length;
    }
    return total;
  }

  // ===================================================================
  // Super Admin
  // ===================================================================

  async list() {
    const nodes = await this.loadNodes();
    const unmatchedOpen = await this.unmatchedRepository.count({ where: { dismissed: false, resolvedNodeId: IsNull() } });
    const usageRows: Array<{ templateNodeId: number; cnt: string }> = await this.typeRepository.manager.query(
      'SELECT templateNodeId, COUNT(*) AS cnt FROM property_types WHERE templateNodeId IS NOT NULL GROUP BY templateNodeId',
    );
    const usage: Record<number, number> = {};
    for (const u of usageRows) usage[Number(u.templateNodeId)] = Number(u.cnt);
    return { nodes, unmatchedOpen, usage };
  }

  async create(dto: CreateTypeNodeDto): Promise<PropertyTypeTemplateNode> {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Name is required');
    if (dto.parentId != null) {
      const parent = await this.nodeRepository.findOne({ where: { id: dto.parentId } });
      if (!parent) throw new NotFoundException('Group not found');
      if (parent.parentId != null) throw new BadRequestException('Types go inside a group, not inside another type');
    }
    const nameKey = locationKey(name);
    await this.assertNameFree(dto.parentId ?? null, nameKey);
    await this.assertCodesFree(dto.codes || [], null);
    return this.nodeRepository.save(
      this.nodeRepository.create({
        parentId: dto.parentId ?? null,
        name,
        nameKey,
        codes: cleanList(dto.codes),
        translations: cleanTranslations(dto.translations),
        aliases: cleanAliases(dto.aliases, name),
        status: 'ok',
        sortOrder: 500,
      }),
    );
  }

  async update(id: number, dto: UpdateTypeNodeDto): Promise<PropertyTypeTemplateNode> {
    const node = await this.nodeRepository.findOne({ where: { id } });
    if (!node) throw new NotFoundException('Type not found');
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('Name is required');
      const nameKey = locationKey(name);
      if (nameKey !== node.nameKey) {
        await this.assertNameFree(node.parentId, nameKey, id);
        dto.aliases = [...(dto.aliases ?? node.aliases ?? []), node.name];
      }
      node.name = name;
      node.nameKey = nameKey;
    }
    if (dto.codes !== undefined) {
      await this.assertCodesFree(dto.codes, id);
      node.codes = cleanList(dto.codes);
    }
    if (dto.translations !== undefined) node.translations = cleanTranslations(dto.translations);
    if (dto.aliases !== undefined) node.aliases = cleanAliases(dto.aliases, node.name);
    if (dto.status !== undefined) {
      node.status = dto.status;
      if (dto.status === 'ok') node.note = null;
    }
    if (dto.note !== undefined) node.note = dto.note?.trim() || null;
    return this.nodeRepository.save(node);
  }

  async move(id: number, dto: MoveTypeNodeDto): Promise<PropertyTypeTemplateNode> {
    const node = await this.nodeRepository.findOne({ where: { id } });
    if (!node) throw new NotFoundException('Type not found');
    const parentId = dto.parentId ?? null;
    if (parentId === node.parentId) return node;
    if (parentId != null) {
      const parent = await this.nodeRepository.findOne({ where: { id: parentId } });
      if (!parent) throw new NotFoundException('Group not found');
      if (parent.parentId != null) throw new BadRequestException('Types go inside a group, not inside another type');
      if (await this.nodeRepository.count({ where: { parentId: id } })) {
        throw new BadRequestException('A group with types in it cannot become a type');
      }
    }
    await this.assertNameFree(parentId, node.nameKey, id);
    node.parentId = parentId;
    return this.nodeRepository.save(node);
  }

  async remove(id: number): Promise<{ deleted: number }> {
    const node = await this.nodeRepository.findOne({ where: { id } });
    if (!node) throw new NotFoundException('Type not found');
    const children = await this.nodeRepository.find({ where: { parentId: id }, select: ['id'] });
    const ids = [id, ...children.map((c) => c.id)];
    await this.typeRepository.update({ templateNodeId: In(ids) }, { templateNodeId: null });
    await this.nodeRepository.delete({ id });
    return { deleted: ids.length };
  }

  private async assertNameFree(parentId: number | null, nameKey: string, exceptId?: number) {
    const twin = await this.nodeRepository.findOne({ where: { parentId: parentId == null ? IsNull() : parentId, nameKey } });
    if (twin && twin.id !== exceptId) throw new ConflictException(`"${twin.name}" already exists here`);
  }

  private async assertCodesFree(codes: string[], exceptId: number | null) {
    const wanted = new Set(cleanList(codes) || []);
    if (!wanted.size) return;
    const all = await this.nodeRepository.find({ select: ['id', 'name', 'codes'] });
    const taken = all.find((n) => n.id !== exceptId && (n.codes || []).some((c) => wanted.has(c)));
    if (taken) throw new ConflictException(`Code already used by "${taken.name}"`);
  }

  async listUnmatched() {
    const rows = await this.unmatchedRepository.find({
      where: { dismissed: false, resolvedNodeId: IsNull() },
      order: { occurrences: 'DESC', lastSeenAt: 'DESC' },
      take: 500,
    });
    const nodes = new Map((await this.loadNodes()).map((n) => [n.id, n]));
    return rows.map((r) => ({ ...r, placedUnder: r.placedUnderNodeId != null ? nodes.get(r.placedUnderNodeId)?.name ?? '' : '' }));
  }

  async dismissUnmatched(id: number): Promise<void> {
    await this.unmatchedRepository.update({ id }, { dismissed: true });
  }

  // ===================================================================
  // CSV: Group, Type, Codes, Aliases, then one column per language
  // ===================================================================

  async exportCsv(): Promise<string> {
    const nodes = await this.loadNodes();
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const langs = [...new Set(nodes.flatMap((n) => Object.keys(n.translations || {})))].filter((l) => l !== 'en').sort();
    const header = ['Group', 'Type', 'Codes', 'Aliases', 'Status', ...langs.map((l) => `Name ${l}`)];
    const rows = nodes.map((n) => {
      const group = n.parentId != null ? byId.get(n.parentId)?.name ?? '' : n.name;
      return [
        group,
        n.parentId != null ? n.name : '',
        (n.codes || []).join('; '),
        (n.aliases || []).join('; '),
        n.status,
        ...langs.map((l) => n.translations?.[l] ?? ''),
      ];
    });
    rows.sort((a, b) => (a[0] + '|' + a[1]).localeCompare(b[0] + '|' + b[1]));
    return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
  }

  // Adds groups and types the template doesn't have (matched by name), and
  // fills in codes/aliases/translations that are empty. Never deletes or moves.
  async importCsv(text: string): Promise<{ rows: number; created: number; updated: number }> {
    const records = parseCsv(text);
    if (records.length < 2) throw new BadRequestException('The file has no rows');
    const header = records[0].map((h) => h.trim());
    const col = (name: string) => header.findIndex((h) => locationKey(h) === locationKey(name));
    const iGroup = col('Group');
    const iType = col('Type');
    if (iGroup < 0) throw new BadRequestException('Expected a Group column (see Export CSV)');
    const iCodes = col('Codes');
    const iAliases = col('Aliases');
    const langCols = header
      .map((h, i) => ({ i, m: h.match(/^Name ([a-z]{2})$/i) }))
      .filter((x) => x.m)
      .map((x) => ({ i: x.i, lang: x.m![1].toLowerCase() }));

    let created = 0;
    let updated = 0;
    for (const rec of records.slice(1)) {
      const groupName = (rec[iGroup] || '').trim();
      if (!groupName) continue;
      let group = await this.nodeRepository.findOne({ where: { parentId: IsNull(), nameKey: locationKey(groupName) } });
      if (!group) {
        group = await this.nodeRepository.save(
          this.nodeRepository.create({ parentId: null, name: groupName, nameKey: locationKey(groupName), status: 'ok', sortOrder: 500 }),
        );
        created++;
      }
      const typeName = iType >= 0 ? (rec[iType] || '').trim() : '';
      let target = group;
      if (typeName) {
        let node = await this.nodeRepository.findOne({ where: { parentId: group.id, nameKey: locationKey(typeName) } });
        if (!node) {
          node = await this.nodeRepository.save(
            this.nodeRepository.create({ parentId: group.id, name: typeName, nameKey: locationKey(typeName), status: 'ok', sortOrder: 500 }),
          );
          created++;
        }
        target = node;
      }
      let changed = false;
      const codes = iCodes >= 0 ? cleanList((rec[iCodes] || '').split(';')) : null;
      if (codes && !(target.codes || []).length) {
        target.codes = codes;
        changed = true;
      }
      const aliases = iAliases >= 0 ? cleanAliases((rec[iAliases] || '').split(';'), target.name) : null;
      if (aliases && !(target.aliases || []).length) {
        target.aliases = aliases;
        changed = true;
      }
      const tr = { ...(target.translations || {}) };
      for (const { i, lang } of langCols) {
        const v = (rec[i] || '').trim();
        if (v && !tr[lang]) {
          tr[lang] = v;
          changed = true;
        }
      }
      if (changed) {
        target.translations = cleanTranslations(tr);
        await this.nodeRepository.save(target);
        updated++;
      }
    }
    return { rows: records.length - 1, created, updated };
  }
}

function cleanList(values: string[] | null | undefined): string[] | null {
  const out = [...new Set((values || []).map((v) => String(v).trim()).filter(Boolean))].map((v) => v.slice(0, 30));
  return out.length ? out : null;
}

function cleanAliases(aliases: string[] | null | undefined, name: string): string[] | null {
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

function cleanTranslations(tr: Record<string, string> | null | undefined): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const [lang, value] of Object.entries(tr || {})) {
    const l = lang.trim().toLowerCase();
    const v = String(value ?? '').trim();
    if (/^[a-z]{2}$/.test(l) && l !== 'en' && v) out[l] = v.slice(0, 150);
  }
  return Object.keys(out).length ? out : null;
}

function csvCell(v: string): string {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
