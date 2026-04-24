import { escapeHtml, formatCurrency } from '../utils/helpers';

export interface ChatPropertyData {
  id: number;
  reference: string;
  title: string;
  price: number;
  priceOnRequest: boolean;
  currency: string;
  bedrooms?: number;
  bathrooms?: number;
  buildSize?: number;
  location: string;
  propertyType: string;
  image: string | null;
  listingType: string;
}

export class ChatPropertyCard {
  private data: ChatPropertyData;
  private onClick?: (reference: string) => void;

  constructor(data: ChatPropertyData, onClick?: (reference: string) => void) {
    this.data = data;
    this.onClick = onClick;
  }

  render(): HTMLElement {
    const card = document.createElement('div');
    card.className = 'spw-chat-property-card';
    card.addEventListener('click', () => this.onClick?.(this.data.reference));

    const priceStr = this.data.priceOnRequest
      ? 'Price on Request'
      : formatCurrency(this.data.price, this.data.currency);

    const details: string[] = [];
    if (this.data.bedrooms != null) details.push(`${this.data.bedrooms} bed`);
    if (this.data.bathrooms != null) details.push(`${this.data.bathrooms} bath`);
    if (this.data.buildSize != null) details.push(`${this.data.buildSize}m²`);

    card.innerHTML = `
      ${this.data.image ? `<img class="spw-chat-property-img" src="${escapeHtml(this.data.image)}" alt="${escapeHtml(this.data.title)}" loading="lazy">` : ''}
      <div class="spw-chat-property-info">
        <div class="spw-chat-property-title">${escapeHtml(this.data.title)}</div>
        <div class="spw-chat-property-price">${escapeHtml(priceStr)}</div>
        <div class="spw-chat-property-meta">
          ${this.data.location ? `<span>${escapeHtml(this.data.location)}</span>` : ''}
          ${details.length ? `<span>${details.join(' · ')}</span>` : ''}
        </div>
        <div class="spw-chat-property-ref">${escapeHtml(this.data.reference)}</div>
      </div>
    `;

    return card;
  }
}
