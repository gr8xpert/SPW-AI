import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Location, LocationLevel } from '../../database/entities';
import { CreateLocationDto, UpdateLocationDto } from './dto';

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
    return this.locationRepository.find({
      where,
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
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
    const location = this.locationRepository.create({ ...dto, tenantId });
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
  private async mergeInto(tenantId: number, source: Location, target: Location): Promise<void> {
    if (source.id === target.id) return;

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

  async incrementPropertyCount(tenantId: number, locationId: number): Promise<void> {
    await this.locationRepository.increment({ id: locationId, tenantId }, 'propertyCount', 1);
  }

  async decrementPropertyCount(tenantId: number, locationId: number): Promise<void> {
    await this.locationRepository.decrement({ id: locationId, tenantId }, 'propertyCount', 1);
  }
}
