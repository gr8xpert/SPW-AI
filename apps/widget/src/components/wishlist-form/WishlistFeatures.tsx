import { useMemo, useState } from 'preact/hooks';
import { useLabels } from '@/hooks/useLabels';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';
import RsFeaturesModal from '@/components/search/RsFeaturesModal';
import type { Feature } from '@/types';

// Features on the wishlist form: one button that opens the features popup
// (search + a group per category), and the chosen ones as chips you can
// remove. A client can have 150+ features; listed inline they made the form
// several screens long.
export default function WishlistFeatures({ value, onChange }: { value: number[]; onChange: (ids: number[]) => void }) {
  const { t } = useLabels();
  const all = useSelector(selectors.getFeatures);
  const [open, setOpen] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<string, Feature[]>();
    for (const f of all) {
      const cat = f.category || t('features_label', 'Features');
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(f);
    }
    return map;
  }, [all, t]);
  const byId = useMemo(() => new Map(all.map((f) => [f.id, f])), [all]);
  const chosen = value.map((id) => byId.get(id)).filter((f): f is Feature => !!f);
  const toggle = (id: number) => onChange(value.includes(id) ? value.filter((f) => f !== id) : [...value, id]);

  return (
    <div class="rs-wishlist-features">
      <button type="button" class="rs-select rs-wishlist-features__open" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <span>{t('wishlist_form_features_choose', 'Choose features')}</span>
        {chosen.length > 0 && <span class="rs-wishlist-features__count">{chosen.length}</span>}
      </button>
      {chosen.length > 0 && (
        <div class="rs-tags rs-wishlist-features__chosen">
          {chosen.map((f) => (
            <button
              key={f.id}
              type="button"
              class="rs-tag rs-tag--active rs-wishlist-features__chip"
              aria-label={`${f.name} ×`}
              onClick={() => toggle(f.id)}
            >
              {f.name}
              <span aria-hidden="true" class="rs-wishlist-features__x">×</span>
            </button>
          ))}
        </div>
      )}
      {open && (
        <RsFeaturesModal
          grouped={grouped}
          selected={value}
          toggle={toggle}
          clearAll={() => onChange([])}
          onClose={() => setOpen(false)}
          hideKeyReady
        />
      )}
    </div>
  );
}
