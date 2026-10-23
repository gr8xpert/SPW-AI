import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { TenantSettings } from '@spm/shared';
import { Property, Tenant } from '../../database/entities';
import { selectCard, toCard, type BuyerPropertyCard } from '../lead/buyer/buyer-property-card';
import { propertyLink } from '../lead/buyer/buyer-mail';
import { normalizeBuyerSettings } from '../lead/buyer/buyer-settings.service';
import { renderCampaignEmail, type AgencyInfo, type CampaignPropertyCard, type CampaignRendered } from './campaign-render';
import { checkTemplate, inlineCss } from './template-check';

// The fixed words around the client's own text, in the contact's language.
const TEXTS: Record<string, { view: string; unsubscribe: string; unsubscribeText: string; bed: string; bath: string; onRequest: string }> = {
  en: { view: 'View property', unsubscribe: 'Unsubscribe', unsubscribeText: "Don't want these emails any more?", bed: 'bed', bath: 'bath', onRequest: 'Price on request' },
  es: { view: 'Ver propiedad', unsubscribe: 'Darse de baja', unsubscribeText: '¿No quiere recibir más estos emails?', bed: 'dorm.', bath: 'baños', onRequest: 'Precio a consultar' },
  nl: { view: 'Bekijk woning', unsubscribe: 'Afmelden', unsubscribeText: 'Wilt u deze e-mails niet meer ontvangen?', bed: 'slpk', bath: 'badk', onRequest: 'Prijs op aanvraag' },
  de: { view: 'Immobilie ansehen', unsubscribe: 'Abmelden', unsubscribeText: 'Möchten Sie diese E-Mails nicht mehr erhalten?', bed: 'Schlafz.', bath: 'Bad', onRequest: 'Preis auf Anfrage' },
  fr: { view: 'Voir le bien', unsubscribe: 'Se désabonner', unsubscribeText: 'Vous ne souhaitez plus recevoir ces e-mails ?', bed: 'ch.', bath: 'sdb', onRequest: 'Prix sur demande' },
};

const demoCard = (id: number, title: string, price: number, beds: number, baths: number, size: number, town: string): BuyerPropertyCard =>
  ({
    id, reference: `DEMO-${id}`, agentReference: null, title: { en: title }, slug: null, listingType: 'sale', status: 'active',
    price, priceTo: null, rentalPeriod: null, currency: 'EUR', priceOnRequest: false,
    bedrooms: beds, bedroomsTo: null, bathrooms: baths, bathroomsTo: null, buildSize: size, buildSizeTo: null,
    plotSize: null, plotSizeTo: null, virtualTourUrl: null, image: null,
    location: { id: 0, name: { en: town } }, propertyType: { id: 0, name: { en: 'Villa' } },
  }) as BuyerPropertyCard;

// Shown in the editor preview when the client has no live listings yet.
const DEMO_CARDS: BuyerPropertyCard[] = [
  demoCard(1, 'Sea-view villa with pool', 1250000, 4, 3, 320, 'Marbella'),
  demoCard(2, 'Modern apartment near the beach', 425000, 2, 2, 110, 'Estepona'),
  demoCard(3, 'Townhouse in the old town', 389000, 3, 2, 150, 'Mijas'),
];

export interface CampaignContext {
  tenantId: number;
  agency: string;
  color: string;
  defaultLang: string;
  patterns: Record<string, string>;
  slugFormat: unknown;
  cards: BuyerPropertyCard[];
  agencyInfo: AgencyInfo;
}

export interface CampaignLinks {
  pixelUrl: string | null;
  unsubscribeUrl: string;
  propertyUrl: ((propertyId: number) => string) | null;
}

function pick(value: Record<string, string> | null | undefined, lang: string): string {
  if (!value || typeof value !== 'object') return '';
  return value[lang] || value.en || Object.values(value).find((v) => typeof v === 'string' && v) || '';
}

function money(n: number, currency: string, lang: string): string {
  try {
    return new Intl.NumberFormat(lang, { style: 'currency', currency: currency || 'EUR', maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${currency || 'EUR'} ${Math.round(n).toLocaleString('en')}`;
  }
}

@Injectable()
export class CampaignContentService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(Property)
    private readonly propertyRepository: Repository<Property>,
  ) {}

  // juice is slow-ish and a campaign renders the same body for every contact.
  private readonly inlined = new Map<string, string>();

  private inline(html: string): string {
    const hit = this.inlined.get(html);
    if (hit !== undefined) return hit;
    const out = inlineCss(html);
    if (this.inlined.size >= 20) this.inlined.delete(this.inlined.keys().next().value as string);
    this.inlined.set(html, out);
    return out;
  }

  // The editor preview: the real renderer with a sample contact and the
  // client's 3 newest live listings (demo listings when there are none).
  async previewSample(tenantId: number, template: { subject: string; bodyHtml: string }): Promise<{ subject: string; html: string; warnings: string[] }> {
    const check = checkTemplate(template.bodyHtml);
    const newest = await this.propertyRepository.find({
      where: { tenantId, status: 'active', isPublished: true } as never,
      select: ['id'],
      order: { createdAt: 'DESC' } as never,
      take: 3,
    });
    const ctx = await this.context(tenantId, newest.map((p) => p.id));
    if (!ctx.cards.length) ctx.cards = DEMO_CARDS;
    const out = this.render(
      ctx,
      { subject: template.subject, bodyHtml: check.html },
      { name: 'Anna Smith', email: 'anna@example.com', language: ctx.defaultLang },
      { pixelUrl: null, unsubscribeUrl: '#unsubscribe', propertyUrl: null },
    );
    return { subject: out.subject, html: out.html, warnings: [...check.errors, ...check.warnings] };
  }

  // Everything one campaign's emails share. Only listings that are live on
  // the website are featured; the order is the one the client gave.
  async context(tenantId: number, propertyIds: number[] | null | undefined): Promise<CampaignContext> {
    const tenant = await this.tenantRepository.findOne({ where: { id: tenantId } });
    const settings = (tenant?.settings || {}) as TenantSettings & { companyName?: string; primaryColor?: string; slugFormat?: unknown };
    let cards: BuyerPropertyCard[] = [];
    const ids = (propertyIds || []).filter((id) => Number.isInteger(id) && id > 0);
    if (ids.length) {
      const rows = await selectCard(this.propertyRepository.createQueryBuilder('p'))
        .where('p.tenantId = :tenantId', { tenantId })
        .andWhere('p.id IN (:...ids)', { ids })
        .andWhere('p.status = :status', { status: 'active' })
        .andWhere('p.isPublished = :published', { published: true })
        .getMany();
      const byId = new Map(rows.map((r) => [r.id, toCard(r)]));
      cards = ids.map((id) => byId.get(id)).filter((c): c is BuyerPropertyCard => !!c);
    }
    return {
      tenantId,
      agency: settings.companyName || tenant?.name || '',
      color: /^#[0-9a-f]{6}$/i.test(settings.primaryColor ?? '') ? settings.primaryColor! : '#1e293b',
      defaultLang: (settings.defaultLanguage || 'en').slice(0, 2),
      patterns: normalizeBuyerSettings(settings.buyerMatch).propertyUrlPatterns,
      slugFormat: settings.slugFormat,
      cards,
      agencyInfo: { logo: settings.logoUrl, phone: settings.contactPhone, email: settings.contactEmail, website: settings.websiteUrl },
    };
  }

  langFor(ctx: CampaignContext, contactLang: string | null | undefined): string {
    const lang = (contactLang || ctx.defaultLang || 'en').slice(0, 2).toLowerCase();
    return /^[a-z]{2}$/.test(lang) ? lang : 'en';
  }

  // The website address of one listing, or null when the client has not set
  // the property URL pattern (Buyer Match settings).
  websiteUrl(ctx: CampaignContext, card: BuyerPropertyCard, lang: string): string | null {
    return propertyLink(card, lang, ctx.patterns, ctx.slugFormat);
  }

  render(
    ctx: CampaignContext,
    template: { subject: string; bodyHtml: string; bodyText?: string | null },
    contact: { name: string | null; email: string; language?: string | null },
    links: CampaignLinks,
  ): CampaignRendered {
    const lang = this.langFor(ctx, contact.language);
    const t = TEXTS[lang] ?? TEXTS.en;
    const properties: CampaignPropertyCard[] = ctx.cards.map((c) => {
      const site = this.websiteUrl(ctx, c, lang);
      const price = c.priceOnRequest
        ? t.onRequest
        : c.price
          ? c.priceTo && c.priceTo > c.price
            ? `${money(c.price, c.currency, lang)} – ${money(c.priceTo, c.currency, lang)}`
            : money(c.price, c.currency, lang)
          : null;
      return {
        title: pick(c.title, lang) || c.reference,
        reference: c.reference,
        beds: c.bedrooms,
        baths: c.bathrooms,
        area: c.buildSize ? `${c.buildSize} m²` : null,
        location: pick(c.location?.name, lang) || null,
        propertyType: pick(c.propertyType?.name, lang) || null,
        price,
        facts: [
          c.bedrooms ? `${c.bedrooms} ${t.bed}` : '',
          c.bathrooms ? `${c.bathrooms} ${t.bath}` : '',
          c.buildSize ? `${c.buildSize} m²` : '',
        ].filter(Boolean),
        image: c.image,
        url: site ? (links.propertyUrl ? links.propertyUrl(c.id) : site) : null,
      };
    });
    return renderCampaignEmail({
      subject: template.subject,
      bodyHtml: this.inline(template.bodyHtml),
      bodyText: template.bodyText,
      contact: { name: contact.name, email: contact.email },
      agency: ctx.agency,
      color: ctx.color,
      properties,
      agencyInfo: ctx.agencyInfo,
      unsubscribeUrl: links.unsubscribeUrl,
      pixelUrl: links.pixelUrl,
      texts: t,
    });
  }

  // Featured listings as the dashboard shows them on a campaign.
  async featured(tenantId: number, ids: number[] | null | undefined): Promise<{ id: number; reference: string; title: string; live: boolean }[]> {
    const list = (ids || []).filter((id) => Number.isInteger(id) && id > 0);
    if (!list.length) return [];
    const rows = await this.propertyRepository.find({
      where: { tenantId, id: In(list) },
      select: ['id', 'reference', 'title', 'status', 'isPublished'],
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return list
      .map((id) => byId.get(id))
      .filter((p): p is Property => !!p)
      .map((p) => ({
        id: p.id,
        reference: p.reference,
        title: pick(p.title as Record<string, string>, 'en'),
        live: p.status === 'active' && !!p.isPublished,
      }));
  }
}
