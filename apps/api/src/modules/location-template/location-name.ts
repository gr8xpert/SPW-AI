// Place names arrive in many spellings: "Benalmadena" / "Benalmádena",
// "HIGUERON" / "Higuerón", "Ciudad Quesada / Rojales". Matching compares keys:
// lower case, accents stripped, anything but letters and digits collapsed to a
// single space. The same rule as scripts/build-location-template.py.
export function locationKey(name: string | null | undefined): string {
  return stripAccents(String(name ?? '').toLowerCase())
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// NFD splits "á" into "a" + a combining accent (U+0300..U+036F); drop those.
export function stripAccents(text: string): string {
  return text
    .normalize('NFD')
    .split('')
    .filter((c) => c.charCodeAt(0) < 0x300 || c.charCodeAt(0) > 0x36f)
    .join('');
}

// URL-safe slug for new location rows. Accent-stripped, so "Benalmádena"
// becomes "benalmadena" rather than the "benalm-dena" older imports produced.
export function locationSlug(name: string | null | undefined): string {
  return locationKey(name).replace(/ /g, '-').slice(0, 100);
}

export const LOCATION_LEVELS = ['region', 'province', 'area', 'municipality', 'town', 'urbanization'] as const;
export type TemplateLevel = (typeof LOCATION_LEVELS)[number];

export function levelIndex(level: string): number {
  return LOCATION_LEVELS.indexOf(level as TemplateLevel);
}

// The key a feed place the template doesn't know is created under: where the
// feed put it and what it called it. The import looks rows up by it; moves and
// merges in the client's dashboard record it for where a row came from.
export function extraFeedKey(parentId: number | null, name: string | null | undefined): string {
  return `x:${parentId ?? 0}:${locationKey(name)}`;
}
