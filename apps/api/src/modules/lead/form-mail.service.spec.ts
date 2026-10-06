import { FormMailService } from './form-mail.service';
import type { SystemMailMessage } from '../mail/system-mailer.service';
import type { Tenant } from '../../database/entities';

const flush = () => new Promise((r) => setTimeout(r, 0));

function setup(opts: { ownEmailDomain?: boolean; settings?: Record<string, unknown> } = {}) {
  const sent: SystemMailMessage[] = [];
  const mailer = { send: async (m: SystemMailMessage) => { sent.push(m); return { delivered: true }; } };
  const property = {
    id: 7, reference: 'R123', title: { en: 'Sea view villa', es: 'Villa con vistas' }, price: 450000, priceOnRequest: false,
    currency: 'EUR', listingType: 'sale', bedrooms: 3, bathrooms: 2, images: [{ url: 'https://cdn.example.com/a.webp', order: 0 }],
  };
  const properties = { find: async () => [property], findOne: async () => property };
  const checkins = { find: async () => [{ siteUrl: 'https://staging.cristihomes.com' }] };
  const service = new FormMailService(mailer as never, properties as never, checkins as never);
  const tenant = {
    id: 1, name: 'Cristi Homes SL', domain: null,
    featureFlags: { ownEmailDomain: opts.ownEmailDomain === true },
    settings: {
      companyName: 'Cristi Homes', websiteUrl: 'https://cristihomes.com', formSenderEmail: 'info@cristihomes.com',
      inquiryNotificationEmails: ['agent@cristihomes.com'], ...opts.settings,
    },
  } as unknown as Tenant;
  return { service, tenant, sent, property };
}

describe('FormMailService', () => {
  it('inquiry: agency reply goes to the visitor, confirmation reply to the client, nothing names the platform', async () => {
    const { service, tenant, sent, property } = setup();
    await service.inquiry(tenant, { email: 'buyer@mail.com', name: 'Ana', message: 'Hi', pageUrl: 'https://staging.cristihomes.com/property/x_R123' }, 9, property as never, 'https://staging.cristihomes.com');
    await flush();
    const agency = sent.find((m) => m.to === 'agent@cristihomes.com')!;
    const visitor = sent.find((m) => m.to === 'buyer@mail.com')!;
    expect(agency.replyTo).toBe('buyer@mail.com');
    expect(agency.html).toContain('R123');
    expect(agency.html).toContain('https://staging.cristihomes.com/property/x_R123');
    expect(visitor.replyTo).toBe('info@cristihomes.com');
    for (const m of sent) {
      expect(m.fromName).toBe('Cristi Homes');
      expect(m.fromEmail).toBeUndefined(); // domain not verified yet
      expect(`${m.html}${m.text}${m.subject}`.toLowerCase()).not.toMatch(/spw|spm|smart property/);
    }
  });

  it('sends from the client address once their domain is verified', async () => {
    const { service, tenant, sent, property } = setup({ ownEmailDomain: true });
    await service.inquiry(tenant, { email: 'buyer@mail.com' }, 9, property as never);
    await flush();
    expect(sent.every((m) => m.fromEmail === 'info@cristihomes.com')).toBe(true);
  });

  it('drops a page link that is not on the client site', async () => {
    const { service, tenant, sent, property } = setup();
    await service.inquiry(tenant, { email: 'buyer@mail.com', pageUrl: 'https://evil.example/phish' }, 9, property as never, 'https://evil.example');
    await flush();
    expect(sent.map((m) => m.html).join('')).not.toContain('evil.example');
  });

  it('wishlist: links on the page the visitor used when it is the client site, never elsewhere', async () => {
    const own = setup();
    await own.service.wishlist(own.tenant, { recipientEmail: 'friend@mail.com', senderEmail: 'ana@mail.com', senderName: 'Ana', items: [{ id: 7, path: '/property/villa_R123' }] }, 'https://www.staging.cristihomes.com', 'es');
    await flush();
    const toFriend = own.sent.find((m) => m.to === 'friend@mail.com')!;
    expect(toFriend.html).toContain('https://www.staging.cristihomes.com/property/villa_R123');
    expect(toFriend.html).toContain('Villa con vistas');
    expect(toFriend.replyTo).toBe('ana@mail.com');
    expect(own.sent.some((m) => m.to === 'agent@cristihomes.com' && m.replyTo === 'ana@mail.com')).toBe(true);

    const forged = setup();
    await forged.service.wishlist(forged.tenant, { recipientEmail: 'friend@mail.com', items: [{ id: 7, path: '//evil.example/x' }, { id: 7, path: '/ok' }] }, 'https://evil.example', 'en');
    await flush();
    const html = forged.sent.find((m) => m.to === 'friend@mail.com')!.html;
    expect(html).not.toContain('evil.example');
    // No sender email: no agency notification, reply goes to the client.
    expect(forged.sent.find((m) => m.to === 'friend@mail.com')!.replyTo).toBe('info@cristihomes.com');
    expect(forged.sent.some((m) => m.to === 'agent@cristihomes.com')).toBe(false);
  });
});
