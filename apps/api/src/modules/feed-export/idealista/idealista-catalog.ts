// idealista feed v6 (customer JSON) — the fixed lists the builder maps onto.
// Source: feeds.idealista.com/v6/schemas/properties/*.json.

// Which features schema a type belongs to. Each schema has its own required
// fields and its own allowed keys (additionalProperties: false).
export type IdealistaCategory = 'homes' | 'premises' | 'office' | 'garage' | 'storage' | 'building' | 'land';

export interface IdealistaTypeOption {
  value: string;
  label: string;
  category: IdealistaCategory;
}

// The Spain-relevant subset of the schema enums, in dashboard order.
export const IDEALISTA_TYPES: IdealistaTypeOption[] = [
  { value: 'flat', label: 'Flat / apartment (piso)', category: 'homes' },
  { value: 'house', label: 'House (casa o chalet)', category: 'homes' },
  { value: 'house_independent', label: 'Detached house (chalet independiente)', category: 'homes' },
  { value: 'house_semidetached', label: 'Semi-detached house (chalet pareado)', category: 'homes' },
  { value: 'house_terraced', label: 'Terraced house (chalet adosado)', category: 'homes' },
  { value: 'house_villa', label: 'Villa', category: 'homes' },
  { value: 'rustic', label: 'Country house (casa rústica)', category: 'homes' },
  { value: 'rustic_cortijo', label: 'Cortijo', category: 'homes' },
  { value: 'rustic_masia', label: 'Masía', category: 'homes' },
  { value: 'rustic_caseron', label: 'Caserón', category: 'homes' },
  { value: 'rustic_village', label: 'Village house (casa de pueblo)', category: 'homes' },
  { value: 'rustic_palace', label: 'Palace (palacio)', category: 'homes' },
  { value: 'rustic_castle', label: 'Castle (castillo)', category: 'homes' },
  { value: 'rustic_torre', label: 'Torre', category: 'homes' },
  { value: 'rustic_terrera', label: 'Casa terrera', category: 'homes' },
  { value: 'premises', label: 'Commercial premises (local)', category: 'premises' },
  { value: 'premises_commercial', label: 'Commercial premises – shop', category: 'premises' },
  { value: 'premises_industrial', label: 'Industrial premises (nave)', category: 'premises' },
  { value: 'office', label: 'Office (oficina)', category: 'office' },
  { value: 'garage', label: 'Garage / parking space', category: 'garage' },
  { value: 'storage', label: 'Storage room (trastero)', category: 'storage' },
  { value: 'building', label: 'Building (edificio)', category: 'building' },
  { value: 'land', label: 'Land (terreno)', category: 'land' },
  { value: 'land_urban', label: 'Urban land (suelo urbano)', category: 'land' },
  { value: 'land_countrybuildable', label: 'Buildable rustic land', category: 'land' },
  { value: 'land_countrynonbuildable', label: 'Non-buildable rustic land', category: 'land' },
];

const TYPE_BY_VALUE = new Map(IDEALISTA_TYPES.map((t) => [t.value, t]));

export function isIdealistaType(value: unknown): value is string {
  return typeof value === 'string' && TYPE_BY_VALUE.has(value);
}

export function idealistaCategory(value: string): IdealistaCategory | null {
  return TYPE_BY_VALUE.get(value)?.category ?? null;
}

// Guess from a property type name (any language). First match wins, so the
// specific names come before the general ones. Where Cristi Homes' current
// Odoo mapping covers a name, the guess follows it (e.g. Townhouse → house,
// Building → premises_commercial) — those values are proven on idealista.
const GUESSES: Array<[RegExp, string]> = [
  [/semi[\s-]?detached|pareado/, 'house_semidetached'],
  [/industrial|nave/, 'premises_commercial'],
  [/building|edificio/, 'premises_commercial'],
  [/garage|garaje|parking|aparcamiento|plaza de/, 'garage'],
  [/storage|trastero/, 'storage'],
  [/office|oficina/, 'office'],
  [/urban (plot|land)|suelo urbano|solar urbano/, 'land_urban'],
  [/plot|land|terreno|parcela|solar/, 'land'],
  [/penthouse|[aá]tico|duplex|d[uú]plex|studio|estudio|apartment|apartamento|\bflat\b|piso|ground floor|planta baja/, 'flat'],
  [/commercial|comercial|\bbar\b|caf[eé]|restaurant|hotel|hostel|b&b|business|negocio|premises|\blocal\b|shop|tienda/, 'premises'],
  [/villa|detached|independiente/, 'house_independent'],
  [/cortijo/, 'rustic_cortijo'],
  [/town ?house|terraced|adosad|bungalow|finca|country|house|casa|chalet|home|vivienda/, 'house'],
];

export function guessIdealistaType(...names: Array<string | null | undefined>): string | null {
  for (const raw of names) {
    const name = (raw || '').toLowerCase();
    if (!name) continue;
    for (const [re, value] of GUESSES) if (re.test(name)) return value;
  }
  return null;
}

// Flat sub-kinds idealista wants as flags on a `flat`.
export function flatFlags(typeName: string): Record<string, boolean> {
  const n = typeName.toLowerCase();
  const flags: Record<string, boolean> = {};
  if (/penthouse|[aá]tico/.test(n)) flags.featuresPenthouse = true;
  if (/duplex|d[uú]plex/.test(n)) flags.featuresDuplex = true;
  if (/studio|estudio/.test(n)) flags.featuresStudio = true;
  return flags;
}

// Our language codes → idealista descriptionLanguage.
export const DESCRIPTION_LANGUAGES: Record<string, string> = {
  es: 'spanish', en: 'english', de: 'german', fr: 'french', nl: 'dutch',
  ru: 'russian', it: 'italian', pt: 'portuguese', ca: 'catalan', fi: 'finnish',
  pl: 'polish', ro: 'romanian', sv: 'swedish', da: 'danish', no: 'norway',
  nb: 'norway', el: 'greek', zh: 'chinese',
};

// Yes/no features matched from the client's feature names (en/es). Only for
// the categories whose schema allows that key.
export const FEATURE_KEYWORDS: Array<{ key: string; re: RegExp; categories: IdealistaCategory[] }> = [
  { key: 'featuresPool', re: /pool|piscina/, categories: ['homes'] },
  { key: 'featuresConditionedAir', re: /air ?con|a\/c|aire acondicionado|climatizaci/, categories: ['homes', 'premises', 'office'] },
  { key: 'featuresLiftAvailable', re: /\blift\b|elevator|ascensor/, categories: ['homes', 'garage'] },
  { key: 'featuresTerrace', re: /terrace|terraza/, categories: ['homes'] },
  { key: 'featuresGarden', re: /garden|jard[ií]n/, categories: ['homes', 'building'] },
  { key: 'featuresParkingAvailable', re: /parking|garage|garaje|aparcamiento/, categories: ['homes', 'premises'] },
  { key: 'featuresStorage', re: /storage|trastero/, categories: ['homes', 'premises', 'office'] },
  { key: 'featuresWardrobes', re: /wardrobe|armario/, categories: ['homes'] },
  { key: 'featuresBalcony', re: /balcon/, categories: ['homes'] },
  { key: 'featuresDoorman', re: /doorman|concierge|portero|conserje/, categories: ['homes', 'office'] },
  { key: 'featuresEquippedKitchen', re: /(fitted|equipped) kitchen|cocina (equipada|amueblada)/, categories: ['homes', 'premises', 'office'] },
  { key: 'featuresEquippedWithFurniture', re: /^(fully )?furnished|^amueblad/, categories: ['homes'] },
  { key: 'featuresAllowPets', re: /pets allowed|admite mascotas/, categories: ['homes'] },
  { key: 'featuresSecurityAlarm', re: /alarm/, categories: ['premises', 'office', 'garage'] },
];

// "South", "South West", "Orientation: South", "Orientación sur", "North facing".
const ORIENTATION_RE =
  /^(orientation[:\s-]*|orientaci[oó]n[:\s-]*)?((north|south|east|west|norte|sur|este|oeste)(\s*[-/ ]\s*(north|south|east|west|norte|sur|este|oeste))?)(\s+facing)?$/;
const ORIENTATION_KEYS: Record<string, string> = {
  north: 'featuresOrientationNorth', norte: 'featuresOrientationNorth',
  south: 'featuresOrientationSouth', sur: 'featuresOrientationSouth',
  east: 'featuresOrientationEast', este: 'featuresOrientationEast',
  west: 'featuresOrientationWest', oeste: 'featuresOrientationWest',
};

export function orientationKeys(featureName: string): string[] {
  const m = ORIENTATION_RE.exec(featureName.trim().toLowerCase());
  if (!m) return [];
  return [m[3], m[5]].filter(Boolean).map((w) => ORIENTATION_KEYS[w]);
}

export const ENERGY_RATINGS = ['A', 'A+', 'B', 'C', 'D', 'E', 'F', 'G'];

// Video files idealista downloads itself — streaming pages (YouTube, Vimeo)
// are not accepted.
export const VIDEO_FILE_RE = /\.(mp4|mov|avi|wmv|mpe?g|flv|m2t|3gp|rm)(\?.*)?$/i;
