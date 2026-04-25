import { useState, useMemo, useRef, useCallback, useEffect } from 'preact/hooks';
import { useFilters } from '@/hooks/useFilters';
import { useLabels } from '@/hooks/useLabels';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';

interface Props {
  variation?: number;
  [key: string]: unknown;
}

export default function RsPropertyType({ variation = 1 }: Props) {
  const { filters, setFilter, isLocked } = useFilters();
  const { t } = useLabels();
  const types = useSelector(selectors.getPropertyTypes);
  const locked = isLocked('propertyTypeId');
  const current = filters.propertyTypeId;
  const allLabel = t('property_type_all', 'All Types');

  const handleChange = useCallback((id: number | undefined) => {
    setFilter('propertyTypeId', id as number);
  }, [setFilter]);

  if (variation === 1) return <TypeaheadVariation types={types} value={current} onChange={handleChange} allLabel={allLabel} locked={locked} />;
  if (variation === 3) return <TagsVariation types={types} value={current} onChange={handleChange} locked={locked} />;
  if (variation === 4) return <IconsVariation types={types} value={current} onChange={handleChange} locked={locked} />;

  return (
    <div class={`rs_property_type rs-field${locked ? ' rs-field--locked' : ''}`}>
      <select
        class="rs-select"
        value={current ?? ''}
        onChange={(e) => {
          const v = (e.target as HTMLSelectElement).value;
          handleChange(v ? Number(v) : undefined);
        }}
        disabled={locked}
      >
        <option value="">{allLabel}</option>
        {types.map(pt => (
          <option key={pt.id} value={pt.id}>{pt.name}</option>
        ))}
      </select>
    </div>
  );
}

function TypeaheadVariation({ types, value, onChange, allLabel, locked }: {
  types: { id: number; name: string }[];
  value: number | undefined;
  onChange: (id: number | undefined) => void;
  allLabel: string;
  locked: boolean;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = types.find(t => t.id === value);

  const filtered = useMemo(() => {
    if (!query.trim()) return types;
    const q = query.toLowerCase();
    return types.filter(t => t.name.toLowerCase().includes(q));
  }, [query, types]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div class={`rs_property_type rs-dropdown-wrap${locked ? ' rs-field--locked' : ''}`} ref={ref}>
      <input
        type="text"
        class="rs-input"
        placeholder={selected ? selected.name : allLabel}
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
          {filtered.map(pt => (
            <li
              key={pt.id}
              class={`rs-dropdown__item${pt.id === value ? ' rs-dropdown__item--selected' : ''}`}
              onClick={() => { onChange(pt.id); setOpen(false); setQuery(''); }}
            >
              {pt.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TagsVariation({ types, value, onChange, locked }: {
  types: { id: number; name: string }[];
  value: number | undefined;
  onChange: (id: number | undefined) => void;
  locked: boolean;
}) {
  return (
    <div class={`rs_property_type rs-tags${locked ? ' rs-field--locked' : ''}`}>
      {types.map(pt => (
        <button
          key={pt.id}
          type="button"
          class={`rs-tag${pt.id === value ? ' rs-tag--active' : ''}`}
          onClick={() => onChange(pt.id === value ? undefined : pt.id)}
          disabled={locked}
        >
          {pt.name}
        </button>
      ))}
    </div>
  );
}

function IconsVariation({ types, value, onChange, locked }: {
  types: { id: number; name: string; icon?: string }[];
  value: number | undefined;
  onChange: (id: number | undefined) => void;
  locked: boolean;
}) {
  return (
    <div class={`rs_property_type rs-type-icons${locked ? ' rs-field--locked' : ''}`}>
      {types.map(pt => (
        <button
          key={pt.id}
          type="button"
          class={`rs-type-icon${pt.id === value ? ' rs-type-icon--active' : ''}`}
          onClick={() => onChange(pt.id === value ? undefined : pt.id)}
          disabled={locked}
        >
          {pt.icon
            ? <img class="rs-type-icon__img" src={pt.icon} alt="" />
            : <span style="font-size:1.5rem">&#x1f3e0;</span>
          }
          <span>{pt.name}</span>
        </button>
      ))}
    </div>
  );
}
