// Features page wording. Every other language file has exactly these keys,
// picked in useFeaturesText(). Feature names are client data and are never
// translated here.

export const en = {
  title: 'Features',
  description: 'Manage property features and amenities',
  // Placeholder of each translation box, by language code.
  langNames: {
    en: 'English', es: 'Spanish', de: 'German', fr: 'French', nl: 'Dutch',
    it: 'Italian', ru: 'Russian', sv: 'Swedish', no: 'Norwegian',
    da: 'Danish', pl: 'Polish', cs: 'Czech', fi: 'Finnish',
  },
  // Category tabs and picker, by category code.
  categories: {
    all: 'All Features',
    interior: 'Interior',
    exterior: 'Exterior',
    community: 'Community',
    climate: 'Climate',
    views: 'Views',
    security: 'Security',
    parking: 'Parking',
    other: 'Other',
  },

  // Header buttons and AI translation
  aiOrganize: 'AI Organize',
  aiTranslateAll: 'AI Translate All',
  aiTranslate: 'AI Translate',
  translating: (pct: number) => `Translating ${pct}%`,
  lockedLong: 'AI Translation is a premium add-on — contact your account manager to unlock',
  lockedShort: 'AI Translation is a premium add-on',
  addFeature: 'Add Feature',
  cancel: 'Cancel',
  create: 'Create',
  edit: 'Edit',
  delete: 'Delete',
  clear: 'Clear',
  saveChanges: 'Save Changes',

  // Stat cards
  totalFeatures: 'Total Features',
  categoriesUsed: 'Categories Used',
  active: 'Active',

  // Filters
  searchPlaceholder: 'Search features...',
  showAll: 'Show all features on website',
  shownCount: (shown: number, total: number) => `(${shown} of ${total} shown)`,
  hideEmpty: 'Hide features with 0 properties',
  selected: (n: number) => `${n === 1 ? 'feature' : 'features'} selected`,

  // List
  categoryCount: (category: string, n: number) => `${category} (${n})`,
  empty: 'No features yet. Click "Add Feature" to create one.',
  noMatch: 'No features match the current filter.',
  visibleOnWebsite: 'Visible on website',
  hiddenFromWebsite: 'Hidden from website',

  // Add / edit dialogs
  addTitle: 'Add Feature',
  addDescription: 'Create a new property feature',
  editTitle: 'Edit Feature',
  editDescription: 'Update details and translations',
  nameEnglish: 'Name (English)',
  category: 'Category',
  icon: 'Icon',
  translationsCount: (filled: number, total: number) => `Translations (${filled}/${total})`,

  // Bulk translate dialog
  bulkTitle: 'AI Translate All Features',
  bulkText: (features: number, languages: number) =>
    `This will translate all ${features} ${features === 1 ? 'feature' : 'features'} to ${languages} ${languages === 1 ? 'language' : 'languages'} using AI.`,
  startTranslation: 'Start Translation',

  // Delete dialogs
  bulkDeleteTitle: (n: number) => `Delete ${n} ${n === 1 ? 'feature' : 'features'}?`,
  bulkDeleteText: 'Properties referencing these features will keep their other tags. This cannot be undone.',
  deleteN: (n: number) => `Delete ${n}`,
  deleteTitle: 'Delete Feature',
  deleteText: (name: string) => `Are you sure you want to delete "${name}"? This action cannot be undone.`,

  // Toasts
  toast: {
    loadFailed: 'Failed to load features',
    created: 'Feature created',
    createFailed: 'Failed to create',
    updated: 'Feature updated',
    updateFailed: 'Failed to update',
    deleted: 'Feature deleted',
    deleteFailed: 'Failed to delete',
    bulkDeleted: (n: number) => `Deleted ${n} ${n === 1 ? 'feature' : 'features'}`,
    bulkDeleteFailed: 'Bulk delete failed',
    orderUpdated: 'Order updated',
    reorderFailed: 'Failed to reorder',
    shown: 'Feature visible on website',
    hidden: 'Feature hidden from website',
    allShown: 'All features visible on website',
    allHidden: 'All features hidden from website',
    allHiddenText: 'Switch on the ones the website should show.',
    visibilityFailed: 'Failed to update visibility',
    organizeComplete: 'AI organize complete',
    organizeResult: (recategorised: number, skipped: number) =>
      `${recategorised} ${recategorised === 1 ? 'feature' : 'features'} recategorised, ${skipped} skipped`,
    organizeFinished: 'AI organize finished',
    noChanges: 'No changes needed',
    organizeFailed: 'AI organize failed',
    allComplete: 'All translations are already complete',
    translatedTo: (n: number) => `Translated to ${n} ${n === 1 ? 'language' : 'languages'}`,
    translatedName: (name: string) => `Translated "${name}"`,
    translationFailed: 'Translation failed',
    noTargetLanguages: 'No target languages configured. Add languages in Settings.',
    bulkComplete: 'Bulk translation complete',
    bulkCompleteText: (n: number) => `${n} ${n === 1 ? 'feature' : 'features'} translated`,
    bulkErrors: 'Bulk translation had errors',
    bulkErrorsText: (failed: number, total: number) => `${failed} of ${total} failed`,
    bulkAlready: 'Bulk translation is already running',
    bulkAlreadyText: 'Showing the run in flight — no second run was started.',
    bulkStarted: 'Bulk translation started',
    bulkStartedText: 'You can leave this page — progress shows on the button.',
    bulkFailed: 'Bulk translation failed',
  },
};

export type FeaturesText = typeof en;
