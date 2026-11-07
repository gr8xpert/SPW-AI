// Wording for the MailerLite card (added 2026-11-05).
export const en = {
  title: 'MailerLite',
  description: 'Keep your contacts and tags up to date in your own MailerLite account.',
  intro: 'Connect your own MailerLite account and we copy your contacts and their tags there. You design and send your emails in MailerLite. When someone unsubscribes, bounces or reports spam there, they are unsubscribed here too.',
  connect: {
    keyLabel: 'MailerLite API key',
    keyPlaceholder: 'Paste your API key here',
    whereTitle: 'Where do I find my key?',
    whereSteps: 'In MailerLite, open Integrations, choose MailerLite API, and click Generate new token. Copy the token and paste it here.',
    button: 'Connect',
    connecting: 'Checking your key…',
  },
  errors: {
    BAD_KEY: 'MailerLite did not accept this API key. Please check it and try again.',
    MAILERLITE_BUSY: 'MailerLite is busy. Please try again in a minute.',
    generic: 'We could not reach MailerLite. Please try again in a few minutes.',
    loadFailed: 'We could not load your MailerLite settings. Only managers can see them.',
    actionFailed: 'That did not work. Please try again.',
  },
  consent: {
    title: 'One thing before the first sync',
    checkbox: 'I confirm these contacts agreed to receive marketing email',
    help: 'Only people who are subscribed here are copied. Addresses that have unsubscribed or bounced are left out.',
    button: 'Confirm and start the first sync',
  },
  connected: {
    badge: 'Connected',
    keyEnding: (last4: string) => `API key ending in ${last4}`,
    consentBy: (who: string, when: string) => `Consent confirmed by ${who} on ${when}`,
    lastSync: 'Last sync',
    never: 'Not yet',
    syncing: 'Syncing now. A large list can take a few hours, you can leave this page.',
    syncNow: 'Sync now',
    disconnect: 'Disconnect',
    daily: 'Your contacts also sync by themselves once a day.',
    groups: 'Everyone goes into a group called "SPM contacts", and each tag gets its own group starting with "SPM:". If you remove a tag here, the person leaves that group in MailerLite. Your other groups are not touched.',
    statsNote: 'Opens, clicks and other results of emails you send from MailerLite appear in MailerLite, not here.',
  },
  counts: {
    added: 'Added',
    updated: 'Updated',
    unchanged: 'Already up to date',
    skipped: 'Left out',
    failed: 'Could not be sent',
    skippedHelp: 'Left out: people without a real email address, and people who unsubscribed or bounced.',
  },
  notices: {
    bad_key: 'MailerLite no longer accepts your API key. Please connect again with a new key.',
    unreachable: 'The last sync could not finish because MailerLite could not be reached. It carries on from where it stopped next time.',
    some_groups_missing: 'Some tags have no group in MailerLite because the group could not be created. Your account may have reached its limit of groups.',
  },
  attention: {
    badge: 'Needs attention',
    newKey: 'Connect with a new key',
  },
  disconnect: {
    title: 'Disconnect MailerLite?',
    body: 'Syncing stops and unsubscribes no longer come back from MailerLite. Your contacts and groups stay in your MailerLite account.',
    cancel: 'Cancel',
    confirm: 'Disconnect',
  },
};

export type MailerLiteText = typeof en;
