import type { Property, Labels, InquiryData } from '../types';
import { escapeHtml, formatCurrency } from '../utils/helpers';

export interface PropertyDetailOptions {
  property: Property;
  labels: Labels;
  currency?: string;
  enableInquiry?: boolean;
  onClose: () => void;
  onInquiry?: (data: InquiryData) => Promise<void>;
}

export class PropertyDetail {
  private options: PropertyDetailOptions;
  private overlay: HTMLElement | null = null;
  private escapeHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(options: PropertyDetailOptions) {
    this.options = options;
  }

  public show(): void {
    const { property, labels, currency = 'EUR', enableInquiry } = this.options;

    // Create overlay
    this.overlay = document.createElement('div');
    this.overlay.className = 'spw-modal-overlay';

    // Price display
    const priceDisplay = property.priceOnRequest
      ? labels['property.priceOnRequest']
      : formatCurrency(property.price, currency);

    // Build specs
    const specs: string[] = [];
    if (property.bedrooms !== undefined) {
      specs.push(`<div class="spw-detail-spec"><strong>${property.bedrooms}</strong> ${escapeHtml(labels['property.bedrooms'])}</div>`);
    }
    if (property.bathrooms !== undefined) {
      specs.push(`<div class="spw-detail-spec"><strong>${property.bathrooms}</strong> ${escapeHtml(labels['property.bathrooms'])}</div>`);
    }
    if (property.buildSize) {
      specs.push(`<div class="spw-detail-spec"><strong>${property.buildSize} m²</strong> ${escapeHtml(labels['property.buildSize'])}</div>`);
    }
    if (property.plotSize) {
      specs.push(`<div class="spw-detail-spec"><strong>${property.plotSize} m²</strong> ${escapeHtml(labels['property.plotSize'])}</div>`);
    }

    // Build features list
    const featuresHtml = property.features.length > 0 ? `
      <div class="spw-detail-section">
        <h4>${escapeHtml(labels['detail.features'])}</h4>
        <div class="spw-features-list">
          ${property.features.map(f => `
            <div class="spw-feature-item">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              <span>${escapeHtml(f.name)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    ` : '';

    // Build inquiry form
    const inquiryFormHtml = enableInquiry ? `
      <div class="spw-detail-section">
        <h4>${escapeHtml(labels['inquiry.title'])}</h4>
        <form class="spw-inquiry-form">
          <input type="hidden" name="propertyId" value="${property.id}">
          <input type="hidden" name="propertyReference" value="${escapeHtml(property.reference)}">
          <div class="spw-form-group">
            <label class="spw-label">${escapeHtml(labels['inquiry.name'])} *</label>
            <input type="text" class="spw-input" name="name" required>
          </div>
          <div class="spw-form-group">
            <label class="spw-label">${escapeHtml(labels['inquiry.email'])} *</label>
            <input type="email" class="spw-input" name="email" required>
          </div>
          <div class="spw-form-group">
            <label class="spw-label">${escapeHtml(labels['inquiry.phone'])}</label>
            <input type="tel" class="spw-input" name="phone">
          </div>
          <div class="spw-form-group">
            <label class="spw-label">${escapeHtml(labels['inquiry.message'])} *</label>
            <textarea class="spw-input" name="message" rows="4" required></textarea>
          </div>
          <button type="submit" class="spw-btn spw-btn-primary">
            ${escapeHtml(labels['inquiry.submit'])}
          </button>
          <div class="spw-inquiry-message"></div>
        </form>
      </div>
    ` : '';

    // Video/Virtual tour buttons
    const mediaButtons: string[] = [];
    if (property.videoUrl) {
      mediaButtons.push(`<a href="${escapeHtml(property.videoUrl)}" target="_blank" class="spw-btn spw-btn-outline">${escapeHtml(labels['detail.video'])}</a>`);
    }
    if (property.virtualTourUrl) {
      mediaButtons.push(`<a href="${escapeHtml(property.virtualTourUrl)}" target="_blank" class="spw-btn spw-btn-outline">${escapeHtml(labels['detail.virtualTour'])}</a>`);
    }

    this.overlay.innerHTML = `
      <div class="spw-modal">
        <div class="spw-modal-header">
          <div>
            <h3 class="spw-property-title">${escapeHtml(property.title)}</h3>
            <div class="spw-property-location">${escapeHtml(property.location.name)}</div>
          </div>
          <button class="spw-modal-close" aria-label="${escapeHtml(labels['general.close'])}">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div class="spw-modal-body">
          <!-- Gallery -->
          <div class="spw-gallery">
            <div class="spw-gallery-main">
              <img src="${escapeHtml(property.images[0]?.url || '')}" alt="${escapeHtml(property.title)}" class="spw-gallery-main-img">
            </div>
            ${property.images.length > 1 ? `
              <div class="spw-gallery-thumbs">
                ${property.images.map((img, i) => `
                  <div class="spw-gallery-thumb ${i === 0 ? 'active' : ''}" data-index="${i}">
                    <img src="${escapeHtml(img.url)}" alt="${escapeHtml(img.alt || '')}">
                  </div>
                `).join('')}
              </div>
            ` : ''}
          </div>

          <!-- Price & Reference -->
          <div class="spw-detail-header">
            <div class="spw-property-price">${escapeHtml(priceDisplay)}</div>
            <div class="spw-property-ref">Ref: ${escapeHtml(property.reference)}</div>
          </div>

          <!-- Specs -->
          <div class="spw-detail-specs">
            ${specs.join('')}
          </div>

          <!-- Media Buttons -->
          ${mediaButtons.length > 0 ? `<div class="spw-detail-media">${mediaButtons.join('')}</div>` : ''}

          <!-- Description -->
          <div class="spw-detail-section">
            <h4>${escapeHtml(labels['detail.description'])}</h4>
            <p class="spw-detail-description">${escapeHtml(property.description)}</p>
          </div>

          <!-- Features -->
          ${featuresHtml}

          <!-- Inquiry Form -->
          ${inquiryFormHtml}
        </div>
      </div>
    `;

    document.body.appendChild(this.overlay);

    // Add active class after append (for animation)
    requestAnimationFrame(() => {
      this.overlay?.classList.add('active');
    });

    this.bindEvents();

    // Prevent body scroll
    document.body.style.overflow = 'hidden';
  }

  private bindEvents(): void {
    if (!this.overlay) return;

    // Close button
    const closeBtn = this.overlay.querySelector('.spw-modal-close');
    closeBtn?.addEventListener('click', () => this.close());

    // Click outside to close
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.close();
      }
    });

    // Escape key to close
    this.escapeHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.close();
      }
    };
    document.addEventListener('keydown', this.escapeHandler);

    // Gallery thumbnails
    const thumbs = this.overlay.querySelectorAll('.spw-gallery-thumb');
    thumbs.forEach((thumb) => {
      thumb.addEventListener('click', () => {
        const index = Number(thumb.getAttribute('data-index'));
        this.setGalleryImage(index);
      });
    });

    // Inquiry form
    const form = this.overlay.querySelector('.spw-inquiry-form');
    form?.addEventListener('submit', (e) => this.handleInquirySubmit(e));
  }

  private setGalleryImage(index: number): void {
    const { property } = this.options;
    if (!this.overlay || index < 0 || index >= property.images.length) return;

    const mainImg = this.overlay.querySelector('.spw-gallery-main-img') as HTMLImageElement;
    if (mainImg) {
      mainImg.src = property.images[index].url;
    }

    // Update active thumb
    const thumbs = this.overlay.querySelectorAll('.spw-gallery-thumb');
    thumbs.forEach((thumb, i) => {
      thumb.classList.toggle('active', i === index);
    });
  }

  private async handleInquirySubmit(e: Event): Promise<void> {
    e.preventDefault();

    const { labels, onInquiry } = this.options;
    if (!onInquiry) return;

    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    const messageEl = form.querySelector('.spw-inquiry-message') as HTMLElement;
    const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement;

    const data: InquiryData = {
      propertyId: Number(formData.get('propertyId')),
      propertyReference: formData.get('propertyReference') as string,
      name: formData.get('name') as string,
      email: formData.get('email') as string,
      phone: formData.get('phone') as string || undefined,
      message: formData.get('message') as string,
    };

    submitBtn.disabled = true;
    messageEl.innerHTML = '';

    try {
      await onInquiry(data);
      messageEl.innerHTML = `<div class="spw-form-success">${escapeHtml(labels['inquiry.success'])}</div>`;
      form.reset();
    } catch (error) {
      messageEl.innerHTML = `<div class="spw-form-error">${escapeHtml(labels['inquiry.error'])}</div>`;
    } finally {
      submitBtn.disabled = false;
    }
  }

  public close(): void {
    if (!this.overlay) return;

    // Remove escape handler to prevent memory leak
    if (this.escapeHandler) {
      document.removeEventListener('keydown', this.escapeHandler);
      this.escapeHandler = null;
    }

    this.overlay.classList.remove('active');

    // Wait for animation before removing
    setTimeout(() => {
      this.overlay?.remove();
      this.overlay = null;
      document.body.style.overflow = '';
    }, 200);

    this.options.onClose();
  }
}
