// The Odoo Buyers export, column by column. This is the only place that
// knows Odoo's header labels: when the client's real file names a column
// differently, add the label to that field's list here.
//
// Labels are compared lower-cased with spaces collapsed, so "Budget From"
// and "budget  from" both match "budget from".

export const ODOO_COLUMNS = {
  id: ['id', 'external id'],
  firstName: ['first name', 'firstname'],
  lastName: ['last name', 'lastname'],
  name: ['name', 'contact name', 'display name'],
  email: ['email', 'e-mail'],
  phone: ['phone'],
  mobile: ['mobile'],
  language: ['language'],
  street: ['street'],
  street2: ['street 2', 'street2'],
  city: ['city'],
  zip: ['zip', 'zip code', 'postcode'],
  state: ['state', 'province'],
  country: ['country'],
  preferredContact: ['i prefer contact by', 'preferred contact', 'prefer contact by'],
  role: ['contact type', 'type of contact'],
  salesperson: ['salesperson', 'sales person'],
  salesAgent: ['sales agent'],
  relatedAgents: ['related sale agents', 'related sales agents', 'related agents'],
  lawyer: ["buyer's lawyer", 'buyers lawyer', 'lawyer'],
  priority: ['priority'],
  status: ['status buyer', 'buyer status', 'status'],
  subStatus: ['sub-status', 'sub status', 'substatus'],
  waitingReplyAt: ['waiting for reply date', 'waiting for reply'],
  referredBy: ['referred by'],
  referralPercent: ['referral %', 'referral percentage', 'referral'],
  idType: ['id type'],
  idNumber: ['id number'],
  listingType: ['listing type'],
  propertyType: ['property type', 'property types'],
  bedrooms: ['bedrooms'],
  bathrooms: ['bathrooms'],
  budgetMin: ['budget from'],
  budgetMax: ['budget to'],
  towns: ['towns', 'town'],
  buildSize: ['build size (m2)', 'build size', 'built size (m2)'],
  plotSize: ['plot size (m2)', 'plot size'],
  condition: ['condition'],
  views: ['views'],
  pool: ['swimming pool', 'pool'],
  settings: ['settings', 'setting'],
  sendMatchesTo: ['send matched properties to'],
  purpose: ['purpose'],
  financial: ['financial situation'],
  locationSetting: ['location'],
  distanceAirport: ['distance to airport by car', 'distance to airport'],
  distanceBeach: ['distance to beach by car', 'distance to beach'],
  distanceShops: ['distance to stores / village by car', 'distance to stores/village by car', 'distance to stores'],
  notes: ['internal notes', 'notes'],
  visitStart: ['visiting period - start', 'visiting period start'],
  visitEnd: ['visiting period - end', 'visiting period end'],
  createdOn: ['created on', 'creation date'],
  createdBy: ['created by'],
  sugRef: ['suggested properties/property reference', 'suggested properties / property reference'],
  sugAgentRef: ['suggested properties/agent reference', 'suggested properties / agent reference'],
  sugVisitDate: ['suggested properties/visiting date', 'suggested properties / visiting date'],
  sugStatus: ['suggested properties/status', 'suggested properties / status'],
  sugNote: ['suggested properties/note', 'suggested properties / note'],
} as const;

export type OdooField = keyof typeof ODOO_COLUMNS;

// Columns that may hold several values ("Marbella, Estepona").
export const MULTI_FIELDS: OdooField[] = [
  'relatedAgents', 'listingType', 'propertyType', 'towns', 'condition', 'views', 'pool', 'settings',
  'purpose', 'financial', 'locationSetting', 'distanceAirport', 'distanceBeach', 'distanceShops',
];

// Odoo buyer question columns → SPM buyer question keys (the A2 defaults).
export const QUESTION_FIELDS: Partial<Record<OdooField, string>> = {
  purpose: 'purpose',
  financial: 'financial',
  locationSetting: 'location_setting',
  distanceAirport: 'distance_airport',
  distanceBeach: 'distance_beach',
  distanceShops: 'distance_shops',
};

// Odoo wishlist columns that are SPM features.
export const FEATURE_FIELDS: OdooField[] = ['condition', 'views', 'pool', 'settings'];

export function headerKey(label: unknown): string {
  return String(label ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}
