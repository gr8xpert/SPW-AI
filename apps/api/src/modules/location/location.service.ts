import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { Location, LocationBoundary, LocationLevel } from '../../database/entities';
import { fenceFor, resolveLocationPoints } from './location-points';
import { bySortOrderThenName } from '../../common/i18n/sort-by-name';
import { CreateLocationDto, UpdateLocationDto } from './dto';
import { extraFeedKey, locationKey } from '../location-template/location-name';

export interface LocationTree extends Location {
  children: LocationTree[];
}

@Injectable()
export class LocationService {
  constructor(
    @InjectRepository(Location)
    private locationRepository: Repository<Location>,
  ) {}

  async findAll(tenantId: number, level?: LocationLevel): Promise<Location[]> {
    const where: any = { tenantId, isActive: true };
    if (level) {
      where.level = level;
    }
    const locations = await this.locationRepository.find({
      where,
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
    // Alphabetical within each sortOrder group — see bySortOrderThenName.
    return locations.sort(bySortOrderThenName);
  }

  /**
   * Where a single place sits, and its outline if we have one.
   *
   * The property detail map used to ask Nominatim for the place by bare name
   * from the browser — which is how "Los Alamos" drew a village in Almeria,
   * and it asked again on every page view. The outline we store was geocoded
   * with the parent for context and checked against it, and the point comes
   * back through the same guard the listing map uses: a place we cannot place
   * believably gets its parent's point and no outline, so the map says "this
   * town, roughly" instead of drawing the wrong shape.
   */
  async outline(tenantId: number, id: number): Promise<{
    id: number;
    name: unknown;
    level: string;
    lat: number;
    lng: number;
    approximate: boolean;
    boundary: LocationBoundary | null;
    fence: LocationBoundary | null;
  } | null> {
    // `boundary` is hidden on the entity (a few hundred coordinate pairs), so
    // it has to be asked for by name.
    const places = await this.locationRepository
      .createQueryBuilder('l')
      .select(['l.id', 'l.parentId', 'l.level', 'l.name', 'l.lat', 'l.lng'])
      .addSelect('l.boundary')
      .where('l.tenantId = :tenantId', { tenantId })
      .getMany();

    const place = places.find((l) => l.id === id);
    if (!place) return null;
    const point = resolveLocationPoints(places).get(id);
    if (!point) return null;

    return {
      id: place.id,
      name: place.name as unknown,
      level: place.level as string,
      lat: point.lat,
      lng: point.lng,
      approximate: point.borrowed,
      boundary: point.borrowed ? null : (place.boundary ?? null),
      // With no shape of its own, the municipality it belongs to says where it
      // is far better than a circle drawn around a point.
      fence: fenceFor(place, new Map(places.map((l) => [l.id, l]))),
    };
  }

  async findTree(tenantId: number, includeInactive = false): Promise<LocationTree[]> {
    const where: any = { tenantId };
    if (!includeInactive) where.isActive = true;
    const locations = await this.locationRepository.find({
      where,
      order: { sortOrder: 'ASC' },
    });

    // Direct property count per locationId via raw SQL.
    const counts: Array<{ locationId: number; cnt: string }> = await this.locationRepository.manager.query(
      `SELECT locationId, COUNT(*) AS cnt
       FROM properties
       WHERE tenantId = ? AND locationId IS NOT NULL
       GROUP BY locationId`,
      [tenantId],
    );

    const directCount = new Map<number, number>();
    for (const row of counts) {
      directCount.set(Number(row.locationId), parseInt(row.cnt, 10));
    }
    for (const loc of locations) {
      loc.propertyCount = directCount.get(loc.id) || 0;
    }

    const tree = this.buildTree(locations);
    // Roll up descendant counts so parents reflect their subtree.
    const rollUp = (nodes: LocationTree[]): number => {
      let total = 0;
      for (const n of nodes) {
        const childTotal = rollUp(n.children);
        n.propertyCount = (n.propertyCount || 0) + childTotal;
        total += n.propertyCount;
      }
      return total;
    };
    rollUp(tree);

    return tree;
  }

  private buildTree(locations: Location[], parentId: number | null = null): LocationTree[] {
    return locations
      .filter((loc) => loc.parentId === parentId)
      // Sort each sibling group independently, so alphabetical order applies at
      // every depth of the tree rather than only at the roots.
      .sort(bySortOrderThenName)
      .map((loc) => ({
        ...loc,
        children: this.buildTree(locations, loc.id),
      }));
  }

  async findOne(tenantId: number, id: number): Promise<Location> {
    const location = await this.locationRepository.findOne({
      where: { id, tenantId },
      relations: ['parent', 'children'],
    });
    if (!location) {
      throw new NotFoundException('Location not found');
    }
    return location;
  }

  async create(tenantId: number, dto: CreateLocationDto): Promise<Location> {
    const existing = await this.locationRepository.findOne({
      where: { tenantId, slug: dto.slug },
    });
    if (existing) {
      throw new ConflictException('Location with this slug already exists');
    }
    if (dto.parentId) {
      const parent = await this.locationRepository.findOne({
        where: { id: dto.parentId, tenantId },
      });
      if (!parent) {
        throw new NotFoundException('Parent location not found');
      }
    }
    const location = this.locationRepository.create({ ...dto, tenantId, aliases: cleanAliases(dto.aliases, dto.name?.en) });
    return this.locationRepository.save(location);
  }

  async update(tenantId: number, id: number, dto: UpdateLocationDto): Promise<Location> {
    const location = await this.findOne(tenantId, id);
    if (dto.slug && dto.slug !== location.slug) {
      const existing = await this.locationRepository.findOne({
        where: { tenantId, slug: dto.slug },
      });
      if (existing) {
        throw new ConflictException('Location with this slug already exists');
      }
    }
    if (dto.parentId === id) {
      throw new ConflictException('Location cannot be its own parent');
    }

    // Reparent path: if the new parent already has a same-slug sibling, fold
    // this location into that twin (children + properties) and delete this row.
    // Avoids manual cleanup of duplicates (e.g. two "Costa del Sol" nodes
    // imported under Málaga and Cádiz that the user now wants merged).
    const parentChanging = dto.parentId !== undefined && dto.parentId !== location.parentId;
    if (parentChanging) {
      const targetParentId = dto.parentId ?? null;
      const slugToCheck = dto.slug || location.slug;
      const twin = await this.findSibling(tenantId, targetParentId, slugToCheck, id);
      if (twin) {
        await this.mergeInto(tenantId, location, twin);
        // Apply any non-parentId updates (name, sortOrder, etc.) to the kept row.
        const otherUpdates: Partial<Location> = {};
        for (const key of Object.keys(dto) as Array<keyof UpdateLocationDto>) {
          if (key === 'parentId' || key === 'slug') continue;
          (otherUpdates as any)[key] = (dto as any)[key];
        }
        if (Object.keys(otherUpdates).length > 0) {
          await this.locationRepository.update({ id: twin.id, tenantId }, otherUpdates);
        }
        return this.findOne(tenantId, twin.id);
      }
    }

    // Use repository.update() (column-level) instead of save() because findOne
    // loads the `parent` relation — save() prefers the stale relation object's
    // id over a freshly set parentId column, which silently drops the change.
    const updateData: Partial<Location> = {};
    for (const key of Object.keys(dto) as Array<keyof UpdateLocationDto>) {
      (updateData as any)[key] = (dto as any)[key];
    }
    if (dto.aliases !== undefined) updateData.aliases = cleanAliases(dto.aliases, dto.name?.en ?? location.name?.en);
    await this.locationRepository.update({ id, tenantId }, updateData);
    return this.findOne(tenantId, id);
  }

  async remove(tenantId: number, id: number): Promise<void> {
    const location = await this.findOne(tenantId, id);
    await this.locationRepository.update({ parentId: id }, { parentId: null });
    await this.locationRepository.remove(location);
  }

  async bulkDelete(tenantId: number, ids: number[]): Promise<{ count: number }> {
    if (!ids.length) return { count: 0 };
    // Detach children first so they don't get cascade-orphaned via DB SET NULL.
    await this.locationRepository
      .createQueryBuilder()
      .update()
      .set({ parentId: null })
      .where('tenantId = :tenantId', { tenantId })
      .andWhere('parentId IN (:...ids)', { ids })
      .execute();
    await this.locationRepository
      .createQueryBuilder()
      .delete()
      .where('tenantId = :tenantId', { tenantId })
      .andWhere('id IN (:...ids)', { ids })
      .execute();
    return { count: ids.length };
  }

  // Bulk move: re-parent many locations under one parent (or null for top-level).
  // Each moved node is first checked for a same-slug twin under the new parent;
  // if a twin exists the moved node is merged into it (children + properties
  // re-pointed, source deleted). Returns counts so the UI can report what happened.
  async bulkMove(tenantId: number, ids: number[], parentId: number | null): Promise<{ count: number; merged: number }> {
    if (!ids.length) return { count: 0, merged: 0 };
    if (parentId != null) {
      if (ids.includes(parentId)) throw new ConflictException('A location cannot be moved into itself');
      const parent = await this.locationRepository.findOne({ where: { id: parentId, tenantId } });
      if (!parent) throw new NotFoundException('Parent location not found');
    }

    let merged = 0;
    for (const id of ids) {
      const node = await this.locationRepository.findOne({ where: { id, tenantId } });
      if (!node) continue;

      const twin = await this.findSibling(tenantId, parentId, node.slug, id);
      if (twin) {
        await this.mergeInto(tenantId, node, twin);
        merged++;
        continue;
      }
      await this.locationRepository.update({ id, tenantId }, { parentId });
    }
    return { count: ids.length, merged };
  }

  // Looks for a sibling under `parentId` with the same slug, excluding self.
  // parentId === null searches top-level rows. Returns the row to merge into,
  // or null when no collision exists.
  private async findSibling(
    tenantId: number,
    parentId: number | null,
    slug: string,
    excludeId: number,
  ): Promise<Location | null> {
    const where: any = { tenantId, slug };
    where.parentId = parentId === null ? IsNull() : parentId;
    const row = await this.locationRepository.findOne({ where });
    if (!row || row.id === excludeId) return null;
    return row;
  }

  // Recursively folds `source` into `target`:
  //   1. Re-points properties from source.id → target.id
  //   2. For each source child: if target has a same-slug child, recurse;
  //      otherwise reparent the child to target.
  //   3. Deletes source.
  // Recursion handles cases like merging "Costa del Sol Cádiz" → "Costa del
  // Sol Málaga" where both sides also have an overlapping sub-municipality.
  async mergeInto(tenantId: number, source: Location, target: Location): Promise<void> {
    if (source.id === target.id) return;

    // The next import sends the source's listings here instead of re-creating
    // it: the target takes over the feed places the source stood for.
    const keys = new Set([...(target.feedKeys || []), ...(source.feedKeys || []), originKey(source)]);
    const aliases = cleanAliases([...(target.aliases || []), ...(source.aliases || [])], target.name?.en);
    await this.locationRepository.update({ id: target.id, tenantId }, { feedKeys: [...keys], aliases });
    target.feedKeys = [...keys];
    target.aliases = aliases;

    await this.locationRepository.manager.query(
      'UPDATE properties SET locationId = ? WHERE tenantId = ? AND locationId = ?',
      [target.id, tenantId, source.id],
    );

    const sourceChildren = await this.locationRepository.find({
      where: { tenantId, parentId: source.id },
    });

    for (const child of sourceChildren) {
      const twin = await this.locationRepository.findOne({
        where: { tenantId, parentId: target.id, slug: child.slug },
      });
      if (twin && twin.id !== child.id) {
        await this.mergeInto(tenantId, child, twin);
      } else {
        await this.locationRepository.update({ id: child.id, tenantId }, { parentId: target.id });
      }
    }

    await this.locationRepository.delete({ id: source.id, tenantId });
  }

  /**
   * "Merge into…" from the client's dashboard: the source's listings and
   * places move into the target and the source is removed. Imports then put
   * the source's feed listings into the target (see mergeInto).
   */
  async mergeLocations(tenantId: number, sourceId: number, targetId: number): Promise<Location> {
    if (sourceId === targetId) throw new ConflictException('Pick a different location to merge into');
    const source = await this.locationRepository.findOne({ where: { id: sourceId, tenantId } });
    const target = await this.locationRepository.findOne({ where: { id: targetId, tenantId } });
    if (!source || !target) throw new NotFoundException('Location not found');
    // Merging a place into one of its own sub-places would delete the branch.
    const all = await this.locationRepository.find({ where: { tenantId }, select: ['id', 'parentId'] });
    const parentOf = new Map(all.map((r) => [r.id, r.parentId]));
    for (let cur: number | null | undefined = target.parentId, hops = 0; cur != null && hops < 50; cur = parentOf.get(cur), hops++) {
      if (cur === source.id) throw new ConflictException('A location cannot be merged into a place inside it');
    }
    await this.mergeInto(tenantId, source, target);
    return this.findOne(tenantId, target.id);
  }

  // Before the client moves or renames rows: remember where the feed put
  // them, so the next import finds them instead of making a twin there.
  async rememberOrigins(tenantId: number, ids: number[]): Promise<void> {
    if (!ids.length) return;
    const rows = await this.locationRepository.find({ where: { tenantId, id: In(ids) } });
    for (const r of rows) {
      if (r.templateNodeId != null) continue; // found through its template link anyway
      const key = originKey(r);
      if ((r.feedKeys || []).includes(key)) continue;
      await this.locationRepository.update({ id: r.id, tenantId }, { feedKeys: [...(r.feedKeys || []), key] });
    }
  }

  // Marks rows the client arranged by hand (moved, renamed, created) so the
  // location template never re-parents or renames them.
  async markUserLocked(tenantId: number, ids: number[]): Promise<void> {
    if (!ids.length) return;
    await this.locationRepository
      .createQueryBuilder()
      .update()
      .set({ userLocked: true })
      .where('tenantId = :tenantId', { tenantId })
      .andWhere('id IN (:...ids)', { ids })
      .execute();
  }

  async markCoordsLocked(tenantId: number, id: number): Promise<void> {
    await this.locationRepository.update({ id, tenantId }, { coordsLocked: true });
  }

  async incrementPropertyCount(tenantId: number, locationId: number): Promise<void> {
    await this.locationRepository.increment({ id: locationId, tenantId }, 'propertyCount', 1);
  }

  async decrementPropertyCount(tenantId: number, locationId: number): Promise<void> {
    await this.locationRepository.decrement({ id: locationId, tenantId }, 'propertyCount', 1);
  }
}

// What a row stands for in feed terms: its template place, or the feed name
// under the parent it was created in.
function originKey(row: Location): string {
  return row.templateNodeId != null ? `t:${row.templateNodeId}` : extraFeedKey(row.parentId, row.name?.en);
}

// Trimmed, de-duplicated, without the location's own name.
function cleanAliases(list: string[] | null | undefined, ownName?: string | null): string[] | null {
  if (!list) return null;
  const own = locationKey(ownName);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const name = String(raw ?? '').trim().slice(0, 100);
    const k = locationKey(name);
    if (!k || k === own || seen.has(k)) continue;
    seen.add(k);
    out.push(name);
  }
  return out.length ? out.slice(0, 20) : null;
}
