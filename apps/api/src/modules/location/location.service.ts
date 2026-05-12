import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
  async bulkMove(tenantId: number, ids: number[], parentId: number | null): Promise<{ count: number }> {
    if (!ids.length) return { count: 0 };
    if (parentId != null) {
      if (ids.includes(parentId)) throw new ConflictException('A location cannot be moved into itself');
      const parent = await this.locationRepository.findOne({ where: { id: parentId, tenantId } });
      if (!parent) throw new NotFoundException('Parent location not found');
    }
    await this.locationRepository
      .createQueryBuilder()
      .update()
      .set({ parentId })
      .where('tenantId = :tenantId', { tenantId })
      .andWhere('id IN (:...ids)', { ids })
      .execute();
    return { count: ids.length };
  }

  async incrementPropertyCount(tenantId: number, locationId: number): Promise<void> {
    await this.locationRepository.increment({ id: locationId, tenantId }, 'propertyCount', 1);
  }

  async decrementPropertyCount(tenantId: number, locationId: number): Promise<void> {
    await this.locationRepository.decrement({ id: locationId, tenantId }, 'propertyCount', 1);
  }
}
