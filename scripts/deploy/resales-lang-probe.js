// One-off probe (2026-10-14): which languages Resales sends, and how to ask.
// Clients (Ben Kunst) have Dutch text in Resales; we import with P_Lang=EN only.
// Checks: code format (NL vs 5), whether SearchProperties carries the full
// description per language, and what comes back for an untranslated language.
// Run from apps/api (its .env + node_modules). Read-only. Prints no credentials.
// Usage: node resales-lang-probe.js [tenant-name-filter]   (default: kunst)
const path = require('path');
const crypto = require('crypto');
const api = path.resolve(__dirname, '../../apps/api');
require(path.join(api, 'node_modules/dotenv')).config({ path: path.join(api, '.env') });
const mysql = require(path.join(api, 'node_modules/mysql2/promise'));
const axios = require(path.join(api, 'node_modules/axios'));
const { decryptSecret } = require(path.join(api, 'dist/common/crypto/secret-cipher'));

const BASE = 'https://webapi.resales-online.com/V6';
const FILTER = (process.argv[2] || 'kunst').toLowerCase();
const CODES = ['EN', 'ES', 'NL', 'DE', 'FR', 'SV', 'DA', 'NO', 'FI', 'RU', 'PL', 'nl', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15'];

const text = (v) => (typeof v === 'string' ? v : v == null ? '' : JSON.stringify(v));
const hash = (s) => crypto.createHash('md5').update(s).digest('hex').slice(0, 8);
const snip = (s, n = 110) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const first = (p) => (Array.isArray(p) ? p[0] : p);

async function get(endpoint, params) {
  try {
    const d = (await axios.get(`${BASE}/${endpoint}`, { params, timeout: 25000 })).data;
    if (d?.transaction?.status === 'error') return { error: JSON.stringify(d.transaction.errordescription || d.transaction) };
    return { data: d };
  } catch (e) {
    return { error: String(e.response?.status || e.message) };
  }
}

function line(code, desc, enHash, extra = '') {
  const s = text(desc);
  const same = enHash && hash(s) === enHash ? ' [SAME AS EN]' : '';
  return `  ${code.padEnd(4)} type=${typeof desc} len=${String(s.length).padStart(5)} md5=${s ? hash(s) : '-'}${same}${extra} | ${snip(s)}`;
}

(async () => {
  const db = await mysql.createConnection({
    host: process.env.DATABASE_HOST, port: +(process.env.DATABASE_PORT || 3306),
    user: process.env.DATABASE_USER, password: process.env.DATABASE_PASSWORD, database: process.env.DATABASE_NAME,
  });
  const [rows] = await db.query(
    "SELECT f.id, f.tenantId, t.name, f.credentials FROM feed_configs f JOIN tenants t ON t.id = f.tenantId WHERE f.provider = 'resales' AND f.isActive = 1",
  );
  await db.end();
  const picked = rows.filter((r) => FILTER === 'all' || String(r.name).toLowerCase().includes(FILTER));
  console.log(`filter "${FILTER}": ${picked.length} of ${rows.length} active Resales feeds`);
  if (!picked.length) console.log('tenants:', rows.map((r) => r.name).join(', '));

  for (const row of picked) {
    console.log(`\n================ tenant ${row.tenantId} ${row.name} (feed ${row.id}) ================`);
    let c;
    try { c = JSON.parse(decryptSecret(row.credentials)); } catch (e) { console.log('cannot read credentials:', e.message); continue; }
    const auth = { p_agency_filterid: c.filterId || '', p1: c.clientId || '', p2: c.apiKey || '' };

    // Pick a development (the complaint is on for=development), else any listing.
    let devs = true;
    let list = await get('SearchProperties', { ...auth, P_New_Devs: 'only', P_PageSize: 3 });
    let items = [].concat(list.data?.Property || []);
    if (!items.length) {
      devs = false;
      list = await get('SearchProperties', { ...auth, P_PageSize: 3 });
      items = [].concat(list.data?.Property || []);
    }
    if (!items.length) { console.log('no listings:', list.error || 'empty'); continue; }
    const ref = items[0].Reference;
    console.log('list item keys:', Object.keys(items[0]).join(','));
    console.log('QueryInfo:', JSON.stringify(list.data.QueryInfo));

    // 1) PropertyDetails per language code.
    console.log(`\n-- PropertyDetails ${ref}, Description per P_Lang --`);
    let enHash = '';
    for (const code of CODES) {
      const r = await get('PropertyDetails', { ...auth, P_RefId: ref, P_Lang: code, P_Dimension: 1 });
      if (r.error) { console.log(`  ${code.padEnd(4)} ERROR ${r.error.slice(0, 200)}`); continue; }
      const p = first(r.data.Property);
      if (!p) { console.log(`  ${code.padEnd(4)} no Property`); continue; }
      const desc = p.Description;
      if (code === 'EN') enHash = hash(text(desc));
      const langKeys = Object.keys(p).filter((k) => /lang|descr|title|name$/i.test(k)).join(',');
      const qi = r.data.QueryInfo ? ` qi=${JSON.stringify(r.data.QueryInfo).slice(0, 120)}` : '';
      console.log(line(code, desc, code === 'EN' ? '' : enHash, ` keys[${langKeys}] type=${snip(text(p.PropertyType?.NameType), 30)}${qi}`));
    }

    // 2) Is SearchProperties enough? Compare its Description with the detail one.
    console.log(`\n-- SearchProperties Description per P_Lang (same 3 listings) --`);
    const base = { ...auth, P_PageSize: 3, ...(devs ? { P_New_Devs: 'only' } : {}) };
    for (const code of ['EN', 'NL', '5', '3', 'ES', 'DE']) {
      const r = await get('SearchProperties', { ...base, P_Lang: code });
      if (r.error) { console.log(`  ${code.padEnd(4)} ERROR ${r.error.slice(0, 200)}`); continue; }
      const p = [].concat(r.data.Property || []).find((x) => x.Reference === ref) || first(r.data.Property);
      console.log(line(code, p?.Description, '', ` ref=${p?.Reference}`));
    }
  }
})().catch((e) => { console.error(e); process.exit(1); });
