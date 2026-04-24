import type { Property, Labels } from '../types';
import { escapeHtml, formatCurrency } from '../utils/helpers';

export interface FavoritesPanelOptions {
  labels: Labels;
  currency?: string;
  getFavoriteProperties: () => Promise<Property[]>;
  getFavoriteIds: () => number[];
  onPropertyClick?: (property: Property) => void;
  onRemoveFavorite?: (property: Property) => void;
  onShareSubmit: (data: {
    name: string;
    email: string;
    friendEmail?: string;
    message?: string;
    propertyIds: number[];
  }) => Promise<{ success: boolean; message: string }>;
  onClose: () => void;
}

export class FavoritesPanel {
  private options: FavoritesPanelOptions;
  private overlay: HTMLElement | null = null;
  private escapeHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(options: FavoritesPanelOptions) {
    this.options = options;
  }

  public async show(): Promise<void> {
    const { labels } = this.options;
    const favoriteIds = this.options.getFavoriteIds();

    this.overlay = document.createElement('div');
    this.overlay.className = 'spw-modal-overlay';

    this.overlay.innerHTML = `
      <div class="spw-modal spw-favorites-modal">
        <div class="spw-modal-header">
          <div>
            <h3 class="spw-property-title">${escapeHtml(labels['favorites.title'] || 'My Wishlist')}</h3>
            <span class="spw-favorites-count">${favoriteIds.length} ${escapeHtml(labels['favorites.properties'] || 'properties')}</span>
          </div>
          <button class="spw-modal-close" aria-label="${escapeHtml(labels['general.close'])}">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div class="spw-modal-body">
          <div class="spw-favorites-loading">
            <div class="spw-spinner"></div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(this.overlay);
    requestAnimationFrame(() => this.overlay?.classList.add('active'));
    document.body.style.overflow = 'hidden';
    this.bindCloseEvents();

    if (favoriteIds.length === 0) {
      this.renderEmpty();
      return;
    }

    try {
      const properties = await this.options.getFavoriteProperties();
      this.renderContent(properties);
    } catch {
      this.renderError();
    }
  }

  private renderContent(properties: Property[]): void {
    if (!this.overlay) return;
    const { labels, currency = 'EUR' } = this.options;
    const body = this.overlay.querySelector('.spw-modal-body')!;

    const propertyCards = properties.map((p) => `
      <div class="spw-fav-card" data-property-ref="${escapeHtml(p.reference)}">
        <div class="spw-fav-card-img">
          ${p.images[0]?.url ? `<img src="${escapeHtml(p.images[0].url)}" alt="${escapeHtml(p.title)}">` : '<div class="spw-fav-card-noimg"></div>'}
        </div>
        <div class="spw-fav-card-info">
          <p class="spw-fav-card-title">${escapeHtml(p.title)}</p>
          <p class="spw-fav-card-location">${escapeHtml(p.location?.name || '')}</p>
          <p class="spw-fav-card-price">${p.priceOnRequest ? escapeHtml(labels['property.priceOnRequest']) : formatCurrency(p.price, currency)}</p>
          <div class="spw-fav-card-specs">
            ${p.bedrooms !== undefined ? `<span>${p.bedrooms} ${escapeHtml(labels['property.bedrooms'])}</span>` : ''}
            ${p.bathrooms !== undefined ? `<span>${p.bathrooms} ${escapeHtml(labels['property.bathrooms'])}</span>` : ''}
            ${p.buildSize ? `<span>${p.buildSize} m²</span>` : ''}
          </div>
        </div>
        <button class="spw-fav-card-remove" data-id="${p.id}" title="${escapeHtml(labels['property.removeFromFavorites'])}">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>
    `).join('');

    body.innerHTML = `
      <div class="spw-favorites-list">
        ${propertyCards}
      </div>
      <div class="spw-favorites-share">
        <h4>${escapeHtml(labels['favorites.shareTitle'] || 'Email this wishlist')}</h4>
        <form class="spw-favorites-form">
          <div class="spw-form-group">
            <label class="spw-label">${escapeHtml(labels['inquiry.name'])} *</label>
            <input type="text" class="spw-input" name="name" required>
          </div>
          <div class="spw-form-group">
            <label class="spw-label">${escapeHtml(labels['inquiry.email'])} *</label>
            <input type="email" class="spw-input" name="email" required>
          </div>
          <div class="spw-form-group">
            <label class="spw-label">${escapeHtml(labels['favorites.friendEmail'] || "Friend's email (optional)")}</label>
            <input type="email" class="spw-input" name="friendEmail">
          </div>
          <div class="spw-form-group">
            <label class="spw-label">${escapeHtml(labels['inquiry.message'])}</label>
            <textarea class="spw-input" name="message" rows="3" placeholder="${escapeHtml(labels['favorites.messagePlaceholder'] || 'Check out these properties!')}"></textarea>
          </div>
          <button type="submit" class="spw-btn spw-btn-primary">
            ${escapeHtml(labels['favorites.send'] || 'Send Wishlist')}
          </button>
          <div class="spw-inquiry-message"></div>
        </form>
      </div>
    `;

    body.querySelectorAll('.spw-fav-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('.spw-fav-card-remove')) return;
        const ref = card.getAttribute('data-property-ref');
        const prop = properties.find((p) => p.reference === ref);
        if (prop) this.options.onPropertyClick?.(prop);
      });
    });

    body.querySelectorAll('.spw-fav-card-remove').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = Number((btn as HTMLElement).getAttribute('data-id'));
        const prop = properties.find((p) => p.id === id);
        if (prop) {
          this.options.onRemoveFavorite?.(prop);
          (btn as HTMLElement).closest('.spw-fav-card')?.remove();
          const countEl = this.overlay?.querySelector('.spw-favorites-count');
          if (countEl) {
            const remaining = this.overlay?.querySelectorAll('.spw-fav-card').length || 0;
            countEl.textContent = `${remaining} ${labels['favorites.properties'] || 'properties'}`;
          }
        }
      });
    });

    const form = body.querySelector('.spw-favorites-form');
    form?.addEventListener('submit', (e) => this.handleSubmit(e));
  }

  private renderEmpty(): void {
    if (!this.overlay) return;
    const { labels } = this.options;
    const body = this.overlay.querySelector('.spw-modal-body')!;
    body.innerHTML = `
      <div class="spw-no-results">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3.332.88-4.5 2.06A6.17 6.17 0 0 0 7.5 3 5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
        </svg>
        <p>${escapeHtml(labels['favorites.empty'] || 'No properties in your wishlist yet.')}</p>
      </div>
    `;
  }

  private renderError(): void {
    if (!this.overlay) return;
    const { labels } = this.options;
    const body = this.overlay.querySelector('.spw-modal-body')!;
    body.innerHTML = `
      <div class="spw-no-results">
        <p>${escapeHtml(labels['general.error'])}</p>
      </div>
    `;
  }

  private async handleSubmit(e: Event): Promise<void> {
    e.preventDefault();
    const { labels } = this.options;
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    const messageEl = form.querySelector('.spw-inquiry-message') as HTMLElement;
    const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement;

    const data = {
      name: formData.get('name') as string,
      email: formData.get('email') as string,
      friendEmail: (formData.get('friendEmail') as string) || undefined,
      message: (formData.get('message') as string) || undefined,
      propertyIds: this.options.getFavoriteIds(),
    };

    submitBtn.disabled = true;
    messageEl.innerHTML = '';

    try {
      await this.options.onShareSubmit(data);
      messageEl.innerHTML = `<div class="spw-form-success">${escapeHtml(labels['favorites.success'] || 'Wishlist sent successfully!')}</div>`;
      form.reset();
    } catch {
      messageEl.innerHTML = `<div class="spw-form-error">${escapeHtml(labels['favorites.error'] || 'Failed to send. Please try again.')}</div>`;
    } finally {
      submitBtn.disabled = false;
    }
  }

  private bindCloseEvents(): void {
    if (!this.overlay) return;

    const closeBtn = this.overlay.querySelector('.spw-modal-close');
    closeBtn?.addEventListener('click', () => this.close());

    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });

    this.escapeHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') this.close();
    };
    document.addEventListener('keydown', this.escapeHandler);
  }

  public close(): void {
    if (!this.overlay) return;
    if (this.escapeHandler) {
      document.removeEventListener('keydown', this.escapeHandler);
      this.escapeHandler = null;
    }
    this.overlay.classList.remove('active');
    setTimeout(() => {
      this.overlay?.remove();
      this.overlay = null;
      document.body.style.overflow = '';
    }, 200);
    this.options.onClose();
  }
}
