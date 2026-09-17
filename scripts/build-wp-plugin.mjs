#!/usr/bin/env node
// Packages apps/wordpress-plugin/spw as an installable WordPress plugin zip:
//   dist/wordpress-plugin/spw-<version>.zip   (contains a top-level spw/ folder)
// Upload it via WordPress → Plugins → Add New → Upload Plugin.
//
// Dependency-free (writes the zip format directly with zlib) so it runs the
// same on Windows, macOS and Linux without a `zip` binary.
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

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

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

const files = walk(pluginDir);
const locals = [];
const centrals = [];
let offset = 0;

for (const file of files) {
  const name = Buffer.from('spw/' + relative(pluginDir, file).split(sep).join('/'), 'utf8');
  const data = readFileSync(file);
  const compressed = deflateRawSync(data, { level: 9 });
  const crc = crc32(data);
  const { time, day } = dosDateTime(statSync(file).mtime);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);           // version needed
  local.writeUInt16LE(0x0800, 6);       // UTF-8 names
  local.writeUInt16LE(8, 8);            // deflate
  local.writeUInt16LE(time, 10);
  local.writeUInt16LE(day, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(0, 28);
  locals.push(local, name, compressed);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);         // version made by
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt16LE(time, 12);
  central.writeUInt16LE(day, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(offset, 42);
  centrals.push(central, name);

  offset += local.length + name.length + compressed.length;
}

const centralSize = centrals.reduce((n, b) => n + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralSize, 12);
end.writeUInt32LE(offset, 16);

mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, `spw-${version}.zip`);
writeFileSync(outFile, Buffer.concat([...locals, ...centrals, end]));
console.log(`Built ${relative(root, outFile)} (${files.length} files, v${version})`);
