import type { Property, SearchResults, Labels, SearchFilters } from '../types';
import { escapeHtml } from '../utils/helpers';
import { PropertyCard } from './PropertyCard';

export interface ResultsGridOptions {
  container: HTMLElement;
  labels: Labels;
  currency?: string;
  layout?: 'grid' | 'list';
  enableFavorites?: boolean;
  favorites?: Set<number>;
  showSorting?: boolean;
  showPagination?: boolean;
  onPropertyClick?: (property: Property) => void;
  onFavoriteToggle?: (property: Property) => void;
  onSortChange?: (sortBy: SearchFilters['sortBy']) => void;
  onPageChange?: (page: number) => void;
}

export class ResultsGrid {
  private container: HTMLElement;
  private options: ResultsGridOptions;
  private results: SearchResults | null = null;
  private currentSort: SearchFilters['sortBy'] = 'featured';

  constructor(options: ResultsGridOptions) {
    this.options = options;
    this.container = options.container;
  }

  public render(results: SearchResults): void {
    this.results = results;
    const { labels, layout = 'grid', showSorting, showPagination } = this.options;

    if (results.data.length === 0) {
      this.renderNoResults();
      return;
    }

    const headerHtml = `
      <div class="spw-results-header">
        <div class="spw-results-count">
          ${escapeHtml(labels['results.showing'])}
          <strong>${(results.meta.page - 1) * results.meta.limit + 1}-${Math.min(results.meta.page * results.meta.limit, results.meta.total)}</strong>
          ${escapeHtml(labels['results.of'])}
          <strong>${results.meta.total}</strong>
          ${escapeHtml(labels['results.properties'])}
        </div>
        ${showSorting ? this.renderSortDropdown() : ''}
      </div>
    `;

    const gridClass = layout === 'list' ? 'spw-property-list' : 'spw-property-grid';

    this.container.innerHTML = `
      <div class="spw-results">
        ${headerHtml}
        <div class="${gridClass}" id="spw-property-container"></div>
        ${showPagination && results.meta.pages > 1 ? this.renderPagination() : ''}
      </div>
    `;

    // Render property cards
    const gridContainer = this.container.querySelector('#spw-property-container');
    if (gridContainer) {
      results.data.forEach(property => {
        const card = new PropertyCard({
          property,
          labels,
          currency: this.options.currency,
          isFavorite: this.options.favorites?.has(property.id),
          enableFavorites: this.options.enableFavorites,
          onFavoriteToggle: this.options.onFavoriteToggle,
          onClick: this.options.onPropertyClick,
        });
        gridContainer.appendChild(card.render());
      });
    }

    this.bindEvents();
  }

  private renderSortDropdown(): string {
    const { labels } = this.options;

    return `
      <div class="spw-results-sort">
        <label>${escapeHtml(labels['results.sortBy'])}</label>
        <select class="spw-select spw-sort-select">
          <option value="featured" ${this.currentSort === 'featured' ? 'selected' : ''}>${escapeHtml(labels['results.featured'])}</option>
          <option value="price_asc" ${this.currentSort === 'price_asc' ? 'selected' : ''}>${escapeHtml(labels['results.priceAsc'])}</option>
          <option value="price_desc" ${this.currentSort === 'price_desc' ? 'selected' : ''}>${escapeHtml(labels['results.priceDesc'])}</option>
          <option value="date_desc" ${this.currentSort === 'date_desc' ? 'selected' : ''}>${escapeHtml(labels['results.dateDesc'])}</option>
          <option value="date_asc" ${this.currentSort === 'date_asc' ? 'selected' : ''}>${escapeHtml(labels['results.dateAsc'])}</option>
        </select>
      </div>
    `;
  }

  private renderPagination(): string {
    if (!this.results) return '';

    const { meta } = this.results;
    const { labels } = this.options;
    const pages: string[] = [];

    // Previous button
    pages.push(`
      <button class="spw-pagination-btn" data-page="${meta.page - 1}" ${meta.page === 1 ? 'disabled' : ''}>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="m15 18-6-6 6-6"/>
        </svg>
        ${escapeHtml(labels['pagination.previous'])}
      </button>
    `);

    // Page numbers
    const maxVisible = 5;
    let startPage = Math.max(1, meta.page - Math.floor(maxVisible / 2));
    const endPage = Math.min(meta.pages, startPage + maxVisible - 1);

    if (endPage - startPage + 1 < maxVisible) {
      startPage = Math.max(1, endPage - maxVisible + 1);
    }

    if (startPage > 1) {
      pages.push(`<button class="spw-pagination-btn" data-page="1">1</button>`);
      if (startPage > 2) {
        pages.push(`<span class="spw-pagination-ellipsis">...</span>`);
      }
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(`
        <button class="spw-pagination-btn ${i === meta.page ? 'active' : ''}" data-page="${i}">
          ${i}
        </button>
      `);
    }

    if (endPage < meta.pages) {
      if (endPage < meta.pages - 1) {
        pages.push(`<span class="spw-pagination-ellipsis">...</span>`);
      }
      pages.push(`<button class="spw-pagination-btn" data-page="${meta.pages}">${meta.pages}</button>`);
    }

    // Next button
    pages.push(`
      <button class="spw-pagination-btn" data-page="${meta.page + 1}" ${meta.page === meta.pages ? 'disabled' : ''}>
        ${escapeHtml(labels['pagination.next'])}
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="m9 18 6-6-6-6"/>
        </svg>
      </button>
    `);

    return `<div class="spw-pagination">${pages.join('')}</div>`;
  }

  private renderNoResults(): void {
    const { labels } = this.options;

    this.container.innerHTML = `
      <div class="spw-no-results">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
        </svg>
        <p>${escapeHtml(labels['results.noResults'])}</p>
      </div>
    `;
  }

  public showLoading(): void {
    const { labels } = this.options;

    this.container.innerHTML = `
      <div class="spw-loading">
        <div class="spw-spinner"></div>
        <span>${escapeHtml(labels['general.loading'])}</span>
      </div>
    `;
  }

  public showError(message?: string): void {
    const { labels } = this.options;

    this.container.innerHTML = `
      <div class="spw-no-results">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>
        </svg>
        <p>${escapeHtml(message || labels['general.error'])}</p>
      </div>
    `;
  }

  private bindEvents(): void {
    // Sort change
    const sortSelect = this.container.querySelector('.spw-sort-select') as HTMLSelectElement;
    sortSelect?.addEventListener('change', () => {
      this.currentSort = sortSelect.value as SearchFilters['sortBy'];
      this.options.onSortChange?.(this.currentSort);
    });

    // Pagination clicks
    const paginationBtns = this.container.querySelectorAll('.spw-pagination-btn');
    paginationBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const page = Number(btn.getAttribute('data-page'));
        if (page && !btn.hasAttribute('disabled')) {
          this.options.onPageChange?.(page);
        }
      });
    });
  }

  public updateFavorite(propertyId: number, isFavorite: boolean): void {
    const card = this.container.querySelector(`[data-property-id="${propertyId}"]`);
    const btn = card?.querySelector('.spw-property-favorite');
    btn?.classList.toggle('active', isFavorite);
  }

  public setSort(sortBy: SearchFilters['sortBy']): void {
    this.currentSort = sortBy;
    const sortSelect = this.container.querySelector('.spw-sort-select') as HTMLSelectElement;
    if (sortSelect) {
      sortSelect.value = sortBy || 'featured';
    }
  }

  public destroy(): void {
    this.container.innerHTML = '';
    this.results = null;
  }
}
