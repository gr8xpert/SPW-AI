import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PropertyType } from '../../database/entities';
import { locationKey } from '../location-template/location-name';
import { PropertyTypeService } from './property-type.service';
import {
  MAX_TRANSFER_ROWS,
  TransferFileNode,
  int,
  ints,
  isWithin,
  matchTree,
  names,
  topDown,
} from '../../common/setup-transfer/match-tree';

export const PROPERTY_TYPES_FILE_FORMAT = 'spm-property-types';

interface FileType extends TransferFileNode {
  name: Record<string, string>;
  sortOrder: number | null;
}

export interface PropertyTypeImportReport {
  applied: boolean;
  fileRows: number;
  accountRows: number;
  matched: number;
  changed: number;
  moved: number;
  renamed: number;
  reordered: number;
  merged: number;
  keptInPlace: number;
  clashes: number;
  ambiguous: number;
  notInAccount: number;
  notInAccountSample: string[];
  untouched: number;
}

/**
 * Property Types "Export setup" / "Import setup": copies one client's
 * arrangement (nesting, order, names and translations) onto the matching
 * types of another client. Never creates or deletes a type the importing
 * client doesn't have; see common/setup-transfer/match-tree.
 */
@Injectable()
export class PropertyTypeTransferService {
  constructor(
    @InjectRepository(PropertyType)
    private readonly propertyTypeRepository: Repository<PropertyType>,
    private readonly propertyTypeService: PropertyTypeService,
  ) {}

  async export(tenantId: number) {
    const rows = await this.propertyTypeRepository.find({ where: { tenantId }, order: { id: 'ASC' } });
    return {
      format: PROPERTY_TYPES_FILE_FORMAT,
      version: 1,
      exportedAt: new Date().toISOString(),
      count: rows.length,
      items: rows.map((r) => ({
        ref: r.id,
        parentRef: r.parentId,
        name: r.name,
        slug: r.slug,
        sortOrder: r.sortOrder,
        templateIds: r.templateNodeId != null ? [r.templateNodeId] : [],
        // Current name, and the feed names it was renamed from (any parent).
        places: [
          { parentRef: r.parentId, key: locationKey(r.name?.en) },
          ...feedNames(r).map((key) => ({ parentRef: -1, key })),
        ].filter((p) => p.key),
      })),
    };
  }

  async import(tenantId: number, text: string, apply: boolean): Promise<PropertyTypeImportReport> {
    const file = parseFile(text);
    const rows = await this.propertyTypeRepository.find({ where: { tenantId } });
    const byId = new Map(rows.map((r) => [r.id, r]));

    const { refFor, ambiguous } = matchTree(
      file,
      rows.map((r) => ({
        id: r.id,
        parentId: r.parentId,
        templateIds: r.templateNodeId != null ? [r.templateNodeId] : [],
        keys: [locationKey(r.name?.en), ...feedNames(r)].filter(Boolean),
      })),
    );

    const listings = await this.listingCounts(tenantId);
    const rowsFor = new Map<number, PropertyType[]>();
    for (const [id, ref] of refFor) {
      const list = rowsFor.get(ref) ?? [];
      list.push(byId.get(id)!);
      rowsFor.set(ref, list);
    }
    const fileByRef = new Map(file.map((f) => [f.ref, f]));
    for (const [ref, list] of rowsFor) {
      const tids = fileByRef.get(ref)!.templateIds;
      list.sort(
        (a, b) =>
          Number(tids.includes(b.templateNodeId ?? -1)) - Number(tids.includes(a.templateNodeId ?? -1)) ||
          (listings.get(b.id) ?? 0) - (listings.get(a.id) ?? 0) ||
          a.id - b.id,
      );
    }
    const keptRowFor = (ref: number) => rowsFor.get(ref)?.[0];

    const report: PropertyTypeImportReport = {
      applied: apply,
      fileRows: file.length,
      accountRows: rows.length,
      matched: refFor.size,
      changed: 0,
      moved: 0,
      renamed: 0,
      reordered: 0,
      merged: 0,
      keptInPlace: 0,
      clashes: 0,
      ambiguous,
      notInAccount: 0,
      notInAccountSample: [],
      untouched: rows.length - refFor.size,
    };

    const parentOf = new Map(rows.map((r) => [r.id, r.parentId]));
    const gone = new Set<number>();

    for (const item of topDown(file.map((f) => ({ ...f, id: f.ref, parentId: f.parentRef })))) {
      const matchedRows = (rowsFor.get(item.ref) ?? []).filter((r) => !gone.has(r.id));
      if (!matchedRows.length) {
        report.notInAccount++;
        if (report.notInAccountSample.length < 20) report.notInAccountSample.push(item.name.en || `#${item.ref}`);
        continue;
      }
      const [row, ...extras] = matchedRows;

      // Client 1 has these as one type: fold the extras into the kept row,
      // which takes over their feed names so imports don't recreate them.
      if (extras.length) {
        if (apply) {
          const keys = new Set(row.feedKeys || []);
          for (const e of extras) {
            for (const k of [locationKey(e.name?.en), ...feedNames(e)]) if (k) keys.add(`n:${k}`);
          }
          row.feedKeys = [...keys];
          await this.propertyTypeRepository.update({ id: row.id, tenantId }, { feedKeys: row.feedKeys });
          await this.propertyTypeService.merge(tenantId, extras.map((e) => e.id), row.id);
        }
        for (const e of extras) {
          for (const [id, p] of parentOf) if (p === e.id) parentOf.set(id, row.id);
          parentOf.delete(e.id);
          gone.add(e.id);
        }
        report.merged += extras.length;
      }

      const patch: Partial<PropertyType> = {};
      const currentParent = parentOf.get(row.id) ?? null;
      let moved = false;
      if (item.parentRef != null && !keptRowFor(item.parentRef)) {
        report.keptInPlace++;
      } else {
        const wantParent = item.parentRef == null ? null : keptRowFor(item.parentRef)!.id;
        if (wantParent !== currentParent) {
          if (wantParent != null && isWithin(parentOf, wantParent, row.id)) {
            report.clashes++;
          } else {
            patch.parentId = wantParent;
            patch.aiAssigned = false; // the client's arrangement, not AI's
            moved = true;
          }
        }
      }

      const name = { ...(row.name || {}), ...item.name };
      const renamed = !!item.name.en && item.name.en !== row.name?.en;
      if (JSON.stringify(name) !== JSON.stringify(row.name)) patch.name = name;
      if (item.sortOrder != null && item.sortOrder !== row.sortOrder) patch.sortOrder = item.sortOrder;

      if (!Object.keys(patch).length) continue;
      report.changed++;
      if (moved) report.moved++;
      if (renamed) report.renamed++;
      if (patch.sortOrder !== undefined) report.reordered++;

      if (apply) {
        if (renamed) await this.propertyTypeService.rememberFeedName(tenantId, row);
        await this.propertyTypeRepository.update({ id: row.id, tenantId }, patch);
        if (moved || renamed) await this.propertyTypeService.markUserLocked(tenantId, [row.id]);
      }
      if (moved) parentOf.set(row.id, patch.parentId ?? null);
    }

    return report;
  }

  private async listingCounts(tenantId: number): Promise<Map<number, number>> {
    const counts: Array<{ propertyTypeId: number; cnt: string }> = await this.propertyTypeRepository.manager.query(
      `SELECT propertyTypeId, COUNT(*) AS cnt FROM properties
       WHERE tenantId = ? AND propertyTypeId IS NOT NULL GROUP BY propertyTypeId`,
      [tenantId],
    );
    return new Map(counts.map((c) => [Number(c.propertyTypeId), Number(c.cnt)]));
  }
}

function feedNames(r: PropertyType): string[] {
  return (r.feedKeys || []).map((k) => /^n:(.+)$/.exec(k)?.[1]).filter((k): k is string => !!k);
}

function parseFile(text: string): FileType[] {
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BadRequestException('This file is not a Property Types export (it is not valid JSON).');
  }
  if (data?.format !== PROPERTY_TYPES_FILE_FORMAT) {
    throw new BadRequestException(
      data?.format === 'spm-locations'
        ? 'This is a Locations export. Import it on the Locations page.'
        : 'This file is not a Property Types export.',
    );
  }
  if (!Array.isArray(data.items)) throw new BadRequestException('The file has no property types in it.');
  if (data.items.length > MAX_TRANSFER_ROWS) throw new BadRequestException(`The file has more than ${MAX_TRANSFER_ROWS} property types.`);

  const items: FileType[] = [];
  const seen = new Set<number>();
  for (const raw of data.items) {
    const ref = int(raw?.ref);
    if (ref == null || seen.has(ref)) continue;
    seen.add(ref);
    const name = names(raw.name);
    const places = Array.isArray(raw.places)
      ? raw.places
          .slice(0, 50)
          .map((p: any) => ({ parentRef: int(p?.parentRef), key: locationKey(typeof p?.key === 'string' ? p.key : '') }))
          .filter((p: { key: string }) => p.key)
      : [];
    if (!places.length && name.en) places.push({ parentRef: int(raw.parentRef), key: locationKey(name.en) });
    items.push({
      ref,
      parentRef: int(raw.parentRef),
      name,
      sortOrder: int(raw.sortOrder),
      templateIds: ints(raw.templateIds).slice(0, 50),
      places,
    });
  }
  for (const it of items) {
    if (it.parentRef != null && !seen.has(it.parentRef)) it.parentRef = null;
    for (const p of it.places) if (p.parentRef != null && p.parentRef !== -1 && !seen.has(p.parentRef)) p.parentRef = -1;
  }
  return items;
}
