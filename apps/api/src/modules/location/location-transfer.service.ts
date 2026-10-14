import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Location, LocationLevel } from '../../database/entities';
import { LOCATION_LEVELS, locationKey } from '../location-template/location-name';
import { LocationService, cleanAliases } from './location.service';
import {
  MAX_TRANSFER_ROWS,
  TransferFileNode,
  int,
  ints,
  isWithin,
  matchTree,
  names,
  num,
  strings,
  topDown,
} from '../../common/setup-transfer/match-tree';

export const LOCATIONS_FILE_FORMAT = 'spm-locations';

interface FileLocation extends TransferFileNode {
  level: LocationLevel | undefined;
  name: Record<string, string>;
  sortOrder: number | null;
  lat: number | null;
  lng: number | null;
  coordsLocked: boolean;
  aliases: string[] | null;
}

export interface LocationImportReport {
  applied: boolean;
  fileRows: number;
  accountRows: number;
  /** account rows that have a counterpart in the file */
  matched: number;
  /** of those, rows that change */
  changed: number;
  moved: number;
  renamed: number;
  reordered: number;
  coordsSet: number;
  aliasesSet: number;
  /** account duplicates folded together because the file has them as one place */
  merged: number;
  /** rows left under their current parent: the file's parent isn't in this account */
  keptInPlace: number;
  /** moves skipped: a same-named place already sits there, or it would loop */
  clashes: number;
  ambiguous: number;
  /** file rows this account doesn't have — never created */
  notInAccount: number;
  notInAccountSample: string[];
  /** account rows the file doesn't mention — left as they are */
  untouched: number;
}

/**
 * Locations "Export setup" / "Import setup": copies one client's arrangement
 * (nesting, order, names and translations, other spellings, map points) onto
 * the matching rows of another client. Never creates or deletes a place the
 * importing client doesn't have; see common/setup-transfer/match-tree.
 */
@Injectable()
export class LocationTransferService {
  constructor(
    @InjectRepository(Location)
    private readonly locationRepository: Repository<Location>,
    private readonly locationService: LocationService,
  ) {}

  async export(tenantId: number) {
    const rows = await this.locationRepository.find({ where: { tenantId }, order: { id: 'ASC' } });
    return {
      format: LOCATIONS_FILE_FORMAT,
      version: 1,
      exportedAt: new Date().toISOString(),
      count: rows.length,
      items: rows.map((r) => ({
        ref: r.id,
        parentRef: r.parentId,
        level: r.level,
        name: r.name,
        slug: r.slug,
        sortOrder: r.sortOrder,
        lat: r.lat == null ? null : Number(r.lat),
        lng: r.lng == null ? null : Number(r.lng),
        coordsLocked: r.coordsLocked,
        aliases: r.aliases,
        templateIds: templateIdsOf(r),
        places: placesOf(r),
      })),
    };
  }

  async import(tenantId: number, text: string, apply: boolean): Promise<LocationImportReport> {
    const file = parseFile(text);
    const rows = await this.locationRepository.find({ where: { tenantId } });
    const byId = new Map(rows.map((r) => [r.id, r]));

    const { refFor, ambiguous } = matchTree(
      file,
      rows.map((r) => ({
        id: r.id,
        parentId: r.parentId,
        level: r.level,
        templateIds: templateIdsOf(r),
        keys: [locationKey(r.name?.en), ...originNames(r)].filter(Boolean),
      })),
    );

    // file ref → this account's rows standing for it; the first one is kept.
    const rowsFor = new Map<number, Location[]>();
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
          b.propertyCount - a.propertyCount ||
          a.id - b.id,
      );
    }
    const keptRowFor = (ref: number) => rowsFor.get(ref)?.[0];

    const report: LocationImportReport = {
      applied: apply,
      fileRows: file.length,
      accountRows: rows.length,
      matched: refFor.size,
      changed: 0,
      moved: 0,
      renamed: 0,
      reordered: 0,
      coordsSet: 0,
      aliasesSet: 0,
      merged: 0,
      keptInPlace: 0,
      clashes: 0,
      ambiguous,
      notInAccount: 0,
      notInAccountSample: [],
      untouched: rows.length - refFor.size,
    };

    // The tree as it will be, kept up to date as rows move, so later moves
    // are checked against the new arrangement.
    const parentOf = new Map(rows.map((r) => [r.id, r.parentId]));
    const slugAt = new Map(rows.map((r) => [`${r.parentId ?? 0}|${r.slug}`, r.id]));
    const gone = new Set<number>();

    for (const item of topDown(file.map((f) => ({ ...f, id: f.ref, parentId: f.parentRef })))) {
      const matchedRows = (rowsFor.get(item.ref) ?? []).filter((r) => !gone.has(r.id));
      if (!matchedRows.length) {
        report.notInAccount++;
        if (report.notInAccountSample.length < 20) report.notInAccountSample.push(item.name.en || `#${item.ref}`);
        continue;
      }
      const [row, ...extras] = matchedRows;

      // Client 1 has these as one place: fold the extras into the kept row.
      for (const extra of extras) {
        if (isWithin(parentOf, row.id, extra.id)) continue; // kept row sits inside it
        if (apply) await this.locationService.mergeInto(tenantId, extra, row);
        for (const [id, p] of parentOf) if (p === extra.id) parentOf.set(id, row.id);
        parentOf.delete(extra.id);
        slugAt.delete(`${extra.parentId ?? 0}|${extra.slug}`);
        gone.add(extra.id);
        report.merged++;
      }

      const patch: Partial<Location> = {};
      const currentParent = parentOf.get(row.id) ?? null;
      let moved = false;
      if (item.parentRef != null && !keptRowFor(item.parentRef)) {
        report.keptInPlace++;
      } else {
        const wantParent = item.parentRef == null ? null : keptRowFor(item.parentRef)!.id;
        if (wantParent !== currentParent) {
          const taken = slugAt.get(`${wantParent ?? 0}|${row.slug}`);
          if ((wantParent != null && isWithin(parentOf, wantParent, row.id)) || (taken != null && taken !== row.id)) {
            report.clashes++;
          } else {
            patch.parentId = wantParent;
            moved = true;
          }
        }
      }

      const name = { ...(row.name || {}), ...item.name };
      const renamed = !!item.name.en && item.name.en !== row.name?.en;
      if (JSON.stringify(name) !== JSON.stringify(row.name)) patch.name = name;
      const releveled = !!item.level && item.level !== row.level;
      if (releveled) patch.level = item.level!;
      if (item.sortOrder != null && item.sortOrder !== row.sortOrder) patch.sortOrder = item.sortOrder;

      const aliases = cleanAliases(item.aliases, name.en);
      if (JSON.stringify(aliases) !== JSON.stringify(row.aliases ?? null)) patch.aliases = aliases;

      // A point the client typed in themselves isn't replaced by one that wasn't.
      const keepOwnPoint = row.coordsLocked && !item.coordsLocked;
      if (item.lat != null && item.lng != null && !keepOwnPoint) {
        if (fixed(item.lat) !== fixed(row.lat) || fixed(item.lng) !== fixed(row.lng)) {
          patch.lat = item.lat;
          patch.lng = item.lng;
          report.coordsSet++;
        }
        if (item.coordsLocked && !row.coordsLocked) patch.coordsLocked = true;
      }

      if (!Object.keys(patch).length) continue;
      report.changed++;
      if (moved) report.moved++;
      if (renamed) report.renamed++;
      if (patch.sortOrder !== undefined) report.reordered++;
      if (patch.aliases !== undefined) report.aliasesSet++;

      if (apply) {
        // Same bookkeeping as a move/rename in the dashboard: imports keep
        // finding the row, and the template leaves it where it now is.
        if (moved || renamed) await this.locationService.rememberOrigins(tenantId, [row.id]);
        await this.locationRepository.update({ id: row.id, tenantId }, patch);
        if (moved || renamed || releveled) await this.locationService.markUserLocked(tenantId, [row.id]);
      }
      if (moved) {
        slugAt.delete(`${currentParent ?? 0}|${row.slug}`);
        slugAt.set(`${patch.parentId ?? 0}|${row.slug}`, row.id);
        parentOf.set(row.id, patch.parentId ?? null);
      }
    }

    return report;
  }
}

// Template places a row stands for: its own link and any merged into it.
function templateIdsOf(r: Location): number[] {
  const ids = r.templateNodeId != null ? [r.templateNodeId] : [];
  for (const k of r.feedKeys || []) {
    const m = /^t:(\d+)$/.exec(k);
    if (m) ids.push(Number(m[1]));
  }
  return ids;
}

// Where the row is and where the feed originally put it ("x:<parentId>:<key>").
function placesOf(r: Location): Array<{ parentRef: number | null; key: string }> {
  const places = [{ parentRef: r.parentId, key: locationKey(r.name?.en) }];
  for (const k of r.feedKeys || []) {
    const m = /^x:(\d+):(.+)$/.exec(k);
    if (m) places.push({ parentRef: Number(m[1]) || null, key: m[2] });
  }
  return places.filter((p) => p.key);
}

function originNames(r: Location): string[] {
  return (r.feedKeys || []).map((k) => /^x:\d+:(.+)$/.exec(k)?.[1]).filter((k): k is string => !!k);
}

function fixed(v: unknown): string | null {
  return v == null || v === '' ? null : Number(v).toFixed(5);
}

function parseFile(text: string): FileLocation[] {
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BadRequestException('This file is not a Locations export (it is not valid JSON).');
  }
  if (data?.format !== LOCATIONS_FILE_FORMAT) {
    throw new BadRequestException(
      data?.format === 'spm-property-types'
        ? 'This is a Property Types export. Import it on the Property Types page.'
        : 'This file is not a Locations export.',
    );
  }
  if (!Array.isArray(data.items)) throw new BadRequestException('The file has no locations in it.');
  if (data.items.length > MAX_TRANSFER_ROWS) throw new BadRequestException(`The file has more than ${MAX_TRANSFER_ROWS} locations.`);

  const items: FileLocation[] = [];
  const seen = new Set<number>();
  for (const raw of data.items) {
    const ref = int(raw?.ref);
    if (ref == null || seen.has(ref)) continue;
    seen.add(ref);
    const level = LOCATION_LEVELS.includes(raw.level) ? (raw.level as LocationLevel) : undefined;
    const lat = num(raw.lat);
    const lng = num(raw.lng);
    const validPoint = lat != null && lng != null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
    const places = Array.isArray(raw.places)
      ? raw.places
          .slice(0, 50)
          .map((p: any) => ({ parentRef: int(p?.parentRef), key: locationKey(typeof p?.key === 'string' ? p.key : '') }))
          .filter((p: { key: string }) => p.key)
      : [];
    const name = names(raw.name);
    if (!places.length && name.en) places.push({ parentRef: int(raw.parentRef), key: locationKey(name.en) });
    items.push({
      ref,
      parentRef: int(raw.parentRef),
      level,
      name,
      sortOrder: int(raw.sortOrder),
      lat: validPoint ? lat : null,
      lng: validPoint ? lng : null,
      coordsLocked: raw.coordsLocked === true,
      aliases: Array.isArray(raw.aliases) ? strings(raw.aliases, 100, 20) : null,
      templateIds: ints(raw.templateIds).slice(0, 50),
      places,
    });
  }
  // A parent the file doesn't contain: the row counts as top level, and a feed
  // origin under a since-deleted parent matches no parent (-1) rather than the
  // top level.
  for (const it of items) {
    if (it.parentRef != null && !seen.has(it.parentRef)) it.parentRef = null;
    for (const p of it.places) if (p.parentRef != null && !seen.has(p.parentRef)) p.parentRef = -1;
  }
  return items;
}
