import axios from 'axios';
import { KyeroAdapter } from './kyero.adapter';

// Trimmed from a real Kyero v3 feed (morairainvest.com, 2026-10-12). The
// generator writes every non-ASCII character as a numeric entity.
const property = (id: string, ref: string, extra = '') => `
<property>
<id>${id}</id>
<date>2025-10-31 11:37:03</date>
<ref>${ref}</ref>
<price>2250000</price>
<currency>EUR</currency>
<price_freq>sale</price_freq>
<new_build>1</new_build>
<type>villa</type>
<town>J&#xE1;vea</town>
<province>Alicante</province>
<location><latitude>38.7894</latitude><longitude>0.1662</longitude></location>
<location_detail>J&#xE1;vea</location_detail>
<beds>3</beds>
<baths>2</baths>
<pool>1</pool>
<surface_area><built>415</built><plot>817</plot></surface_area>
<energy_rating><consumption>B</consumption><emissions>B</emissions></energy_rating>
<url><en>https://www.morairainvest.com/property/villa-${ref}/</en></url>
<video_url>https://www.youtube.com/watch?v=9nlxuhTYhSQ</video_url>
<desc>
<es>Villa con ba&#xF1;o compartido. Precio 2.250.000 &#x20AC;.</es>
<en>Villa with four levels.&#13;&#13;The main floor features a large living area.&#13;Sea views.</en>
<de></de>
</desc>
<features>
<feature>air conditioning centralised</feature>
<feature>construction year: 2016</feature>
<feature>urbanization: Canor</feature>
<feature>near the beach</feature>
</features>
<images>
<image id="1"><tags><tag>floorplan</tag></tags><url>https://www.morairainvest.com/objetos/${id}/plan.jpeg</url></image>
<image id="2"><url>https://www.morairainvest.com/objetos/${id}/IMG_7388.jpeg</url></image>
<image id="3"><url>https://www.morairainvest.com/objetos/${id}/10898DA-606.jpeg</url></image>
</images>
${extra}
</property>`;

const feed = (n: number, body?: string) =>
  `<?xml version="1.0"?>\n<root><kyero><feed_version>3</feed_version></kyero>` +
  (body ?? Array.from({ length: n }, (_, i) => property(`6258${10 + i}`, `${10898 + i}DA`)).join('')) +
  '\n</root>';

const map = (raw: Record<string, unknown>) => (new KyeroAdapter() as any).mapProperty({ id: '1', ...raw });

describe('KyeroAdapter', () => {
  const creds = { endpoint: 'https://www.morairainvest.com/feed/kyero/ver/casas-costa-blanca/' };
  let get: jest.SpyInstance;

  afterEach(() => get?.mockRestore());

  it('finds the listings behind the <kyero> version header', async () => {
    get = jest.spyOn(axios, 'get').mockResolvedValue({ status: 200, data: feed(3) });
    const { properties, totalCount } = await new KyeroAdapter().fetchProperties(creds, 1, 100);
    expect(totalCount).toBe(3);
    expect(properties.map((p) => p.externalId)).toEqual(['625810', '625811', '625812']);
  });

  it('maps a v3 property', async () => {
    get = jest.spyOn(axios, 'get').mockResolvedValue({ status: 200, data: feed(1) });
    const { properties } = await new KyeroAdapter().fetchProperties(creds, 1, 100);
    const p = properties[0];
    expect(p).toMatchObject({
      externalId: '625810',
      reference: '10898DA',
      listingType: 'development',
      propertyType: 'villa',
      price: 2250000,
      priceOnRequest: false,
      currency: 'EUR',
      bedrooms: 3,
      bathrooms: 2,
      buildSize: 415,
      plotSize: 817,
      lat: 38.7894,
      lng: 0.1662,
      videoUrl: 'https://www.youtube.com/watch?v=9nlxuhTYhSQ',
      energyRating: 'B',
      builtYear: 2016,
      location: {
        name: 'Canor',
        province: 'Alicante',
        municipality: 'Jávea',
        town: 'Jávea',
        urbanization: 'Canor',
        country: 'Spain',
      },
    });
    expect(p.rentalPeriod).toBeUndefined();
    expect(p.virtualTourUrl).toBeUndefined();
    expect(p.title).toEqual({ en: 'Villa in Jávea' });
    expect(p.description).toEqual({
      es: 'Villa con baño compartido. Precio 2.250.000 €.',
      en: 'Villa with four levels.\n\nThe main floor features a large living area.\nSea views.',
    });
    expect(p.features).toEqual(['air conditioning centralised', 'near the beach', 'Pool']);
    expect(p.featureCategories).toEqual({ pool: 'community' });
    // Floor plan moves behind the photos.
    expect(p.images.map((i) => [i.url.split('/').pop(), i.order, i.alt])).toEqual([
      ['IMG_7388.jpeg', 0, undefined],
      ['10898DA-606.jpeg', 1, undefined],
      ['plan.jpeg', 2, 'Floor plan'],
    ]);
  });

  it('decodes a feed with thousands of numeric entities', async () => {
    // The real feed writes every accent as &#x..; (about 3,900 in 65 listings);
    // the parser's default expansion cap is 1,000.
    const desc = `<desc><en>${'Jard&#xED;n con ba&#xF1;o. '.repeat(800)}</en></desc>`;
    get = jest.spyOn(axios, 'get').mockResolvedValue({ status: 200, data: feed(1, property('1', 'R1').replace(/<desc>[\s\S]*<\/desc>/, desc)) });
    const { properties } = await new KyeroAdapter().fetchProperties(creds, 1, 100);
    expect(properties[0].description.en.startsWith('Jardín con baño.')).toBe(true);
  });

  it('treats a line-break entity without its semicolon as a line break', async () => {
    // Two morairainvest listings write "&amp;#13" with no ";" ("…principales&#134 amplios…").
    const desc = '<desc><es>Caracter&#xED;sticas principales&amp;#134 amplios dormitorios&amp;#13Parcela 1.067 m&#xB2;</es></desc>';
    get = jest.spyOn(axios, 'get').mockResolvedValue({ status: 200, data: feed(1, property('1', 'R1').replace(/<desc>[\s\S]*<\/desc>/, desc)) });
    const { properties } = await new KyeroAdapter().fetchProperties(creds, 1, 100);
    expect(properties[0].description.es).toBe('Características principales\n4 amplios dormitorios\nParcela 1.067 m²');
  });

  it('keeps a reference with leading zeros as text', () => {
    expect(map({ id: '007', ref: '00123' })).toMatchObject({ externalId: '007', reference: '00123' });
  });

  it('reads the listing type from price_freq and new_build', () => {
    expect(map({ price: '1200', price_freq: 'month' })).toMatchObject({ listingType: 'rent', rentalPeriod: 'month' });
    expect(map({ price: '900', price_freq: 'week' })).toMatchObject({ listingType: 'rent', rentalPeriod: 'week' });
    expect(map({ price: '250000', price_freq: 'sale' })).toMatchObject({ listingType: 'sale' });
    expect(map({ price: '250000', price_freq: 'sale', new_build: '1' })).toMatchObject({ listingType: 'development' });
    expect(map({ price: '250000', price_freq: 'sale', new_build: '0' })).toMatchObject({ listingType: 'sale' });
  });

  it('marks a missing or zero price as on request', () => {
    expect(map({ price: '0', price_freq: 'sale' })).toMatchObject({ price: null, priceOnRequest: true });
    expect(map({ price_freq: 'sale' })).toMatchObject({ price: null, priceOnRequest: true });
  });

  it('does not turn a location_detail equal to the town into an urbanization', () => {
    const p = map({ town: 'Moraira', location_detail: 'Moraira' });
    expect(p.location).toMatchObject({ name: 'Moraira', town: 'Moraira' });
    expect(p.location.urbanization).toBeUndefined();
    const q = map({ town: 'Moraira', location_detail: 'Benimeit' });
    expect(q.location).toMatchObject({ name: 'Benimeit', town: 'Moraira', urbanization: 'Benimeit' });
  });

  it('uses the feed title when one is sent', () => {
    expect(map({ type: 'villa', town: 'Moraira', title: { en: 'Sea view villa', es: 'Villa con vistas' } }).title)
      .toEqual({ en: 'Sea view villa', es: 'Villa con vistas' });
  });

  it('does not add Pool twice', () => {
    expect(map({ pool: '1', features: { feature: ['private pool'] } }).features).toEqual(['private pool']);
    expect(map({ pool: '0', features: { feature: ['garden'] } }).features).toEqual(['garden']);
  });

  it('reads features sent per language (IPP Spain CRM)', () => {
    expect(map({ features: { feature: [{ en: 'Lift', es: 'Ascensor' }, { es: 'Garaje' }, 'Garden'] } }).features)
      .toEqual(['Lift', 'Garaje', 'Garden']);
  });

  it('downloads the file once per run, whatever the number of pages', async () => {
    get = jest.spyOn(axios, 'get').mockResolvedValue({ status: 200, data: feed(5) });
    const adapter = new KyeroAdapter();
    const refs: string[] = [];
    let page = 1;
    let more = true;
    while (more) {
      const r = await adapter.fetchProperties(creds, page++, 2);
      expect(r.totalCount).toBe(5);
      refs.push(...r.properties.map((p) => p.reference));
      more = r.hasMore;
    }
    expect(refs).toEqual(['10898DA', '10899DA', '10900DA', '10901DA', '10902DA']);
    expect(get).toHaveBeenCalledTimes(1);
    await adapter.fetchProperties(creds, 1, 2);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('refuses internal addresses, also behind a redirect', async () => {
    get = jest.spyOn(axios, 'get');
    await expect(new KyeroAdapter().fetchProperties({ endpoint: 'http://127.0.0.1:3001/x.xml' })).rejects.toThrow(/not allowed/);
    await expect(new KyeroAdapter().validateCredentials({ endpoint: 'http://169.254.169.254/latest' }))
      .resolves.toEqual({ valid: false, error: 'Kyero: feed URL not allowed' });
    expect(get).not.toHaveBeenCalled();
    get.mockResolvedValueOnce({ status: 302, headers: { location: 'http://10.0.0.5/feed.xml' }, data: '' });
    await expect(new KyeroAdapter().fetchProperties({ endpoint: 'https://www.morairainvest.com/r.xml' })).rejects.toThrow(/not allowed/);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('needs a feed URL', async () => {
    await expect(new KyeroAdapter().validateCredentials({})).resolves.toMatchObject({ valid: false });
    await expect(new KyeroAdapter().fetchProperties({})).rejects.toThrow(/feed URL/);
  });
});
