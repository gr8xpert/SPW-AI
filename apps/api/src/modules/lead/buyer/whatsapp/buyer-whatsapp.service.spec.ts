import { BadRequestException, ForbiddenException } from '@nestjs/common';

// The email send imports the PDF renderer (puppeteer, ESM); not needed here.
jest.mock('puppeteer', () => ({}));

import { BuyerWhatsAppService, greet } from './buyer-whatsapp.service';

const viewer = { id: 7, role: 'admin' };
const card = (id: number, ref: string) => ({
  id, reference: ref, agentReference: null, title: { en: `Villa ${ref}` }, slug: null, listingType: 'sale', status: 'active',
  price: 500000, priceTo: null, rentalPeriod: null, currency: 'EUR', priceOnRequest: false,
  bedrooms: 3, bedroomsTo: null, bathrooms: 2, bathroomsTo: null, buildSize: null, buildSizeTo: null, plotSize: null, plotSizeTo: null,
  virtualTourUrl: null, image: null, location: null, propertyType: null,
});

function setup(lead: Record<string, unknown> = {}) {
  const theLead = { id: 5, firstName: 'Ana', lastName: 'Ruiz', mobile: '+34 600 112 233', phone: null, language: 'en', erasedAt: null, unsubscribedAt: null, assignedToUser: { name: 'Sam' }, contact: null, ...lead };
  const tenant = { id: 1, name: 'Conte', settings: { buyerMatch: { propertyUrlPatterns: { default: 'https://site.test/property/{ref}' } } } };
  const deps = {
    tenantRepository: { findOne: jest.fn().mockResolvedValue(tenant) },
    buyers: { get: jest.fn().mockResolvedValue(theLead), log: jest.fn() },
    newLeads: { findNew: jest.fn().mockResolvedValue(theLead), latestForm: jest.fn().mockResolvedValue({ metadata: { reference: 'R1', title: 'Villa', pageUrl: 'https://site.test/r1' } }), setHandled: jest.fn() },
    sender: {
      langOf: jest.fn().mockReturnValue('en'),
      pickProperties: jest.fn().mockResolvedValue({ properties: [card(11, 'R11'), card(12, 'R12')], skipped: [], allSkipped: false }),
    },
    suggestions: { markSent: jest.fn() },
    mail: { labels: jest.fn().mockResolvedValue({ buyer_wa_properties: 'Hi {name}, here are {count} properties:', buyer_wa_follow_up: 'Hi {name}, checking in.', buyer_wa_enquiry: 'Hi {name}, thanks for asking about {property}.' }) },
    formMail: { sender: jest.fn().mockReturnValue({ name: 'Conte Estates' }) },
    tracking: { createSend: jest.fn().mockResolvedValue({ id: 99 }), trackingFor: jest.fn().mockReturnValue({ link: (pid: number) => `https://api.test/t/c/${pid}` }), record: jest.fn() },
    pages: { linkFor: jest.fn().mockResolvedValue('https://site.test/me/abc') },
    viewings: { items: jest.fn() },
    tasks: { listForBuyer: jest.fn().mockResolvedValue([{ id: 3 }]), update: jest.fn() },
  };
  const svc = new BuyerWhatsAppService(
    deps.tenantRepository as never, deps.buyers as never, deps.newLeads as never, deps.sender as never, deps.suggestions as never,
    deps.mail as never, deps.formMail as never, deps.tracking as never, deps.pages as never, deps.viewings as never, deps.tasks as never,
  );
  return { svc, deps };
}

describe('BuyerWhatsAppService', () => {
  it('previews with website links and records nothing', async () => {
    const { svc, deps } = setup();
    const out = await svc.preview(1, viewer, 5, { kind: 'properties', propertyIds: [11, 12] }, 'buyer');
    expect(out.message).toBe('Hi Ana, here are 2 properties:');
    expect(out.text).toContain('*Villa R11* · ');
    expect(out.text).toContain('https://site.test/property/R11');
    expect(out.text).toContain('All your selected properties: https://site.test/me/abc');
    expect(out.text.endsWith('Sam · Conte Estates')).toBe(true);
    expect(out.phones[0].digits).toBe('34600112233');
    expect(deps.tracking.createSend).not.toHaveBeenCalled();
    expect(deps.buyers.log).not.toHaveBeenCalled();
  });

  it('opens with tracked links and records a WhatsApp send', async () => {
    const { svc, deps } = setup();
    const out = await svc.open(1, viewer, 5, { kind: 'properties', propertyIds: [11, 12], message: 'Look at these' }, 'buyer');
    expect(out.url.startsWith('https://wa.me/34600112233?text=')).toBe(true);
    expect(out.text.startsWith('Look at these')).toBe(true);
    expect(out.text).toContain('https://api.test/t/c/11');
    expect(out.text).not.toContain('https://site.test/property/R11');
    expect(deps.tracking.createSend).toHaveBeenCalledWith(expect.objectContaining({ channel: 'whatsapp', recipient: 'buyer', propertyIds: [11, 12] }));
    expect(deps.suggestions.markSent).toHaveBeenCalledWith(1, 7, 5, [11, 12]);
    expect(deps.tracking.record).toHaveBeenCalledWith(expect.objectContaining({ event: 'sent', source: 'whatsapp', sendId: 99 }));
    expect(deps.buyers.log).toHaveBeenCalledWith(5, 7, 'suggestion_sent', 'R11, R12', expect.objectContaining({ channel: 'whatsapp', sendId: 99 }), true);
  });

  it('uses a typed-in number over the contact one', async () => {
    const { svc } = setup();
    const out = await svc.open(1, viewer, 5, { kind: 'follow_up', phone: '0044 7700 900123' }, 'buyer');
    expect(out.url.startsWith('https://wa.me/447700900123?')).toBe(true);
  });

  it('refuses without any phone number', async () => {
    const { svc } = setup({ mobile: null, phone: null });
    await expect(svc.open(1, viewer, 5, { kind: 'follow_up' }, 'buyer')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses an erased buyer', async () => {
    const { svc } = setup({ erasedAt: new Date() });
    await expect(svc.preview(1, viewer, 5, { kind: 'follow_up' }, 'buyer')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('logs a follow-up and ticks the task off when asked', async () => {
    const { svc, deps } = setup();
    await svc.open(1, viewer, 5, { kind: 'follow_up', taskId: 3, markTaskDone: true }, 'buyer');
    expect(deps.buyers.log).toHaveBeenCalledWith(5, 7, 'whatsapp', 'Hi Ana, checking in.', expect.objectContaining({ kind: 'follow_up', taskId: 3 }), true);
    expect(deps.tasks.update).toHaveBeenCalledWith(1, viewer, 3, { done: true });
  });

  it('replies to an enquiry from New Leads and marks it handled', async () => {
    const { svc, deps } = setup();
    const out = await svc.open(1, viewer, 5, { kind: 'enquiry', markHandled: true }, 'newLead');
    expect(out.text).toContain('Hi Ana, thanks for asking about R1 · Villa.');
    expect(out.text).toContain('https://site.test/r1');
    expect(deps.newLeads.setHandled).toHaveBeenCalledWith(1, viewer, 5, true);
    expect(deps.buyers.get).not.toHaveBeenCalled();
  });

  it('only sends enquiry replies from New Leads', async () => {
    const { svc } = setup();
    await expect(svc.preview(1, viewer, 5, { kind: 'properties', propertyIds: [11] }, 'newLead')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('greet', () => {
  it('drops the name slot when the name is unknown', () => {
    expect(greet('Hi {name}, here are {count}:', null, { count: 2 })).toBe('Hi, here are 2:');
    expect(greet('Hola {name}, aquí', 'Ana', {})).toBe('Hola Ana, aquí');
  });
});
