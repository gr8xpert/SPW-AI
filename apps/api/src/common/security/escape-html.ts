// Minimal HTML escape for inserting untrusted user input into outbound HTML
// (emails, dashboard previews). Replaces the five characters that can break
// out of attribute/element context. Output is *not* safe to drop into a
// <script> or <style> body — only for text/attribute contexts.
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
