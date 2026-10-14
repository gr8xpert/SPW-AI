// One-off probe (2026-10-07): what Resales sends for New Developments with
// p_pricelist / P_DecimalBaths / P_ShowGPSCoords / NewDevName / p_keyready.
// Run from apps/api (its .env + node_modules). Prints shapes, never credentials.
const path = require('path');
const api = path.resolve(__dirname, '../../apps/api');
require(path.join(api, 'node_modules/dotenv')).config({ path: path.join(api, '.env') });
const mysql = require(path.join(api, 'node_modules/mysql2/promise'));
const axios = require(path.join(api, 'node_modules/axios'));
const { decryptSecret } = require(path.join(api, 'dist/common/crypto/secret-cipher'));

const BASE = 'https://webapi.resales-online.com/V6';
const cut = (v, n = 1500) => { const s = JSON.stringify(v, null, 1); return s && s.length > n ? s.slice(0, n) + ' …' : s; };

(async () => {
  const db = await mysql.createConnection({
    host: process.env.DATABASE_HOST, port: +(process.env.DATABASE_PORT || 3306),
    user: process.env.DATABASE_USER, password: process.env.DATABASE_PASSWORD, database: process.env.DATABASE_NAME,
  });
  const [rows] = await db.query(
    "SELECT f.id, f.tenantId, t.name, f.credentials FROM feed_configs f JOIN tenants t ON t.id = f.tenantId WHERE f.provider = 'resales' AND f.isActive = 1",
  );
  await db.end();
  for (const row of rows) {
    console.log(`\n================ tenant ${row.tenantId} ${row.name} (feed ${row.id}) ================`);
    let c;
    try { c = JSON.parse(decryptSecret(row.credentials)); } catch (e) { console.log('cannot read credentials:', e.message); continue; }
    const auth = { p_agency_filterid: c.filterId || '', p1: c.clientId || '', p2: c.apiKey || '' };
    try {
      const all = (await axios.get(`${BASE}/SearchProperties`, { params: { ...auth, P_New_Devs: 'only', P_PageSize: 3 }, timeout: 20000 })).data;
      const kr = (await axios.get(`${BASE}/SearchProperties`, { params: { ...auth, P_New_Devs: 'only', p_keyready: 1, P_PageSize: 1 }, timeout: 20000 })).data;
      console.log('developments:', all?.QueryInfo?.PropertyCount, '| key ready:', kr?.QueryInfo?.PropertyCount);
      const list = all?.Property || [];
      if (!list.length) continue;
      const ref = list[0].Reference;
      console.log('list item keys:', Object.keys(list[0]).join(','));
      const d = (await axios.get(`${BASE}/PropertyDetails`, {
        params: { ...auth, P_RefId: ref, P_Lang: 'EN', P_Dimension: 1, p_pricelist: 'TRUE', P_DecimalBaths: 1, P_ShowGPSCoords: 'TRUE', P_shownewdevname: 'TRUE', p_keyready: 1 },
        timeout: 20000,
      })).data;
      const p = Array.isArray(d?.Property) ? d.Property[0] : d?.Property;
      if (!p) { console.log('no detail:', cut(d?.transaction, 400)); continue; }
      console.log('detail', ref, 'keys:', Object.keys(p).join(','));
      const pick = {};
      for (const k of ['NewDevName', 'KeyReady', 'Bedrooms', 'Bathrooms', 'Price', 'Built', 'GpsX', 'GpsY', 'Latitude', 'Longitude', 'CompletionDate', 'Location', 'Area', 'Province', 'Address', 'PropertyType']) pick[k] = p[k];
      console.log('fields:', cut(pick, 1500));
      const listKey = Object.keys(p).find((k) => /price.?list|units/i.test(k));
      console.log('price list key:', listKey);
      if (listKey) {
        const v = p[listKey];
        const units = Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.values(v).find(Array.isArray) || v : v);
        console.log('units:', Array.isArray(units) ? units.length : typeof units);
        console.log(cut(Array.isArray(units) ? units.slice(0, 3) : units, 3000));
        if (Array.isArray(units)) {
          const sold = units.find((u) => JSON.stringify(u).match(/sold/i));
          if (sold) console.log('a SOLD unit:', cut(sold, 800));
        }
      }
    } catch (e) {
      console.log('request failed:', e.response?.status || e.message);
    }
  }
})().catch((e) => { console.error(e); process.exit(1); });
