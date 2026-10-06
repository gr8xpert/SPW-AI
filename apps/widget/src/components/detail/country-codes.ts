// Every country's calling code, by ISO 3166 code. Names come from the
// browser in the page's language (Intl.DisplayNames); flags are built from
// the ISO code. Countries sharing +1 or +7 are told apart by the ISO code.
const DIAL: Record<string, string> = {
  AF: '93', AL: '355', DZ: '213', AS: '1684', AD: '376', AO: '244', AI: '1264', AG: '1268', AR: '54', AM: '374',
  AW: '297', AU: '61', AT: '43', AZ: '994', BS: '1242', BH: '973', BD: '880', BB: '1246', BY: '375', BE: '32',
  BZ: '501', BJ: '229', BM: '1441', BT: '975', BO: '591', BA: '387', BW: '267', BR: '55', VG: '1284', BN: '673',
  BG: '359', BF: '226', BI: '257', KH: '855', CM: '237', CA: '1', CV: '238', KY: '1345', CF: '236', TD: '235',
  CL: '56', CN: '86', CO: '57', KM: '269', CG: '242', CD: '243', CK: '682', CR: '506', CI: '225', HR: '385',
  CU: '53', CW: '599', CY: '357', CZ: '420', DK: '45', DJ: '253', DM: '1767', DO: '1809', EC: '593', EG: '20',
  SV: '503', GQ: '240', ER: '291', EE: '372', SZ: '268', ET: '251', FK: '500', FO: '298', FJ: '679', FI: '358',
  FR: '33', GF: '594', PF: '689', GA: '241', GM: '220', GE: '995', DE: '49', GH: '233', GI: '350', GR: '30',
  GL: '299', GD: '1473', GP: '590', GU: '1671', GT: '502', GG: '44', GN: '224', GW: '245', GY: '592', HT: '509',
  HN: '504', HK: '852', HU: '36', IS: '354', IN: '91', ID: '62', IR: '98', IQ: '964', IE: '353', IM: '44',
  IL: '972', IT: '39', JM: '1876', JP: '81', JE: '44', JO: '962', KZ: '7', KE: '254', KI: '686', XK: '383',
  KW: '965', KG: '996', LA: '856', LV: '371', LB: '961', LS: '266', LR: '231', LY: '218', LI: '423', LT: '370',
  LU: '352', MO: '853', MG: '261', MW: '265', MY: '60', MV: '960', ML: '223', MT: '356', MH: '692', MQ: '596',
  MR: '222', MU: '230', YT: '262', MX: '52', FM: '691', MD: '373', MC: '377', MN: '976', ME: '382', MS: '1664',
  MA: '212', MZ: '258', MM: '95', NA: '264', NR: '674', NP: '977', NL: '31', NC: '687', NZ: '64', NI: '505',
  NE: '227', NG: '234', KP: '850', MK: '389', MP: '1670', NO: '47', OM: '968', PK: '92', PW: '680', PS: '970',
  PA: '507', PG: '675', PY: '595', PE: '51', PH: '63', PL: '48', PT: '351', PR: '1787', QA: '974', RE: '262',
  RO: '40', RU: '7', RW: '250', KN: '1869', LC: '1758', VC: '1784', WS: '685', SM: '378', ST: '239', SA: '966',
  SN: '221', RS: '381', SC: '248', SL: '232', SG: '65', SX: '1721', SK: '421', SI: '386', SB: '677', SO: '252',
  ZA: '27', KR: '82', SS: '211', ES: '34', LK: '94', SD: '249', SR: '597', SE: '46', CH: '41', SY: '963',
  TW: '886', TJ: '992', TZ: '255', TH: '66', TL: '670', TG: '228', TO: '676', TT: '1868', TN: '216', TR: '90',
  TM: '993', TC: '1649', TV: '688', UG: '256', UA: '380', AE: '971', GB: '44', US: '1', UY: '598', VI: '1340',
  UZ: '998', VU: '678', VA: '39', VE: '58', VN: '84', YE: '967', ZM: '260', ZW: '263',
};

export interface CountryCode {
  country: string;
  code: string;
  flag: string;
  name: string;
}

function flagOf(iso: string): string {
  return String.fromCodePoint(...[...iso].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

let cache: { lang: string; list: CountryCode[] } | null = null;

/** All countries, sorted by name in the page language. */
export function countryCodes(language: string): CountryCode[] {
  if (cache?.lang === language) return cache.list;
  let names: { of(code: string): string | undefined } | null = null;
  try {
    names = new Intl.DisplayNames([language, 'en'], { type: 'region' });
  } catch { /* old browser: ISO codes as names */ }
  const list = Object.entries(DIAL)
    .map(([country, dial]) => ({ country, code: `+${dial}`, flag: flagOf(country), name: names?.of(country) || country }))
    .sort((a, b) => a.name.localeCompare(b.name, language));
  cache = { lang: language, list };
  return list;
}

export function isCountry(iso: unknown): iso is string {
  return typeof iso === 'string' && iso.toUpperCase() in DIAL;
}

// Fallback when the visitor's country can't be asked: their time zone, then
// their browser language's region.
const ZONE_COUNTRY: Record<string, string> = {
  'Europe/Madrid': 'ES', 'Atlantic/Canary': 'ES', 'Africa/Ceuta': 'ES', 'Europe/London': 'GB', 'Europe/Dublin': 'IE',
  'Europe/Paris': 'FR', 'Europe/Berlin': 'DE', 'Europe/Amsterdam': 'NL', 'Europe/Brussels': 'BE', 'Europe/Luxembourg': 'LU',
  'Europe/Rome': 'IT', 'Europe/Lisbon': 'PT', 'Europe/Zurich': 'CH', 'Europe/Vienna': 'AT', 'Europe/Stockholm': 'SE',
  'Europe/Oslo': 'NO', 'Europe/Copenhagen': 'DK', 'Europe/Helsinki': 'FI', 'Europe/Warsaw': 'PL', 'Europe/Prague': 'CZ',
  'Europe/Budapest': 'HU', 'Europe/Bucharest': 'RO', 'Europe/Sofia': 'BG', 'Europe/Athens': 'GR', 'Europe/Istanbul': 'TR',
  'Europe/Kiev': 'UA', 'Europe/Kyiv': 'UA', 'Europe/Moscow': 'RU', 'Europe/Gibraltar': 'GI', 'Europe/Malta': 'MT',
  'Asia/Nicosia': 'CY', 'Asia/Dubai': 'AE', 'Asia/Riyadh': 'SA', 'Asia/Qatar': 'QA', 'Asia/Kuwait': 'KW',
  'Asia/Karachi': 'PK', 'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN', 'Asia/Dhaka': 'BD', 'Asia/Shanghai': 'CN',
  'Asia/Hong_Kong': 'HK', 'Asia/Singapore': 'SG', 'Asia/Tokyo': 'JP', 'Asia/Seoul': 'KR', 'Asia/Jerusalem': 'IL',
  'Asia/Tehran': 'IR', 'Asia/Bangkok': 'TH', 'Asia/Manila': 'PH', 'Asia/Jakarta': 'ID', 'Asia/Kuala_Lumpur': 'MY',
  'Africa/Casablanca': 'MA', 'Africa/Cairo': 'EG', 'Africa/Johannesburg': 'ZA', 'Africa/Lagos': 'NG', 'Africa/Nairobi': 'KE',
  'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US', 'America/Los_Angeles': 'US', 'America/Phoenix': 'US',
  'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Mexico_City': 'MX', 'America/Sao_Paulo': 'BR',
  'America/Argentina/Buenos_Aires': 'AR', 'America/Bogota': 'CO', 'America/Lima': 'PE', 'America/Santiago': 'CL',
  'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Australia/Perth': 'AU', 'Pacific/Auckland': 'NZ',
};

export function guessCountry(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (ZONE_COUNTRY[zone]) return ZONE_COUNTRY[zone];
  } catch { /* no Intl time zone */ }
  const region = (navigator.language || '').split('-')[1]?.toUpperCase();
  return isCountry(region) ? region : null;
}
