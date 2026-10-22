// Property Types page wording. Every other language file has exactly these
// keys, picked in usePropertyTypesText(). Type names and slugs are client data
// and are never translated here.

export const en = {
  title: 'Property Types',
  description: 'Manage property type classifications',
  // Placeholder of each translation box, by language code.
  langNames: {
    en: 'English', es: 'Spanish', de: 'German', fr: 'French', nl: 'Dutch',
    it: 'Italian', ru: 'Russian', sv: 'Swedish', no: 'Norwegian',
    da: 'Danish', pl: 'Polish', cs: 'Czech', fi: 'Finnish',
  },

  // Header buttons and AI translation
  aiOrganize: 'AI Organize',
  aiTranslateAll: 'AI Translate All',
  aiTranslate: 'AI Translate',
  translating: (pct: number) => `Translating ${pct}%`,
  lockedLong: 'AI Translation is a premium add-on — contact your account manager to unlock',
  lockedShort: 'AI Translation is a premium add-on',
  addType: 'Add Type',
  cancel: 'Cancel',
  create: 'Create',
  edit: 'Edit',
  delete: 'Delete',
  clear: 'Clear',
  saveChanges: 'Save Changes',

  // Add / edit dialogs
  addTitle: 'Add Property Type',
  addDescription: 'Create a new property type classification',
  editTitle: 'Edit Property Type',
  editDescription: 'Update details and translations',
  nameEnglish: 'Name (English)',
  slug: 'Slug',
  icon: 'Icon',
  parentType: 'Parent Type',
  optional: '(optional)',
  noParent: 'No parent (top level)',
  noParentOption: '— No parent (top level) —',
  translationsCount: (filled: number, total: number) => `Translations (${filled}/${total})`,

  // Filters and selection
  searchPlaceholder: 'Search property types...',
  hideEmpty: 'Hide types with 0 properties',
  selected: (n: number) => `${n === 1 ? 'type' : 'types'} selected`,
  moveUnderParent: 'Move under parent…',

  // Table
  allTypes: (n: number) => `All Property Types (${n})`,
  empty: 'No property types yet. Click "Add Type" to create one.',
  colName: 'Name',
  colSlug: 'Slug',
  colTranslations: 'Translations',
  colProperties: 'Properties',
  colVisible: 'Visible',
  visibleOnWebsite: 'Visible on website',
  hiddenFromWebsite: 'Hidden from website',

  // Bulk translate dialog
  bulkTitle: 'AI Translate All Property Types',
  bulkText: (types: number, languages: number) =>
    `This will translate all ${types} property ${types === 1 ? 'type' : 'types'} to ${languages} ${languages === 1 ? 'language' : 'languages'} using AI.`,
  startTranslation: 'Start Translation',

  // Bulk move dialog
  bulkMoveTitle: (n: number) => `Move ${n} ${n === 1 ? 'type' : 'types'} under a parent`,
  bulkMoveText: 'Choose a parent type. Selected items become its children. Select "No parent" to make them top-level.',
  moveN: (n: number) => `Move ${n} ${n === 1 ? 'item' : 'items'}`,

  // Delete dialogs
  bulkDeleteTitle: (n: number) => `Delete ${n} ${n === 1 ? 'type' : 'types'}?`,
  bulkDeleteText: 'Properties using these types will have their type cleared. Child types will become top-level. This cannot be undone.',
  deleteN: (n: number) => `Delete ${n}`,
  deleteTitle: 'Delete Property Type',
  deleteText: (name: string) => `Are you sure you want to delete "${name}"? This action cannot be undone.`,

  // Toasts
  toast: {
    loadFailed: 'Failed to load property types',
    created: 'Property type created',
    createFailed: 'Failed to create',
    updated: 'Property type updated',
    updateFailed: 'Failed to update',
    deleted: 'Property type deleted',
    deleteFailed: 'Failed to delete',
    bulkMoved: (n: number) => `Moved ${n} ${n === 1 ? 'type' : 'types'}`,
    bulkMoveFailed: 'Bulk move failed',
    bulkDeleted: (n: number) => `Deleted ${n} ${n === 1 ? 'type' : 'types'}`,
    bulkDeleteFailed: 'Bulk delete failed',
    orderUpdated: 'Order updated',
    reorderFailed: 'Failed to reorder',
    shown: 'Type visible on website',
    hidden: 'Type hidden from website',
    visibilityFailed: 'Failed to update visibility',
    organizeComplete: 'AI organize complete',
    // Only what actually happened is listed, joined with ", ".
    parentsCreated: (n: number) => `+${n} parent ${n === 1 ? 'group' : 'groups'}`,
    childrenAttached: (n: number) => `${n} grouped`,
    typesMerged: (n: number) => `${n} ${n === 1 ? 'duplicate' : 'duplicates'} merged`,
    detached: (n: number) => `${n} moved to top level`,
    skipped: (n: number) => `${n} skipped`,
    alreadyRight: 'Everything already looks right',
    organizeFinished: 'AI organize finished',
    noChanges: 'No changes needed',
    organizeFailed: 'AI organize failed',
    allComplete: 'All translations are already complete',
    translatedTo: (n: number) => `Translated to ${n} ${n === 1 ? 'language' : 'languages'}`,
    translatedName: (name: string) => `Translated "${name}"`,
    translationFailed: 'Translation failed',
    noTargetLanguages: 'No target languages configured. Add languages in Settings.',
    bulkComplete: 'Bulk translation complete',
    bulkCompleteText: (n: number) => `${n} property ${n === 1 ? 'type' : 'types'} translated`,
    bulkErrors: 'Bulk translation had errors',
    bulkErrorsText: (failed: number, total: number) => `${failed} of ${total} failed`,
    bulkAlready: 'Bulk translation is already running',
    bulkAlreadyText: 'Showing the run in flight — no second run was started.',
    bulkStarted: 'Bulk translation started',
    bulkStartedText: 'You can leave this page — progress shows on the button.',
    bulkFailed: 'Bulk translation failed',
  },
};

export type PropertyTypesText = typeof en;
