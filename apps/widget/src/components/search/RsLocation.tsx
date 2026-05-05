import { useState, useMemo, useRef, useCallback, useEffect } from 'preact/hooks';
import { useFilters } from '@/hooks/useFilters';
import { useLabels } from '@/hooks/useLabels';
import { useConfig } from '@/hooks/useConfig';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';
import type { Location } from '@/types';

interface Props {
  variation?: number;
  [key: string]: unknown;
}

const LEVEL_INDENT: Record<string, number> = { country: 0, province: 1, municipality: 2, town: 3, area: 4 };
const HIDDEN_LEVEL_LABELS = new Set<string>();

function buildTree(locations: Location[]): Location[] {
  const byParent = new Map<number | undefined, Location[]>();
  for (const loc of locations) {
    const pid = loc.parentId ?? 0;
    if (!byParent.has(pid)) byParent.set(pid, []);
    byParent.get(pid)!.push(loc);
  }
  const result: Location[] = [];
  function walk(parentId: number | undefined) {
    const children = byParent.get(parentId ?? 0) ?? [];
    for (const child of children.sort((a, b) => a.name.localeCompare(b.name))) {
      result.push(child);
      walk(child.id);
    }
  }
  walk(undefined);
  if (!result.length) return [...locations].sort((a, b) => a.name.localeCompare(b.name));
  return result;
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
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const scroll = useScrollArrows();

  const selected = locations.find(l => l.id === value);

  const filtered = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return locations.filter(l => l.name.toLowerCase().includes(q)).slice(0, 50);
  }, [query, locations]);

  const showDropdown = open && query.trim().length > 0;

  useEffect(() => {
    if (showDropdown) requestAnimationFrame(() => scroll.attach());
    else scroll.detach();
    return () => scroll.detach();
  }, [showDropdown]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setQuery(''); }
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
                    {!!loc.propertyCount && (
                      <span class="rs-dropdown__count">{loc.propertyCount}</span>
                    )}
                  </span>
                </li>
              ))
            )}
          </ul>
          <ScrollArrow direction="down" visible={scroll.canDown} scroll={scroll} />
        </div>
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

function CascadingMultiSelect({ locations, onChange, locked, t, config }: {
  locations: Location[];
  onChange: (ids: number[]) => void;
  locked: boolean;
  t: (key: string, fallback: string) => string;
  config?: {
    dropdown1: { levels: string[]; visible?: boolean };
    dropdown2: { levels: string[]; visible?: boolean };
    dropdown3: { levels: string[]; visible?: boolean };
  };
}) {
  const [activeTab, setActiveTab] = useState<number | null>(null);
  const [selected1, setSelected1] = useState<Set<number>>(new Set());
  const [selected2, setSelected2] = useState<Set<number>>(new Set());
  const [selected3, setSelected3] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const scroll = useScrollArrows();

  const dropdowns: DropdownDef[] = useMemo(() => {
    const labels = [
      t('location_dropdown1_label', 'Location'),
      t('location_dropdown2_label', 'Sub-location'),
      t('location_dropdown3_label', 'Area'),
    ];
    if (config) {
      return [config.dropdown1, config.dropdown2, config.dropdown3].map((d, i) => ({
        levels: d.levels ?? [],
        label: labels[i],
        visible: d.visible !== false || i < 2,
      }));
    }
    return [
      { levels: [], label: labels[0], visible: true },
      { levels: [], label: labels[1], visible: true },
      { levels: [], label: labels[2], visible: false },
    ];
  }, [config, t]);

  const hasLevelConfig = dropdowns.some(d => d.levels.length > 0);

  const getItemsForDropdown = useCallback((ddIndex: number): Location[] => {
    const dd = dropdowns[ddIndex];
    if (!dd) return [];

    if (hasLevelConfig) {
      const levelSet = new Set(dd.levels);
      const byLevel = locations.filter(l => levelSet.has(l.level));

      if (ddIndex === 0) return byLevel.sort((a, b) => a.name.localeCompare(b.name));

      const prevSelected = ddIndex === 1 ? selected1 : selected2;
      if (prevSelected.size === 0) return [];

      const descendantIds = getDescendantIds(locations, prevSelected);
      return byLevel.filter(l =>
        l.parentId != null && (prevSelected.has(l.parentId) || descendantIds.has(l.parentId))
      ).sort((a, b) => a.name.localeCompare(b.name));
    }

    if (ddIndex === 0) return locations.filter(l => !l.parentId).sort((a, b) => a.name.localeCompare(b.name));

    const prevSelected = ddIndex === 1 ? selected1 : selected2;
    if (prevSelected.size === 0) return [];
    const descendantIds = getDescendantIds(locations, prevSelected);
    return locations.filter(l =>
      l.parentId != null && (prevSelected.has(l.parentId) || descendantIds.has(l.parentId))
    ).sort((a, b) => a.name.localeCompare(b.name));
  }, [locations, dropdowns, hasLevelConfig, selected1, selected2]);

  const items1 = useMemo(() => getItemsForDropdown(0), [getItemsForDropdown]);
  const items2 = useMemo(() => getItemsForDropdown(1), [getItemsForDropdown]);
  const items3 = useMemo(() => getItemsForDropdown(2), [getItemsForDropdown]);

  useEffect(() => {
    let ids: number[] = [];
    if (selected3.size > 0) ids = [...selected3];
    else if (selected2.size > 0) ids = [...selected2];
    else if (selected1.size > 0) ids = [...selected1];
    onChange(ids);
  }, [selected1, selected2, selected3]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setActiveTab(null);
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

  const toggleTab = (idx: number) => {
    setActiveTab(prev => prev === idx ? null : idx);
    setSearch('');
  };

  const allItems = [items1, items2, items3];
  const allSelected = [selected1, selected2, selected3];
  const allSetters = [setSelected1, setSelected2, setSelected3];

  const toggleItem = (tab: number, id: number) => {
    const next = new Set(allSelected[tab]);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    allSetters[tab](next);

    if (tab === 0) { setSelected2(new Set()); setSelected3(new Set()); }
    if (tab === 1) { setSelected3(new Set()); }
  };

  const currentItems = activeTab != null ? allItems[activeTab] : [];
  const currentSelected = activeTab != null ? allSelected[activeTab] : new Set<number>();

  const filtered = useMemo(() => {
    if (!search.trim()) return currentItems;
    const q = search.toLowerCase();
    return currentItems.filter(l => l.name.toLowerCase().includes(q));
  }, [currentItems, search]);

  const groupedItems = useMemo(() => {
    if (activeTab === 0 || activeTab === null) return [{ parent: null as Location | null, items: filtered }];

    const groups: { parent: Location | null; items: Location[] }[] = [];
    const parentIdSet = new Set(filtered.map(l => l.parentId).filter((id): id is number => id != null));

    for (const pid of parentIdSet) {
      const parent = locations.find(l => l.id === pid) ?? null;
      const children = filtered.filter(l => l.parentId === pid);
      if (children.length > 0) groups.push({ parent, items: children });
    }

    const orphans = filtered.filter(l => !l.parentId);
    if (orphans.length > 0) groups.unshift({ parent: null, items: orphans });

    return groups.length > 0 ? groups : [{ parent: null as Location | null, items: filtered }];
  }, [activeTab, filtered, locations]);

  const formatTabLabel = (count: number, dd: DropdownDef) => {
    if (count > 0) return t('location_n_selected', '{n} selected').replace('{n}', String(count));
    return dd.label;
  };

  const showTab3 = dropdowns[2].visible || items3.length > 0 || selected3.size > 0;

  return (
    <div class={`rs-cascading-v2${locked ? ' rs-field--locked' : ''}`} ref={ref}>
      <div class="rs-cascading-v2__tabs">
        <button
          type="button"
          class={`rs-cascading-v2__tab${activeTab === 0 ? ' rs-cascading-v2__tab--active' : ''}${selected1.size > 0 ? ' rs-cascading-v2__tab--has-selection' : ''}`}
          onClick={() => toggleTab(0)}
        >
          {formatTabLabel(selected1.size, dropdowns[0])}
        </button>
        <button
          type="button"
          class={`rs-cascading-v2__tab${activeTab === 1 ? ' rs-cascading-v2__tab--active' : ''}${selected2.size > 0 ? ' rs-cascading-v2__tab--has-selection' : ''}`}
          onClick={() => toggleTab(1)}
        >
          {formatTabLabel(selected2.size, dropdowns[1])}
        </button>
        {showTab3 && (
          <button
            type="button"
            class={`rs-cascading-v2__tab${activeTab === 2 ? ' rs-cascading-v2__tab--active' : ''}${selected3.size > 0 ? ' rs-cascading-v2__tab--has-selection' : ''}`}
            onClick={() => toggleTab(2)}
          >
            {formatTabLabel(selected3.size, dropdowns[2])}
          </button>
        )}
      </div>
      {activeTab !== null && (
        <div class="rs-cascading-v2__panel rs-dropdown-enter">
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
                      {group.items.map(loc => (
                        <li
                          key={loc.id}
                          class={`rs-cascading-v2__item${group.parent ? ' rs-cascading-v2__item--child' : ''}`}
                          onClick={() => toggleItem(activeTab, loc.id)}
                        >
                          <span class={`rs-cascading-v2__checkbox${currentSelected.has(loc.id) ? ' rs-cascading-v2__checkbox--checked' : ''}`}>
                            {currentSelected.has(loc.id) && <CheckIcon />}
                          </span>
                          <span class="rs-cascading-v2__label">{loc.name}</span>
                          <span class="rs-dropdown__meta">
                            <LevelBadge level={loc.level} />
                            {!!loc.propertyCount && (
                              <span class="rs-dropdown__count">{loc.propertyCount}</span>
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
      )}
    </div>
  );
}

/* ── Variation 3: Hierarchical with checkboxes ── */

function Hierarchical({ locations, value, onChange, placeholder, allLabel, locked }: {
  locations: Location[];
  value: number | undefined;
  onChange: (id: number | undefined) => void;
  placeholder: string;
  allLabel: string;
  locked: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const scroll = useScrollArrows();
  const tree = useMemo(() => buildTree(locations), [locations]);
  const selected = locations.find(l => l.id === value);

  useEffect(() => {
    if (open) requestAnimationFrame(() => scroll.attach());
    else scroll.detach();
    return () => scroll.detach();
  }, [open]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
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
        {selected ? selected.name : (placeholder || allLabel)}
      </button>
      {open && (
        <div class="rs-dropdown rs-dropdown--scrollable rs-dropdown-enter">
          <ScrollArrow direction="up" visible={scroll.canUp} scroll={scroll} />
          <ul class="rs-dropdown__list" ref={scroll.listRef as any}>
            <li
              class={`rs-dropdown__item${!value ? ' rs-dropdown__item--selected' : ''}`}
              onClick={() => { onChange(undefined); setOpen(false); }}
            >
              <span class={`rs-cascading-v2__checkbox${!value ? ' rs-cascading-v2__checkbox--checked' : ''}`}>
                {!value && <CheckIcon />}
              </span>
              <span>{allLabel}</span>
            </li>
            {tree.map(loc => (
              <li
                key={loc.id}
                class={`rs-dropdown__item rs-dropdown__item--indent-${LEVEL_INDENT[loc.level] ?? 0}${loc.id === value ? ' rs-dropdown__item--selected' : ''}`}
                onClick={() => { onChange(loc.id); setOpen(false); }}
              >
                <span class={`rs-cascading-v2__checkbox${loc.id === value ? ' rs-cascading-v2__checkbox--checked' : ''}`}>
                  {loc.id === value && <CheckIcon />}
                </span>
                <span>{loc.name}</span>
                <span class="rs-dropdown__meta">
                  <LevelBadge level={loc.level} />
                  {!!loc.propertyCount && (
                    <span class="rs-dropdown__count">{loc.propertyCount}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <ScrollArrow direction="down" visible={scroll.canDown} scroll={scroll} />
        </div>
      )}
    </div>
  );
}

/* ── Variation 4: Collapsible tree dropdown ── */

function CollapsibleTree({ locations, value, onChange, allLabel, locked, placeholder }: {
  locations: Location[];
  value: number | undefined;
  onChange: (id: number | undefined) => void;
  allLabel: string;
  locked: boolean;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const ref = useRef<HTMLDivElement>(null);
  const scroll = useScrollArrows();
  const selected = locations.find(l => l.id === value);

  const roots = useMemo(
    () => locations.filter(l => !l.parentId).sort((a, b) => a.name.localeCompare(b.name)),
    [locations],
  );

  const childrenOf = useMemo(() => {
    const map = new Map<number, Location[]>();
    for (const loc of locations) {
      if (loc.parentId) {
        if (!map.has(loc.parentId)) map.set(loc.parentId, []);
        map.get(loc.parentId)!.push(loc);
      }
    }
    for (const children of map.values()) children.sort((a, b) => a.name.localeCompare(b.name));
    return map;
  }, [locations]);

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
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function renderNode(loc: Location, depth: number) {
    const children = childrenOf.get(loc.id);
    const isExpanded = expanded.has(loc.id);
    const isSelected = loc.id === value;

    return (
      <li key={loc.id}>
        <div
          class={`rs-dropdown__item rs-dropdown__item--indent-${depth}${isSelected ? ' rs-dropdown__item--selected' : ''}`}
          onClick={() => { onChange(loc.id); setOpen(false); }}
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
            {!!loc.propertyCount && (
              <span class="rs-dropdown__count">{loc.propertyCount}</span>
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
        {selected ? selected.name : (placeholder || allLabel)}
      </button>
      {open && (
        <div class="rs-dropdown rs-dropdown--scrollable rs-dropdown-enter">
          <ScrollArrow direction="up" visible={scroll.canUp} scroll={scroll} />
          <ul class="rs-dropdown__list" ref={scroll.listRef as any}>
            <li
              class={`rs-dropdown__item${!value ? ' rs-dropdown__item--selected' : ''}`}
              onClick={() => { onChange(undefined); setOpen(false); }}
            >
              <span class="rs-tree__spacer" />
              <span class={`rs-cascading-v2__checkbox${!value ? ' rs-cascading-v2__checkbox--checked' : ''}`}>
                {!value && <CheckIcon />}
              </span>
              <span>{allLabel}</span>
            </li>
            {roots.map(loc => renderNode(loc, 0))}
          </ul>
          <ScrollArrow direction="down" visible={scroll.canDown} scroll={scroll} />
        </div>
      )}
    </div>
  );
}

/* ── Main component ── */

export default function RsLocation({ variation = 1 }: Props) {
  const { filters, setFilter, isLocked } = useFilters();
  const { t } = useLabels();
  const widgetConfig = useConfig();
  const locations = useSelector(selectors.getLocations);
  const locked = isLocked('locationId');

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

  return (
    <div class="rs_location">
      {variation !== 1 && variation !== 2 && <label class="rs-field__label">{label}</label>}
      {variation === 1 && (
        <Typeahead
          locations={locations}
          value={filters.locationId}
          onChange={handleChange}
          placeholder={placeholder}
          locked={locked}
        />
      )}
      {variation === 2 && (
        <CascadingMultiSelect
          locations={locations}
          onChange={handleMultiChange}
          locked={locked}
          t={t}
          config={widgetConfig.locationSearchConfig}
        />
      )}
      {variation === 3 && (
        <Hierarchical
          locations={locations}
          value={filters.locationId}
          onChange={handleChange}
          placeholder={placeholder}
          allLabel={allLabel}
          locked={locked}
        />
      )}
      {variation === 4 && (
        <CollapsibleTree
          locations={locations}
          value={filters.locationId}
          onChange={handleChange}
          allLabel={allLabel}
          locked={locked}
          placeholder={placeholder}
        />
      )}
    </div>
  );
}
