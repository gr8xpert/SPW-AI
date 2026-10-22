// New Leads wording in English; the other languages are in index.ts.

export const en = {
  title: 'New Leads',
  description: 'People who filled in a form on your website. Give each one a role and they move to Contacts.',
  empty: 'No new leads. Website enquiries and wishlist forms show up here.',
  loadFailed: 'Could not load new leads',
  retry: 'Try again',
  total: (n: number) => `${n} waiting`,
  chooseRole: 'Choose a role',
  addToContacts: 'Add to Contacts',
  added: (role: string) => `Added to Contacts as ${role}`,
  addFailed: 'Could not add to Contacts',
  delete: 'Delete',
  deleteTitle: 'Delete this lead?',
  deleteText: 'For spam or tests. The lead and its form messages are removed for good.',
  cancel: 'Cancel',
  deleted: 'Lead deleted',
  deleteFailed: 'Could not delete the lead',
  noName: 'No name',
  unassigned: 'No agent',
  agent: 'Agent',
  noMessage: 'No message',
  moreForms: (n: number) => `+${n} earlier ${n === 1 ? 'form' : 'forms'}`,
  forms: {
    enquiry: 'Property enquiry',
    favorites: 'Emailed favourites',
    wishlist_form: 'Wishlist form',
    other: 'Website form',
  },
  viewPage: 'Page',
};

export type NewLeadText = typeof en;
