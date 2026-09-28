#!/usr/bin/env node
// Builds ONE zip with everything the server needs for a release:
//   dist/releases/spw-release-<YYYYMMDD-HHMM>.zip
//     api/dist/...            → apps/api/dist
//     dashboard/.next/...     → apps/dashboard/.next   (no cache/, no trace)
//     widget/dist/...         → apps/widget/dist       (+ public /widget/ copy)
//     shared/dist/...         → packages/shared/dist   (loaded by the API at runtime)
//     meta/api-package.json, meta/dashboard-package.json (dependency check)
//     release.json            (id, commit, dashboard BUILD_ID, widget version, migrations)
// Upload it to httpdocs/spw/releases/ and run deploy.php?action=install.
//
//   node scripts/build-release.mjs              build all three apps, then zip
//   node scripts/build-release.mjs --no-build   zip what is already built
// Production URLs can be overridden with NEXT_PUBLIC_API_URL / NEXTAUTH_URL.
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { buildZip } from './lib/zip.mjs';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const apps = (...p) => join(root, 'apps', ...p);
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.spw-ai.com';
const AUTH_URL = process.env.NEXTAUTH_URL || 'https://dashboard.spw-ai.com';

const run = (cmd, cwd, env = {}) => {
  console.log(`\n$ ${cmd}   (${relative(root, cwd) || '.'})`);
  execSync(cmd, { cwd, stdio: 'inherit', env: { ...process.env, ...env } });
};

if (!process.argv.includes('--no-build')) {
  run('npx tsc -p .', join(root, 'packages', 'shared'));
  run('npx nest build', apps('api'));
  run('npx vite build', apps('widget'));
  rmSync(apps('dashboard', '.next'), { recursive: true, force: true });
  // Production URLs are baked into the dashboard at build time.
  run('npx next build', apps('dashboard'), { NEXT_PUBLIC_API_URL: API_URL, NEXTAUTH_URL: AUTH_URL });
}

const fail = (msg) => {
  console.error(`\nSTOP: ${msg}`);
  process.exit(1);
};

function walk(dir, skip = () => false) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (skip(full)) continue;
    if (statSync(full).isDirectory()) out.push(...walk(full, skip));
    else out.push(full);
  }
  return out;
}

const apiDist = apps('api', 'dist');
const nextDir = apps('dashboard', '.next');
const widgetDist = apps('widget', 'dist');
const sharedDist = join(root, 'packages', 'shared', 'dist');
for (const [label, dir] of [['API', apiDist], ['dashboard', nextDir], ['widget', widgetDist], ['shared package', sharedDist]]) {
  if (!existsSync(dir)) fail(`${label} is not built (${relative(root, dir)} missing).`);
}
const buildId = readFileSync(join(nextDir, 'BUILD_ID'), 'utf8').trim();
const widgetVersion = JSON.parse(readFileSync(join(widgetDist, 'version.json'), 'utf8')).version;

const nextFiles = walk(nextDir, (full) => {
  const rel = relative(nextDir, full).split(sep).join('/');
  return rel === 'cache' || rel === 'trace';
});
// A dashboard built with local URLs breaks production logins (see memory: dashboard prod build).
for (const f of nextFiles.filter((f) => f.endsWith('.js'))) {
  if (readFileSync(f, 'utf8').includes('localhost:3001')) fail(`dashboard build contains localhost:3001 (${relative(root, f)}). Rebuild with production URLs.`);
}

const apiFiles = walk(apiDist, (full) => full.endsWith('.tsbuildinfo'));
const migrations = apiFiles
  .map((f) => relative(apiDist, f).split(sep).join('/'))
  .filter((f) => /^database\/migrations\/\d+-.+\.js$/.test(f))
  .map((f) => f.replace(/^database\/migrations\//, '').replace(/\.js$/, ''))
  .sort();

let commit = 'unknown';
try {
  commit = execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim();
  if (execSync('git status --porcelain', { cwd: root }).toString().trim()) commit += '+uncommitted';
} catch {
  /* not a git checkout */
}

const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const id = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
const release = {
  id,
  createdAt: now.toISOString(),
  commit,
  dashboardBuildId: buildId,
  widgetVersion,
  migrations,
  apiUrl: API_URL,
};

const entries = [
  ...apiFiles.map((f) => ({ name: 'api/dist/' + relative(apiDist, f).split(sep).join('/'), file: f })),
  ...nextFiles.map((f) => ({ name: 'dashboard/.next/' + relative(nextDir, f).split(sep).join('/'), file: f })),
  ...walk(widgetDist).map((f) => ({ name: 'widget/dist/' + relative(widgetDist, f).split(sep).join('/'), file: f })),
  // The API loads @spm/shared at runtime.
  ...walk(sharedDist, (full) => full.endsWith('.tsbuildinfo')).map((f) => ({ name: 'shared/dist/' + relative(sharedDist, f).split(sep).join('/'), file: f })),
  { name: 'meta/api-package.json', file: apps('api', 'package.json') },
  { name: 'meta/dashboard-package.json', file: apps('dashboard', 'package.json') },
  { name: 'release.json', data: JSON.stringify(release, null, 2) },
];

const outDir = join(root, 'dist', 'releases');
mkdirSync(outDir, { recursive: true });
// Random part: the releases folder sits under the web root on the server.
const out = join(outDir, `spw-release-${id}-${randomBytes(16).toString('hex')}.zip`);
writeFileSync(out, buildZip(entries));
const mb = (statSync(out).size / 1048576).toFixed(1);
console.log(`\nBuilt ${relative(root, out)}  (${entries.length} files, ${mb} MB)`);
console.log(`  commit ${commit} · dashboard ${buildId} · widget ${widgetVersion} · ${migrations.length} migrations`);
console.log('\nNext: upload it to httpdocs/spw/releases/ (Plesk File Manager), then open');
console.log('  https://spw-ai.com/spw/scripts/deploy/deploy.php?key=<your key>');
console.log('and click Install.');
