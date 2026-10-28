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

const sam = { id: 8, name: 'Sam', email: 'sam@conte.test', phone: '+34 611 222 333', whatsapp: null, publicEmail: null };

function setup(lead: Record<string, unknown> = {}, agent: Record<string, unknown> | null = sam) {
  const theLead = { id: 5, firstName: 'Ana', lastName: 'Ruiz', mobile: '+34 600 112 233', phone: null, language: 'en', erasedAt: null, unsubscribedAt: null, assignedTo: 8, assignedToUser: { name: 'Sam' }, contact: null, ...lead };
  const tenant = { id: 1, name: 'Conte', settings: { buyerMatch: { propertyUrlPatterns: { default: 'https://site.test/property/{ref}' } } } };
  const deps = {
    tenantRepository: { findOne: jest.fn().mockResolvedValue(tenant) },
    userRepository: { findOne: jest.fn().mockResolvedValue(agent) },
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
    calendly: { linkForLead: jest.fn().mockResolvedValue({ url: 'https://calendly.com/sam/viewing?utm_content=spm5x0123456789', agent: 'Sam' }) },
  };
  const svc = new BuyerWhatsAppService(
    deps.tenantRepository as never, deps.userRepository as never, deps.buyers as never, deps.newLeads as never, deps.sender as never, deps.suggestions as never,
    deps.mail as never, deps.formMail as never, deps.tracking as never, deps.pages as never, deps.viewings as never, deps.tasks as never,
    deps.calendly as never,
  );
  return { svc, deps };
}

describe('BuyerWhatsAppService', () => {
  it('adds the Calendly booking line only when asked, and says when one is available', async () => {
    const { svc } = setup();
    const without = await svc.preview(1, viewer, 5, { kind: 'follow_up' }, 'buyer');
    expect(without.bookingAvailable).toBe(true);
    expect(without.text).not.toContain('calendly.com');
    const withIt = await svc.preview(1, viewer, 5, { kind: 'follow_up', withBooking: true }, 'buyer');
    expect(withIt.text).toContain('Pick a time that suits you: https://calendly.com/sam/viewing');
    const props = await svc.preview(1, viewer, 5, { kind: 'properties', propertyIds: [11], withBooking: true }, 'buyer');
    expect(props.bookingAvailable).toBe(false);
  });

  it('previews with website links and records nothing', async () => {
    const { svc, deps } = setup();
    const out = await svc.preview(1, viewer, 5, { kind: 'properties', propertyIds: [11, 12] }, 'buyer');
    expect(out.message).toBe('Hi Ana, here are 2 properties:');
    expect(out.text).toContain('*Villa R11* · ');
    expect(out.text).toContain('https://site.test/property/R11');
    expect(out.text).toContain('All your selected properties: https://site.test/me/abc');
    expect(out.text.endsWith('Sam\n📱 https://wa.me/34611222333\n✉️ sam@conte.test')).toBe(true);
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

  it('signs with the agent WhatsApp number and public email, never a no-login placeholder', async () => {
    const { svc } = setup({}, { ...sam, whatsapp: '0034 699 000 111', email: 'agent-1-0123456789ab@no-login.invalid' });
    const out = await svc.preview(1, viewer, 5, { kind: 'follow_up' }, 'buyer');
    expect(out.text.endsWith('Sam\n📱 https://wa.me/34699000111')).toBe(true);
    const pub = await setup({}, { ...sam, publicEmail: 'sales@conte.test' }).svc.preview(1, viewer, 5, { kind: 'follow_up' }, 'buyer');
    expect(pub.text).toContain('✉️ sales@conte.test');
    expect(pub.text).not.toContain('sam@conte.test');
  });

  it('signs as the sender when the lead has no agent yet', async () => {
    const { svc, deps } = setup({ assignedTo: null, assignedToUser: null });
    await svc.preview(1, viewer, 5, { kind: 'enquiry' }, 'newLead');
    expect(deps.userRepository.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 7, tenantId: 1 } }));
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
