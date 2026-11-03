// Saved filters hold location and property type ids in JSON, so nothing cascades
// when a row is merged away. Left alone, a website key limited to the merged row
// would stop showing those listings.

export type MergedKind = 'location' | 'propertyType';

const FIELDS = {
  location: { scope: 'locationIds', exportFilter: 'locations', wishlist: 'locationIds' },
  propertyType: { scope: 'propertyTypeIds', exportFilter: 'types', wishlist: 'propertyTypeIds' },
} as const;

export function repointIds(list: unknown, removed: Set<number>, targetId: number): number[] | null {
  if (!Array.isArray(list)) return null;
  const ids = list.map(Number);
  if (!ids.some((id) => removed.has(id))) return null;
  return [...new Set(ids.map((id) => (removed.has(id) ? targetId : id)))];
}

// Both the plain scope and the per-listing-type tabs of a website key.
export function repointKeyScope(scope: any, kind: MergedKind, removed: Set<number>, targetId: number): any | null {
  if (!scope || typeof scope !== 'object') return null;
  const field = FIELDS[kind].scope;
  let changed = false;
  const next = { ...scope };
  const ids = repointIds(scope[field], removed, targetId);
  if (ids) {
    next[field] = ids;
    changed = true;
  }
  if (scope.byListingType && typeof scope.byListingType === 'object') {
    const tabs: Record<string, any> = { ...scope.byListingType };
    for (const [type, tab] of Object.entries<any>(tabs)) {
      const tabIds = repointIds(tab?.[field], removed, targetId);
      if (!tabIds) continue;
      tabs[type] = { ...tab, [field]: tabIds };
      changed = true;
    }
    next.byListingType = tabs;
  }
  return changed ? next : null;
}

// The driver hands JSON columns back as a string on some MySQL versions.
function json(raw: unknown): any {
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}

// Website keys, feed exports, buyer wishlists and location groups that named a
// merged row now name the survivor.
export async function repointSavedFilters(
  db: { query: (sql: string, params?: any[]) => Promise<any> },
  tenantId: number,
  kind: MergedKind,
  removedIds: number[],
  targetId: number,
): Promise<void> {
  const removed = new Set(removedIds);
  const fields = FIELDS[kind];

  const keys: Array<{ id: number; scope: unknown }> = await db.query(
    'SELECT id, scope FROM api_keys WHERE tenantId = ? AND scope IS NOT NULL',
    [tenantId],
  );
  for (const key of keys || []) {
    const scope = repointKeyScope(json(key.scope), kind, removed, targetId);
    if (scope) await db.query('UPDATE api_keys SET scope = ? WHERE id = ? AND tenantId = ?', [JSON.stringify(scope), key.id, tenantId]);
  }

  const exports: Array<{ id: number; propertyFilter: unknown }> = await db.query(
    'SELECT id, propertyFilter FROM feed_export_configs WHERE tenantId = ? AND propertyFilter IS NOT NULL',
    [tenantId],
  );
  for (const config of exports || []) {
    const filter = json(config.propertyFilter);
    const ids = repointIds(filter?.[fields.exportFilter], removed, targetId);
    if (ids) {
      await db.query('UPDATE feed_export_configs SET propertyFilter = ? WHERE id = ? AND tenantId = ?', [
        JSON.stringify({ ...filter, [fields.exportFilter]: ids }),
        config.id,
        tenantId,
      ]);
    }
  }

  const leads: Array<{ id: number; wishlist: unknown }> = await db.query(
    'SELECT id, wishlist FROM leads WHERE tenantId = ? AND wishlist IS NOT NULL',
    [tenantId],
  );
  for (const lead of leads || []) {
    const wishlist = json(lead.wishlist);
    const ids = repointIds(wishlist?.[fields.wishlist], removed, targetId);
    if (ids) {
      await db.query('UPDATE leads SET wishlist = ? WHERE id = ? AND tenantId = ?', [
        JSON.stringify({ ...wishlist, [fields.wishlist]: ids }),
        lead.id,
        tenantId,
      ]);
    }
  }

  // Property type groups are kept up by PropertyTypeService.merge.
  if (kind !== 'location') return;
  const groups: Array<{ id: number; locationIds: unknown }> = await db.query(
    'SELECT id, locationIds FROM location_groups WHERE tenantId = ?',
    [tenantId],
  );
  for (const group of groups || []) {
    const ids = repointIds(json(group.locationIds), removed, targetId);
    if (ids) await db.query('UPDATE location_groups SET locationIds = ? WHERE id = ? AND tenantId = ?', [JSON.stringify(ids), group.id, tenantId]);
  }
}
