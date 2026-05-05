import { useState, useMemo, useRef, useCallback, useEffect } from 'preact/hooks';
import { useFilters } from '@/hooks/useFilters';
import { useLabels } from '@/hooks/useLabels';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';
import { useDragScroll } from '@/hooks/useDragScroll';
import type { PropertyType } from '@/types';

interface Props {
  variation?: number;
  [key: string]: unknown;
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

  return { listRef, canUp, canDown, scrollClick, startHover, stopHover, attach, detach };
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

/* ── Variation 1: Typeahead autocomplete (single-select) ── */

function Typeahead({ types, value, onChange, placeholder, locked }: {
  types: PropertyType[];
  value: number | undefined;
  onChange: (id: number | undefined) => void;
  placeholder: string;
  locked: boolean;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const scroll = useScrollArrows();

  const selected = types.find(t => t.id === value);

  const filtered = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return types.filter(t => t.name.toLowerCase().includes(q));
  }, [query, types]);

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
              filtered.map(pt => (
                <li
                  key={pt.id}
                  class={`rs-dropdown__item${pt.id === value ? ' rs-dropdown__item--selected' : ''}`}
                  onClick={() => { onChange(pt.id); setOpen(false); setQuery(''); }}
                >
                  <span>{pt.name}</span>
                  {!!pt.propertyCount && (
                    <span class="rs-dropdown__count">{pt.propertyCount}</span>
                  )}
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

/* ── Variation 2: Multi-select checkbox dropdown ── */

function MultiSelectDropdown({ types, selected, onChange, allLabel, locked, t }: {
  types: PropertyType[];
  selected: Set<number>;
  onChange: (ids: number[]) => void;
  allLabel: string;
  locked: boolean;
  t: (key: string, fallback: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const scroll = useScrollArrows();

  const filtered = useMemo(() => {
    if (!search.trim()) return types;
    const q = search.toLowerCase();
    return types.filter(pt => pt.name.toLowerCase().includes(q));
  }, [search, types]);

  const toggleItem = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange([...next]);
  };

  const buttonLabel = selected.size > 0
    ? t('property_type_n_selected', '{n} selected').replace('{n}', String(selected.size))
    : allLabel;

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
        class={`rs-select${selected.size > 0 ? ' rs-select--has-selection' : ''}`}
        onClick={() => !locked && setOpen(!open)}
        style="text-align: left"
      >
        {buttonLabel}
      </button>
      {open && (
        <div class="rs-dropdown rs-dropdown--scrollable rs-dropdown-enter">
          <div class="rs-cascading-v2__search">
            <div class="rs-input-wrap">
              <SearchIcon />
              <input
                type="text"
                class="rs-input rs-input--sm rs-input--has-icon"
                placeholder={t('property_type_search', 'Search type...')}
                value={search}
                onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
              />
            </div>
          </div>
          <ScrollArrow direction="up" visible={scroll.canUp} scroll={scroll} />
          <ul class="rs-dropdown__list" ref={scroll.listRef as any}>
            {selected.size > 0 && (
              <li
                class="rs-dropdown__item"
                onClick={() => onChange([])}
              >
                <span class="rs-cascading-v2__checkbox">
                  <span />
                </span>
                <span class="rs-dropdown__clear-all">{t('clear_all', 'Clear all')}</span>
              </li>
            )}
            {filtered.map(pt => (
              <li
                key={pt.id}
                class={`rs-dropdown__item${selected.has(pt.id) ? ' rs-dropdown__item--selected' : ''}`}
                onClick={() => toggleItem(pt.id)}
              >
                <span class={`rs-cascading-v2__checkbox${selected.has(pt.id) ? ' rs-cascading-v2__checkbox--checked' : ''}`}>
                  {selected.has(pt.id) && <CheckIcon />}
                </span>
                <span>{pt.name}</span>
                {!!pt.propertyCount && (
                  <span class="rs-dropdown__count">{pt.propertyCount}</span>
                )}
              </li>
            ))}
            {filtered.length === 0 && (
              <li class="rs-dropdown__empty">&mdash;</li>
            )}
          </ul>
          <ScrollArrow direction="down" visible={scroll.canDown} scroll={scroll} />
        </div>
      )}
    </div>
  );
}

/* ── Variation 3: Single-select checkbox dropdown ── */

function CheckboxDropdown({ types, value, onChange, allLabel, locked }: {
  types: PropertyType[];
  value: number | undefined;
  onChange: (id: number | undefined) => void;
  allLabel: string;
  locked: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const scroll = useScrollArrows();
  const selected = types.find(t => t.id === value);

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
        {selected ? selected.name : allLabel}
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
            {types.map(pt => (
              <li
                key={pt.id}
                class={`rs-dropdown__item${pt.id === value ? ' rs-dropdown__item--selected' : ''}`}
                onClick={() => { onChange(pt.id); setOpen(false); }}
              >
                <span class={`rs-cascading-v2__checkbox${pt.id === value ? ' rs-cascading-v2__checkbox--checked' : ''}`}>
                  {pt.id === value && <CheckIcon />}
                </span>
                <span>{pt.name}</span>
                {!!pt.propertyCount && (
                  <span class="rs-dropdown__count">{pt.propertyCount}</span>
                )}
              </li>
            ))}
          </ul>
          <ScrollArrow direction="down" visible={scroll.canDown} scroll={scroll} />
        </div>
      )}
    </div>
  );
}

/* ── Variation 4: Icon grid multi-select ── */

const TYPE_ICONS: Record<string, { paths: string[]; stroke?: boolean }> = {
  apartment: { paths: [
    'M3 21h18', 'M5 21V5l7-2 7 2v16', 'M9 21v-4h6v4',
    'M9 9h1.5', 'M13.5 9H15', 'M9 12h1.5', 'M13.5 12H15', 'M9 15h1.5', 'M13.5 15H15',
  ], stroke: true },
  villa: { paths: [
    'M3 21h18', 'M5 21V10l7-7 7 7v11', 'M9 21v-6h6v6',
  ], stroke: true },
  townhouse: { paths: [
    'M1 21h22', 'M3 21V11l5-4 4 3 4-3 5 4v10',
    'M7 21v-4h3v4', 'M14 21v-4h3v4', 'M12 10v2',
  ], stroke: true },
  penthouse: { paths: [
    'M2 21h20', 'M4 21V10l8-7 8 7v11',
    'M9 21v-5h6v5', 'M12 3v1', 'M9 7l3-2 3 2',
  ], stroke: true },
  land: { paths: [
    'M2 20l5-7 3 4 4-5 6 8',
    'M2 20h20', 'M17 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  ], stroke: true },
  commercial: { paths: [
    'M3 21h18', 'M5 21V7l7-4 7 4v14',
    'M9 10h1.5', 'M13.5 10H15', 'M9 13h1.5', 'M13.5 13H15',
    'M9 21v-4h6v4',
  ], stroke: true },
  'country-house': { paths: [
    'M3 21h18', 'M5 21v-9l7-6 7 6v9',
    'M9 21v-5h6v5', 'M14 5V3h3v4',
  ], stroke: true },
};

function getTypeIcon(slug: string) {
  return TYPE_ICONS[slug] ?? TYPE_ICONS.apartment;
}

function TypeLineIcon({ slug }: { slug: string }) {
  const icon = getTypeIcon(slug);
  return (
    <svg class="rs-type-icon__svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      {icon.paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

function IconsMultiSelect({ types, selected, onChange, locked }: {
  types: PropertyType[];
  selected: Set<number>;
  onChange: (ids: number[]) => void;
  locked: boolean;
}) {
  const drag = useDragScroll();
  const toggle = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange([...next]);
  };

  return (
    <div class={`rs_property_type rs-type-icons${locked ? ' rs-field--locked' : ''}`} ref={drag.ref} {...drag.handlers}>
      {types.map(pt => (
        <button
          key={pt.id}
          type="button"
          class={`rs-type-icon${selected.has(pt.id) ? ' rs-type-icon--active' : ''}`}
          onClick={() => toggle(pt.id)}
          disabled={locked}
        >
          <TypeLineIcon slug={pt.slug} />
          <span>{pt.name}</span>
          {!!pt.propertyCount && (
            <span class="rs-type-icon__count">{pt.propertyCount}</span>
          )}
          {selected.has(pt.id) && (
            <span class="rs-type-icon__check">
              <CheckIcon />
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ── Main component ── */

export default function RsPropertyType({ variation = 1 }: Props) {
  const { filters, setFilter, isLocked } = useFilters();
  const { t } = useLabels();
  const types = useSelector(selectors.getPropertyTypes);
  const locked = isLocked('propertyTypeId');
  const current = filters.propertyTypeId;
  const currentIds = filters.propertyTypeIds;
  const allLabel = t('property_type_all', 'All Types');
  const placeholder = t('property_type_placeholder', 'Search type...');
  const label = t('property_type', 'Property Type');

  const selectedSet = useMemo(() => new Set(currentIds ?? []), [currentIds]);

  const handleChange = useCallback((id: number | undefined) => {
    setFilter('propertyTypeId', id as number);
    setFilter('propertyTypeIds', undefined as never);
  }, [setFilter]);

  const handleMultiChange = useCallback((ids: number[]) => {
    setFilter('propertyTypeIds', ids.length > 0 ? ids : undefined as never);
    setFilter('propertyTypeId', undefined as never);
  }, [setFilter]);

  return (
    <div class="rs_property_type">
      {variation !== 1 && <label class="rs-field__label">{label}</label>}
      {variation === 1 && (
        <Typeahead
          types={types}
          value={current}
          onChange={handleChange}
          placeholder={placeholder}
          locked={locked}
        />
      )}
      {variation === 2 && (
        <MultiSelectDropdown
          types={types}
          selected={selectedSet}
          onChange={handleMultiChange}
          allLabel={allLabel}
          locked={locked}
          t={t}
        />
      )}
      {variation === 3 && (
        <CheckboxDropdown
          types={types}
          value={current}
          onChange={handleChange}
          allLabel={allLabel}
          locked={locked}
        />
      )}
      {variation === 4 && (
        <IconsMultiSelect
          types={types}
          selected={selectedSet}
          onChange={handleMultiChange}
          locked={locked}
        />
      )}
    </div>
  );
}
