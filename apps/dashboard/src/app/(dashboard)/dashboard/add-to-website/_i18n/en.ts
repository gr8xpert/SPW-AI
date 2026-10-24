// Add to Website (embed builder), English. Every other language must have the
// same keys. Code snippets, shortcodes and data-spm-* attributes stay as they
// are in the page: people copy them.
export const en = {
  title: 'Add to your website',
  description: 'Choose what to show, set the filters, then copy the code. Works on WordPress, Wix, Squarespace, Webflow, Next.js or any website.',

  mapOff: 'Map search is not switched on for your account, so map blocks don’t show on your website. Contact us to add it.',
  blocks: {
    search: 'Search form',
    listing: 'Property results',
    map: 'Map search',
    detail: 'Property page',
    wishlist: 'Saved properties',
    carousel: 'Carousel',
  },
  carouselDesigns: ['Centre focus', '3D perspective', 'Coverflow', 'Full width', 'Tilted', 'Dark numbered cards'],
  sorts: {
    default: 'Default',
    newest: 'Newest first',
    price_desc: 'Price: high to low',
    price_asc: 'Price: low to high',
    oldest: 'Oldest first',
    updated: 'Most up to date',
    ref: 'Reference',
  } as Record<string, string>,
  listingTypes: {
    any: 'Any',
    sale: 'For sale',
    rent: 'For rent',
    holiday: 'Holiday rental',
    'new-development': 'New development',
  } as Record<string, string>,

  step1: '1. What to show',
  design: 'Design',
  designFromSettings: 'The one chosen in Website Design',
  designN: (n: number) => `Design ${n}`,

  step2: '2. Filters (optional)',
  step2Description: 'Everything is picked from your own lists, so the code gets the right IDs.',
  location: 'Location',
  propertyType: 'Property type',
  for: 'For',
  sort: 'Sort',
  any: 'Any',
  bedsMin: 'Bedrooms (at least)',
  bathsMin: 'Bathrooms (at least)',
  priceFrom: 'Price from',
  priceTo: 'Price up to',
  howMany: 'How many to show',
  refs: 'Hand-picked properties (reference numbers)',
  refsHelp: 'Shows exactly these properties in this order (up to 50), as their own list. The other filters still apply, so leave them empty to show every one.',
  features: 'Features',
  autoplay: 'Turn by itself every 5 seconds',
  carouselNote: 'A carousel shows its own properties and never changes the page’s search.',
  fixed: 'Visitors cannot change these filters',
  standalone: 'This block searches on its own (for several different lists on one page)',

  preview: 'Preview',
  step3: '3. Copy the code',
  step3Description: 'Pick your website type.',
  anyWebsite: 'Any website',
  copy: 'Copy',

  wpNote: 'With the SPM plugin installed, paste this into any page, Divi module or Elementor widget.',
  wpNoPlugin: 'No plugin yet? SPM → Setup in WordPress after installing it. The plugin also gives you tidy property addresses and Google-ready page titles.',
  html1: '1. Once per site, in the page header (replace YOUR_API_KEY):',
  html2: '2. Where the properties should appear:',
  html3: '3. Once per page, just before </body>:',
  wixBefore: 'Wix: ',
  wixMenu: 'Add → Embed code → Embed HTML',
  wixAfter: ', then paste everything below into the box and set the block to full width.',
  wixPagesBefore: 'Property pages: add one page with the Property page block and let it read ',
  wixPagesAfter: ' from the address.',
  sqBefore: 'Squarespace: add a ',
  sqBlock: 'Code block',
  sqAfter: ' and paste this.',
  nextIntro:
    'Next.js (App Router): ask us for the SPM Next.js kit — property pages with full SEO (titles, Google preview, structured data, sitemap) and instant page changes. Without it, this is the minimum:',
  next1: '1. app/spm.tsx — then put <Spm /> once at the end of <body> in app/layout.tsx:',
  next2: '2. In any page, where the properties should appear (property pages: app/property/[slug]/page.tsx):',

  guidesTitle: 'Setup guides',
  guidesDescription: 'What each website type needs, and what you get for Google.',
  colWebsite: 'Website',
  colHow: 'How to add it',
  colSeo: 'Google / SEO',
  guides: {
    wordpress: {
      platform: 'WordPress (best)',
      steps: 'Install the SPM plugin, run Setup, then place shortcodes like [spm_listing].',
      seo: 'Full: tidy property addresses, page titles, Google preview tags and a property sitemap, all from your SEO fields.',
    },
    next: {
      platform: 'Next.js',
      steps: 'Use the SPM Next.js kit (ask us): one component in the layout, blocks in any page, a property page at /property/[slug].',
      seo: 'Full: per-property titles, descriptions, Google preview tags, structured data and a property sitemap, all rendered on the server.',
    },
    wix: {
      platform: 'Wix',
      steps: 'Add → Embed code → Embed HTML, paste the snippet. One page per block; property pages read ?ref= from the address.',
      seo: 'Partial: properties are found and indexed, but Wix does not allow per-property titles in the page source.',
    },
    squarespace: {
      platform: 'Squarespace / Webflow',
      steps: 'Add a Code block (Squarespace) or an Embed element (Webflow) and paste the snippet.',
      seo: 'Partial, as with Wix.',
    },
  },
};

export type AddToWebsiteText = typeof en;
