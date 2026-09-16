import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { PropertyType } from '../../database/entities';
import { bySortOrderThenName } from '../../common/i18n/sort-by-name';
import { CreatePropertyTypeDto, UpdatePropertyTypeDto } from './dto';

@Injectable()
export class PropertyTypeService {
  constructor(
    @InjectRepository(PropertyType)
    private propertyTypeRepository: Repository<PropertyType>,
  ) {}

  async findAll(tenantId: number): Promise<Array<PropertyType & { propertyCount: number }>> {
    const types = (
      await this.propertyTypeRepository.find({
        where: { tenantId, isActive: true },
        order: { sortOrder: 'ASC', id: 'ASC' },
      })
      // Alphabetical within each sortOrder group — see bySortOrderThenName.
    ).sort(bySortOrderThenName);

    const counts: Array<{ propertyTypeId: number; cnt: string }> = await this.propertyTypeRepository.manager.query(
      `SELECT propertyTypeId, COUNT(*) AS cnt
       FROM properties
       WHERE tenantId = ? AND propertyTypeId IS NOT NULL
       GROUP BY propertyTypeId`,
      [tenantId],
    );

    const directCount = new Map<number, number>();
    for (const row of counts) directCount.set(Number(row.propertyTypeId), parseInt(row.cnt, 10));

    // Roll up: a parent's count includes all of its descendants' counts.
    const childrenOf = new Map<number, number[]>();
    for (const pt of types) {
      if (pt.parentId != null) {
        const arr = childrenOf.get(pt.parentId) || [];
        arr.push(pt.id);
        childrenOf.set(pt.parentId, arr);
      }
    }
    const rolledUp = new Map<number, number>();
    const collect = (id: number): number => {
      if (rolledUp.has(id)) return rolledUp.get(id)!;
      let total = directCount.get(id) || 0;
      for (const childId of childrenOf.get(id) || []) total += collect(childId);
      rolledUp.set(id, total);
      return total;
    };
    for (const pt of types) collect(pt.id);

    return types.map((pt) => ({ ...pt, propertyCount: rolledUp.get(pt.id) || 0 }));
  }

  async findOne(tenantId: number, id: number): Promise<PropertyType> {
    const propertyType = await this.propertyTypeRepository.findOne({
      where: { id, tenantId },
    });

    if (!propertyType) {
      throw new NotFoundException('Property type not found');
    }

    return propertyType;
  }

  async create(tenantId: number, dto: CreatePropertyTypeDto): Promise<PropertyType> {
    const existing = await this.propertyTypeRepository.findOne({
      where: { tenantId, slug: dto.slug },
    });
    if (existing) {
      throw new ConflictException('Property type with this slug already exists');
    }
    if (dto.parentId) {
      const parent = await this.propertyTypeRepository.findOne({
        where: { id: dto.parentId, tenantId },
      });
      if (!parent) throw new NotFoundException('Parent property type not found');
    }

    const propertyType = this.propertyTypeRepository.create({ ...dto, tenantId });
    return this.propertyTypeRepository.save(propertyType);
  }

  async update(tenantId: number, id: number, dto: UpdatePropertyTypeDto): Promise<PropertyType> {
    const propertyType = await this.findOne(tenantId, id);

    if (dto.slug && dto.slug !== propertyType.slug) {
      const existing = await this.propertyTypeRepository.findOne({
        where: { tenantId, slug: dto.slug },
      });
      if (existing) {
        throw new ConflictException('Property type with this slug already exists');
      }
    }

    if (dto.parentId === id) {
      throw new ConflictException('Property type cannot be its own parent');
    }
    if (dto.parentId != null) {
      const parent = await this.propertyTypeRepository.findOne({
        where: { id: dto.parentId, tenantId },
      });
      if (!parent) throw new NotFoundException('Parent property type not found');
    }

    // Column-level update bypasses any stale loaded relation, same reason as in LocationService.
    const updateData: Partial<PropertyType> = {};
    for (const key of Object.keys(dto) as Array<keyof UpdatePropertyTypeDto>) {
      (updateData as any)[key] = (dto as any)[key];
    }

    // Moving a type by hand takes it out of AI's control. Without this the row
    // keeps aiAssigned=true and the next AI Organize run is free to move it
    // back — the user's correction would silently evaporate. Keyed on the
    // parentId key being *present*, so unrelated edits (renames, the visibility
    // toggle) don't accidentally lock a type AI is still managing.
    if ('parentId' in dto) {
      updateData.aiAssigned = false;
    }
    await this.propertyTypeRepository.update({ id, tenantId }, updateData);
    return this.findOne(tenantId, id);
  }

  async remove(tenantId: number, id: number): Promise<void> {
    const propertyType = await this.findOne(tenantId, id);
    await this.propertyTypeRepository.remove(propertyType);
  }

  async bulkDelete(tenantId: number, ids: number[]): Promise<{ count: number }> {
    if (!ids.length) return { count: 0 };
    await this.propertyTypeRepository
      .createQueryBuilder()
      .update()
      .set({ parentId: null })
      .where('tenantId = :tenantId', { tenantId })
      .andWhere('parentId IN (:...ids)', { ids })
      .execute();
    await this.propertyTypeRepository
      .createQueryBuilder()
      .delete()
      .where('tenantId = :tenantId', { tenantId })
      .andWhere('id IN (:...ids)', { ids })
      .execute();
    return { count: ids.length };
  }

  async bulkMove(tenantId: number, ids: number[], parentId: number | null): Promise<{ count: number }> {
    if (!ids.length) return { count: 0 };
    if (parentId != null) {
      if (ids.includes(parentId)) throw new ConflictException('A property type cannot be moved into itself');
      const parent = await this.propertyTypeRepository.findOne({ where: { id: parentId, tenantId } });
      if (!parent) throw new NotFoundException('Parent property type not found');
    }
    // aiAssigned=false for the same reason as in update(): a drag-and-drop or
    // bulk move is the user taking ownership of where this type sits, and a
    // later AI Organize run must leave it alone.
    await this.propertyTypeRepository
      .createQueryBuilder()
      .update()
      .set({ parentId, aiAssigned: false })
      .where('tenantId = :tenantId', { tenantId })
      .andWhere('id IN (:...ids)', { ids })
      .execute();
    return { count: ids.length };
  }

  // Folds duplicate types (e.g. an imported "Apartments" next to "Apartment")
  // into one surviving row. Unlike bulkDelete this loses no listings: every
  // property and child type on a source row is re-pointed at the target before
  // the source is removed.
  //
  // Caller decides which row survives. AI enrichment picks the row with the
  // most listings rather than the name the model preferred, because that row is
  // the one already referenced by feed mappings and public URLs.
  async merge(
    tenantId: number,
    sourceIds: number[],
    targetId: number,
  ): Promise<{ mergedTypes: number; movedProperties: number }> {
    const wanted = [...new Set(sourceIds)].filter((id) => id !== targetId);
    if (!wanted.length) return { mergedTypes: 0, movedProperties: 0 };

    const target = await this.propertyTypeRepository.findOne({
      where: { id: targetId, tenantId },
    });
    if (!target) throw new NotFoundException('Target property type not found');

    const sources = await this.propertyTypeRepository.find({
      where: { id: In(wanted), tenantId },
    });
    if (!sources.length) return { mergedTypes: 0, movedProperties: 0 };
    const ids = sources.map((s) => s.id);

    // The survivor must not hang off a row we're about to delete — MySQL's
    // ON DELETE SET NULL would silently un-parent it.
    if (target.parentId != null && ids.includes(target.parentId)) {
      await this.propertyTypeRepository.update({ id: target.id, tenantId }, { parentId: null });
    }

    // Listings move first. Deleting the type before this point would let the
    // FK null their propertyTypeId and lose the association for good.
    const placeholders = ids.map(() => '?').join(',');
    const moved = await this.propertyTypeRepository.manager.query(
      `UPDATE properties SET propertyTypeId = ?
       WHERE tenantId = ? AND propertyTypeId IN (${placeholders})`,
      [targetId, tenantId, ...ids],
    );
    const movedProperties = Number(moved?.affectedRows ?? 0);

    // Children of a merged row re-home onto the survivor rather than orphaning.
    await this.propertyTypeRepository
      .createQueryBuilder()
      .update()
      .set({ parentId: targetId })
      .where('tenantId = :tenantId', { tenantId })
      .andWhere('parentId IN (:...ids)', { ids })
      .execute();

    await this.propertyTypeRepository
      .createQueryBuilder()
      .delete()
      .where('tenantId = :tenantId', { tenantId })
      .andWhere('id IN (:...ids)', { ids })
      .execute();

    await this.pruneGroupReferences(tenantId, ids, targetId);

    return { mergedTypes: ids.length, movedProperties };
  }

  // property_type_groups holds its members as a JSON id array, so nothing
  // cascades when a type row disappears. Left alone, a merged type would just
  // vanish from whatever group it was in.
  private async pruneGroupReferences(
    tenantId: number,
    removedIds: number[],
    targetId: number,
  ): Promise<void> {
    const groups: Array<{ id: number; propertyTypeIds: unknown }> =
      await this.propertyTypeRepository.manager.query(
        `SELECT id, propertyTypeIds FROM property_type_groups WHERE tenantId = ?`,
        [tenantId],
      );

    for (const group of groups || []) {
      // The driver hands JSON columns back as a string on some MySQL versions
      // and as a parsed array on others.
      let members: number[];
      try {
        const raw =
          typeof group.propertyTypeIds === 'string'
            ? JSON.parse(group.propertyTypeIds)
            : group.propertyTypeIds;
        members = Array.isArray(raw) ? raw.map(Number) : [];
      } catch {
        continue;
      }

      if (!members.some((id) => removedIds.includes(id))) continue;

      const kept = members.filter((id) => !removedIds.includes(id));
      if (!kept.includes(targetId)) kept.push(targetId);

      await this.propertyTypeRepository.manager.query(
        `UPDATE property_type_groups SET propertyTypeIds = ? WHERE id = ? AND tenantId = ?`,
        [JSON.stringify(kept), group.id, tenantId],
      );
    }
  }
}
