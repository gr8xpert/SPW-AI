import { buildAgentNotice, buildWishlistConfirmation, wishlistSummary, type WishlistNames } from './buyer-form-mail';

const from = { name: 'Costa <Homes>', color: '#123456', website: 'https://costa.example' };
const names: WishlistNames = {
  locations: new Map([[3, 'Marbella'], [4, 'Estepona']]),
  types: new Map([[10, 'Villa']]),
  features: new Map([[7, 'Piscina']]),
};
const es = {
  wishlist_form_listing_type: 'Busco',
  listing_type_sale: 'En Venta',
  wishlist_form_locations: 'Ubicaciones',
  wishlist_form_budget_max: 'Presupuesto hasta',
  wishlist_form_email_subject: '{company}: hemos recibido su lista de deseos',
  wishlist_form_email_greeting: 'Estimado/a {name}:',
};

describe('wishlistSummary', () => {
  it('lists what was asked for, in the label language, skipping unknown ids', () => {
    const rows = wishlistSummary(
      { listingTypes: ['sale'], locationIds: [3, 99, 4], propertyTypeIds: [10], minBedrooms: 3, budgetMax: 500000, currency: 'EUR', featureIds: [7] },
      names,
      es,
      'es',
    );
    expect(rows.map((r) => r.label)).toEqual(['Busco', 'Ubicaciones', 'Property types', 'Bedrooms (min.)', 'Presupuesto hasta', 'Features']);
    expect(rows[0].value).toBe('En Venta');
    expect(rows[1].value).toBe('Marbella, Estepona');
    expect(rows[3].value).toBe('3+');
    expect(rows[4].value).toMatch(/500\.000/);
  });

  it('is empty for no wishlist', () => {
    expect(wishlistSummary(null, names, {}, 'en')).toEqual([]);
  });
});

describe('wishlist form emails', () => {
  it('confirmation: client branding, page language, escaped, no platform name', () => {
    const mail = buildWishlistConfirmation({ from, labels: es, name: 'Ana <b>', summary: [{ label: 'Busco', value: 'En Venta' }] });
    expect(mail.subject).toBe('Costa <Homes>: hemos recibido su lista de deseos');
    expect(mail.html).toContain('Estimado/a Ana &lt;b&gt;:');
    expect(mail.html).toContain('Costa &lt;Homes&gt;');
    expect(mail.html).not.toMatch(/spm|spw|smart property/i);
    expect(mail.text).toContain('Busco: En Venta');
  });

  it('agent notice: new vs updated, buyer link, notes quoted', () => {
    const mail = buildAgentNotice({
      from, name: 'Ana', email: 'ana@x.es', phone: '+34 600', preferredContact: 'whatsapp', isNew: true,
      summary: [], answers: [{ label: 'Purpose', value: 'Holiday home' }], notes: 'Call after 6', buyerUrl: 'https://dash/dashboard/buyers/5',
    });
    expect(mail.subject).toBe('New buyer: Ana');
    expect(mail.html).toContain('https://dash/dashboard/buyers/5');
    expect(mail.text).toContain('Purpose: Holiday home');
    expect(mail.text).toContain('Call after 6');
    expect(buildAgentNotice({ from, name: 'Ana', email: 'a@x', isNew: false, summary: [], answers: [] }).subject).toBe('Updated wishlist: Ana');
  });
});
