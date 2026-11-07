import { composeDesign, type Composition } from './sections';

// The starter designs: each one a theme and a list of sections, ready to send
// once the client has picked listings. Colours, contact details and logo come
// from placeholders, so every client's version is their own.

export type LayoutName =
  | 'luxury' | 'modern' | 'minimal' | 'newsletter' | 'new-listing' | 'open-house'
  | 'magazine' | 'showcase' | 'price-reduced' | 'market-report' | 'meet-agency' | 'coastal';

interface LayoutSource extends Composition {
  name: LayoutName;
  subject: string;
}

const SOURCES: LayoutSource[] = [
  {
    name: 'luxury',
    subject: 'Exceptional homes, selected for you',
    theme: 'midnight',
    sections: ['logo-center', 'hero-photo', 'lead-details', 'grid-others', 'contact-agency'],
    copy: { moreTitle: 'Also in our private collection' },
  },
  {
    name: 'modern',
    subject: 'New properties for you, {{contact.first_name}}',
    theme: 'bright',
    sections: ['logo-phone', 'hero-text', 'grid-all', 'cta-center', 'contact-card'],
    copy: { kicker: 'New this week', headline: 'Homes we think you will love', intro: 'Hi {{contact.first_name}}, here are the latest listings our clients ask about most.' },
  },
  {
    name: 'minimal',
    subject: 'A short selection for you',
    theme: 'editorial',
    sections: ['logo-left', 'hero-text', 'rows-all', 'cta-center'],
    copy: { kicker: '{{agency.name}}', headline: 'A short selection', intro: 'Hello {{contact.first_name}}, a few homes worth a look.' },
  },
  {
    name: 'newsletter',
    subject: 'Our monthly property update',
    theme: 'classic',
    sections: ['logo-brand', 'hero-text', 'text-block', 'lead-split', 'rows-others', 'three-points', 'cta-band'],
    copy: {
      kicker: 'Monthly update',
      headline: 'What is happening in the market',
      intro: 'Hi {{contact.first_name}}, a quick look at the month and the homes our team recommends.',
      body: 'Write two or three short paragraphs here about prices, new developments or tips for buyers.',
      moreTitle: 'Also new this month',
    },
  },
  {
    name: 'new-listing',
    subject: 'Just listed: {{agency.name}}',
    theme: 'bright',
    sections: ['logo-center', 'hero-photo', 'lead-details', 'text-block', 'grid-others', 'contact-card'],
    copy: {
      body: 'Hi {{contact.first_name}}, this home has just come on the market and we wanted you to see it first.',
      moreTitle: 'You may also like',
    },
  },
  {
    name: 'open-house',
    subject: 'You are invited: open house',
    theme: 'classic',
    sections: ['logo-center', 'hero-band', 'text-block', 'lead-feature', 'cta-center', 'contact-card'],
    copy: {
      kicker: 'Open house',
      headline: 'Come and see it in person',
      intro: 'Hi {{contact.first_name}}, join us for a viewing. No appointment needed.',
      body: 'Saturday, 10:00 to 14:00. Write the address here.',
      cta: 'Reply to book a time',
      ctaUrl: 'mailto:{{agency.email}}',
    },
  },
  {
    name: 'magazine',
    subject: 'This month’s selection from {{agency.name}}',
    theme: 'editorial',
    sections: ['logo-center', 'hero-center', 'lead-feature', 'divider', 'grid-others', 'contact-agency'],
    copy: {
      kicker: 'The selection',
      headline: 'Homes with a story',
      intro: 'Dear {{contact.first_name}}, this month’s favourites from our team.',
      moreTitle: 'More from this edition',
    },
  },
  {
    name: 'showcase',
    subject: 'One home worth seeing',
    theme: 'terracotta',
    sections: ['logo-left', 'hero-photo', 'lead-details', 'three-points', 'cta-band'],
    copy: {
      points: [
        { title: 'The setting', text: 'Write one line about the location here.' },
        { title: 'The home', text: 'Write one line about what makes it special.' },
        { title: 'The next step', text: 'Write one line about viewings or timing.' },
      ],
      cta: 'Book a viewing',
      ctaUrl: 'mailto:{{agency.email}}',
    },
  },
  {
    name: 'price-reduced',
    subject: 'Price reduced: homes worth a second look',
    theme: 'classic',
    sections: ['logo-phone', 'hero-band', 'lead-split', 'rows-others', 'contact-card'],
    copy: {
      kicker: 'Price reduced',
      headline: 'Worth a second look',
      intro: 'Hi {{contact.first_name}}, these homes have just come down in price.',
      moreTitle: 'More new prices',
    },
  },
  {
    name: 'market-report',
    subject: 'The market in brief',
    theme: 'bright',
    sections: ['logo-left', 'hero-text', 'text-block', 'three-points', 'grid-all', 'cta-center'],
    copy: {
      kicker: 'Market report',
      headline: 'The market in brief',
      intro: 'Hi {{contact.first_name}}, what we are seeing in the area right now.',
      body: 'Write your view of the market here: prices, demand, what buyers should know.',
      points: [
        { title: 'Prices', text: 'Write one line about prices.' },
        { title: 'Demand', text: 'Write one line about demand.' },
        { title: 'Our advice', text: 'Write one line of advice.' },
      ],
    },
  },
  {
    name: 'meet-agency',
    subject: 'Nice to meet you, {{contact.first_name}}',
    theme: 'terracotta',
    sections: ['logo-center', 'hero-center', 'three-points', 'stack-all', 'cta-band'],
    copy: {
      kicker: 'Welcome',
      headline: 'Nice to meet you',
      intro: 'Hello {{contact.first_name}}, thank you for getting in touch. Here is how we help, and a few homes to start with.',
    },
  },
  {
    name: 'coastal',
    subject: 'Homes by the sea',
    theme: 'coast',
    sections: ['logo-brand', 'hero-photo', 'lead-details', 'grid-others', 'cta-band'],
    copy: { moreTitle: 'More homes near the water' },
  },
];

export const LAYOUTS: { name: LayoutName; subject: string; html: string }[] = SOURCES.map((s) => ({
  name: s.name,
  subject: s.subject,
  html: composeDesign(s),
}));

export function layoutByName(name: string): { name: LayoutName; subject: string; html: string } | null {
  return LAYOUTS.find((l) => l.name === name) ?? null;
}
