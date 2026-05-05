import { useState, useCallback } from 'preact/hooks';
import { useLabels } from '@/hooks/useLabels';
import { useFavorites } from '@/hooks/useFavorites';
import { useCurrency } from '@/hooks/useCurrency';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';
import { buildPropertyUrl } from '@/core/url-utils';
import { useWishlistState, wishlistActions } from '@/hooks/useWishlistState';
import RsWishlistIcon from '@/components/common/RsWishlistIcon';
import type { Property } from '@/types';
import RsWishlistEmpty from './RsWishlistEmpty';

export default function RsWishlistGrid() {
  const { t } = useLabels();
  const { favorites, remove } = useFavorites();
  const { formatPrice } = useCurrency();
  const results = useSelector(selectors.getResults);
  const config = useSelector(selectors.getConfig);
  const { compareSelection, notes, sortBy, editingNote } = useWishlistState();

  let properties: Property[] = results?.data.filter((p) =>
    favorites.includes(p.id)
  ) ?? [];

  if (sortBy === 'price_asc') {
    properties = [...properties].sort((a, b) => a.price - b.price);
  } else if (sortBy === 'price_desc') {
    properties = [...properties].sort((a, b) => b.price - a.price);
  }

  if (properties.length === 0) {
    return <RsWishlistEmpty />;
  }

  const getUrl = (p: Property) => buildPropertyUrl(p, config) || '#';

  return (
    <div class="rs-wishlist-grid">
      {properties.map((property, i) => {
        const isSelected = compareSelection.includes(property.id);
        const note = notes[property.id];
        const isEditingNote = editingNote === property.id;

        return (
          <div key={property.id} class="rs-wishlist-grid__card" style={`--i:${i}`}>
            <div class="rs-wishlist-grid__image">
              {property.images[0] && (
                <img
                  src={property.images[0].thumbnailUrl ?? property.images[0].url}
                  alt={property.title}
                  loading="lazy"
                />
              )}
              <button
                type="button"
                class="rs-wishlist-grid__heart"
                onClick={() => remove(property.id)}
                aria-label={t('wishlist_remove', 'Remove')}
              >
                <RsWishlistIcon size={20} filled />
              </button>
              {property.isFeatured && (
                <span class="rs-wishlist-grid__badge">
                  {t('featured', 'Featured')}
                </span>
              )}
              <label class="rs-wishlist-grid__compare-check">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => wishlistActions.toggleCompare(property.id)}
                />
                <span>{t('compare', 'Compare')}</span>
              </label>
            </div>
            <div class="rs-wishlist-grid__body">
              <h3 class="rs-wishlist-grid__title">{property.title}</h3>
              <p class="rs-wishlist-grid__price">
                {property.priceOnRequest
                  ? t('price_on_request', 'Price on Request')
                  : formatPrice(property.price, property.currency)}
              </p>
              <p class="rs-wishlist-grid__location">{property.location.name}</p>
              <div class="rs-wishlist-grid__specs">
                {property.bedrooms != null && (
                  <span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V7"/><path d="M21 11H3V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4z"/></svg>
                    {property.bedrooms} {t('beds', 'Beds')}
                  </span>
                )}
                {property.bathrooms != null && (
                  <span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12h16a1 1 0 0 1 1 1v3a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4v-3a1 1 0 0 1 1-1z"/><path d="M6 12V5a2 2 0 0 1 2-2h3v2.25"/></svg>
                    {property.bathrooms} {t('baths', 'Baths')}
                  </span>
                )}
                {property.buildSize != null && (
                  <span>{property.buildSize} m²</span>
                )}
                {property.plotSize != null && (
                  <span>{t('card_plot_size', 'Plot')}: {property.plotSize} m²</span>
                )}
              </div>
              <p class="rs-wishlist-grid__ref">
                {t('reference', 'Ref')}: {property.reference}
              </p>

              {/* Note section */}
              {isEditingNote ? (
                <NoteEditor
                  propertyId={property.id}
                  initialValue={note || ''}
                  t={t}
                />
              ) : note ? (
                <div class="rs-wishlist-grid__note">
                  <span class="rs-wishlist-grid__note-text">{note}</span>
                  <button
                    type="button"
                    class="rs-wishlist-grid__note-edit"
                    onClick={() => wishlistActions.setEditingNote(property.id)}
                  >
                    {t('edit', 'Edit')}
                  </button>
                  <button
                    type="button"
                    class="rs-wishlist-grid__note-remove"
                    onClick={() => wishlistActions.removeNote(property.id)}
                  >
                    &times;
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  class="rs-wishlist-grid__add-note"
                  onClick={() => wishlistActions.setEditingNote(property.id)}
                >
                  + {t('add_note', 'Add Note')}
                </button>
              )}

              <a
                href={getUrl(property)}
                class="rs-search-btn rs-wishlist-grid__view-btn"
              >
                {t('view_details', 'View Details')}
              </a>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function NoteEditor({ propertyId, initialValue, t }: {
  propertyId: number;
  initialValue: string;
  t: (key: string, fallback: string) => string;
}) {
  const [value, setValue] = useState(initialValue);

  const save = useCallback(() => {
    if (value.trim()) {
      wishlistActions.setNote(propertyId, value.trim());
    } else {
      wishlistActions.removeNote(propertyId);
    }
    wishlistActions.setEditingNote(null);
  }, [propertyId, value]);

  const cancel = useCallback(() => {
    wishlistActions.setEditingNote(null);
  }, []);

  return (
    <div class="rs-wishlist-grid__note-editor">
      <textarea
        class="rs-input"
        value={value}
        onInput={(e) => setValue((e.target as HTMLTextAreaElement).value)}
        rows={2}
        placeholder={t('note_placeholder', 'Add a personal note...')}
      />
      <div class="rs-wishlist-grid__note-actions">
        <button type="button" class="rs-search-btn" onClick={save}>
          {t('save', 'Save')}
        </button>
        <button type="button" class="rs-reset-btn" onClick={cancel}>
          {t('cancel', 'Cancel')}
        </button>
      </div>
    </div>
  );
}
