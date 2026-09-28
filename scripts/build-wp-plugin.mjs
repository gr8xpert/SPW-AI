#!/usr/bin/env node
// Packages apps/wordpress-plugin/spw as an installable WordPress plugin zip:
//   dist/wordpress-plugin/spw-<version>.zip   (contains a top-level spw/ folder)
// Upload it via WordPress → Plugins → Add New → Upload Plugin.
//
// Dependency-free (scripts/lib/zip.mjs).
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildZip } from './lib/zip.mjs';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const pluginDir = join(root, 'apps', 'wordpress-plugin', 'spw');
const outDir = join(root, 'dist', 'wordpress-plugin');

const header = readFileSync(join(pluginDir, 'spw.php'), 'utf8');
const version = header.match(/^\s*\*\s*Version:\s*([\w.-]+)/m)?.[1];
const constVersion = header.match(/define\('SPW_VERSION',\s*'([\w.-]+)'\)/)?.[1];
if (!version || version !== constVersion) {
  console.error(`Version mismatch in spw.php: header "${version}" vs SPW_VERSION "${constVersion}"`);
  process.exit(1);
}

// Files that must never ship in the plugin zip.
const EXCLUDE = [/(^|\/)\./, /(^|\/)node_modules\//, /\.zip$/, /(^|\/)Thumbs\.db$/];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = relative(pluginDir, full).split(sep).join('/');
    if (EXCLUDE.some((re) => re.test(rel))) continue;
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out.sort();
}

const files = walk(pluginDir);
const zip = buildZip(files.map((file) => ({ name: 'spw/' + relative(pluginDir, file).split(sep).join('/'), file })));

mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, `spw-${version}.zip`);
writeFileSync(outFile, zip);
console.log(`Built ${relative(root, outFile)} (${files.length} files, v${version})`);
