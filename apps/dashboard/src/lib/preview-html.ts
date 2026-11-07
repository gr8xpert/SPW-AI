// Email previews sit in a sandboxed iframe (no scripts, no popups). A link clicked
// there would load the page inside the frame, and most websites refuse to be
// framed, so the preview turns into the browser's grey error page.
// Every link is sent to a new window instead, which the sandbox blocks: clicks do nothing.
const LINK_TARGET = /(<a\b[^<>]*?)\s+target\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const BASE_TAG = /<base\b[^<>]*>/gi;

export function inertPreviewHtml(html: string | null | undefined): string {
  if (!html) return '';
  const clean = html.replace(BASE_TAG, '').replace(LINK_TARGET, '$1');
  const base = '<base target="_blank">';
  const head = /<head\b[^<>]*>/i.exec(clean);
  if (head) return clean.slice(0, head.index + head[0].length) + base + clean.slice(head.index + head[0].length);
  return base + clean;
}
