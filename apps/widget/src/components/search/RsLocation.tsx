import { useState, useMemo, useRef, useCallback, useEffect } from 'preact/hooks';
import type { RefObject } from 'preact';
import RsFloating, { isOutsideField } from '@/components/common/RsFloating';
import { useFilters } from '@/hooks/useFilters';
import { useLabels } from '@/hooks/useLabels';
import { useConfig } from '@/hooks/useConfig';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';
import type { Location } from '@/types';
import { useFacets, facetCount, countClass, useNonEmpty, FacetsEnabled } from '@/hooks/useFacets';

interface Props {
  variation?: number;
  [key: string]: unknown;
}

// How deep each level sits, so a list of mixed levels reads as a hierarchy.
// Keep in step with the dashboard's Locations page: a level missing here was
// drawn flush left, which made a town look like a region's equal.
const LEVEL_INDENT: Record<string, number> = {
  country: 0,
  region: 0,
  province: 1,
  area: 2,
  municipality: 2,
  town: 3,
  urbanization: 4,
};
const HIDDEN_LEVEL_LABELS = new Set<string>();

// Accent-insensitive normalization: NFD decomposes "São" into "S" + "a" +
// combining tilde + "o", then the regex strips combining diacritics so "São"
// and "Sao" both collapse to "sao". Applied to both the search query and
// location names before comparison.
const DIACRITICS = /[̀-ͯ]/g;
function normalizeSearch(str: string): string {
  return str.normalize('NFD').replace(DIACRITICS, '').toLowerCase();
}

function buildTree(locations: Location[]): Location[] {
  const byParent = new Map<number | undefined, Location[]>();
  for (const loc of locations) {
    const pid = loc.parentId ?? 0;
    if (!byParent.has(pid)) byParent.set(pid, []);
    byParent.get(pid)!.push(loc);
  }
  const result: Location[] = [];
  // Children stay in the order the API sent them: the dashboard's order.
  function walk(parentId: number | undefined) {
    const children = byParent.get(parentId ?? 0) ?? [];
    for (const child of children) {
      result.push(child);
      walk(child.id);
    }
  }
  walk(undefined);
  if (!result.length) return [...locations];
  return result;
}

/**
 * Each place's position in the dashboard's order (Locations: drag, or the Sort
 * menu). The API sends the list in that order per parent, but flat, so a
 * place's rank is where it falls walking the tree. The dropdowns sort by it;
 * they used to sort A–Z and ignore the dashboard.
 */
function dashboardRank(locations: Location[]): Map<number, number> {
  const known = new Set(locations.map((l) => l.id));
  const byParent = new Map<number, Location[]>();
  for (const loc of locations) {
    // A place whose parent isn't in the list ranks as a root.
    const pid = loc.parentId != null && known.has(loc.parentId) ? loc.parentId : 0;
    if (!byParent.has(pid)) byParent.set(pid, []);
    byParent.get(pid)!.push(loc);
  }
  const rank = new Map<number, number>();
  const walk = (pid: number) => {
    for (const loc of byParent.get(pid) ?? []) {
      if (rank.has(loc.id)) continue; // a cycle in the data must not hang the page
      rank.set(loc.id, rank.size);
      walk(loc.id);
    }
  };
  walk(0);
  for (const loc of locations) if (!rank.has(loc.id)) rank.set(loc.id, rank.size);
  return rank;
}

interface DropdownLevels { levels?: string[]; visible?: boolean }
interface DropdownConfig { dropdown1?: DropdownLevels; dropdown2?: DropdownLevels; dropdown3?: DropdownLevels; count?: number }

/**
 * How many location dropdowns this search shows: Locations → Website Search
 * Dropdowns (count = boxes switched on), the same on every search design.
 * Never saved: what each design did before — design 01's cascading boxes
 * (2, or 3 when box 3 was visible), one field everywhere else.
 */
export function locationBoxes(config: DropdownConfig | undefined, variation: number): number {
  const count = config?.count;
  if (count === 1 || count === 2 || count === 3) return count;
  if (variation === 2) return config?.dropdown3?.visible ? 3 : 2;
  return 1;
}

/**
 * The levels picked in Locations → Website Search Dropdowns. Only the
 * cascading dropdown (style 2) used to read them, so the tree (search designs
 * 03, 04) always started at Region and the search box offered every level
 * (10-05, solobanus picked Municipality). `top` starts the tree; `below` are
 * the visible later dropdowns' levels, shown under them. Null: nothing picked.
 */
function pickedLevels(config?: DropdownConfig): { top: Set<string>; below: Set<string> } | null {
  const top = new Set(config?.dropdown1?.levels ?? []);
  if (!top.size) return null;
  const below = new Set<string>();
  // With a box count set, only the boxes switched on count: one box with
  // Area + Municipality shows just those, not box 2's towns as well.
  const count = config?.count;
  [config?.dropdown2, config?.dropdown3].forEach((d, i) => {
    const on = count ? i + 2 <= count : d?.visible !== false;
    if (d && on) for (const l of d.levels ?? []) if (!top.has(l)) below.add(l);
  });
  return { top, below };
}

interface TreeRow { loc: Location; depth: number }

/**
 * A dropdown's places as a tree among themselves, like the Property Type
 * list: each place sits under its nearest ancestor that is also in the list
 * (a town under its municipality when a box shows Municipality + Town),
 * indented by depth. A place with no such ancestor is a root. Before, a box
 * with two levels listed them flat, so parents and children read as equals.
 */
function levelTree(items: Location[], all: Location[], rank: Map<number, number>): { rows: TreeRow[]; childrenOf: Map<number, Location[]> } {
  const inList = new Set(items.map((l) => l.id));
  const byId = new Map(all.map((l) => [l.id, l]));
  const childrenOf = new Map<number, Location[]>();
  const roots: Location[] = [];
  for (const loc of items) {
    let p = loc.parentId != null ? byId.get(loc.parentId) : undefined;
    const seen = new Set<number>();
    while (p && !inList.has(p.id) && !seen.has(p.id)) {
      seen.add(p.id);
      p = p.parentId != null ? byId.get(p.parentId) : undefined;
    }
    if (p && inList.has(p.id) && p.id !== loc.id) {
      if (!childrenOf.has(p.id)) childrenOf.set(p.id, []);
      childrenOf.get(p.id)!.push(loc);
    } else {
      roots.push(loc);
    }
  }
  const byRank = (a: Location, b: Location) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0);
  roots.sort(byRank);
  for (const list of childrenOf.values()) list.sort(byRank);
  const rows: TreeRow[] = [];
  const placed = new Set<number>();
  const walk = (loc: Location, depth: number) => {
    if (placed.has(loc.id)) return; // a cycle in the data must not hang the page
    placed.add(loc.id);
    rows.push({ loc, depth });
    for (const child of childrenOf.get(loc.id) ?? []) walk(child, depth + 1);
  };
  for (const root of roots) walk(root, 0);
  for (const loc of items) if (!placed.has(loc.id)) rows.push({ loc, depth: 0 });
  return { rows, childrenOf };
}

// A place and everything under it in the same dropdown.
function branchIds(id: number, childrenOf: Map<number, Location[]>): number[] {
  const out: number[] = [];
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    if (out.includes(cur)) continue;
    out.push(cur);
    for (const c of childrenOf.get(cur) ?? []) stack.push(c.id);
  }
  return out;
}

function parentMap(childrenOf: Map<number, Location[]>): Map<number, number> {
  const parentOf = new Map<number, number>();
  for (const [pid, kids] of childrenOf) for (const k of kids) parentOf.set(k.id, pid);
  return parentOf;
}

// The selection holds only the top picks: a ticked parent stands for its whole
// branch (the API searches a place with everything under it), so the URL stays
// short. A place shows ticked when it, or a parent above it, is picked.
function isTicked(id: number, selected: Set<number>, parentOf: Map<number, number>): boolean {
  const seen = new Set<number>();
  for (let cur: number | undefined = id; cur != null && !seen.has(cur); cur = parentOf.get(cur)) {
    if (selected.has(cur)) return true;
    seen.add(cur);
  }
  return false;
}

// Ticking a parent ticks all its children. Unticking a child of a ticked
// parent keeps its brothers and sisters ticked, the parent no longer whole.
function toggleBranch(selected: Set<number>, id: number, childrenOf: Map<number, Location[]>): Set<number> {
  const parentOf = parentMap(childrenOf);
  const next = new Set(selected);
  if (next.has(id)) {
    next.delete(id);
    return next;
  }
  // The picked parent this place is ticked through, if any.
  const path = [id];
  let picked: number | undefined;
  for (let p = parentOf.get(id); p != null && !path.includes(p); p = parentOf.get(p)) {
    path.push(p);
    if (next.has(p)) { picked = p; break; }
  }
  if (picked != null) {
    next.delete(picked);
    // Down from that parent: every branch off the path stays ticked.
    for (let i = path.length - 1; i > 0; i--) {
      for (const c of childrenOf.get(path[i]) ?? []) if (c.id !== path[i - 1]) next.add(c.id);
    }
    return next;
  }
  for (const b of branchIds(id, childrenOf)) next.delete(b);
  next.add(id);
  return next;
}

// While searching, a match keeps its place and its parents in the tree.
function filterRows(rows: TreeRow[], childrenOf: Map<number, Location[]>, query: string): TreeRow[] {
  const q = normalizeSearch(query.trim());
  if (!q) return rows;
  const parentOf = new Map<number, number>();
  for (const [pid, kids] of childrenOf) for (const k of kids) parentOf.set(k.id, pid);
  const keep = new Set<number>();
  for (const { loc } of rows) {
    if (!normalizeSearch(loc.name).includes(q)) continue;
    for (let id: number | undefined = loc.id; id != null && !keep.has(id); id = parentOf.get(id)) keep.add(id);
  }
  return rows.filter((r) => keep.has(r.loc.id));
}

function getDescendantIds(locations: Location[], parentIds: Set<number>): Set<number> {
  const result = new Set<number>();
  const queue = [...parentIds];
  while (queue.length) {
    const pid = queue.shift()!;
    for (const loc of locations) {
      if (loc.parentId === pid && !result.has(loc.id)) {
        result.add(loc.id);
        queue.push(loc.id);
      }
    }
  }
  return result;
}

function LevelBadge({ level }: { level: string }) {
  if (HIDDEN_LEVEL_LABELS.has(level)) return null;
  return <span class="rs-dropdown__level">{level}</span>;
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg class="rs-input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

/* ── Scroll arrow infrastructure ── */

function useScrollArrows() {
  const listRef = useRef<HTMLElement>(null);
  const [canUp, setCanUp] = useState(false);
  const [canDown, setCanDown] = useState(false);
  const rafRef = useRef(0);
  const cleanupRef = useRef<(() => void) | null>(null);

  const update = useCallback(() => {
    const el = listRef.current;
    if (!el) { setCanUp(false); setCanDown(false); return; }
    setCanUp(el.scrollTop > 2);
    setCanDown(el.scrollTop + el.clientHeight < el.scrollHeight - 2);
  }, []);

  const attach = useCallback(() => {
    if (cleanupRef.current) cleanupRef.current();
    const el = listRef.current;
    if (!el) { setCanUp(false); setCanDown(false); return; }
    requestAnimationFrame(update);
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(() => requestAnimationFrame(update));
    ro.observe(el);
    const mo = new MutationObserver(() => requestAnimationFrame(update));
    mo.observe(el, { childList: true, subtree: true });
    cleanupRef.current = () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
      mo.disconnect();
      cleanupRef.current = null;
    };
  }, [update]);

  const detach = useCallback(() => {
    if (cleanupRef.current) cleanupRef.current();
    setCanUp(false);
    setCanDown(false);
  }, []);

  const recheck = useCallback(() => {
    requestAnimationFrame(update);
  }, [update]);

  const scrollClick = useCallback((dir: number) => {
    listRef.current?.scrollBy({ top: dir * 120, behavior: 'smooth' });
  }, []);

  const startHover = useCallback((dir: number) => {
    const speed = dir * 3;
    const tick = () => {
      if (listRef.current) listRef.current.scrollTop += speed;
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const stopHover = useCallback(() => cancelAnimationFrame(rafRef.current), []);

  return { listRef, canUp, canDown, scrollClick, startHover, stopHover, attach, detach, recheck };
}

function ScrollArrow({ direction, visible, scroll }: {
  direction: 'up' | 'down';
  visible: boolean;
  scroll: ReturnType<typeof useScrollArrows>;
}) {
  const dir = direction === 'up' ? -1 : 1;
  return (
    <button
      type="button"
      class={`rs-scroll-arrow rs-scroll-arrow--${direction}${visible ? '' : ' rs-scroll-arrow--hidden'}`}
      onClick={() => scroll.scrollClick(dir)}
      onMouseEnter={() => scroll.startHover(dir)}
      onMouseLeave={scroll.stopHover}
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
    >
      <svg width="10" height="10" viewBox="0 0 10 10">
        <path
          d={direction === 'up' ? 'M1 7l4-4 4 4' : 'M1 3l4 4 4-4'}
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>
  );
}

/* ── Variation 1: Typeahead autocomplete ── */

function Typeahead({ locations, value, onChange, placeholder, locked }: {
  locations: Location[];
  value: number | undefined;
  onChange: (id: number | undefined) => void;
  placeholder: string;
  locked: boolean;
}) {
  const facets = useFacets();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const scroll = useScrollArrows();

  const selected = locations.find(l => l.id === value);

  const filtered = useMemo(() => {
    if (!query.trim()) return [];
    const q = normalizeSearch(query);
    return locations.filter(l => normalizeSearch(l.name).includes(q)).slice(0, 50);
  }, [query, locations]);

  const showDropdown = open && query.trim().length > 0;

  useEffect(() => {
    if (showDropdown) requestAnimationFrame(() => scroll.attach());
    else scroll.detach();
    return () => scroll.detach();
  }, [showDropdown]);

  // A Reset elsewhere on the page clears the store; drop the typed text too.
  useEffect(() => {
    if (value === undefined) setQuery('');
  }, [value]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (isOutsideField(ref.current, e.target)) { setOpen(false); setQuery(''); }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div class={`rs-field rs-dropdown-wrap${locked ? ' rs-field--locked' : ''}`} ref={ref}>
      <div class="rs-input-wrap">
        <SearchIcon />
        <input
          type="text"
          class="rs-input rs-input--has-icon"
          placeholder={selected ? selected.name : placeholder}
          value={open ? query : (selected?.name ?? '')}
          onFocus={() => { setOpen(true); setQuery(''); }}
          onInput={(e) => { setQuery((e.target as HTMLInputElement).value); setOpen(true); }}
          readOnly={locked}
        />
        {selected && open && (
          <button
            type="button"
            class="rs-typeahead__clear"
            onClick={() => { onChange(undefined); setQuery(''); }}
          >
            &times;
          </button>
        )}
      </div>
      {showDropdown && (
        <RsFloating anchorRef={ref}>
          <RsFloating anchorRef={ref}>
            <div class="rs-dropdown rs-dropdown--scrollable rs-dropdown-enter">
              <ScrollArrow direction="up" visible={scroll.canUp} scroll={scroll} />
              <ul class="rs-dropdown__list" ref={scroll.listRef as any}>
                {filtered.length === 0 ? (
                  <li class="rs-dropdown__empty">&mdash;</li>
                ) : (
                  filtered.map(loc => (
                    <li
                      key={loc.id}
                      class={`rs-dropdown__item${loc.id === value ? ' rs-dropdown__item--selected' : ''}`}
                      onClick={() => { onChange(loc.id); setOpen(false); setQuery(''); }}
                    >
                      <span>{loc.name}</span>
                      <span class="rs-dropdown__meta">
                        <LevelBadge level={loc.level} />
                        {facetCount(facets, 'locations', loc.id, loc.propertyCount) !== undefined && (
<span class={countClass('rs-dropdown__count', facetCount(facets, 'locations', loc.id, loc.propertyCount))}>{facetCount(facets, 'locations', loc.id, loc.propertyCount)}</span>
)}
                      </span>
                    </li>
                  ))
                )}
              </ul>
              <ScrollArrow direction="down" visible={scroll.canDown} scroll={scroll} />
            </div>
          </RsFloating>
        </RsFloating>
      )}
    </div>
  );
}

/* ── Variation 2: Cascading multi-select with tabs ── */

interface DropdownDef {
  levels: string[];
  label: string;
  visible: boolean;
}

// Which tab each already-chosen place belongs to: the first tab whose levels
// include the place's level (the first tab when none does). The places above
// it are ticked in the earlier tabs, so the later tab has something to list.
function initialSelection(
  locations: Location[],
  value: number[] | undefined,
  config?: { dropdown1: { levels: string[] }; dropdown2: { levels: string[] }; dropdown3: { levels: string[] } },
): [Set<number>, Set<number>, Set<number>] {
  const sets: [Set<number>, Set<number>, Set<number>] = [new Set(), new Set(), new Set()];
  if (!value?.length) return sets;
  const levels = config ? [config.dropdown1, config.dropdown2, config.dropdown3].map((d) => d?.levels ?? []) : [[], [], []];
  const byId = new Map(locations.map((l) => [l.id, l]));
  const tabOf = (l: Location) => levels.findIndex((ls) => ls.includes(l.level));
  for (const id of value) {
    const loc = byId.get(id);
    if (!loc) continue;
    const tab = Math.max(0, tabOf(loc));
    sets[tab].add(id);
    for (let p = loc.parentId != null ? byId.get(loc.parentId) : undefined; p; p = p.parentId != null ? byId.get(p.parentId) : undefined) {
      const pt = tabOf(p);
      if (pt >= 0 && pt < tab) sets[pt].add(p.id);
    }
  }
  return sets;
}

function CascadingMultiSelect({ locations, value, onChange, locked, t, config, visibleCount }: {
  locations: Location[];
  value: number[] | undefined;
  onChange: (ids: number[]) => void;
  locked: boolean;
  t: (key: string, fallback: string) => string;
  config?: {
    dropdown1: { levels: string[]; visible?: boolean };
    dropdown2: { levels: string[]; visible?: boolean };
    dropdown3: { levels: string[]; visible?: boolean };
  };
  // How many of the three dropdowns show (1–3), see locationBoxes().
  visibleCount: number;
}) {
  const facets = useFacets();
  const [activeTab, setActiveTab] = useState<number | null>(null);
  // A search that arrives with the page (a results page opened from the
  // homepage, a shared link) starts the tabs on its places.
  const initial = useMemo(() => initialSelection(locations, value, config), []);
  const [selected1, setSelected1] = useState<Set<number>>(initial[0]);
  const [selected2, setSelected2] = useState<Set<number>>(initial[1]);
  const [selected3, setSelected3] = useState<Set<number>>(initial[2]);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const tab0Ref = useRef<HTMLButtonElement>(null);
  const tab1Ref = useRef<HTMLButtonElement>(null);
  const tab2Ref = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const scroll = useScrollArrows();

  const dropdowns: DropdownDef[] = useMemo(() => {
    const labels = [
      t('location_dropdown1_label', 'Location'),
      t('location_dropdown2_label', 'Sub Location'),
      t('location_dropdown3_label', 'Area'),
    ];
    if (config) {
      return [config.dropdown1, config.dropdown2, config.dropdown3].map((d, i) => ({
        levels: d.levels ?? [],
        label: labels[i],
        visible: i < visibleCount,
      }));
    }
    return [
      { levels: [], label: labels[0], visible: true },
      { levels: [], label: labels[1], visible: visibleCount >= 2 },
      { levels: [], label: labels[2], visible: visibleCount >= 3 },
    ];
  }, [config, t, visibleCount]);

  const hasLevelConfig = dropdowns.some(d => d.levels.length > 0);
  const rank = useMemo(() => dashboardRank(locations), [locations]);

  const getItemsForDropdown = useCallback((ddIndex: number): Location[] => {
    const dd = dropdowns[ddIndex];
    if (!dd) return [];
    const inOrder = (list: Location[]) => list.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));

    if (hasLevelConfig) {
      const levelSet = new Set(dd.levels);
      const byLevel = locations.filter(l => levelSet.has(l.level));

      // A site whose places don't reach the configured level (no
      // municipalities, say) would otherwise open on an empty list, with no
      // way in. The top of its own tree is the honest starting point.
      if (ddIndex === 0) {
        const first = byLevel.length ? byLevel : locations.filter(l => !l.parentId);
        return inOrder(first);
      }

      const prevSelected = ddIndex === 1 ? selected1 : selected2;
      if (prevSelected.size === 0) return [];

      const descendantIds = getDescendantIds(locations, prevSelected);
      return inOrder(byLevel.filter(l =>
        l.parentId != null && (prevSelected.has(l.parentId) || descendantIds.has(l.parentId))
      ));
    }

    if (ddIndex === 0) return inOrder(locations.filter(l => !l.parentId));

    const prevSelected = ddIndex === 1 ? selected1 : selected2;
    if (prevSelected.size === 0) return [];
    const descendantIds = getDescendantIds(locations, prevSelected);
    return inOrder(locations.filter(l =>
      l.parentId != null && (prevSelected.has(l.parentId) || descendantIds.has(l.parentId))
    ));
  }, [locations, rank, dropdowns, hasLevelConfig, selected1, selected2]);

  const items1 = useMemo(() => getItemsForDropdown(0), [getItemsForDropdown]);
  const items2 = useMemo(() => getItemsForDropdown(1), [getItemsForDropdown]);
  const items3 = useMemo(() => getItemsForDropdown(2), [getItemsForDropdown]);

  // What the tabs stand for: the deepest tab with anything ticked.
  const tabIds = (): number[] => {
    if (selected3.size > 0) return [...selected3];
    if (selected2.size > 0) return [...selected2];
    if (selected1.size > 0) return [...selected1];
    return [];
  };
  const sameIds = (a: number[], b: number[]) => a.length === b.length && a.every((id) => b.includes(id));

  // Set when the tabs were just redrawn from the store (below), so that
  // redraw is not reported back as if the visitor had picked something.
  const fromStoreRef = useRef(false);

  useEffect(() => {
    if (fromStoreRef.current) { fromStoreRef.current = false; return; }
    // Only a change the visitor made: reporting the store's own value back
    // (on mount, say) would replace a single locationId from the URL and
    // leave the map and the count with no location at all.
    const ids = tabIds();
    if (sameIds(ids, value ?? [])) return;
    onChange(ids);
  }, [selected1, selected2, selected3]);

  // The other way round: a location set from outside the tabs — AI or voice
  // search, a link — must show in them. They used to read the store only when
  // first drawn, so after an AI search for "Marbella" the results were right
  // but the picker still said "Location". Also catches the list of places
  // arriving after the tabs were drawn.
  const valueKey = (value ?? []).join(',');
  useEffect(() => {
    if (!value?.length || !locations.length) return; // emptying is the Reset effect's job
    if (sameIds(tabIds(), value)) return;
    const [a, b, c] = initialSelection(locations, value, config);
    // A place the tabs don't list: leave them alone. Redrawing them empty
    // would report "no location" and quietly widen the search.
    if (!a.size && !b.size && !c.size) return;
    fromStoreRef.current = true;
    setSelected1(a);
    setSelected2(b);
    setSelected3(c);
  }, [valueKey, locations]);

  // The tabs keep their own selection (each level is a separate Set), so a
  // Reset elsewhere on the page has to reach them: when the store no longer
  // holds any location, drop what the tabs are showing.
  const hasStoreValue = !!value && value.length > 0;
  useEffect(() => {
    if (hasStoreValue) return;
    if (!selected1.size && !selected2.size && !selected3.size) return;
    setSelected1(new Set());
    setSelected2(new Set());
    setSelected3(new Set());
    setSearch('');
    setActiveTab(null);
  }, [hasStoreValue]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (isOutsideField(ref.current, e.target)) setActiveTab(null);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    if (activeTab !== null) {
      if (scroll.listRef.current) scroll.listRef.current.scrollTop = 0;
      requestAnimationFrame(() => scroll.attach());
    } else {
      scroll.detach();
    }
    return () => scroll.detach();
  }, [activeTab]);

  // The panel hangs off the active tab. RsFloating renders it at the end of
  // <body> and keeps it there, so neither a builder row nor a sticky header
  // can clip or cover it, and the old manual offsetParent maths (which
  // templates using `display: contents` broke) is no longer needed.
  const activeTabRef = activeTab === null ? tab0Ref : [tab0Ref, tab1Ref, tab2Ref][activeTab];

  const toggleTab = (idx: number) => {
    setActiveTab(prev => prev === idx ? null : idx);
    setSearch('');
  };

  const allItems = [items1, items2, items3];
  const allSelected = [selected1, selected2, selected3];
  const allSetters = [setSelected1, setSelected2, setSelected3];

  const currentItems = activeTab != null ? allItems[activeTab] : [];
  const currentSelected = activeTab != null ? allSelected[activeTab] : new Set<number>();

  // The open box's places as a tree (Municipality + Town: towns under their
  // municipality), the way the Property Type list shows its children.
  const tree = useMemo(() => levelTree(currentItems, locations, rank), [currentItems, locations, rank]);
  const filtered = useMemo(() => filterRows(tree.rows, tree.childrenOf, search), [tree, search]);
  const treeParents = useMemo(() => parentMap(tree.childrenOf), [tree]);

  const toggleItem = (tab: number, id: number) => {
    allSetters[tab](toggleBranch(allSelected[tab], id, tree.childrenOf));

    if (tab === 0) { setSelected2(new Set()); setSelected3(new Set()); }
    if (tab === 1) { setSelected3(new Set()); }
  };

  // Boxes 2 and 3 group their top places under the place they belong to
  // (towns under "Marbella"); each group keeps its own children nested.
  const groupedItems = useMemo(() => {
    if (activeTab === 0 || activeTab === null) return [{ parent: null as Location | null, rows: filtered }];
    const byId = new Map(locations.map((l) => [l.id, l]));
    const groups = new Map<number, { parent: Location | null; rows: TreeRow[] }>();
    let current: { parent: Location | null; rows: TreeRow[] } | null = null;
    for (const row of filtered) {
      if (row.depth === 0 || !current) {
        const pid = row.loc.parentId ?? 0;
        if (!groups.has(pid)) groups.set(pid, { parent: byId.get(pid) ?? null, rows: [] });
        current = groups.get(pid)!;
      }
      current.rows.push(row);
    }
    const list = [...groups.values()];
    // Places with no parent first, as before.
    list.sort((a, b) => (a.parent ? 1 : 0) - (b.parent ? 1 : 0));
    return list.length > 0 ? list : [{ parent: null as Location | null, rows: filtered }];
  }, [activeTab, filtered, locations]);

  const formatTabLabel = (count: number, dd: DropdownDef) => {
    if (count > 0) return t('location_n_selected', '{n} selected').replace('{n}', String(count));
    return dd.label;
  };

  const showTab2 = dropdowns[1].visible;
  const showTab3 = dropdowns[2].visible;

  return (
    <div class={`rs-cascading-v2${locked ? ' rs-field--locked' : ''}`} ref={ref}>
      <div class="rs-cascading-v2__tabs">
        <button
          ref={tab0Ref}
          type="button"
          class={`rs-cascading-v2__tab${activeTab === 0 ? ' rs-cascading-v2__tab--active' : ''}${selected1.size > 0 ? ' rs-cascading-v2__tab--has-selection' : ''}`}
          onClick={() => toggleTab(0)}
        >
          {formatTabLabel(selected1.size, dropdowns[0])}
        </button>
        {showTab2 && (
          <button
            ref={tab1Ref}
            type="button"
            class={`rs-cascading-v2__tab${activeTab === 1 ? ' rs-cascading-v2__tab--active' : ''}${selected2.size > 0 ? ' rs-cascading-v2__tab--has-selection' : ''}`}
            onClick={() => toggleTab(1)}
          >
            {formatTabLabel(selected2.size, dropdowns[1])}
          </button>
        )}
        {showTab3 && (
          <button
            ref={tab2Ref}
            type="button"
            class={`rs-cascading-v2__tab${activeTab === 2 ? ' rs-cascading-v2__tab--active' : ''}${selected3.size > 0 ? ' rs-cascading-v2__tab--has-selection' : ''}`}
            onClick={() => toggleTab(2)}
          >
            {formatTabLabel(selected3.size, dropdowns[2])}
          </button>
        )}
      </div>
      {activeTab !== null && (
        <RsFloating anchorRef={activeTabRef as RefObject<HTMLElement>}>
        <div
          class="rs-cascading-v2__panel rs-dropdown-enter"
          ref={panelRef}
        >
          <div class="rs-cascading-v2__search">
            <div class="rs-input-wrap">
              <SearchIcon />
              <input
                type="text"
                class="rs-input rs-input--sm rs-input--has-icon"
                placeholder={t('location_search', 'Search location...')}
                value={search}
                onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
              />
            </div>
          </div>
          {currentItems.length === 0 ? (
            <div class="rs-cascading-v2__empty">
              {activeTab === 1
                ? t('location_select_parent', 'Select a location first')
                : t('location_select_parent', 'Select a sub-location first')}
            </div>
          ) : (
            <>
              <ScrollArrow direction="up" visible={scroll.canUp} scroll={scroll} />
              <ul class="rs-cascading-v2__list" ref={scroll.listRef as any}>
                {groupedItems.map((group, gi) => (
                  <li key={gi}>
                    {group.parent && (
                      <div class="rs-cascading-v2__group-header">{group.parent.name}</div>
                    )}
                    <ul>
                      {group.rows.map(({ loc, depth }) => (
                        <li
                          key={loc.id}
                          class={`rs-cascading-v2__item${group.parent ? ' rs-cascading-v2__item--child' : ''}${depth > 0 ? ` rs-cascading-v2__item--depth-${Math.min(depth, 3)}` : ' rs-cascading-v2__item--root'}`}
                          onClick={() => toggleItem(activeTab, loc.id)}
                        >
                          <span class={`rs-cascading-v2__checkbox${isTicked(loc.id, currentSelected, treeParents) ? ' rs-cascading-v2__checkbox--checked' : ''}`}>
                            {isTicked(loc.id, currentSelected, treeParents) && <CheckIcon />}
                          </span>
                          <span class="rs-cascading-v2__label">{loc.name}</span>
                          <span class="rs-dropdown__meta">
                            <LevelBadge level={loc.level} />
                            {facetCount(facets, 'locations', loc.id, loc.propertyCount) !== undefined && (
<span class={countClass('rs-dropdown__count', facetCount(facets, 'locations', loc.id, loc.propertyCount))}>{facetCount(facets, 'locations', loc.id, loc.propertyCount)}</span>
)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
                {filtered.length === 0 && currentItems.length > 0 && (
                  <li class="rs-dropdown__empty">&mdash;</li>
                )}
              </ul>
              <ScrollArrow direction="down" visible={scroll.canDown} scroll={scroll} />
            </>
          )}
        </div>
        </RsFloating>
      )}
    </div>
  );
}

/* ── Several places in one field (variations 3 and 4) ── */

// The tick boxes mean what they show: a click ticks or unticks a place and
// the list stays open, so a visitor can pick several (10-26, Monarch).
function toggleId(ids: number[], id: number): number[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

// The closed field: the one place picked, else "{n} selected".
function pickedText(locations: Location[], ids: number[], empty: string, nSelected: string): string {
  if (!ids.length) return empty;
  if (ids.length === 1) return locations.find((l) => l.id === ids[0])?.name ?? empty;
  return nSelected.replace('{n}', String(ids.length));
}

/* ── Variation 3: Hierarchical with checkboxes ── */

function Hierarchical({ locations, value, onChange, placeholder, allLabel, nSelected, locked }: {
  locations: Location[];
  value: number[];
  onChange: (ids: number[]) => void;
  placeholder: string;
  allLabel: string;
  nSelected: string;
  locked: boolean;
}) {
  const facets = useFacets();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const scroll = useScrollArrows();
  const tree = useMemo(() => buildTree(locations), [locations]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => scroll.attach());
    else scroll.detach();
    return () => scroll.detach();
  }, [open]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (isOutsideField(ref.current, e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div class={`rs-field rs-dropdown-wrap${locked ? ' rs-field--locked' : ''}`} ref={ref}>
      <button
        type="button"
        class="rs-select"
        onClick={() => !locked && setOpen(!open)}
        style="text-align: left"
      >
        {pickedText(locations, value, placeholder || allLabel, nSelected)}
      </button>
      {open && (
        <RsFloating anchorRef={ref}>
          <div class="rs-dropdown rs-dropdown--scrollable rs-dropdown-enter">
            <ScrollArrow direction="up" visible={scroll.canUp} scroll={scroll} />
            <ul class="rs-dropdown__list" ref={scroll.listRef as any}>
              <li
                class={`rs-dropdown__item${!value.length ? ' rs-dropdown__item--selected' : ''}`}
                onClick={() => { onChange([]); setOpen(false); }}
              >
                <span class={`rs-cascading-v2__checkbox${!value.length ? ' rs-cascading-v2__checkbox--checked' : ''}`}>
                  {!value.length && <CheckIcon />}
                </span>
                <span>{allLabel}</span>
              </li>
              {tree.map(loc => (
                <li
                  key={loc.id}
                  class={`rs-dropdown__item rs-dropdown__item--indent-${LEVEL_INDENT[loc.level] ?? 0}${value.includes(loc.id) ? ' rs-dropdown__item--selected' : ''}`}
                  onClick={() => onChange(toggleId(value, loc.id))}
                >
                  <span class={`rs-cascading-v2__checkbox${value.includes(loc.id) ? ' rs-cascading-v2__checkbox--checked' : ''}`}>
                    {value.includes(loc.id) && <CheckIcon />}
                  </span>
                  <span>{loc.name}</span>
                  <span class="rs-dropdown__meta">
                    <LevelBadge level={loc.level} />
                    {facetCount(facets, 'locations', loc.id, loc.propertyCount) !== undefined && (
<span class={countClass('rs-dropdown__count', facetCount(facets, 'locations', loc.id, loc.propertyCount))}>{facetCount(facets, 'locations', loc.id, loc.propertyCount)}</span>
)}
                  </span>
                </li>
              ))}
            </ul>
            <ScrollArrow direction="down" visible={scroll.canDown} scroll={scroll} />
          </div>
        </RsFloating>
      )}
    </div>
  );
}

/* ── Variation 4: Collapsible tree dropdown ── */

function CollapsibleTree({ locations, picked, value, onChange, allLabel, nSelected, locked, placeholder }: {
  locations: Location[];
  picked: { top: Set<string>; below: Set<string> } | null;
  value: number[];
  onChange: (ids: number[]) => void;
  allLabel: string;
  nSelected: string;
  locked: boolean;
  placeholder: string;
}) {
  const facets = useFacets();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const scroll = useScrollArrows();

  // Without picked levels: the whole tree from its roots. With them: only the
  // picked levels, each place under its nearest picked ancestor (Area +
  // Municipality: municipalities under their area), the rest as roots.
  const { roots, childrenOf } = useMemo(() => {
    const items = picked ? locations.filter((l) => picked.top.has(l.level) || picked.below.has(l.level)) : locations;
    const { rows, childrenOf: map } = levelTree(items, locations, dashboardRank(locations));
    return { roots: rows.filter((r) => r.depth === 0).map((r) => r.loc), childrenOf: map };
  }, [locations, picked]);
  const parentOf = useMemo(() => parentMap(childrenOf), [childrenOf]);
  const valueSet = useMemo(() => new Set(value), [value]);

  // Picked levels open fully, like the Property Type list; the whole
  // unpicked tree starts folded, as before (it can run to hundreds of places).
  const [expanded, setExpanded] = useState<Set<number>>(() => (picked ? new Set(childrenOf.keys()) : new Set()));
  useEffect(() => {
    if (picked) setExpanded(new Set(childrenOf.keys()));
  }, [childrenOf]);

  const toggleExpand = (e: MouseEvent, id: number) => {
    e.stopPropagation();
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  useEffect(() => {
    if (open) requestAnimationFrame(() => scroll.attach());
    else scroll.detach();
    return () => scroll.detach();
  }, [open]);

  useEffect(() => {
    if (open) scroll.recheck();
  }, [expanded, open]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (isOutsideField(ref.current, e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function renderNode(loc: Location, depth: number) {
    const children = childrenOf.get(loc.id);
    const isExpanded = expanded.has(loc.id);
    const isSelected = isTicked(loc.id, valueSet, parentOf);

    return (
      <li key={loc.id}>
        <div
          class={`rs-dropdown__item rs-dropdown__item--indent-${Math.min(depth, 4)}${isSelected ? ' rs-dropdown__item--selected' : ''}`}
          onClick={() => onChange([...toggleBranch(new Set(value), loc.id, childrenOf)])}
        >
          {children && children.length > 0 ? (
            <button
              type="button"
              class={`rs-tree__toggle${isExpanded ? ' rs-tree__toggle--open' : ''}`}
              onClick={(e) => toggleExpand(e as unknown as MouseEvent, loc.id)}
            >
              <svg width="10" height="10" viewBox="0 0 10 10">
                <path d={isExpanded ? 'M1 3l4 4 4-4' : 'M3 1l4 4-4 4'} fill="none" stroke="currentColor" stroke-width="1.5" />
              </svg>
            </button>
          ) : (
            <span class="rs-tree__spacer" />
          )}
          <span class={`rs-cascading-v2__checkbox${isSelected ? ' rs-cascading-v2__checkbox--checked' : ''}`}>
            {isSelected && <CheckIcon />}
          </span>
          <span>{loc.name}</span>
          <span class="rs-dropdown__meta">
            <LevelBadge level={loc.level} />
            {facetCount(facets, 'locations', loc.id, loc.propertyCount) !== undefined && (
<span class={countClass('rs-dropdown__count', facetCount(facets, 'locations', loc.id, loc.propertyCount))}>{facetCount(facets, 'locations', loc.id, loc.propertyCount)}</span>
)}
          </span>
        </div>
        {children && isExpanded && (
          <ul class="rs-tree__children">
            {children.map(child => renderNode(child, depth + 1))}
          </ul>
        )}
      </li>
    );
  }

  return (
    <div class={`rs-field rs-dropdown-wrap${locked ? ' rs-field--locked' : ''}`} ref={ref}>
      <button
        type="button"
        class="rs-select"
        onClick={() => !locked && setOpen(!open)}
        style="text-align: left"
      >
        {pickedText(locations, value, placeholder || allLabel, nSelected)}
      </button>
      {open && (
        <RsFloating anchorRef={ref}>
          <div class="rs-dropdown rs-dropdown--scrollable rs-dropdown-enter">
            <ScrollArrow direction="up" visible={scroll.canUp} scroll={scroll} />
            <ul class="rs-dropdown__list" ref={scroll.listRef as any}>
              <li
                class={`rs-dropdown__item${!value.length ? ' rs-dropdown__item--selected' : ''}`}
                onClick={() => { onChange([]); setOpen(false); }}
              >
                <span class="rs-tree__spacer" />
                <span class={`rs-cascading-v2__checkbox${!value.length ? ' rs-cascading-v2__checkbox--checked' : ''}`}>
                  {!value.length && <CheckIcon />}
                </span>
                <span>{allLabel}</span>
              </li>
              {roots.map(loc => renderNode(loc, 0))}
            </ul>
            <ScrollArrow direction="down" visible={scroll.canDown} scroll={scroll} />
          </div>
        </RsFloating>
      )}
    </div>
  );
}

/* ── Main component ── */

export default function RsLocation({ variation = 1 }: Props) {
  const { filters, setFilter, isLocked } = useFilters();
  const { t } = useLabels();
  const widgetConfig = useConfig();
  const allLocations = useSelector(selectors.getLocations);
  const locked = isLocked('locationId');
  // Places that would find nothing drop out (picked ones stay).
  const locations = useNonEmpty(allLocations, 'locations', [filters.locationId, ...(filters.locationIds ?? [])]);

  const placeholder = t('location_placeholder', 'Search location...');
  const allLabel = t('location_all', 'All Locations');

  const handleChange = useCallback((id: number | undefined) => {
    setFilter('locationId', id as number);
    setFilter('locationIds', undefined as never);
  }, [setFilter]);

  const handleMultiChange = useCallback((ids: number[]) => {
    setFilter('locationIds', ids.length > 0 ? ids : undefined as never);
    setFilter('locationId', undefined as never);
  }, [setFilter]);

  const label = t('location_placeholder', 'Location');
  const nSelected = t('location_n_selected', '{n} selected');
  const multiValue = filters.locationIds ?? (filters.locationId != null ? [filters.locationId] : []);
  const picked = useMemo(() => pickedLevels(widgetConfig.locationSearchConfig), [widgetConfig.locationSearchConfig]);
  // 2–3 dropdowns switch any design to the cascading boxes; one keeps the
  // design's own field (search box, tree…).
  const boxes = locationBoxes(widgetConfig.locationSearchConfig, variation);
  const cascading = variation === 2 || boxes > 1;

  return (
    <div class={`rs_location${cascading && boxes > 1 ? ` rs_location--multi rs_location--n${boxes}` : ''}`}>
      {!cascading && variation !== 1 && <label class="rs-field__label">{label}</label>}
      {cascading && (
        <CascadingMultiSelect
          locations={locations}
          value={filters.locationIds ?? (filters.locationId != null ? [filters.locationId] : undefined)}
          onChange={handleMultiChange}
          locked={locked}
          t={t}
          config={widgetConfig.locationSearchConfig}
          visibleCount={boxes}
        />
      )}
      {!cascading && variation === 1 && (
        <Typeahead
          locations={picked ? locations.filter((l) => picked.top.has(l.level) || picked.below.has(l.level)) : locations}
          value={filters.locationId}
          onChange={handleChange}
          placeholder={placeholder}
          locked={locked}
        />
      )}
      {!cascading && variation === 3 && (
        <Hierarchical
          locations={locations}
          value={multiValue}
          onChange={handleMultiChange}
          placeholder={placeholder}
          allLabel={allLabel}
          nSelected={nSelected}
          locked={locked}
        />
      )}
      {!cascading && variation === 4 && (
        <CollapsibleTree
          locations={locations}
          picked={picked}
          value={multiValue}
          onChange={handleMultiChange}
          allLabel={allLabel}
          nSelected={nSelected}
          locked={locked}
          placeholder={placeholder}
        />
      )}
    </div>
  );
}

/**
 * The location tabs on their own, for a form (the wishlist form): several
 * places at any level, kept in the form's own state — never the page's
 * search filters. Same tabs as the site's search (Locations → Website Search
 * Dropdowns). facets={false} shows every place, with no counts.
 */
export function LocationPicker({ value, onChange, facets = true }: {
  value: number[];
  onChange: (ids: number[]) => void;
  facets?: boolean;
}) {
  const { t } = useLabels();
  const widgetConfig = useConfig();
  const all = useSelector(selectors.getLocations);
  const locations = useMemo(() => (facets ? all : all.map((l) => ({ ...l, propertyCount: undefined }))), [all, facets]);
  const boxes = locationBoxes(widgetConfig.locationSearchConfig, 2);
  return (
    <FacetsEnabled.Provider value={facets}>
      <div class={`rs_location${boxes > 1 ? ` rs_location--multi rs_location--n${boxes}` : ''}`}>
        <CascadingMultiSelect
          locations={locations}
          value={value}
          onChange={onChange}
          locked={false}
          t={t}
          config={widgetConfig.locationSearchConfig}
          visibleCount={boxes}
        />
      </div>
    </FacetsEnabled.Provider>
  );
}
