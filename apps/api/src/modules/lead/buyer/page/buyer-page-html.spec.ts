import { buildBuyerPageHtml, type BuyerPageView } from './buyer-page-html';

const view: BuyerPageView = {
  lang: 'en',
  agency: { name: 'Costa <Homes>', logo: 'https://cdn.example/logo.png', color: '#123456', website: 'https://costa.example' },
  buyer: { firstName: 'Ann' },
  agent: { name: 'Alex Agent', email: 'alex@costa.example', phone: null },
  properties: [
    {
      id: 7,
      reference: 'LT-1',
      title: 'Villa <script>alert(1)</script>',
      place: 'Marbella',
      facts: '3 bed · 2 bath',
      price: '€450,000',
      image: 'https://cdn.example/1.webp',
      url: 'https://costa.example/en/property/villa_LT-1',
      urlSegment: 'villa_LT-1',
      state: { liked: true, rejected: false, rejectReason: null, viewing: false },
    },
  ],
};

describe('buildBuyerPageHtml', () => {
  const html = buildBuyerPageHtml(view, { labels: {}, feedbackUrl: 'https://api.example/api/v1/buyer-page/AbCdE12345/feedback' });

  it('is hidden from search engines', () => {
    expect(html).toContain('<meta name="robots" content="noindex,nofollow">');
  });

  it('escapes every client and buyer text', () => {
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('Villa &lt;script&gt;');
    expect(html).toContain('Costa &lt;Homes&gt;');
  });

  it('greets by first name and shows the agency branding', () => {
    expect(html).toContain('Hello Ann');
    expect(html).toContain('src="https://cdn.example/logo.png"');
    expect(html).toContain('#123456');
  });

  it('has the three actions per property and the current state', () => {
    expect(html).toContain('data-property="7"');
    expect(html).toContain('data-action="like"');
    expect(html).toContain('data-action="reject"');
    expect(html).toContain('data-action="viewing"');
    expect(html).toMatch(/data-liked="1"/);
    expect(html).toContain('href="https://costa.example/en/property/villa_LT-1"');
  });

  it('posts to the feedback URL it was given', () => {
    expect(html).toContain('https://api.example/api/v1/buyer-page/AbCdE12345/feedback');
  });

  it('shows the empty message when nothing was sent', () => {
    const empty = buildBuyerPageHtml({ ...view, properties: [] }, { labels: {}, feedbackUrl: 'x' });
    expect(empty).toContain('There are no properties here yet.');
  });

  it('uses the labels in the buyer language', () => {
    const es = buildBuyerPageHtml({ ...view, lang: 'es' }, { labels: { buyer_page_like: 'Me gusta' }, feedbackUrl: 'x' });
    expect(es).toContain('lang="es"');
    expect(es).toContain('Me gusta');
  });
});

describe('buildBuyerPageHtml inactive', () => {
  it('says the link is not active', () => {
    const html = buildBuyerPageHtml(null, { labels: {}, feedbackUrl: '' });
    expect(html).toContain('This link is no longer active');
    expect(html).toContain('noindex');
  });
});
