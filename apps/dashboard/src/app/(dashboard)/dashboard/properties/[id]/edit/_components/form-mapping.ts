import type { DecimalValue, Property } from '@spm/shared';
import type { MultilingualField, PropertyFormData } from './types';

const emptyMultilingual: Record<string, string> = {};

export const EMPTY_FORM: PropertyFormData = {
  reference: '', agentReference: '', listingType: 'sale', propertyTypeId: '', locationId: '',
  urbanization: '', status: 'draft', price: '', priceTo: '', currency: 'EUR', priceOnRequest: false,
  bedrooms: '', bedroomsTo: '', bathrooms: '', bathroomsTo: '', buildSize: '', buildSizeTo: '',
  plotSize: '', plotSizeTo: '', terraceSize: '', terraceSizeTo: '', gardenSize: '',
  solariumSize: '', title: { ...emptyMultilingual }, description: { ...emptyMultilingual },
  features: [], videoUrl: '', virtualTourUrl: '', floorPlanUrl: '', floorPlans: [], lat: '', lng: '',
  geoLocationLabel: '', isFeatured: false, isPublished: false, floor: '', street: '',
  streetNumber: '', postcode: '', cadastralReference: '', communityFees: '', basuraTax: '',
  ibiFees: '', commission: '', sharedCommission: false, builtYear: '', energyConsumption: '', energyRating: '', brochureVariant: 'inherit',
  distanceToBeach: '', externalLink: '', blogUrl: '', mapLink: '', websiteUrl: '', slug: '',
  metaTitle: { ...emptyMultilingual }, metaDescription: { ...emptyMultilingual },
  metaKeywords: { ...emptyMultilingual }, pageTitle: { ...emptyMultilingual }, seoSchemaJson: '',
  agentId: '', salesAgentId: '', project: '', isOwnProperty: false, villaSelection: false,
  luxurySelection: false, apartmentSelection: false, deliveryDate: '', completionDate: '',
  propertyTypeReference: '', syncEnabled: true,
};

/** Fill the form from GET /api/dashboard/properties/:id. */
export function propertyToForm(property: Property): PropertyFormData {
  const str = (v: unknown) => (v != null ? String(v) : '');
  // DECIMAL columns arrive as "450000.00"; String(Number(..)) puts 450000 /
  // 120.5 in the inputs instead. Same value, so buildUpdatePayload's Number()
  // still saves exactly what was loaded.
  const dec = (v: DecimalValue | null) => {
    if (v == null || v === '') return '';
    const n = Number(v);
    return Number.isFinite(n) ? String(n) : String(v);
  };
  const dateStr = (v: string | null) => (v ? v.substring(0, 10) : '');
  const ml = (v: Record<string, string> | null) => v || { ...emptyMultilingual };
  // Older rows may hold feature objects instead of ids.
  const features = property.features as unknown[] | null;
  const floorPlans = property.floorPlans as unknown[] | null;
  return {
    reference: property.reference || '',
    agentReference: property.agentReference || '',
    listingType: property.listingType || 'sale',
    propertyTypeId: str(property.propertyTypeId),
    locationId: str(property.locationId),
    urbanization: property.urbanization || '',
    status: property.status || 'draft',
    price: dec(property.price),
    priceTo: dec(property.priceTo),
    currency: property.currency || 'EUR',
    priceOnRequest: property.priceOnRequest || false,
    bedrooms: str(property.bedrooms),
    bedroomsTo: str(property.bedroomsTo),
    bathrooms: str(property.bathrooms),
    bathroomsTo: str(property.bathroomsTo),
    buildSize: dec(property.buildSize),
    buildSizeTo: dec(property.buildSizeTo),
    plotSize: dec(property.plotSize),
    plotSizeTo: dec(property.plotSizeTo),
    terraceSize: dec(property.terraceSize),
    terraceSizeTo: dec(property.terraceSizeTo),
    gardenSize: dec(property.gardenSize),
    solariumSize: dec(property.solariumSize),
    title: ml(property.title),
    description: ml(property.description),
    features: Array.isArray(features)
      ? features.map((f) => (typeof f === 'object' && f !== null ? (f as { id: number }).id : (f as number)))
      : [],
    videoUrl: property.videoUrl || '',
    virtualTourUrl: property.virtualTourUrl || '',
    floorPlanUrl: property.floorPlanUrl || '',
    floorPlans: Array.isArray(floorPlans)
      ? (floorPlans.filter((p) => p && typeof (p as { url?: unknown }).url === 'string') as PropertyFormData['floorPlans'])
      : (property.floorPlanUrl ? [{ url: property.floorPlanUrl }] : []),
    lat: dec(property.lat),
    lng: dec(property.lng),
    geoLocationLabel: property.geoLocationLabel || '',
    isFeatured: property.isFeatured || false,
    isPublished: property.isPublished || false,
    floor: property.floor || '',
    street: property.street || '',
    streetNumber: property.streetNumber || '',
    postcode: property.postcode || '',
    cadastralReference: property.cadastralReference || '',
    communityFees: dec(property.communityFees),
    basuraTax: dec(property.basuraTax),
    ibiFees: dec(property.ibiFees),
    commission: dec(property.commission),
    sharedCommission: property.sharedCommission || false,
    builtYear: str(property.builtYear),
    energyConsumption: dec(property.energyConsumption),
    energyRating: property.energyRating || '',
    brochureVariant: property.brochureVariant || 'inherit',
    distanceToBeach: dec(property.distanceToBeach),
    externalLink: property.externalLink || '',
    blogUrl: property.blogUrl || '',
    mapLink: property.mapLink || '',
    websiteUrl: property.websiteUrl || '',
    slug: property.slug || '',
    metaTitle: ml(property.metaTitle),
    metaDescription: ml(property.metaDescription),
    metaKeywords: ml(property.metaKeywords),
    pageTitle: ml(property.pageTitle),
    seoSchemaJson: property.seoSchemaJson || '',
    agentId: str(property.agentId),
    salesAgentId: str(property.salesAgentId),
    project: property.project || '',
    isOwnProperty: property.isOwnProperty || false,
    villaSelection: property.villaSelection || false,
    luxurySelection: property.luxurySelection || false,
    apartmentSelection: property.apartmentSelection || false,
    deliveryDate: dateStr(property.deliveryDate),
    completionDate: dateStr(property.completionDate),
    propertyTypeReference: property.propertyTypeReference || '',
    syncEnabled: property.syncEnabled !== false,
  };
}

const STRING_FIELDS = [
  'agentReference', 'urbanization', 'floor', 'street', 'streetNumber',
  'postcode', 'cadastralReference', 'videoUrl', 'virtualTourUrl',
  'externalLink', 'blogUrl', 'mapLink', 'websiteUrl',
  'slug', 'project', 'geoLocationLabel', 'propertyTypeReference',
  'energyRating',
] as const;

const NUMBER_FIELDS = [
  'price', 'priceTo', 'bedrooms', 'bedroomsTo', 'bathrooms', 'bathroomsTo',
  'buildSize', 'buildSizeTo', 'plotSize', 'plotSizeTo',
  'terraceSize', 'terraceSizeTo', 'gardenSize', 'solariumSize',
  'communityFees', 'basuraTax', 'ibiFees', 'commission', 'builtYear',
  'energyConsumption', 'distanceToBeach', 'lat', 'lng',
] as const;

const SEO_FIELDS: MultilingualField[] = ['metaTitle', 'metaDescription', 'metaKeywords', 'pageTitle'];

export type BuildPayloadResult =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; error: 'invalid-schema' };

/**
 * The PUT /api/dashboard/properties/:id body for the form. `images` is only
 * passed when the user changed photos on this page (see usePropertyImages).
 */
export function buildUpdatePayload(
  formData: PropertyFormData,
  opts: { propertySource: string; useCustomSchema: boolean; images?: Array<{ url: string; alt: string }> },
): BuildPayloadResult {
  const payload: Record<string, unknown> = {
    listingType: formData.listingType,
    status: formData.status,
    currency: formData.currency,
    priceOnRequest: formData.priceOnRequest,
    isFeatured: formData.isFeatured,
    isPublished: formData.isPublished,
    title: formData.title,
    description: formData.description,
    features: formData.features,
    sharedCommission: formData.sharedCommission,
    isOwnProperty: formData.isOwnProperty,
    villaSelection: formData.villaSelection,
    luxurySelection: formData.luxurySelection,
    apartmentSelection: formData.apartmentSelection,
    syncEnabled: formData.syncEnabled,
    brochureVariant: formData.brochureVariant,
  };

  if (opts.propertySource === 'manual') payload.reference = formData.reference;

  // floorPlanUrl is derived server-side from floorPlans[0].url — don't
  // send it explicitly. Send the multi-plan array (or null to clear).
  payload.floorPlans = formData.floorPlans.length > 0 ? formData.floorPlans : null;

  // Custom JSON-LD schema: only send when the toggle is on. Validate
  // parseability client-side so the user gets an inline error instead of
  // a generic 400 from the server. Empty toggle → null clears any prior value.
  if (opts.useCustomSchema) {
    const raw = formData.seoSchemaJson?.trim() || '';
    if (raw.length > 0) {
      try {
        JSON.parse(raw);
      } catch {
        return { ok: false, error: 'invalid-schema' };
      }
      payload.seoSchemaJson = raw;
    } else {
      payload.seoSchemaJson = null;
    }
  } else {
    payload.seoSchemaJson = null;
  }
  for (const f of STRING_FIELDS) {
    const val = formData[f];
    if (val !== undefined) payload[f] = val || undefined;
  }

  for (const f of NUMBER_FIELDS) {
    const val = formData[f];
    if (val !== '' && val !== undefined) payload[f] = Number(val);
  }

  if (formData.propertyTypeId) payload.propertyTypeId = Number(formData.propertyTypeId);
  if (formData.locationId) payload.locationId = Number(formData.locationId);
  if (formData.agentId) payload.agentId = Number(formData.agentId);
  else payload.agentId = null;
  if (formData.salesAgentId) payload.salesAgentId = Number(formData.salesAgentId);
  else payload.salesAgentId = null;

  if (formData.deliveryDate) payload.deliveryDate = formData.deliveryDate;
  if (formData.completionDate) payload.completionDate = formData.completionDate;

  for (const f of SEO_FIELDS) {
    const obj = formData[f];
    payload[f] = Object.values(obj).some((v) => v) ? obj : undefined;
  }

  if (opts.images) {
    payload.images = opts.images.length > 0 ? opts.images.map((img, idx) => ({ ...img, order: idx })) : null;
  }

  return { ok: true, payload };
}
