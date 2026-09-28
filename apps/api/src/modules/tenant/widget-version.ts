import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

// Version of the deployed widget bundle, from the dist/version.json the widget
// build writes (a hash of spm-widget.umd.js). The WordPress plugin loads the
// bundle with ?ver=<this>, so each deploy is a new URL and no CDN purge is
// needed. The monorepo layout is the same on the server
// (apps/api next to apps/widget/dist); WIDGET_DIST_DIR overrides it.
const CACHE_MS = 60_000;
let cached: { value: string | null; at: number } | null = null;

function candidates(): string[] {
  const list: string[] = [];
  if (process.env.WIDGET_DIST_DIR) list.push(resolve(process.env.WIDGET_DIST_DIR, 'version.json'));
  list.push(resolve(process.cwd(), '../widget/dist/version.json'));
  list.push(resolve(__dirname, '../../../../widget/dist/version.json'));
  return list;
}

export function widgetVersion(now = Date.now()): string | null {
  if (cached && now - cached.at < CACHE_MS) return cached.value;
  let value: string | null = null;
  for (const file of candidates()) {
    try {
      if (!existsSync(file)) continue;
      const v = JSON.parse(readFileSync(file, 'utf8'))?.version;
      if (typeof v === 'string' && /^[a-f0-9]{6,64}$/.test(v)) {
        value = v;
        break;
      }
    } catch {
      /* unreadable: try the next place */
    }
  }
  cached = { value, at: now };
  return value;
}
