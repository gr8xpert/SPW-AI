import type { BrochureVariant } from '@spm/shared';

export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'de', label: 'German' },
  { code: 'fr', label: 'French' },
  { code: 'nl', label: 'Dutch' },
  { code: 'sv', label: 'Swedish' },
  { code: 'no', label: 'Norwegian' },
  { code: 'da', label: 'Danish' },
  { code: 'fi', label: 'Finnish' },
  { code: 'ru', label: 'Russian' },
];

export interface PropertyTypeOption { id: number; name: Record<string, string> | string; }
export interface LocationOption { id: number; name: Record<string, string> | string; level?: string; }
export interface FeatureOption { id: number; name: Record<string, string> | string; category?: string; }
export interface TeamMember { id: number; name: string | null; email: string; }

export interface MediaFileItem {
  id: number;
  url: string;
  originalFilename: string;
  sortOrder: number;
  isUploading?: boolean;
  tempId?: string;
}

export function displayName(name: Record<string, string> | string): string {
  if (typeof name === 'string') return name;
  return name?.en || name?.es || Object.values(name)[0] || '';
}

export type MultilingualField = 'title' | 'description' | 'metaTitle' | 'metaDescription' | 'metaKeywords' | 'pageTitle';

/** The edit form's state: every input is a string, as typed. */
export interface PropertyFormData {
  reference: string;
  agentReference: string;
  listingType: string;
  propertyTypeId: string;
  locationId: string;
  urbanization: string;
  status: string;
  price: string;
  priceTo: string;
  rentalPeriod: '' | 'night' | 'week' | 'month';
  currency: string;
  priceOnRequest: boolean;
  bedrooms: string;
  bedroomsTo: string;
  bathrooms: string;
  bathroomsTo: string;
  buildSize: string;
  buildSizeTo: string;
  plotSize: string;
  plotSizeTo: string;
  terraceSize: string;
  terraceSizeTo: string;
  gardenSize: string;
  solariumSize: string;
  title: Record<string, string>;
  description: Record<string, string>;
  features: number[];
  videoUrl: string;
  virtualTourUrl: string;
  floorPlanUrl: string;
  floorPlans: Array<{ url: string; label?: string }>;
  lat: string;
  lng: string;
  geoLocationLabel: string;
  isFeatured: boolean;
  isPublished: boolean;
  floor: string;
  street: string;
  streetNumber: string;
  postcode: string;
  cadastralReference: string;
  communityFees: string;
  basuraTax: string;
  ibiFees: string;
  commission: string;
  sharedCommission: boolean;
  builtYear: string;
  energyConsumption: string;
  energyRating: string;
  brochureVariant: BrochureVariant;
  distanceToBeach: string;
  externalLink: string;
  blogUrl: string;
  mapLink: string;
  websiteUrl: string;
  slug: string;
  metaTitle: Record<string, string>;
  metaDescription: Record<string, string>;
  metaKeywords: Record<string, string>;
  pageTitle: Record<string, string>;
  seoSchemaJson: string;
  agentId: string;
  salesAgentId: string;
  project: string;
  isOwnProperty: boolean;
  villaSelection: boolean;
  luxurySelection: boolean;
  apartmentSelection: boolean;
  deliveryDate: string;
  completionDate: string;
  propertyTypeReference: string;
  syncEnabled: boolean;
}

export type FormField = keyof PropertyFormData;
export type FieldChangeHandler = (field: FormField, value: any) => void;
export type MultilingualChangeHandler = (field: MultilingualField, lang: string, value: string) => void;

/** Props every form section takes. */
export interface FormSectionProps {
  formData: PropertyFormData;
  onChange: FieldChangeHandler;
}
