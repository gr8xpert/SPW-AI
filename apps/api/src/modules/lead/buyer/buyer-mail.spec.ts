import { buildBuyerEmail, fill, propertyLink } from './buyer-mail';
import type { BuyerPropertyCard } from './buyer-property-card';

const card: BuyerPropertyCard = {
  id: 1,
  reference: 'LT-1',
  agentReference: null,
  title: { en: 'Sea view villa', es: 'Villa con vistas al mar' },
  slug: null,
  listingType: 'sale',
  status: 'active',
  price: 450000,
  priceTo: null,
  rentalPeriod: null,
  currency: 'EUR',
  priceOnRequest: false,
  bedrooms: 3,
  bedroomsTo: null,
  bathrooms: 2,
  bathroomsTo: null,
  buildSize: 180,
  buildSizeTo: null,
  plotSize: null,
  plotSizeTo: null,
  virtualTourUrl: 'https://tour.example/1',
  image: 'https://cdn.example/1.webp',
  location: { id: 5, name: { en: 'Marbella' } },
  propertyType: { id: 2, name: { en: 'Villa', es: 'Villa' } },
};

const from = { name: 'Costa Homes', color: '#123456', website: 'https://costa.example', replyTo: 'info@costa.example' };

describe('propertyLink', () => {
  const patterns = { default: 'https://costa.example/{lang}/property/{segment}', es: 'https://costa.example/es/propiedad/{segment}' };

  it('uses the language pattern, else the default', () => {
    expect(propertyLink(card, 'es', patterns, 'title-ref')).toBe('https://costa.example/es/propiedad/villa-con-vistas-al-mar_LT-1');
    expect(propertyLink(card, 'nl', patterns, 'title-ref')).toBe('https://costa.example/nl/property/sea-view-villa_LT-1');
  });

  it('fills {ref} and returns null without a pattern', () => {
    expect(propertyLink(card, 'en', { default: 'https://x.example/p/{ref}' }, undefined)).toBe('https://x.example/p/LT-1');
    expect(propertyLink(card, 'en', {}, undefined)).toBeNull();
  });
});

describe('buildBuyerEmail', () => {
  const labels = {
    buyer_email_subject: '{company}: propiedades seleccionadas para usted',
    buyer_email_greeting: 'Estimado/a {name}:',
    buyer_email_view: 'Ver propiedad',
  };

  it('writes the buyer language, the link and the price', () => {
    const mail = buildBuyerEmail({
      from,
      labels,
      lang: 'es',
      buyerName: 'Emma <b>',
      agent: { name: 'Alex Agent', email: 'alex@costa.example' },
      message: 'Mira <esto>',
      properties: [card],
      urlPatterns: { default: 'https://costa.example/{lang}/property/{segment}' },
      slugFormat: 'title-ref',
    });
    expect(mail.subject).toBe('Costa Homes: propiedades seleccionadas para usted');
    expect(mail.html).toContain('Estimado/a Emma &lt;b&gt;:');
    expect(mail.html).toContain('Mira &lt;esto&gt;');
    expect(mail.html).toContain('href="https://costa.example/es/property/villa-con-vistas-al-mar_LT-1"');
    expect(mail.html).toContain('Ver propiedad');
    expect(mail.html).toContain('Villa con vistas al mar');
    expect(mail.html).toContain('https://tour.example/1');
    expect(mail.text).toContain('450.000');
    expect(mail.text).toContain('Alex Agent');
    expect(`${mail.html}${mail.text}${mail.subject}`).not.toMatch(/SPM|spw-ai|Smart Property/i);
  });

  it('greets without a name and marks the agent copy', () => {
    const mail = buildBuyerEmail({
      from, labels: {}, lang: 'en', buyerName: null, agent: null, properties: [{ ...card, image: null, virtualTourUrl: null }],
      urlPatterns: {}, slugFormat: null, copyFor: 'Emma Stone',
    });
    expect(mail.html).toContain('Hello,');
    expect(mail.html).toContain('Copy of the selection for Emma Stone');
    expect(mail.html).not.toContain('View property');
  });

  it('fills placeholders and keeps unknown ones', () => {
    expect(fill('{a} and {b}', { a: 1 })).toBe('1 and {b}');
  });
});

describe('buildBuyerEmail tracking', () => {
  const base = {
    from,
    labels: {},
    lang: 'en',
    buyerName: 'Ann',
    agent: null,
    properties: [card],
    urlPatterns: { default: 'https://costa.example/{lang}/property/{segment}' },
    slugFormat: 'title-ref',
  };

  it('adds the pixel and sends property links through the click redirect', () => {
    const mail = buildBuyerEmail({ ...base, tracking: { pixelUrl: 'https://api.example/api/t/o/abc', link: (id) => `https://api.example/api/t/c/x${id}` } });
    expect(mail.html).toContain('src="https://api.example/api/t/o/abc"');
    expect(mail.html).toContain('href="https://api.example/api/t/c/x1"');
    expect(mail.html).not.toContain('https://costa.example/en/property/');
    expect(mail.text).toContain('https://api.example/api/t/c/x1');
    expect(mail.html).toContain('https://tour.example/1');
  });

  it('leaves an untracked email (agent copy) as it was', () => {
    const mail = buildBuyerEmail(base);
    expect(mail.html).not.toContain('/api/t/');
    expect(mail.html).toContain('https://costa.example/en/property/sea-view-villa_LT-1');
  });

  it('adds no click link when the client has no property URL', () => {
    const mail = buildBuyerEmail({ ...base, urlPatterns: {}, tracking: { pixelUrl: 'https://p', link: () => 'https://c' } });
    expect(mail.html).not.toContain('href="https://c"');
  });

  it('adds the unsubscribe link to the buyer copy (html + text), labelled', () => {
    const tracking = { pixelUrl: 'https://p', link: () => 'https://c', unsubscribeUrl: 'https://api.example/api/t/u/tok' };
    const mail = buildBuyerEmail({ ...base, labels: { buyer_email_unsubscribe: 'Darse de baja' }, tracking });
    expect(mail.html).toContain('<a href="https://api.example/api/t/u/tok" style="color:#64748b;">Darse de baja</a>');
    expect(mail.text).toContain('Darse de baja: https://api.example/api/t/u/tok');
    expect(buildBuyerEmail(base).html).not.toContain('/api/t/u/');
  });
});

describe('buildBuyerEmail buyer page button', () => {
  const base = { from, labels: {}, lang: 'en', buyerName: 'Ann', agent: null, properties: [card], urlPatterns: {}, slugFormat: 'title-ref' };

  it('adds "View my properties" when the page link is given', () => {
    const mail = buildBuyerEmail({ ...base, pageUrl: 'https://costa.example/my-properties/?t=AbCdE12345' });
    expect(mail.html).toContain('href="https://costa.example/my-properties/?t=AbCdE12345"');
    expect(mail.html).toContain('View my properties');
    expect(mail.text).toContain('View my properties: https://costa.example/my-properties/?t=AbCdE12345');
  });

  it('leaves it out without a link, or with a bad one', () => {
    expect(buildBuyerEmail(base).html).not.toContain('View my properties');
    expect(buildBuyerEmail({ ...base, pageUrl: 'javascript:alert(1)' }).html).not.toContain('View my properties');
  });
});

describe('buildBuyerEmail alert', () => {
  const base = { from, labels: {}, lang: 'en', buyerName: 'Ann', agent: null, properties: [card], urlPatterns: {}, slugFormat: 'title-ref' };

  it('uses the alert wording and shows the old price of a price drop', () => {
    const mail = buildBuyerEmail({ ...base, alert: { drops: { 1: 480000 } } });
    expect(mail.subject).toBe('Costa Homes: new properties for your search');
    expect(mail.html).toContain('New properties for your search');
    expect(mail.html).toMatch(/Price reduced from €480,000 to €450,000/);
    expect(mail.text).toMatch(/Price reduced from €480,000 to €450,000/);
  });

  it('a new listing has no price line', () => {
    const mail = buildBuyerEmail({ ...base, alert: { drops: {} } });
    expect(mail.html).not.toContain('Price reduced');
  });
});
