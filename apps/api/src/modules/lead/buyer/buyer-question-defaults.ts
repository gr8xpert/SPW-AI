// The starting set of Buyer questions (seeded per tenant on first use) and
// the pure helpers around answers. Clients edit and translate their own copy;
// changing these defaults never touches a tenant that already has questions.

export interface DefaultQuestion {
  qkey: string;
  label: Record<string, string>;
  multiple: boolean;
  options: { key: string; label: Record<string, string> }[];
}

const o = (key: string, en: string, es: string) => ({ key, label: { en, es } });

export const DEFAULT_QUESTIONS: DefaultQuestion[] = [
  {
    qkey: 'purpose',
    label: { en: 'Purpose', es: 'Finalidad' },
    multiple: false,
    options: [
      o('holiday_home', 'Holiday home', 'Segunda residencia'),
      o('permanent', 'Permanent residence', 'Residencia habitual'),
      o('investment', 'Investment', 'Inversión'),
      o('retirement', 'Retirement', 'Jubilación'),
    ],
  },
  {
    qkey: 'financial',
    label: { en: 'Financial situation', es: 'Situación financiera' },
    multiple: false,
    options: [
      o('cash', 'Cash buyer', 'Compra al contado'),
      o('mortgage', 'Needs a mortgage', 'Necesita hipoteca'),
      o('sell_first', 'Must sell a property first', 'Debe vender antes'),
    ],
  },
  {
    qkey: 'location_setting',
    label: { en: 'Location setting', es: 'Entorno' },
    multiple: true,
    options: [
      o('village', 'Village', 'Pueblo'),
      o('countryside', 'Countryside', 'Campo'),
      o('coast', 'Coast', 'Costa'),
    ],
  },
  {
    qkey: 'distance_airport',
    label: { en: 'Distance to airport by car', es: 'Distancia al aeropuerto en coche' },
    multiple: false,
    options: [
      o('lt_30', 'Up to 30 min', 'Hasta 30 min'),
      o('lt_60', 'Up to 1 hour', 'Hasta 1 hora'),
      o('any', 'No preference', 'Sin preferencia'),
    ],
  },
  {
    qkey: 'distance_beach',
    label: { en: 'Distance to beach by car', es: 'Distancia a la playa en coche' },
    multiple: false,
    options: [
      o('walking', 'Walking distance', 'A pie'),
      o('lt_10', 'Up to 10 min', 'Hasta 10 min'),
      o('lt_30', 'Up to 30 min', 'Hasta 30 min'),
      o('any', 'No preference', 'Sin preferencia'),
    ],
  },
  {
    qkey: 'distance_shops',
    label: { en: 'Distance to stores / village by car', es: 'Distancia a tiendas / pueblo en coche' },
    multiple: false,
    options: [
      o('walking', 'Walking distance', 'A pie'),
      o('lt_10', 'Up to 10 min', 'Hasta 10 min'),
      o('lt_30', 'Up to 30 min', 'Hasta 30 min'),
      o('any', 'No preference', 'Sin preferencia'),
    ],
  },
  {
    qkey: 'timeframe',
    label: { en: 'When do you want to buy?', es: '¿Cuándo quiere comprar?' },
    multiple: false,
    options: [
      o('now', 'As soon as possible', 'Lo antes posible'),
      o('3_months', 'Within 3 months', 'En 3 meses'),
      o('6_months', 'Within 6 months', 'En 6 meses'),
      o('1_year', 'Within a year', 'En un año'),
      o('browsing', 'Just looking', 'Solo mirando'),
    ],
  },
  {
    qkey: 'found_us',
    label: { en: 'How did you find us?', es: '¿Cómo nos encontró?' },
    multiple: false,
    options: [
      o('google', 'Google', 'Google'),
      o('portal', 'Property portal', 'Portal inmobiliario'),
      o('social', 'Social media', 'Redes sociales'),
      o('referral', 'Recommended by someone', 'Recomendación'),
      o('other', 'Other', 'Otro'),
    ],
  },
];

// A question or option key from its first label: lower case, no accents,
// words joined by "_", at most 60 characters. '' when nothing usable is left.
export function questionKey(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)
    .replace(/_+$/, '');
}

export const ANSWER_KEY_RE = /^[a-z0-9_]{1,60}$/;

// Answers as sent by the dashboard (or later the wishlist form) → only
// questions and options that exist, one option for a single-choice question,
// no duplicates, no empty lists.
export function cleanAnswers(
  questions: { qkey: string; multiple: boolean; options: { key: string }[] }[],
  raw: Record<string, unknown> | null | undefined,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const q of questions) {
    const value = raw[q.qkey];
    const picked = (Array.isArray(value) ? value : typeof value === 'string' ? [value] : []).filter(
      (v): v is string => typeof v === 'string',
    );
    const valid = q.options.map((x) => x.key);
    const keep = [...new Set(picked)].filter((v) => valid.includes(v));
    if (!keep.length) continue;
    out[q.qkey] = q.multiple ? keep : keep.slice(0, 1);
  }
  return out;
}

// Lead form answers (Facebook: "question → answer") → Buyer question
// answers. A question matches by its key or a label in any language, an
// answer by an option's key or label (a form's multi-choice answer is
// "a, b"). A form may cut a long question short (or the client's label is
// the start of it): a shared start of 12+ characters also counts. Only questions the buyer has no answer to yet are filled, so an
// agent's answer is never overwritten. Unmatched answers stay in the enquiry.
export function answersFromForm(
  questions: { qkey: string; multiple: boolean; isActive?: boolean; label: Record<string, string>; options: { key: string; label: Record<string, string> }[] }[],
  form: { question: string; answer: string }[],
  current: Record<string, string[]> | null | undefined,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const names = (key: string, label: Record<string, string>) => new Set([key, ...Object.values(label).map(questionKey)].filter(Boolean));
  for (const f of form) {
    const asked = questionKey(f.question);
    if (!asked) continue;
    const active = questions.filter((x) => x.isActive !== false);
    const prefix = (a: string, b: string) => Math.min(a.length, b.length) >= 12 && (a.startsWith(b) || b.startsWith(a));
    const q =
      active.find((x) => names(x.qkey, x.label).has(asked)) ??
      active.find((x) => [...names(x.qkey, x.label)].some((n) => prefix(n, asked)));
    if (!q || current?.[q.qkey]?.length || out[q.qkey]) continue;
    const parts = q.multiple ? f.answer.split(/\s*[,;]\s*/) : [f.answer];
    const picked = parts
      .map((p) => questionKey(p))
      .map((p) => q.options.find((o) => p && names(o.key, o.label).has(p))?.key)
      .filter((k): k is string => !!k);
    const keep = [...new Set(picked)];
    if (keep.length) out[q.qkey] = q.multiple ? keep : keep.slice(0, 1);
  }
  return out;
}
