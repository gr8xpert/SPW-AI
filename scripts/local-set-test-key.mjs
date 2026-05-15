// Set a known plaintext API key on tenant id=1 (Tenant A Smoke) for local
// browser testing. Writes the raw key to .local-dev-key.txt at repo root.
// Run: node scripts/local-set-test-key.mjs
import { createHash, randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import mysql from 'mysql2/promise';

const rawKey = `spm_${randomBytes(32).toString('hex')}`;
const hash = createHash('sha256').update(rawKey).digest('hex');
const last4 = rawKey.slice(-4);

const conn = await mysql.createConnection({
  host: '127.0.0.1',
  port: 3306,
  user: 'root',
  password: 'dev-root-password',
  database: 'spw_v2_dev',
});

const [r] = await conn.execute(
  'UPDATE tenants SET apiKeyHash = ?, apiKeyLast4 = ?, widgetEnabled = 1, isActive = 1 WHERE id = 1',
  [hash, last4],
);
await conn.end();

writeFileSync('.local-dev-key.txt', rawKey);
console.log(`updated tenant 1; affected: ${r.affectedRows}`);
console.log(`key written to .local-dev-key.txt`);
console.log(`last4: ${last4}`);
