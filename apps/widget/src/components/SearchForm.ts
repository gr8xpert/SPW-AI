import type { Location, PropertyType, SearchFilters, Labels } from '../types';
import { escapeHtml } from '../utils/helpers';

export interface SearchFormOptions {
  container: HTMLElement;
  locations: Location[];
  propertyTypes: PropertyType[];
  labels: Labels;
  initialFilters?: SearchFilters;
  priceRanges?: { min: number; max: number; label: string }[];
  bedroomOptions?: number[];
  onSubmit: (filters: SearchFilters) => void;
  onReset: () => void;
}

export class SearchForm {
  private container: HTMLElement;
  private options: SearchFormOptions;
  private filters: SearchFilters;
  private formElement: HTMLFormElement | null = null;

  constructor(options: SearchFormOptions) {
    this.options = options;
    this.container = options.container;
    this.filters = options.initialFilters || {};
    this.render();
  }

  private render(): void {
    const { labels, locations, propertyTypes, priceRanges, bedroomOptions } = this.options;

    // Build location tree for grouped select
    const locationTree = this.buildLocationTree(locations);

    this.container.innerHTML = `
      <form class="spw-search-form">
        <h2 class="spw-search-title">${escapeHtml(labels['search.title'])}</h2>
        <div class="spw-search-grid">
          <!-- Listing Type -->
          <div class="spw-form-group">
            <label class="spw-label">${escapeHtml(labels['search.listingType'])}</label>
            <select class="spw-select" name="listingType">
              <option value="">${escapeHtml(labels['search.any'])}</option>
              <option value="sale">${escapeHtml(labels['search.forSale'])}</option>
              <option value="rent">${escapeHtml(labels['search.forRent'])}</option>
              <option value="development">${escapeHtml(labels['search.development'])}</option>
            </select>
          </div>

          <!-- Location -->
          <div class="spw-form-group">
            <label class="spw-label">${escapeHtml(labels['search.location'])}</label>
            <select class="spw-select" name="locationId">
              <option value="">${escapeHtml(labels['search.anyLocation'])}</option>
              ${locationTree}
            </select>
          </div>

          <!-- Property Type -->
          <div class="spw-form-group">
            <label class="spw-label">${escapeHtml(labels['search.propertyType'])}</label>
            <select class="spw-select" name="propertyTypeId">
              <option value="">${escapeHtml(labels['search.anyType'])}</option>
              ${propertyTypes.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('')}
            </select>
          </div>

          <!-- Bedrooms -->
          <div class="spw-form-group">
            <label class="spw-label">${escapeHtml(labels['search.bedrooms'])}</label>
            <select class="spw-select" name="minBedrooms">
              <option value="">${escapeHtml(labels['search.any'])}</option>
              ${(bedroomOptions || [1, 2, 3, 4, 5]).map(b => `<option value="${b}">${b}+</option>`).join('')}
            </select>
          </div>

          <!-- Price Range -->
          <div class="spw-form-group">
            <label class="spw-label">${escapeHtml(labels['search.minPrice'])}</label>
            <select class="spw-select" name="minPrice">
              <option value="">${escapeHtml(labels['search.any'])}</option>
              ${(priceRanges || this.getDefaultPriceRanges()).map(p =>
                `<option value="${p.min}">${escapeHtml(p.label)}</option>`
              ).join('')}
            </select>
          </div>

          <div class="spw-form-group">
            <label class="spw-label">${escapeHtml(labels['search.maxPrice'])}</label>
            <select class="spw-select" name="maxPrice">
              <option value="">${escapeHtml(labels['search.any'])}</option>
              ${(priceRanges || this.getDefaultPriceRanges()).map(p =>
                `<option value="${p.max}">${escapeHtml(p.label)}</option>`
              ).join('')}
            </select>
          </div>
        </div>

        <div class="spw-search-actions">
          <button type="button" class="spw-btn spw-btn-secondary spw-reset-btn">
            ${escapeHtml(labels['search.reset'])}
          </button>
          <button type="submit" class="spw-btn spw-btn-primary">
            ${escapeHtml(labels['search.submit'])}
          </button>
        </div>
      </form>
    `;

    this.formElement = this.container.querySelector('form');
    this.bindEvents();
    this.setFormValues();
  }

  private buildLocationTree(locations: Location[]): string {
    // Group locations by parent
    const byParent = new Map<number | null, Location[]>();

    locations.forEach(loc => {
      const parentId = loc.parentId || null;
      if (!byParent.has(parentId)) {
        byParent.set(parentId, []);
      }
      byParent.get(parentId)!.push(loc);
    });

    // Build hierarchical options
    const buildOptions = (parentId: number | null, indent: number): string => {
      const children = byParent.get(parentId) || [];
      return children.map(loc => {
        const prefix = '—'.repeat(indent);
        const countLabel = loc.propertyCount ? ` (${loc.propertyCount})` : '';
        const childOptions = buildOptions(loc.id, indent + 1);
        return `<option value="${loc.id}">${prefix} ${escapeHtml(loc.name)}${countLabel}</option>${childOptions}`;
      }).join('');
    };

    return buildOptions(null, 0);
  }

  private getDefaultPriceRanges(): { min: number; max: number; label: string }[] {
    return [
      { min: 0, max: 100000, label: '€0 - €100,000' },
      { min: 100000, max: 250000, label: '€100,000 - €250,000' },
      { min: 250000, max: 500000, label: '€250,000 - €500,000' },
      { min: 500000, max: 750000, label: '€500,000 - €750,000' },
      { min: 750000, max: 1000000, label: '€750,000 - €1,000,000' },
      { min: 1000000, max: 2000000, label: '€1,000,000 - €2,000,000' },
      { min: 2000000, max: 5000000, label: '€2,000,000 - €5,000,000' },
      { min: 5000000, max: 999999999, label: '€5,000,000+' },
    ];
  }

  private bindEvents(): void {
    if (!this.formElement) return;

    // Form submit
    this.formElement.addEventListener('submit', (e) => {
      e.preventDefault();
      this.collectFilters();
      this.options.onSubmit(this.filters);
    });

    // Reset button
    const resetBtn = this.container.querySelector('.spw-reset-btn');
    resetBtn?.addEventListener('click', () => {
      this.filters = {};
      this.setFormValues();
      this.options.onReset();
    });
  }

  private collectFilters(): void {
    if (!this.formElement) return;

    const formData = new FormData(this.formElement);

    this.filters = {
      listingType: formData.get('listingType') as SearchFilters['listingType'] || undefined,
      locationId: formData.get('locationId') ? Number(formData.get('locationId')) : undefined,
      propertyTypeId: formData.get('propertyTypeId') ? Number(formData.get('propertyTypeId')) : undefined,
      minBedrooms: formData.get('minBedrooms') ? Number(formData.get('minBedrooms')) : undefined,
      minPrice: formData.get('minPrice') ? Number(formData.get('minPrice')) : undefined,
      maxPrice: formData.get('maxPrice') ? Number(formData.get('maxPrice')) : undefined,
    };

    // Remove undefined values
    Object.keys(this.filters).forEach(key => {
      if (this.filters[key as keyof SearchFilters] === undefined) {
        delete this.filters[key as keyof SearchFilters];
      }
    });
  }

  private setFormValues(): void {
    if (!this.formElement) return;

    const setSelectValue = (name: string, value: unknown) => {
      const select = this.formElement!.querySelector(`[name="${name}"]`) as HTMLSelectElement;
      if (select) {
        select.value = value !== undefined ? String(value) : '';
      }
    };

    setSelectValue('listingType', this.filters.listingType);
    setSelectValue('locationId', this.filters.locationId);
    setSelectValue('propertyTypeId', this.filters.propertyTypeId);
    setSelectValue('minBedrooms', this.filters.minBedrooms);
    setSelectValue('minPrice', this.filters.minPrice);
    setSelectValue('maxPrice', this.filters.maxPrice);
  }

  public getFilters(): SearchFilters {
    return { ...this.filters };
  }

  public setFilters(filters: SearchFilters): void {
    this.filters = { ...filters };
    this.setFormValues();
  }

  public destroy(): void {
    this.container.innerHTML = '';
    this.formElement = null;
  }
}
