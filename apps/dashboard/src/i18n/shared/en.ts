// Wording of the shared components used on client pages (Bulk SEO, Copy
// setup, Sort, locked pages, photo upload, weekly report, super-admin bar).

/** Which list the Copy setup menu works on (matches the API path). */
export type SetupKind = 'locations' | 'property-types';

export const en = {
  bulkSeo: {
    button: 'Bulk SEO',
    running: (progress: number) => `SEO ${progress}%`,
    title: 'Generate SEO with AI',
    description:
      'Fills page title, meta title, meta description and keywords across your whole catalog. Runs in the background on your AI credit.',
    languages: 'Languages',
    overwrite: 'Overwrite existing SEO',
    overwriteHelp:
      'Off: properties that already have SEO in a language are skipped, and cost nothing. On: everything is regenerated, including anything written by hand.',
    schema: 'Generate JSON-LD schema',
    schemaHelp:
      "Adds one extra AI call per property. Only needed if you want custom schema instead of the one built automatically from the property's fields.",
    slug: 'Fill empty slugs',
    slugHelp: "Only writes a slug where there isn't one. Existing slugs are live URLs and are never rewritten.",
    counting: 'Counting properties…',
    // {properties} and {calls} are replaced by the numbers (shown in bold).
    estimate: (properties: number) => `{properties} ${properties === 1 ? 'property' : 'properties'} · up to {calls} AI calls`,
    fewerInPractice: '— fewer in practice, since properties that already have SEO are skipped',
    cancel: 'Cancel',
    start: 'Start',
    pickLanguage: 'Pick at least one language',
    finishedWithErrors: 'Bulk SEO finished with errors',
    complete: 'Bulk SEO complete',
    summary: (generated: number, skipped: number, failed: number, total: number) =>
      `${generated} generated, ${skipped} already had SEO, ${failed} failed out of ${total}.`,
    alreadyRunning: 'Bulk SEO is already running',
    alreadyRunningText: 'Showing the progress of the run in flight — no second run was started.',
    started: 'Bulk SEO started',
    startedText: 'Running in the background. You can leave this page — progress shows on the button.',
    startFailed: 'Bulk SEO failed to start',
    noJobId: 'No job ID returned',
    unexpectedError: 'Unexpected error',
  },
  setupTransfer: {
    button: 'Copy setup',
    menuHelp: (kind: SetupKind): string =>
      kind === 'locations'
        ? 'Copy this location arrangement to another client. Only locations both clients have are changed — nothing is added or deleted.'
        : 'Copy this property type arrangement to another client. Only property types both clients have are changed — nothing is added or deleted.',
    export: 'Export setup',
    import: 'Import setup…',
    exported: 'Setup exported',
    exportedText: (n: number, kind: SetupKind) =>
      `${n} ${kind === 'locations' ? (n === 1 ? 'location' : 'locations') : n === 1 ? 'property type' : 'property types'} saved. Import the file in the other client's dashboard.`,
    exportFailed: 'Could not export',
    tryAgain: 'Try again.',
    readFailed: 'Could not read the file',
    imported: 'Setup imported',
    importedText: (changed: number, merged: number, kind: SetupKind) =>
      `${changed} ${kind === 'locations' ? (changed === 1 ? 'location' : 'locations') : changed === 1 ? 'property type' : 'property types'} updated${
        merged ? `, ${merged} ${merged === 1 ? 'duplicate' : 'duplicates'} merged` : ''
      }. Your website uses the new setup.`,
    importFailed: 'Could not import',
    dialogTitle: (kind: SetupKind): string => (kind === 'locations' ? 'Import location setup' : 'Import property type setup'),
    found: (matched: number, total: number, changed: number, kind: SetupKind) =>
      `${matched} of your ${total} ${kind === 'locations' ? 'locations' : 'property types'} were found in the file${
        changed > 0 ? `; ${changed} will change.` : ' and already match it.'
      }`,
    untouched: (n: number, kind: SetupKind) =>
      `${n} of your ${kind === 'locations' ? 'locations' : 'property types'} ${n === 1 ? 'is' : 'are'} not in the file and stay as they are.`,
    notInAccount: (n: number, kind: SetupKind) =>
      `${n} ${kind === 'locations' ? (n === 1 ? 'location' : 'locations') : n === 1 ? 'property type' : 'property types'} in the file ${n === 1 ? 'is' : 'are'} not in this account and will not be added`,
    example: (list: string) => `(e.g. ${list})`,
    rows: {
      moved: 'Moved to a different parent',
      renamed: 'Renamed',
      reordered: 'New order',
      aliases: 'Other spellings copied',
      coords: 'Map points copied',
      merged: 'Duplicates merged into one',
      keptInPlace: 'Left under current parent (file’s parent not in this account)',
      clashes: 'Not moved (same name already there)',
      ambiguous: 'Skipped (more than one possible match)',
    },
    cancel: 'Cancel',
    apply: 'Apply',
  },
  sortOrder: {
    button: 'Sort',
    help: 'Replaces the current order on every level. Drag rows to fine-tune. Your website uses this order.',
    options: { name: 'A to Z', 'name-desc': 'Z to A', count: 'Most listings first' },
    sorted: (label: string) => `Sorted ${label}`,
    sortedText: 'Your website shows the new order.',
    failed: 'Could not sort',
    failedText: 'Nothing was changed. Try again.',
  },
  locked: {
    title: (feature: string) => `${feature} is locked`,
    description: (feature: string) =>
      `${feature} is available as a paid add-on. Contact your account manager to enable it for this client.`,
    viewPlans: 'View plans',
    backToDashboard: 'Back to dashboard',
    checkFailed: 'Could not check your plan.',
    tryAgain: 'Try again',
  },
  photo: {
    chooseImage: 'Choose an image',
    chooseImageText: 'The photo must be a JPG, PNG or WebP file.',
    uploadFailed: 'Photo upload failed',
    noAddress: 'The upload returned no address.',
    uploading: 'Uploading…',
    change: 'Change photo',
    upload: 'Upload photo',
    remove: 'Remove photo',
    formats: 'JPG, PNG or WebP',
  },
  weeklyReport: {
    title: 'Weekly report',
    description:
      "Every Monday morning: last week's property views, searches and enquiries, the most viewed properties, what your feed imported, and anything on your website that needs attention.",
    enabled: 'Send the weekly report',
    sendTo: 'Send it to',
    remove: (email: string) => `Remove ${email}`,
    defaultRecipients: "Your account's admins (add addresses to choose yourself)",
    emailPlaceholder: 'name@agency.com',
    add: 'Add',
    save: 'Save',
    preview: "Preview this week's report",
    sendToMe: 'Send it to me now',
    notEmail: 'That is not an email address',
    saved: 'Weekly report settings saved',
    saveFailed: 'Could not save',
    previewFailed: 'Could not build the preview',
    sent: 'Report sent',
    sentText: (to: string | undefined) => (to ? `Check ${to}.` : 'Check your inbox.'),
    sendFailed: 'Could not send',
    to: (list: string) => `To: ${list}`,
    nobody: 'nobody yet — add an address',
    frameTitle: 'Weekly report preview',
  },
  impersonation: {
    session: 'Super-admin session ·',
    viewingAs: 'Viewing as',
    returnToAdmin: 'Return to admin',
    returned: 'Returned to admin',
    returnedText: 'You are back to your super-admin session.',
  },
};

export type SharedText = typeof en;
