import { escapeHtml } from './escape-html';

describe('escapeHtml', () => {
  it('escapes the five HTML-sensitive characters', () => {
    expect(escapeHtml(`<script>alert("xss" & 'pwn')</script>`)).toBe(
      '&lt;script&gt;alert(&quot;xss&quot; &amp; &#39;pwn&#39;)&lt;/script&gt;',
    );
  });

  it('escapes ampersand first (no double-encoding)', () => {
    // If `&` were escaped after `<`, the literal `&` in `&lt;` would become
    // `&amp;lt;`. This test pins the order so a future refactor doesn't
    // accidentally break it.
    expect(escapeHtml('<&>')).toBe('&lt;&amp;&gt;');
  });

  it('returns empty string for null / undefined', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('stringifies non-string values', () => {
    expect(escapeHtml(42)).toBe('42');
    expect(escapeHtml(false)).toBe('false');
  });

  it('does not escape characters that are safe in attribute/element context', () => {
    expect(escapeHtml('plain text 123')).toBe('plain text 123');
  });
});
