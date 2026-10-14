// Rightmove Real Time Datafeed (RTDF v1.4) — the fixed code lists the builder
// maps onto. Codes come from Rightmove's JSON schema for SendPropertyDetails
// (property_type, media_type, removal_reason, area units); the overseas call
// shares them. Os_Status is not in a public schema: the values below follow
// the UK `status` list and must be checked against the schema Rightmove sends
// with the test credentials.

export interface RightmoveTypeOption {
  value: string; // the code, as a string (dashboard selects work on strings)
  label: string;
}

// The overseas-relevant subset of property_type, in dashboard order.
export const RIGHTMOVE_TYPES: RightmoveTypeOption[] = [
  { value: '28', label: 'Apartment' },
  { value: '8', label: 'Flat' },
  { value: '7', label: 'Ground floor flat' },
  { value: '9', label: 'Studio flat' },
  { value: '29', label: 'Penthouse' },
  { value: '56', label: 'Duplex' },
  { value: '59', label: 'Triplex' },
  { value: '27', label: 'Villa' },
  { value: '131', label: 'Detached villa' },
  { value: '128', label: 'Semi-detached villa' },
  { value: '4', label: 'Detached house' },
  { value: '3', label: 'Semi-detached house' },
  { value: '1', label: 'Terraced house' },
  { value: '22', label: 'Town house' },
  { value: '26', label: 'House (unspecified)' },
  { value: '12', label: 'Bungalow' },
  { value: '24', label: 'Chalet' },
  { value: '23', label: 'Cottage' },
  { value: '30', label: 'Finca' },
  { value: '104', label: 'Cortijo' },
  { value: '113', label: 'Country house' },
  { value: '95', label: 'Village house' },
  { value: '101', label: 'Cave house' },
  { value: '52', label: 'Farm house' },
  { value: '25', label: 'Character property' },
  { value: '92', label: 'Castle' },
  { value: '125', label: 'Off-plan' },
  { value: '143', label: 'Block of apartments' },
  { value: '110', label: 'Plot' },
  { value: '20', label: 'Land (residential)' },
  { value: '107', label: 'Farm land' },
  { value: '45', label: 'Parking' },
  { value: '51', label: 'Garages' },
  { value: '232', label: 'Storage' },
  { value: '137', label: 'Shop' },
  { value: '178', label: 'Office' },
  { value: '80', label: 'Restaurant' },
  { value: '83', label: 'Cafe' },
  { value: '134', label: 'Bar / nightclub' },
  { value: '202', label: 'Hotel' },
  { value: '277', label: 'Guest house' },
  { value: '238', label: 'Warehouse' },
  { value: '253', label: 'Commercial property' },
];

const TYPE_CODES = new Set(RIGHTMOVE_TYPES.map((t) => t.value));

export function isRightmoveType(value: unknown): value is string {
  return typeof value === 'string' && TYPE_CODES.has(value);
}

export function rightmoveTypeLabel(value: string | null): string {
  return RIGHTMOVE_TYPES.find((t) => t.value === value)?.label ?? '';
}

// Guess from a property type name (any language). First match wins, so the
// specific names come before the general ones.
const GUESSES: Array<[RegExp, string]> = [
  [/penthouse|[aá]tico/, '29'],
  [/triplex/, '59'],
  [/duplex|d[uú]plex/, '56'],
  [/studio|estudio/, '9'],
  [/ground floor|planta baja/, '7'],
  [/semi[\s-]?detached villa|villa pareada/, '128'],
  [/detached villa|villa independiente/, '131'],
  [/semi[\s-]?detached|pareado/, '3'],
  [/town ?house|adosad/, '22'],
  [/terraced/, '1'],
  [/bungalow/, '12'],
  [/cortijo/, '104'],
  [/finca/, '30'],
  [/cave|cueva/, '101'],
  [/village|pueblo/, '95'],
  [/country ?house|casa de campo|r[uú]stic/, '113'],
  [/castle|castillo/, '92'],
  [/farm ?land|terreno r[uú]stico/, '107'],
  [/plot|land|terreno|parcela|solar/, '110'],
  [/garage|garaje/, '51'],
  [/parking|aparcamiento|plaza de/, '45'],
  [/storage|trastero/, '232'],
  [/office|oficina/, '178'],
  [/restaurant/, '80'],
  [/caf[eé]/, '83'],
  [/\bbar\b|night ?club/, '134'],
  [/hotel/, '202'],
  [/hostel|guest ?house|b&b|hostal/, '277'],
  [/warehouse|industrial|nave/, '238'],
  [/shop|tienda|\blocal\b|premises/, '137'],
  [/building|edificio|block/, '143'],
  [/commercial|comercial|business|negocio/, '253'],
  [/apartment|apartamento|\bflat\b|piso/, '28'],
  [/villa/, '27'],
  [/detached|independiente/, '4'],
  [/chalet/, '24'],
  [/cottage/, '23'],
  [/house|casa|home|vivienda/, '26'],
];

export function guessRightmoveType(...names: Array<string | null | undefined>): string | null {
  for (const raw of names) {
    const name = (raw || '').toLowerCase();
    if (!name) continue;
    for (const [re, value] of GUESSES) if (re.test(name)) return value;
  }
  return null;
}

// Os_Status — see the note at the top: confirm with Rightmove's schema.
export const OS_STATUS = { available: 1, sstc: 2, underOffer: 4, reserved: 5 } as const;

export const MEDIA_TYPE = { image: 1, floorplan: 2, brochure: 3, virtualTour: 4 } as const;

export const AREA_UNIT_SQM = 2;

// RemoveProperty removal_reason.
export const REMOVAL_REASON = { soldByUs: 7, withdrawn: 9, removed: 11 } as const;

// Sales channel (overseas listings are sales only).
export const CHANNEL_SALES = 1;

// Yes/no fields of OverseasSendProperty, matched from the client's feature
// names (en/es).
export const FEATURE_FLAGS: Array<{ key: string; re: RegExp }> = [
  { key: 'private_pool', re: /private (swimming )?pool|piscina privada/ },
  { key: 'communal_pool', re: /communal (swimming )?pool|shared pool|piscina comunitaria/ },
  { key: 'sea_view', re: /sea view|sea views|vistas al mar/ },
  { key: 'air_conditioning', re: /air ?con|a\/c|aire acondicionado|climatizaci/ },
  { key: 'security_system', re: /alarm|security system|cctv|sistema de seguridad/ },
  { key: 'gated_entry', re: /gated|urbanizaci[oó]n cerrada|vallad/ },
  { key: 'balcony', re: /balcon/ },
  { key: 'roof_terrace', re: /roof terrace|solarium|terraza en la azotea/ },
  { key: 'ground_floor_terrace', re: /ground floor terrace|garden terrace/ },
  { key: 'hot_tub', re: /hot tub|jacuzzi|jacuzi/ },
  { key: 'log_fireplace', re: /fireplace|chimenea/ },
  { key: 'private_beach', re: /private beach|playa privada/ },
  { key: 'golf_course_on_site_or_within_10_minutes_walk', re: /frontline golf|golf front|primera l[ií]nea de golf|on golf course/ },
  { key: 'at_beach_or_within_10_minutes_walk', re: /beachfront|beach front|frontline beach|primera l[ií]nea de playa/ },
];
