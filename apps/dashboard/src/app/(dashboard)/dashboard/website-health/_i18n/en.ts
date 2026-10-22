// Website Health page wording (English). Check titles and details come from
// the API and are shown as they are.
export const en = {
  title: 'Website Health',
  description: 'Is everything working? Your website, feeds, listings and enquiries at a glance.',
  checkAgain: 'Check again',
  loadFailed: 'Could not load',
  checking: 'Checking…',
  never: 'never',
  banner: {
    ok: 'Everything is working',
    warning: 'A few things need your attention',
    error: 'Something is not working',
  },
  summary: (live: number, views: number, enquiries: number) =>
    `${live} ${live === 1 ? 'property' : 'properties'} live · ${views} property ${views === 1 ? 'view' : 'views'} and ${enquiries} ${enquiries === 1 ? 'enquiry' : 'enquiries'} in the last 7 days`,
  areas: {
    website: 'Your website',
    feeds: 'Property feeds',
    listings: 'Listings',
    leads: 'Enquiries',
  },
  lastImports: 'Last feed imports',
  lastImportsDescription: 'What each feed brought in the last time it ran.',
  columns: {
    feed: 'Feed',
    ran: 'Ran',
    received: 'Received',
    created: 'New',
    updated: 'Updated',
    removed: 'Removed',
    errors: 'Errors',
  },
  showErrors: 'Show errors',
  sitesTitle: 'Websites showing your properties',
  plugin: (version: string | null) => `WordPress plugin${version ? ` v${version}` : ''}`,
  widget: 'widget',
  lastSeen: (when: string) => `last seen ${when}`,
  checked: (when: string) => `Checked ${when}. A summary of this page is emailed every Monday (Settings → Email).`,
};

export type WebsiteHealthText = typeof en;
