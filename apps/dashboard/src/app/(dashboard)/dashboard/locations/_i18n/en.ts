// Locations page wording (page + Move to… / Merge into… dialog). Every other
// language file has exactly these keys, picked in useLocationsText().
// Location names, slugs and aliases are client data and are never translated.

export const en = {
  title: 'Locations',
  description: 'Manage your location hierarchy for property filtering',
  // Location levels by code (badge, Level picker, search dropdown boxes).
  levels: {
    region: 'Region',
    province: 'Province',
    area: 'Area',
    municipality: 'Municipality',
    town: 'Town',
    urbanization: 'Urbanization',
  },
  // Label of each name box in the form, by language code.
  langNames: {
    en: 'English', es: 'Spanish', de: 'German', fr: 'French', nl: 'Dutch',
    pt: 'Portuguese', it: 'Italian', ru: 'Russian', sv: 'Swedish', no: 'Norwegian',
  },

  // Header buttons
  checkMap: 'Check map positions',
  checkMapHint: 'Look each location up on the map and correct any that are in the wrong place',
  aiOrganize: 'AI Organize',
  addLocation: 'Add Location',

  // Stat cards
  stats: {
    total: 'Total',
    regions: 'Regions',
    provinces: 'Provinces',
    areas: 'Areas',
    municipalities: 'Municipalities',
    towns: 'Towns',
    urbanizations: 'Urbanizations',
  },

  // Filters and selection
  searchPlaceholder: 'Search locations...',
  hideEmpty: 'Hide locations with 0 properties',
  selected: (n: number) => `${n === 1 ? 'location' : 'locations'} selected`,
  clear: 'Clear',
  moveUnderParent: 'Move under parent…',
  delete: 'Delete',

  // Tree
  hierarchy: 'Location Hierarchy',
  selectAllVisible: 'Select all visible',
  hierarchyHelp: 'Click the chevron to expand/collapse. Tick checkboxes to bulk-move or bulk-delete.',
  empty: 'No locations yet. Click "Add Location" to create one.',
  alsoShownFor: (names: string) => `also shown for: ${names}`,
  propertyCount: (n: number) => `${n} ${n === 1 ? 'property' : 'properties'}`,
  visibleOnWebsite: 'Visible on website',
  hiddenFromWebsite: 'Hidden from website',
  addInside: 'Add inside',
  edit: 'Edit',
  moveTo: 'Move to…',
  mergeInto: 'Merge into…',

  // Add / edit form
  nameIn: (language: string) => `Name (${language})`,
  slug: 'Slug',
  otherSpellings: 'Other spellings',
  otherSpellingsHint: '(optional, comma separated)',
  otherSpellingsHelp: "When a visitor searches any of these names on your website, this location's properties are shown too.",
  level: 'Level',
  latitude: 'Latitude',
  longitude: 'Longitude',
  optional: '(optional)',
  coordsHelp: 'Where this place sits on the map. Listings with no coordinates of their own are shown here, so getting it wrong (latitude and longitude the wrong way round, say) moves them to the other side of the world.',
  parentLocation: 'Parent Location',
  noParent: 'No parent (top level)',
  noParentOption: '— No parent (top level) —',

  // Website search dropdowns
  dropdownsTitle: 'Website Search Dropdowns',
  dropdownsText: 'How many location dropdowns your website search shows, and which levels each one lists. Dropdown 2 lists places under what is picked in Dropdown 1, Dropdown 3 under Dropdown 2. Applies to every search design.',
  save: 'Save',
  dropdownN: (n: number) => `Dropdown ${n}`,
  alwaysShown: 'Always shown',
  visible: 'Visible',

  // Dialogs
  addTitle: 'Add Location',
  addDescription: 'Create a new location in the hierarchy',
  editTitle: 'Edit Location',
  editDescription: 'Update the location details',
  cancel: 'Cancel',
  create: 'Create',
  saveChanges: 'Save Changes',
  bulkMoveTitle: (n: number) => `Move ${n} ${n === 1 ? 'location' : 'locations'} under a parent`,
  bulkMoveText: 'Pick a parent location. Selected items become its children. Choose "No parent" to move them back to the top level.',
  moveN: (n: number) => `Move ${n} ${n === 1 ? 'item' : 'items'}`,
  bulkDeleteTitle: (n: number) => `Delete ${n} ${n === 1 ? 'location' : 'locations'}?`,
  bulkDeleteText: 'Child locations will become top-level. Properties referencing these will have their location cleared. This action cannot be undone.',
  deleteN: (n: number) => `Delete ${n}`,
  deleteTitle: 'Delete Location',
  deleteText: (name: string) => `Are you sure you want to delete "${name}"? This will also delete all child locations. This action cannot be undone.`,

  // Move to… / Merge into… dialog
  moveMerge: {
    mergeTitle: (name: string) => `Merge "${name}" into…`,
    moveTitle: (name: string) => `Move "${name}" to…`,
    mergeText: 'Its properties and the places inside it move into the location you pick, and it is removed. Future feed imports put its listings there too.',
    moveText: 'It moves with everything inside it. Future feed imports keep it where you put it.',
    searchPlaceholder: 'Search a location…',
    topLevel: '— Top level (no parent) —',
    noMatch: 'No matching location',
    mergeInto: (name: string) => `Merge into ${name}`,
    move: 'Move',
    moveInto: (name: string) => `Move into ${name}`,
    moveToTop: 'Move to top level',
  },

  // Toasts
  toast: {
    loadFailed: 'Failed to load locations',
    created: 'Location created',
    createFailed: 'Failed to create',
    updated: 'Location updated',
    updateFailed: 'Failed to update',
    deleted: 'Location deleted',
    deleteFailed: 'Failed to delete',
    // Bulk move: "Moved 3 locations · merged 1 duplicate"
    movedN: (n: number) => `Moved ${n} ${n === 1 ? 'location' : 'locations'}`,
    mergedDuplicates: (n: number) => `merged ${n} ${n === 1 ? 'duplicate' : 'duplicates'}`,
    bulkMoveFailed: 'Bulk move failed',
    bulkDeleted: (n: number) => `Deleted ${n} ${n === 1 ? 'location' : 'locations'}`,
    bulkDeleteFailed: 'Bulk delete failed',
    reorderFailed: 'Failed to reorder',
    shown: 'Location visible on website',
    hidden: 'Location hidden from website',
    visibilityFailed: 'Failed to update visibility',
    configSaved: 'Search configuration saved',
    configFailed: 'Failed to save configuration',
    // Check map positions
    corrected: (n: number) => `${n} ${n === 1 ? 'location' : 'locations'} corrected`,
    allInPlace: 'Every location was already in the right place',
    leftAlone: (n: number, examples: string) => `${n} left alone: ${examples}`,
    checked: (n: number) => `${n} checked`,
    mapCheckFailed: 'Could not check the map positions',
    // AI organize, parts joined with ", "
    organizeComplete: 'AI organize complete',
    regionsCreated: (n: number) => `+${n} ${n === 1 ? 'region' : 'regions'}`,
    provincesGrouped: (n: number) => `${n} ${n === 1 ? 'province' : 'provinces'} grouped`,
    areasMerged: (n: number) => `${n} duplicate ${n === 1 ? 'area' : 'areas'} merged`,
    skipped: (n: number) => `${n} skipped`,
    organizeFinished: 'AI organize finished',
    noChanges: 'No changes needed',
    organizeFailed: 'AI organize failed',
    // Move to… / Merge into…
    mergedInto: (source: string, target: string) => `Merged "${source}" into "${target}"`,
    moved: (name: string) => `Moved "${name}"`,
    nowInside: (path: string) => `Now inside ${path}`,
    nowTopLevel: 'Now at the top level',
    mergeFailed: 'Could not merge',
    moveFailed: 'Could not move',
  },
};

export type LocationsText = typeof en;
