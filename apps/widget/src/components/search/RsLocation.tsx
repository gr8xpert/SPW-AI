import { useState, useMemo, useRef, useCallback, useEffect } from 'preact/hooks';
import { useFilters } from '@/hooks/useFilters';
import { useLabels } from '@/hooks/useLabels';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';
import type { Location } from '@/types';

interface Props {
  variation?: number;
  [key: string]: unknown;
}

const LEVEL_INDENT: Record<string, number> = { country: 0, province: 1, municipality: 2, town: 3, area: 4 };

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

function Typeahead({ locations, value, onChange, placeholder, allLabel, locked }: {
  locations: Location[];
  value: number | undefined;
  onChange: (id: number | undefined) => void;
  placeholder: string;
  allLabel: string;
  locked: boolean;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = locations.find(l => l.id === value);

  const filtered = useMemo(() => {
    if (!query.trim()) return locations.slice(0, 50);
    const q = query.toLowerCase();
    return locations.filter(l => l.name.toLowerCase().includes(q)).slice(0, 50);
  }, [query, locations]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div class={`rs-field rs-dropdown-wrap${locked ? ' rs-field--locked' : ''}`} ref={ref}>
      <input
        type="text"
        class="rs-input"
        placeholder={selected ? selected.name : placeholder}
        value={open ? query : (selected?.name ?? '')}
        onFocus={() => { setOpen(true); setQuery(''); }}
        onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
        readOnly={locked}
      />
      {open && (
        <ul class="rs-dropdown">
          <li
            class={`rs-dropdown__item${!value ? ' rs-dropdown__item--selected' : ''}`}
            onClick={() => { onChange(undefined); setOpen(false); setQuery(''); }}
          >
            {allLabel}
          </li>
          {filtered.length === 0 && (
            <li class="rs-dropdown__empty">—</li>
          )}
          {filtered.map(loc => (
            <li
              key={loc.id}
              class={`rs-dropdown__item${loc.id === value ? ' rs-dropdown__item--selected' : ''}`}
              onClick={() => { onChange(loc.id); setOpen(false); setQuery(''); }}
            >
              <span>{loc.name}</span>
              {loc.propertyCount != null && (
                <span class="rs-dropdown__count">{loc.propertyCount}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Cascading({ locations, value, onChange, allLabel, locked }: {
  locations: Location[];
  value: number | undefined;
  onChange: (id: number | undefined) => void;
  allLabel: string;
  locked: boolean;
}) {
  const selected = locations.find(l => l.id === value);
  const chain = useMemo(() => {
    if (!selected) return [];
    const path: Location[] = [selected];
    let current = selected;
    while (current.parentId) {
      const parent = locations.find(l => l.id === current.parentId);
      if (!parent) break;
      path.unshift(parent);
      current = parent;
    }
    return path;
  }, [selected, locations]);

  const levels = useMemo(() => {
    const result: { level: string; options: Location[]; selectedId: number | undefined }[] = [];
    const roots = locations.filter(l => !l.parentId).sort((a, b) => a.name.localeCompare(b.name));
    if (!roots.length) return result;

    result.push({ level: roots[0]?.level ?? 'country', options: roots, selectedId: chain[0]?.id });

    for (let i = 0; i < chain.length; i++) {
      const children = locations
        .filter(l => l.parentId === chain[i].id)
        .sort((a, b) => a.name.localeCompare(b.name));
      if (children.length > 0) {
        result.push({ level: children[0].level, options: children, selectedId: chain[i + 1]?.id });
      }
    }
    return result;
  }, [locations, chain]);

  const handleChange = useCallback((levelIdx: number, id: string) => {
    if (!id) {
      if (levelIdx === 0) onChange(undefined);
      else onChange(chain[levelIdx - 1]?.id);
    } else {
      onChange(Number(id));
    }
  }, [chain, onChange]);

  return (
    <div class={`rs-cascading${locked ? ' rs-field--locked' : ''}`}>
      {levels.map((lvl, i) => (
        <select
          key={`${lvl.level}-${i}`}
          class="rs-select"
          value={lvl.selectedId ?? ''}
          onChange={(e) => handleChange(i, (e.target as HTMLSelectElement).value)}
          disabled={locked}
        >
          <option value="">{allLabel}</option>
          {lvl.options.map(loc => (
            <option key={loc.id} value={loc.id}>{loc.name}</option>
          ))}
        </select>
      ))}
    </div>
  );
}

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
  const tree = useMemo(() => buildTree(locations), [locations]);
  const selected = locations.find(l => l.id === value);

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
        <ul class="rs-dropdown">
          <li
            class={`rs-dropdown__item${!value ? ' rs-dropdown__item--selected' : ''}`}
            onClick={() => { onChange(undefined); setOpen(false); }}
          >
            {allLabel}
          </li>
          {tree.map(loc => (
            <li
              key={loc.id}
              class={`rs-dropdown__item rs-dropdown__item--indent-${LEVEL_INDENT[loc.level] ?? 0}${loc.id === value ? ' rs-dropdown__item--selected' : ''}`}
              onClick={() => { onChange(loc.id); setOpen(false); }}
            >
              <span>{loc.name}</span>
              {loc.propertyCount != null && (
                <span class="rs-dropdown__count">{loc.propertyCount}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Dropdown({ locations, value, onChange, allLabel, locked }: {
  locations: Location[];
  value: number | undefined;
  onChange: (id: number | undefined) => void;
  allLabel: string;
  locked: boolean;
}) {
  const sorted = useMemo(() =>
    [...locations].sort((a, b) => a.name.localeCompare(b.name)),
    [locations]
  );

  return (
    <select
      class={`rs-select${locked ? ' rs-field--locked' : ''}`}
      value={value ?? ''}
      onChange={(e) => {
        const v = (e.target as HTMLSelectElement).value;
        onChange(v ? Number(v) : undefined);
      }}
      disabled={locked}
    >
      <option value="">{allLabel}</option>
      {sorted.map(loc => (
        <option key={loc.id} value={loc.id}>
          {loc.name}{loc.propertyCount != null ? ` (${loc.propertyCount})` : ''}
        </option>
      ))}
    </select>
  );
}

export default function RsLocation({ variation = 1 }: Props) {
  const { filters, setFilter, isLocked } = useFilters();
  const { t } = useLabels();
  const locations = useSelector(selectors.getLocations);
  const locked = isLocked('locationId');

  const placeholder = t('location_placeholder', 'Search location...');
  const allLabel = t('location_all', 'All Locations');

  const handleChange = useCallback((id: number | undefined) => {
    setFilter('locationId', id as number);
  }, [setFilter]);

  const label = t('location_placeholder', 'Location');

  return (
    <div class="rs_location">
      {variation !== 1 && <label class="rs-field__label">{label}</label>}
      {variation === 1 && (
        <Typeahead
          locations={locations}
          value={filters.locationId}
          onChange={handleChange}
          placeholder={placeholder}
          allLabel={allLabel}
          locked={locked}
        />
      )}
      {variation === 2 && (
        <Cascading
          locations={locations}
          value={filters.locationId}
          onChange={handleChange}
          allLabel={allLabel}
          locked={locked}
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
        <Dropdown
          locations={locations}
          value={filters.locationId}
          onChange={handleChange}
          allLabel={allLabel}
          locked={locked}
        />
      )}
    </div>
  );
}
