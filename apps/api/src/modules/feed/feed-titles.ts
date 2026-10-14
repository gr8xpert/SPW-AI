// Listing titles for feeds that send no real title, only a type and a town
// (Resales: "Detached Villa in Mijas", English only). Built from the client's
// own translated type and location names, so every website language gets
// "Vrijstaande villa in Mijas", "Villa individual en Mijas" … and a rename
// of the type or town in the dashboard reaches the titles on the next sync.

// How each language says "<type> in <town>". Finnish, Hungarian and Turkish
// say "in" with a case ending on the town name, which a stored name can't
// take, so those read "<type>, <town>" as their portals do.
export const TITLE_PATTERNS: Record<string, string> = {
  en: '{type} in {town}',
  es: '{type} en {town}',
  ca: '{type} a {town}',
  de: '{type} in {town}',
  fr: '{type} à {town}',
  nl: '{type} in {town}',
  it: '{type} a {town}',
  pt: '{type} em {town}',
  ru: '{type} в {town}',
  pl: '{type} w {town}',
  cs: '{type} v {town}',
  sv: '{type} i {town}',
  no: '{type} i {town}',
  da: '{type} i {town}',
  fi: '{type}, {town}',
  hu: '{type}, {town}',
  tr: '{type}, {town}',
  ar: '{type} في {town}',
  zh: '{town}的{type}',
  ja: '{town}の{type}',
  ko: '{town}의 {type}',
};

type Names = Record<string, string> | null | undefined;

function pick(names: Names, lang: string): string {
  const v = names?.[lang];
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Titles in every language the type name exists in. A town without a name
 * in that language uses its English one (place names rarely change); a type
 * without one is left out, so no title mixes two languages. No type, no
 * titles — the caller keeps what the listing has.
 */
export function buildListingTitles(typeName: Names, townName: Names): Record<string, string> {
  const out: Record<string, string> = {};
  const townEn = pick(townName, 'en');
  for (const [lang, pattern] of Object.entries(TITLE_PATTERNS)) {
    const type = pick(typeName, lang);
    if (!type) continue;
    const town = pick(townName, lang) || townEn;
    out[lang] = town ? pattern.replace('{type}', type).replace('{town}', town) : type;
  }
  return out;
}
