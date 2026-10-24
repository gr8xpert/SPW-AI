// Labels page wording. Every other language file has exactly these keys,
// picked in useLabelsText(). Label keys and their translations are client
// data and are never translated here.

export const en = {
  title: 'Labels',
  description: 'Manage UI text translations for your widget',
  // Placeholder of each translation box, by language code.
  langNames: {
    en: 'English', es: 'Spanish', de: 'German', fr: 'French', nl: 'Dutch',
    it: 'Italian', ru: 'Russian', sv: 'Swedish', no: 'Norwegian',
    da: 'Danish', pl: 'Polish', cs: 'Czech', fi: 'Finnish',
  },
  // Tabs, by category id.
  categories: {
    search: 'Search Form',
    results: 'Search Results',
    card: 'Property Card',
    detail: 'Property Detail',
    inquiry: 'Inquiry Form',
    wishlist: 'Wishlist',
    map: 'Map',
    chat: 'AI Chat',
    pagination: 'Pagination',
    mortgage: 'Mortgage Calculator',
    calculator: 'Purchase Costs Calculator',
    buyer: 'Buyer Emails & PDF',
    wishlist_form: 'Wishlist Form',
    buyer_page: 'Buyer Page',
    buyer_whatsapp: 'Buyer WhatsApp Messages',
    general: 'General',
  },

  // Buttons and AI translation
  aiTranslateAll: 'AI Translate All',
  aiTranslate: 'AI Translate',
  translating: (pct: number) => `Translating ${pct}%`,
  lockedLong: 'AI Translation is a premium add-on — contact your account manager to unlock',
  lockedShort: 'AI Translation is a premium add-on',
  translateThis: 'AI translate this label',
  cancel: 'Cancel',
  create: 'Create',
  delete: 'Delete',
  saveChanges: 'Save Changes',

  // Stat cards
  totalLabels: 'Total Labels',
  languages: 'Languages',
  missingTranslations: 'Missing Translations',

  searchPlaceholder: 'Search labels by key or translation...',
  searchResultsAll: (n: number) => `Search results in all tabs (${n})`,
  categoryLabels: (category: string) => `${category} Labels`,
  clickEdit: 'Click the edit button to manage translations',
  empty: 'No labels yet. Initialize defaults or add custom labels.',
  initializeDefaults: 'Initialize Default Labels',
  noMatch: 'No labels match the current filter.',
  colKey: 'Key',
  colEnglish: 'English',
  colTranslations: 'Translations',
  missing: 'Missing',

  // Edit dialog
  editTitle: 'Edit Label',
  english: 'English',
  translationsCount: (filled: number, total: number) => `Translations (${filled}/${total})`,

  // Add dialog
  addTitle: 'Add Label',
  addDescription: 'Create a new custom label with translations',
  key: 'Key',
  keyHint: 'Use format: category_label_name (e.g. bedrooms_label, detail_price, card_view_details)',
  spanish: 'Spanish',

  // Bulk translate dialog
  bulkTitle: 'AI Translate All Labels',
  bulkText: (labels: number, languages: number) =>
    `This will translate all ${labels} ${labels === 1 ? 'label' : 'labels'} to ${languages} ${languages === 1 ? 'language' : 'languages'} using AI.`,
  startTranslation: 'Start Translation',

  // Delete dialog
  deleteTitle: 'Delete Label',
  deleteText: (key: string) => `Are you sure you want to delete "${key}"? This action cannot be undone.`,

  // Toasts
  toast: {
    loadFailed: 'Failed to load labels',
    updated: 'Label updated',
    saveFailed: 'Failed to save',
    created: 'Label created',
    createFailed: 'Failed to create',
    deleted: 'Label deleted',
    deleteFailed: 'Failed to delete',
    initialized: 'Default labels initialized',
    initFailed: 'Failed to initialize',
    allComplete: 'All translations are already complete',
    translatedTo: (n: number) => `Translated to ${n} ${n === 1 ? 'language' : 'languages'}`,
    translatedName: (name: string) => `Translated "${name}"`,
    translationFailed: 'Translation failed',
    noTargetLanguages: 'No target languages configured. Add languages in Settings.',
    bulkComplete: 'Bulk translation complete',
    bulkCompleteText: (n: number) => `${n} ${n === 1 ? 'label' : 'labels'} translated`,
    bulkErrors: 'Bulk translation had errors',
    bulkErrorsText: (failed: number, total: number) => `${failed} of ${total} failed`,
    bulkAlready: 'Bulk translation is already running',
    bulkAlreadyText: 'Showing the run in flight — no second run was started.',
    bulkStarted: 'Bulk translation started',
    bulkStartedText: 'You can leave this page — progress shows on the button.',
    bulkFailed: 'Bulk translation failed',
  },
};

export type LabelsText = typeof en;
