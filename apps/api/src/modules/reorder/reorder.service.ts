import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import {
  Location,
  PropertyType,
  Feature,
  LocationGroup,
  PropertyTypeGroup,
  FeatureGroup,
} from '../../database/entities';
import { ReorderDto } from './dto';
import { i18nName } from '../../common/i18n/sort-by-name';

@Injectable()
export class ReorderService {
  constructor(
    @InjectRepository(Location)
    private locationRepository: Repository<Location>,
    @InjectRepository(PropertyType)
    private propertyTypeRepository: Repository<PropertyType>,
    @InjectRepository(Feature)
    private featureRepository: Repository<Feature>,
    @InjectRepository(LocationGroup)
    private locationGroupRepository: Repository<LocationGroup>,
    @InjectRepository(PropertyTypeGroup)
    private propertyTypeGroupRepository: Repository<PropertyTypeGroup>,
    @InjectRepository(FeatureGroup)
    private featureGroupRepository: Repository<FeatureGroup>,
  ) {}

  /**
   * Reorder locations
   */
  async reorderLocations(tenantId: number, dto: ReorderDto): Promise<{ updated: number }> {
    const ids = dto.items.map((item) => item.id);

    // Verify all items belong to tenant
    const locations = await this.locationRepository.find({
      where: { tenantId, id: In(ids) },
    });

    if (locations.length !== ids.length) {
      throw new NotFoundException('Some locations not found');
    }

    // Update sort orders
    for (const item of dto.items) {
      await this.locationRepository.update(
        { id: item.id, tenantId },
        { sortOrder: item.sortOrder },
      );
    }

    return { updated: dto.items.length };
  }

  /**
   * Reorder property types
   */
  async reorderPropertyTypes(tenantId: number, dto: ReorderDto): Promise<{ updated: number }> {
    const ids = dto.items.map((item) => item.id);

    const propertyTypes = await this.propertyTypeRepository.find({
      where: { tenantId, id: In(ids) },
    });

    if (propertyTypes.length !== ids.length) {
      throw new NotFoundException('Some property types not found');
    }

    for (const item of dto.items) {
      await this.propertyTypeRepository.update(
        { id: item.id, tenantId },
        { sortOrder: item.sortOrder },
      );
    }

    return { updated: dto.items.length };
  }

  /**
   * Reorder features
   */
  async reorderFeatures(tenantId: number, dto: ReorderDto): Promise<{ updated: number }> {
    const ids = dto.items.map((item) => item.id);

    const features = await this.featureRepository.find({
      where: { tenantId, id: In(ids) },
    });

    if (features.length !== ids.length) {
      throw new NotFoundException('Some features not found');
    }

    for (const item of dto.items) {
      await this.featureRepository.update(
        { id: item.id, tenantId },
        { sortOrder: item.sortOrder },
      );
    }

    return { updated: dto.items.length };
  }

  /**
   * Reorder location groups
   */
  async reorderLocationGroups(tenantId: number, dto: ReorderDto): Promise<{ updated: number }> {
    const ids = dto.items.map((item) => item.id);

    const groups = await this.locationGroupRepository.find({
      where: { tenantId, id: In(ids) },
    });

    if (groups.length !== ids.length) {
      throw new NotFoundException('Some location groups not found');
    }

    for (const item of dto.items) {
      await this.locationGroupRepository.update(
        { id: item.id, tenantId },
        { sortOrder: item.sortOrder },
      );
    }

    return { updated: dto.items.length };
  }

  /**
   * Reorder property type groups
   */
  async reorderPropertyTypeGroups(tenantId: number, dto: ReorderDto): Promise<{ updated: number }> {
    const ids = dto.items.map((item) => item.id);

    const groups = await this.propertyTypeGroupRepository.find({
      where: { tenantId, id: In(ids) },
    });

    if (groups.length !== ids.length) {
      throw new NotFoundException('Some property type groups not found');
    }

    for (const item of dto.items) {
      await this.propertyTypeGroupRepository.update(
        { id: item.id, tenantId },
        { sortOrder: item.sortOrder },
      );
    }

    return { updated: dto.items.length };
  }

  /**
   * Reorder feature groups
   */
  async reorderFeatureGroups(tenantId: number, dto: ReorderDto): Promise<{ updated: number }> {
    const ids = dto.items.map((item) => item.id);

    const groups = await this.featureGroupRepository.find({
      where: { tenantId, id: In(ids) },
    });

    if (groups.length !== ids.length) {
      throw new NotFoundException('Some feature groups not found');
    }

    for (const item of dto.items) {
      await this.featureGroupRepository.update(
        { id: item.id, tenantId },
        { sortOrder: item.sortOrder },
      );
    }

    return { updated: dto.items.length };
  }

  /**
   * Re-sort every sibling group of a client's locations or property types in
   * one go (the dashboard's Sort menu). The website lists them in this order.
   *
   * 'name' clears the manual order instead of writing one: with every
   * sortOrder at 0 the API's name tie-break sorts A–Z, and places a later
   * feed import adds fall into place alphabetically too.
   */
  async sortAll(kind: 'location' | 'propertyType', tenantId: number, by: SortBy): Promise<{ updated: number }> {
    // Same columns used on both tables.
    const repo = (kind === 'location' ? this.locationRepository : this.propertyTypeRepository) as Repository<
      Location | PropertyType
    >;
    const table = repo.metadata.tableName;
    const fk = kind === 'location' ? 'locationId' : 'propertyTypeId';

    if (by === 'name') {
      const res = await repo.update({ tenantId }, { sortOrder: 0 });
      return { updated: res.affected ?? 0 };
    }

    const rows = await repo.find({ where: { tenantId }, select: ['id', 'parentId', 'name'] });

    // Listings per row, including everything under it.
    const direct = new Map<number, number>();
    if (by === 'count') {
      const counts: Array<{ id: number; cnt: string }> = await repo.manager.query(
        `SELECT ${fk} AS id, COUNT(*) AS cnt FROM properties WHERE tenantId = ? AND ${fk} IS NOT NULL GROUP BY ${fk}`,
        [tenantId],
      );
      for (const c of counts) direct.set(Number(c.id), parseInt(c.cnt, 10));
    }
    const childrenOf = new Map<number, typeof rows>();
    for (const r of rows) {
      const p = r.parentId ?? 0;
      if (!childrenOf.has(p)) childrenOf.set(p, []);
      childrenOf.get(p)!.push(r);
    }
    const total = new Map<number, number>();
    const seen = new Set<number>();
    const count = (id: number): number => {
      if (total.has(id)) return total.get(id)!;
      if (seen.has(id)) return 0; // a cycle in the data must not hang the request
      seen.add(id);
      let n = direct.get(id) ?? 0;
      for (const c of childrenOf.get(id) ?? []) n += count(c.id);
      total.set(id, n);
      return n;
    };

    const byName = (a: { name: unknown }, b: { name: unknown }) =>
      i18nName(a.name).localeCompare(i18nName(b.name), 'en', { sensitivity: 'base', numeric: true });
    const items: Array<{ id: number; sortOrder: number }> = [];
    for (const siblings of childrenOf.values()) {
      siblings.sort(by === 'count' ? (a, b) => count(b.id) - count(a.id) || byName(a, b) : (a, b) => byName(b, a));
      siblings.forEach((r, i) => items.push({ id: r.id, sortOrder: i + 1 }));
    }

    // One UPDATE per 500 rows — a client can have thousands of places.
    for (let i = 0; i < items.length; i += 500) {
      const chunk = items.slice(i, i + 500);
      await repo.manager.query(
        `UPDATE ${table} SET sortOrder = CASE id ${chunk.map(() => 'WHEN ? THEN ?').join(' ')} END
         WHERE tenantId = ? AND id IN (${chunk.map(() => '?').join(',')})`,
        [...chunk.flatMap((x) => [x.id, x.sortOrder]), tenantId, ...chunk.map((x) => x.id)],
      );
    }
    return { updated: items.length };
  }
}

export type SortBy = 'name' | 'name-desc' | 'count';
