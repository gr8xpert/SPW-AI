#!/usr/bin/env node
// Packages a plugin under apps/wordpress-plugin/ as an installable zip:
//   node scripts/build-wp-plugin.mjs                 → dist/wordpress-plugin/spm-<version>.zip
//   node scripts/build-wp-plugin.mjs spm-converter   → dist/wordpress-plugin/spm-converter-<version>.zip
// Each zip holds one top-level folder named after the plugin.
// Upload it via WordPress → Plugins → Add New → Upload Plugin.
//
// Dependency-free (scripts/lib/zip.mjs).
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildZip } from './lib/zip.mjs';

// plugin folder → its version constant
const PLUGINS = { spm: 'SPM_VERSION', 'spm-converter': 'SPMC_VERSION' };

const slug = process.argv[2] || 'spm';
if (!PLUGINS[slug]) {
  console.error(`Unknown plugin "${slug}" — use one of: ${Object.keys(PLUGINS).join(', ')}`);
  process.exit(1);
}

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const pluginDir = join(root, 'apps', 'wordpress-plugin', slug);
const outDir = join(root, 'dist', 'wordpress-plugin');

const header = readFileSync(join(pluginDir, `${slug}.php`), 'utf8');
const version = header.match(/^\s*\*\s*Version:\s*([\w.-]+)/m)?.[1];
const constVersion = header.match(new RegExp(`define\\('${PLUGINS[slug]}',\\s*'([\\w.-]+)'\\)`))?.[1];
if (!version || version !== constVersion) {
  console.error(`Version mismatch in ${slug}.php: header "${version}" vs ${PLUGINS[slug]} "${constVersion}"`);
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
const zip = buildZip(files.map((file) => ({ name: `${slug}/` + relative(pluginDir, file).split(sep).join('/'), file })));

mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, `${slug}-${version}.zip`);
writeFileSync(outFile, zip);
console.log(`Built ${relative(root, outFile)} (${files.length} files, v${version})`);
