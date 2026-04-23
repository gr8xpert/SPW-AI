import type { Property, Labels } from '../types';
import { escapeHtml, formatCurrency } from '../utils/helpers';

export interface PropertyCardOptions {
  property: Property;
  labels: Labels;
  currency?: string;
  isFavorite?: boolean;
  enableFavorites?: boolean;
  onFavoriteToggle?: (property: Property) => void;
  onClick?: (property: Property) => void;
}

export class PropertyCard {
  private options: PropertyCardOptions;
  private element: HTMLElement | null = null;

  constructor(options: PropertyCardOptions) {
    this.options = options;
  }

  public render(): HTMLElement {
    const { property, labels, currency = 'EUR', isFavorite, enableFavorites } = this.options;

    const card = document.createElement('div');
    card.className = 'spw-property-card';
    card.setAttribute('data-property-id', String(property.id));
    card.setAttribute('data-property-ref', property.reference);

    // Main image
    const mainImage = property.images[0]?.url || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"%3E%3Crect fill="%23f1f5f9" width="400" height="300"/%3E%3Ctext fill="%2394a3b8" font-family="system-ui" font-size="16" x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle"%3ENo Image%3C/text%3E%3C/svg%3E';

    // Price display
    const priceDisplay = property.priceOnRequest
      ? labels['property.priceOnRequest']
      : formatCurrency(property.price, currency);

    // Badges
    const badges: string[] = [];
    if (property.isFeatured) {
      badges.push(`<span class="spw-badge spw-badge-featured">${escapeHtml(labels['property.featured'])}</span>`);
    }
    if (property.listingType === 'sale') {
      badges.push(`<span class="spw-badge spw-badge-sale">${escapeHtml(labels['search.forSale'])}</span>`);
    } else if (property.listingType === 'holiday_rent') {
      badges.push(`<span class="spw-badge spw-badge-rent">${escapeHtml(labels['search.holidayRent'])}</span>`);
    } else if (property.listingType === 'rent') {
      badges.push(`<span class="spw-badge spw-badge-rent">${escapeHtml(labels['search.forRent'])}</span>`);
    }

    // Specs
    const specs: string[] = [];
    if (property.bedrooms !== undefined) {
      specs.push(`
        <div class="spw-property-spec">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/>
          </svg>
          <span>${property.bedrooms} ${escapeHtml(labels['property.bedrooms'])}</span>
        </div>
      `);
    }
    if (property.bathrooms !== undefined) {
      specs.push(`
        <div class="spw-property-spec">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 6 6.5 3.5a1.5 1.5 0 0 0-1-.5C4.683 3 4 3.683 4 4.5V17a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/><line x1="10" x2="8" y1="5" y2="7"/><line x1="2" x2="22" y1="12" y2="12"/><line x1="7" x2="7" y1="19" y2="21"/><line x1="17" x2="17" y1="19" y2="21"/>
          </svg>
          <span>${property.bathrooms} ${escapeHtml(labels['property.bathrooms'])}</span>
        </div>
      `);
    }
    if (property.buildSize) {
      specs.push(`
        <div class="spw-property-spec">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/>
          </svg>
          <span>${property.buildSize} m²</span>
        </div>
      `);
    }

    // Favorite button
    const favoriteButton = enableFavorites ? `
      <button class="spw-property-favorite ${isFavorite ? 'active' : ''}" aria-label="${isFavorite ? labels['property.removeFromFavorites'] : labels['property.addToFavorites']}">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
        </svg>
      </button>
    ` : '';

    card.innerHTML = `
      <div class="spw-property-image">
        <img src="${escapeHtml(mainImage)}" alt="${escapeHtml(property.title)}" loading="lazy">
        <div class="spw-property-badges">
          ${badges.join('')}
        </div>
        ${favoriteButton}
      </div>
      <div class="spw-property-content">
        <div class="spw-property-price">${escapeHtml(priceDisplay)}</div>
        <h3 class="spw-property-title">${escapeHtml(property.title)}</h3>
        <div class="spw-property-location">${escapeHtml(property.location.name)}</div>
        <div class="spw-property-specs">
          ${specs.join('')}
        </div>
      </div>
      <div class="spw-property-actions">
        <button class="spw-btn spw-btn-primary spw-view-details-btn">
          ${escapeHtml(labels['property.viewDetails'])}
        </button>
      </div>
    `;

    this.element = card;
    this.bindEvents();

    return card;
  }

  private bindEvents(): void {
    if (!this.element) return;

    const { property, onFavoriteToggle, onClick } = this.options;

    // View details click
    const detailsBtn = this.element.querySelector('.spw-view-details-btn');
    detailsBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick?.(property);
    });

    // Card click
    this.element.addEventListener('click', () => {
      onClick?.(property);
    });

    // Favorite toggle
    const favoriteBtn = this.element.querySelector('.spw-property-favorite');
    favoriteBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      onFavoriteToggle?.(property);
    });
  }

  public setFavorite(isFavorite: boolean): void {
    const btn = this.element?.querySelector('.spw-property-favorite');
    if (btn) {
      btn.classList.toggle('active', isFavorite);
    }
  }

  public getElement(): HTMLElement | null {
    return this.element;
  }
}
