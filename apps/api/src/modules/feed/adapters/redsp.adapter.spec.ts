import axios from 'axios';
import { RedspAdapter } from './redsp.adapter';

// Trimmed from a real RedSP v4 feed (2026-10-09).
const unit = (id: string, ref: string, extra = '') => `
<property>
<id>${id}</id>
<date>2026-10-06 16:55:57</date>
<ref>${ref}</ref>
<development_ref>P02184</development_ref>
<price>1775000</price>
<price_to>0</price_to>
<currency>EUR</currency>
<price_freq>sale</price_freq>
<new_build>1</new_build>
<type>town house</type>
<address>
<address_detail>C/Molino Hundido</address_detail>
<address_number>20</address_number>
<postal_code>29017</postal_code>
<town>Málaga</town>
<province>Málaga</province>
</address>
<costa>Costa del Sol</costa>
<country>Spain</country>
<location><latitude>36.72449858437059</latitude><longitude>-4.366797337966845</longitude></location>
<location_detail_1>Pedregalejo</location_detail_1>
<location_detail_2/>
<beds>3</beds>
<baths>2</baths>
<key_ready>0</key_ready>
<delivery_date>2026-12-01</delivery_date>
<year_build>2026</year_build>
<category><urban>0</urban><beach>1</beach><golf>0</golf><countryside>0</countryside><first_line>0</first_line></category>
<views><sea_views>1</sea_views><mountain_views>0</mountain_views></views>
<pools><pool>1</pool><communal_pool>1</communal_pool><private_pool>0</private_pool></pools>
<parking><number_of_parking_spaces>2</number_of_parking_spaces><number_of_garage_spaces>0</number_of_garage_spaces></parking>
<surface_area><built_m2>286</built_m2><terrace_m2>87</terrace_m2><garden_m2>0</garden_m2><plot_m2>0</plot_m2></surface_area>
<energy_rating><consumption>A</consumption><emissions>A</emissions></energy_rating>
<title>
<en><![CDATA[New Build Townhouses Near Pedregalejo Beach in Malaga]]></en>
<es><![CDATA[Adosados de nueva construcción cerca de la playa de Pedregalejo, en Málaga]]></es>
<nl><![CDATA[]]></nl>
</title>
<desc>
<en><![CDATA[First line&#13;&#13;&#13;&#13;Second line&#13;Third]]></en>
<es><![CDATA[Primera]]></es>
</desc>
<features><Air_Conditioning>0</Air_Conditioning><gated>1</gated><storage>1</storage><solarium>1</solarium></features>
<extra_features><feature/></extra_features>
<images>
<image id="1"><tags><tag>floorplan</tag></tags><url>https://fotos15.apinmo.com/7515/30435617/50-17.jpg</url></image>
<image id="2"><url>https://fotos15.apinmo.com/7515/30435617/50-1.jpg</url></image>
<image id="3"><url>https://fotos15.apinmo.com/7515/30435617/50-2.jpg</url></image>
</images>
<media><videos></videos><virtual_tour></virtual_tour></media>
${extra}
</property>`;

const feed = (n: number) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<root>\n<redsp><feed_version>4</feed_version></redsp>` +
  Array.from({ length: n }, (_, i) => unit(`1089-119-10-${i + 1}`, `SP${1900 + i}`)).join('') +
  '\n</root>';

describe('RedspAdapter', () => {
  const creds = { endpoint: 'https://xml.redsp.net/files/924/test/spark-redsp_v4.xml' };
  let get: jest.SpyInstance;

  afterEach(() => get?.mockRestore());

  it('maps a v4 unit', async () => {
    get = jest.spyOn(axios, 'get').mockResolvedValue({ data: feed(1) });
    const { properties, totalCount, hasMore } = await new RedspAdapter().fetchProperties(creds, 1, 100);
    expect(totalCount).toBe(1);
    expect(hasMore).toBe(false);
    const p = properties[0];
    expect(p).toMatchObject({
      externalId: '1089-119-10-1',
      reference: 'SP1900',
      listingType: 'development',
      propertyType: 'town house',
      price: 1775000,
      priceOnRequest: false,
      currency: 'EUR',
      bedrooms: 3,
      bathrooms: 2,
      buildSize: 286,
      terraceSize: 87,
      postcode: '29017',
      lat: 36.72449858437059,
      lng: -4.366797337966845,
      deliveryDate: '2026-12-01',
      builtYear: 2026,
      keyReady: false,
      energyRating: 'A',
      location: {
        name: 'Pedregalejo',
        province: 'Málaga',
        area: 'Costa del Sol',
        municipality: 'Málaga',
        town: 'Málaga',
        urbanization: 'Pedregalejo',
        country: 'Spain',
      },
    });
    expect(p.priceTo).toBeUndefined();
    expect(p.plotSize).toBeUndefined();
    expect(p.gardenSize).toBeUndefined();
    expect(p.videoUrl).toBeUndefined();
    expect(p.title).toEqual({
      en: 'New Build Townhouses Near Pedregalejo Beach in Malaga',
      es: 'Adosados de nueva construcción cerca de la playa de Pedregalejo, en Málaga',
    });
    expect(p.description.en).toBe('First line\n\nSecond line\nThird');
    expect(p.features).toEqual([
      'Gated Complex', 'Solarium', 'Storage Room', 'Sea Views', 'Communal Pool', 'Close To Beach', 'Private Parking',
    ]);
    expect(p.featureCategories).toMatchObject({ 'gated complex': 'security', 'sea views': 'views', 'private parking': 'parking' });
    // Floor plan moves behind the photos.
    expect(p.images.map((i) => [i.url.split('/').pop(), i.order, i.alt])).toEqual([
      ['50-1.jpg', 0, undefined],
      ['50-2.jpg', 1, undefined],
      ['50-17.jpg', 2, 'Floor plan'],
    ]);
  });

  it('downloads the file once per run, whatever the number of pages', async () => {
    get = jest.spyOn(axios, 'get').mockResolvedValue({ data: feed(5) });
    const adapter = new RedspAdapter();
    const refs: string[] = [];
    let page = 1;
    let more = true;
    while (more) {
      const r = await adapter.fetchProperties(creds, page++, 2);
      expect(r.totalCount).toBe(5);
      refs.push(...r.properties.map((p) => p.reference));
      more = r.hasMore;
    }
    expect(refs).toEqual(['SP1900', 'SP1901', 'SP1902', 'SP1903', 'SP1904']);
    expect(get).toHaveBeenCalledTimes(1);
    // The next run downloads fresh.
    await adapter.fetchProperties(creds, 1, 2);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('needs a feed URL', async () => {
    await expect(new RedspAdapter().validateCredentials({})).resolves.toMatchObject({ valid: false });
    await expect(new RedspAdapter().fetchProperties({})).rejects.toThrow(/feed URL/);
  });
});
