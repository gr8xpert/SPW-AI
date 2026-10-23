# AI Email Designer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Email Campaigns clients a full-page template editor (HTML code + live preview that matches the sent email) with an AI designer chat that builds and refines templates, a listing loop, an image library, version history/undo and a per-client brand memory.

**Architecture:** The renderer (`campaign-render.ts`) gains a listing loop and agency placeholders; a pure check module sanitizes templates and inlines CSS at render time. New `designer/` folder in the email-campaign module holds versions, images, brand memory, starter layouts and the AI turn loop (tool calls on the client's own key through the existing `AiService.chatCompletionWithTools`). The dashboard gets `/dashboard/campaigns/templates/new|[id]` with CodeMirror, a sandboxed preview iframe rendered by the API, a chat panel and an image library.

**Tech Stack:** NestJS 10 + TypeORM (MySQL), jest; `sanitize-html`, `juice`, `sharp` (already installed); Next 14.1.4 dashboard with `@uiw/react-codemirror` + `@codemirror/lang-html`; puppeteer for E2E (scratchpad, not committed).

**Spec:** `docs/superpowers/specs/2026-10-23-ai-email-designer-design.md`

## Global Constraints

- **No commits by the implementer.** The user commits only after testing by hand. Never stage `.claude/settings.json` or `docs/locations-rosvan.csv`. Each task ends with a *checkpoint* (tests green + graphify rebuild), not a commit.
- After code changes: `python -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"` from the repo root.
- Check current docs with Context7 before using `sanitize-html`, `juice`, `@uiw/react-codemirror`, `sharp` APIs.
- AI calls for this feature use **the client's own key only** (`AiService.chatCompletionWithTools`, which resolves with source `'client'`). Never the platform key.
- Every API route: `@UseGuards(JwtAuthGuard, TenantGuard, DashboardAddonGuard)` + `@RequiresAddon('emailCampaign')`; every query scoped by `tenantId`.
- Dashboard wording in 7 languages: `en, nl, es, fr, de, fi, sv`; each language file is typed with the English type so a missing key fails `tsc`.
- Files under ~500 lines; split by responsibility.
- Responses from the API are wrapped `{ data: ... }` by `TransformInterceptor`; dashboard code unwraps with `res?.data ?? res`.
- Limits (exact values): template HTML ≤ 100 KB after sanitize; 50 versions per template; chat history sent to the model = last 20 user/assistant messages; ≤ 4 tool rounds per turn; 30 AI messages per client per hour (`EMAIL_DESIGNER_HOURLY_LIMIT`); brand memory ≤ 20 notes × 200 chars; images ≤ 10 MB in, ≤ 1200 px wide out, 200 images and 100 MB per client (`EMAIL_IMAGE_LIMIT_MB`, per-client override `settings.emailImageLimitMb`); unused images deleted after 30 days, never when used in a sent campaign.
- Local test tenant: tenant 2, API key `spm_` + 64×`a`, client login `e2e-client@test.local` / `password123`. Ports: API 3001 (`node dist/main.js`, rebuild with `pnpm --filter api build`), dashboard 3020 (`npx next dev -p 3020`), Mailpit UI 127.0.0.1:58025.
- Run API unit tests with `cd apps/api && npx jest <path>`; typecheck with `npx tsc --noEmit` in `apps/api`, `apps/dashboard`.

## Spec adjustments made while planning (already applied to the spec)

1. The AI turn is a plain `POST` returning the finished result (no SSE): the HTML must be complete and checked before it is shown, so streaming partial HTML adds nothing. The editor shows a "Designing…" state.
2. CSS is inlined **when rendering** (preview and send), not when saving, so the client's code view stays readable.
3. The image limit override is `settings.emailImageLimitMb` (Super Admin can set it via the client's settings JSON) plus the `EMAIL_IMAGE_LIMIT_MB` env default; no new Super Admin UI.
4. Images used by a campaign are *pinned* when the campaign starts sending and never cleaned up.
5. No "Send test" button in the editor: the campaign page already sends tests with real featured listings.
6. Images whose address comes out empty (no logo set, listing without a photo) are removed when rendering, so no broken-image icon shows.

## File map

API (`apps/api/src/modules/email-campaign/`):
- Modify `campaign-render.ts` — listing loop, agency placeholders, known-placeholder lists.
- Create `template-check.ts` — sanitize, validate, inline CSS (pure).
- Modify `campaign-content.service.ts` — new card fields, agency info, inline CSS, `previewSample`.
- Modify `email-campaign.service.ts` — check on template save, record versions, touch images.
- Modify `email-campaign.controller.ts` — `POST email-templates/render-preview`.
- Modify `email-campaign.processor.ts` — pin images when sending starts.
- Create `designer/template-version.service.ts`, `designer/email-image.service.ts`, `designer/brand-memory.service.ts`, `designer/layouts.ts`, `designer/design-guide.ts`, `designer/designer-tools.ts`, `designer/email-designer.service.ts`, `designer/email-designer.controller.ts`, `designer/designer-cleanup.service.ts`, `dto/designer.dto.ts`.
- Modify `email-campaign.module.ts`.
- Create `apps/api/src/database/entities/email-designer.entity.ts`; modify `entities/index.ts`.
- Create `apps/api/src/database/migrations/1777410000000-EmailDesigner.ts`.
- Modify `apps/api/src/modules/ai/ai.service.ts` — `clientModel()`.

Dashboard (`apps/dashboard/src/app/(dashboard)/dashboard/campaigns/`):
- Create `templates/new/page.tsx`, `templates/[id]/page.tsx`.
- Create `templates/_components/template-editor.tsx`, `code-pane.tsx`, `preview-pane.tsx`, `insert-menu.tsx`, `history-menu.tsx`, `image-library.tsx`, `designer-chat.tsx`, `brand-memory-dialog.tsx`, `layout-picker.tsx`, `use-template-editor.ts`.
- Create `templates/_i18n/{index,en,nl,es,fr,de,fi,sv}.ts`.
- Modify `_components/templates-section.tsx` — New/Edit open the editor page; dialog removed.

---
### Task 1: Listing loop + agency placeholders in the renderer

**Files:**
- Modify: `apps/api/src/modules/email-campaign/campaign-render.ts`
- Test: `apps/api/src/modules/email-campaign/campaign-render.spec.ts`

**Interfaces:**
- Produces:
  - `CampaignPropertyCard` gains optional `reference?: string; beds?: number | null; baths?: number | null; area?: string | null`.
  - `CampaignRenderInput` gains `agencyInfo?: AgencyInfo` where `export interface AgencyInfo { logo?: string | null; phone?: string | null; email?: string | null; website?: string | null }`.
  - `export const LOOP_RE: RegExp` (global, matches `{{#properties}}…{{/properties}}`, group 1 = inner).
  - `export const KNOWN_PLACEHOLDERS: readonly string[]` and `export const PROPERTY_PLACEHOLDERS: readonly string[]`.
  - `export function safeUrl(u: string | null | undefined): string`.

- [ ] **Step 1: Write the failing tests** — append to `campaign-render.spec.ts`:

```ts
describe('listing loop and agency placeholders', () => {
  const card = (over: Record<string, unknown> = {}) => ({
    title: 'Villa <Sol>', location: 'Marbella', propertyType: 'Villa', price: '€500,000', facts: ['3 bed'],
    image: 'https://img/x.jpg', url: 'https://site/p/1', reference: 'R1', beds: 3, baths: 2, area: '210 m²', ...over,
  });

  it('repeats the loop once per listing with escaped values', () => {
    const out = renderCampaignEmail(base({
      bodyHtml: '<table>{{#properties}}<tr><td><img src="{{property.image}}">{{property.title}} {{property.price}} {{property.beds}}/{{property.baths}} {{property.area}} {{property.reference}} <a href="{{property.url}}">Go</a></td></tr>{{/properties}}</table>{{unsubscribe_link}}',
      properties: [card(), card({ title: 'Flat', url: 'https://site/p/2', reference: 'R2' })] as never,
    }));
    expect(out.html).toContain('Villa &lt;Sol&gt; €500,000 3/2 210 m² R1');
    expect(out.html).toContain('href="https://site/p/2"');
    expect(out.html.match(/<tr>/g)).toHaveLength(2);
    expect(out.html).not.toContain('{{');
  });

  it('drops unsafe addresses inside the loop, and images left without an address', () => {
    const out = renderCampaignEmail(base({
      bodyHtml: '{{#properties}}<img src="{{property.image}}" alt="x"><a href="{{property.url}}">x</a>{{/properties}}',
      properties: [card({ image: 'javascript:alert(1)', url: 'data:text/html,hi' })] as never,
    }));
    expect(out.html).not.toContain('<img');
    expect(out.html).toContain('<a href="">x</a>');
  });

  it('removes the loop when there are no listings and does not add the fixed cards', () => {
    const out = renderCampaignEmail(base({ bodyHtml: '<p>A</p>{{#properties}}<p>{{property.title}}</p>{{/properties}}<p>B</p>', properties: [] }));
    expect(out.html).toContain('<p>A</p><p>B</p>');
    const withCards = renderCampaignEmail(base({ bodyHtml: '{{#properties}}<b>{{property.title}}</b>{{/properties}}', properties: [card()] as never }));
    expect(withCards.html).not.toContain('border:1px solid #e2e8f0');
  });

  it('fills agency placeholders and only allows http(s) logo and website', () => {
    const out = renderCampaignEmail(base({
      bodyHtml: '<img src="{{agency.logo}}"> {{agency.phone}} {{agency.email}} <a href="{{agency.website}}">w</a> {{agency.color}}',
      color: '#112233',
      agencyInfo: { logo: 'https://cdn/logo.png', phone: '+34 600', email: 'info@sun.es', website: 'javascript:x' },
    }));
    expect(out.html).toContain('<img src="https://cdn/logo.png"> +34 600 info@sun.es <a href="">w</a> #112233');
    const noLogo = renderCampaignEmail(base({ bodyHtml: '<img src="{{agency.logo}}" alt="{{agency.name}}"><p>x</p>' }));
    expect(noLogo.html).not.toContain('<img');
  });

  it('text version lists the listings and has no loop markup', () => {
    const out = renderCampaignEmail(base({ bodyHtml: '<p>Hi</p>{{#properties}}<p>{{property.title}}</p>{{/properties}}', properties: [card()] as never }));
    expect(out.text).toContain('Villa <Sol>');
    expect(out.text).not.toContain('{{');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/api && npx jest src/modules/email-campaign/campaign-render.spec.ts`
Expected: the 5 new tests FAIL (loop markup left in the output, agency placeholders empty).

- [ ] **Step 3: Implement** in `campaign-render.ts`.

Extend the header comment:

```ts
//   {{agency.logo}} {{agency.phone}} {{agency.email}} {{agency.website}} {{agency.color}}
//   {{#properties}} … {{/properties}}  repeats its content per featured listing, with
//     {{property.title}} {{property.price}} {{property.location}} {{property.type}}
//     {{property.reference}} {{property.beds}} {{property.baths}} {{property.area}}
//     {{property.image}} {{property.url}}
```

Interfaces:

```ts
export interface CampaignPropertyCard {
  title: string;
  location: string | null;
  propertyType: string | null;
  price: string | null;
  facts: string[];
  image: string | null;
  url: string | null;
  // Only the listing loop uses these.
  reference?: string;
  beds?: number | null;
  baths?: number | null;
  area?: string | null;
}

export interface AgencyInfo {
  logo?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
}
```

Add `agencyInfo?: AgencyInfo;` to `CampaignRenderInput`. Then the constants:

```ts
export const LOOP_RE = /\{\{\s*#properties\s*\}\}([\s\S]*?)\{\{\s*\/properties\s*\}\}/gi;

export const PROPERTY_PLACEHOLDERS = [
  'property.title', 'property.price', 'property.location', 'property.type', 'property.reference',
  'property.beds', 'property.baths', 'property.area', 'property.image', 'property.url',
] as const;

export const KNOWN_PLACEHOLDERS = [
  'contact.name', 'contact.first_name', 'contact.email',
  'agency.name', 'agency.logo', 'agency.phone', 'agency.email', 'agency.website', 'agency.color',
  'properties', 'unsubscribe_link',
] as const;

// Image and link addresses from data: only http(s), anything else becomes empty.
export function safeUrl(u: string | null | undefined): string {
  const v = (u || '').trim();
  return /^https?:\/\//i.test(v) ? v : '';
}

function propertyValues(c: CampaignPropertyCard): Record<string, string> {
  return {
    'property.title': c.title,
    'property.price': c.price ?? '',
    'property.location': c.location ?? '',
    'property.type': c.propertyType ?? '',
    'property.reference': c.reference ?? '',
    'property.beds': c.beds ? String(c.beds) : '',
    'property.baths': c.baths ? String(c.baths) : '',
    'property.area': c.area ?? '',
    'property.image': safeUrl(c.image),
    'property.url': safeUrl(c.url),
  };
}
```

`vars` takes the colour and adds the agency values:

```ts
function vars(input: CampaignRenderInput, color: string): Record<string, string> {
  const name = (input.contact.name || '').trim();
  const info = input.agencyInfo || {};
  return {
    'contact.name': name,
    'contact.first_name': name.split(/\s+/)[0] || '',
    'contact.email': input.contact.email,
    'agency.name': input.agency,
    'agency.logo': safeUrl(info.logo),
    'agency.phone': (info.phone || '').trim(),
    'agency.email': (info.email || '').trim(),
    'agency.website': safeUrl(info.website),
    'agency.color': color,
    unsubscribe_link: input.unsubscribeUrl,
  };
}
```

In `renderCampaignEmail`, replace everything from `const values = vars(input);` through `html = html.split(MARK).join(cards);` with:

```ts
  const values = vars(input, color);
  const cards = propertyCardsHtml(input.properties, color, t.view);

  // Loops and {{properties}} are markup, so they are swapped in after the escaped fill.
  const MARK = '\u0000SPM_PROPERTIES\u0000';
  const loopMark = (i: number) => `\u0000SPM_LOOP_${i}\u0000`;
  const loops: string[] = [];
  const body = input.bodyHtml.replace(LOOP_RE, (_, inner: string) => {
    loops.push(inner);
    return loopMark(loops.length - 1);
  });
  const hasCardsSlot = loops.length > 0 || /\{\{\s*properties\s*\}\}/i.test(body);
  let html = fillPlaceholders(body.replace(/\{\{\s*properties\s*\}\}/gi, MARK), values, true);
  html = html.split(MARK).join(cards);
  loops.forEach((inner, i) => {
    const block = input.properties.map((c) => fillPlaceholders(inner, { ...values, ...propertyValues(c) }, true)).join('');
    html = html.split(loopMark(i)).join(block);
  });
```

Right after the loop block, drop images whose address came out empty (no logo set, a listing without a photo) so no broken-image icon shows:

```ts
  // A placeholder image with no address (no logo, listing without photo) would show a broken icon.
  html = html.replace(/<img\b[^>]*\ssrc=(""|'')[^>]*>/gi, '');
```

In the text version change `input.bodyHtml.replace(/\{\{\s*properties\s*\}\}/gi, '')` to `input.bodyHtml.replace(LOOP_RE, '').replace(/\{\{\s*properties\s*\}\}/gi, '')`.

- [ ] **Step 4: Run the tests**

Run: `cd apps/api && npx jest src/modules/email-campaign/campaign-render.spec.ts`
Expected: all PASS (old and new).

- [ ] **Step 5: Checkpoint** — `cd apps/api && npx tsc --noEmit` clean.

---

### Task 2: Template check (sanitize, validate, inline CSS)

**Files:**
- Create: `apps/api/src/modules/email-campaign/template-check.ts`
- Test: `apps/api/src/modules/email-campaign/template-check.spec.ts`
- Modify: `apps/api/package.json`, root `pnpm-lock.yaml`

**Interfaces:**
- Consumes: `LOOP_RE`, `KNOWN_PLACEHOLDERS`, `PROPERTY_PLACEHOLDERS` (Task 1).
- Produces:
  - `export interface TemplateCheck { html: string; errors: string[]; warnings: string[] }`
  - `export function checkTemplate(html: string): TemplateCheck`. Errors: `'LOOP_UNBALANCED'`, `'TOO_LARGE'`. Warnings: `'UNKNOWN:<name>'`, `'NO_UNSUBSCRIBE'`.
  - `export function inlineCss(html: string): string`
  - `export const MAX_TEMPLATE_BYTES = 100 * 1024`

- [ ] **Step 1: Add dependencies**

Run: `cd apps/api && pnpm add sanitize-html juice && pnpm add -D @types/sanitize-html`
Expected: `apps/api/package.json` and `pnpm-lock.yaml` change (deploy needs a server `pnpm install`, see Task 13).

- [ ] **Step 2: Write the failing tests** — `template-check.spec.ts`:

```ts
import { checkTemplate, inlineCss, MAX_TEMPLATE_BYTES } from './template-check';

describe('checkTemplate', () => {
  it('removes scripts, event handlers, forms, iframes and javascript: links', () => {
    const out = checkTemplate('<p onclick="x()">Hi</p><script>alert(1)</script><form><input></form><iframe src="https://x"></iframe><a href="javascript:alert(1)">a</a>{{unsubscribe_link}}');
    expect(out.html).not.toMatch(/script|onclick|<form|<input|<iframe|javascript:/i);
    expect(out.html).toContain('<p>Hi</p>');
  });

  it('keeps email markup, style blocks, placeholders and the loop', () => {
    const src = '<!DOCTYPE html><html><head><style>@media (max-width:600px){.c{width:100%!important}}</style></head><body><table role="presentation" width="600" cellpadding="0" bgcolor="#ffffff"><tr><td class="c" style="padding:8px">{{#properties}}<a href="{{property.url}}"><img src="{{property.image}}" alt="{{property.title}}" width="280"></a>{{/properties}}</td></tr></table><a href="{{unsubscribe_link}}">u</a></body></html>';
    const out = checkTemplate(src);
    expect(out.errors).toEqual([]);
    expect(out.html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(out.html).toContain('@media (max-width:600px)');
    expect(out.html).toContain('href="{{property.url}}"');
    expect(out.html).toContain('{{#properties}}');
    expect(out.html).toContain('bgcolor="#ffffff"');
  });

  it('reports an unbalanced loop and unknown placeholders', () => {
    const out = checkTemplate('{{#properties}}<p>{{property.title}}</p> {{contact.nam}} {{unsubscribe_link}}');
    expect(out.errors).toContain('LOOP_UNBALANCED');
    expect(out.warnings).toContain('UNKNOWN:contact.nam');
  });

  it('flags property placeholders outside the loop and a missing unsubscribe link', () => {
    const out = checkTemplate('<p>{{property.title}}</p>');
    expect(out.warnings).toContain('UNKNOWN:property.title');
    expect(out.warnings).toContain('NO_UNSUBSCRIBE');
  });

  it('rejects templates over the size limit', () => {
    expect(checkTemplate(`<p>${'x'.repeat(MAX_TEMPLATE_BYTES + 10)}</p>`).errors).toContain('TOO_LARGE');
  });
});

describe('inlineCss', () => {
  it('moves class styles inline, keeps media queries and the loop inside a table', () => {
    const out = inlineCss('<html><head><style>.t{color:#f00} @media (max-width:600px){.t{color:#00f}}</style></head><body><table><tbody>{{#properties}}<tr><td class="t">{{property.title}}</td></tr>{{/properties}}</tbody></table></body></html>');
    expect(out).toMatch(/<td class="t" style="color: ?#f00;?">/);
    expect(out).toContain('@media (max-width:600px)');
    expect(out.indexOf('{{#properties}}')).toBeLessThan(out.indexOf('<tr>'));
    expect(out.indexOf('{{/properties}}')).toBeGreaterThan(out.indexOf('</tr>'));
  });

  it('does not wrap a fragment in html/body', () => {
    expect(inlineCss('<style>p{margin:0}</style><p>Hi</p>')).not.toMatch(/<html|<body/i);
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `cd apps/api && npx jest src/modules/email-campaign/template-check.spec.ts`
Expected: FAIL, "Cannot find module './template-check'".

- [ ] **Step 4: Implement** `template-check.ts` (confirm the option names with current `sanitize-html` / `juice` docs via Context7 first):

```ts
import sanitizeHtml from 'sanitize-html';
import juice from 'juice';
import { KNOWN_PLACEHOLDERS, LOOP_RE, PROPERTY_PLACEHOLDERS } from './campaign-render';

// Every template is cleaned before it is saved (by hand or by the AI): no
// scripts, forms or javascript: links, and the placeholders checked. Styles
// are moved inline only when the email is rendered (inlineCss), so the
// client's own code stays readable.

export const MAX_TEMPLATE_BYTES = 100 * 1024;

export interface TemplateCheck {
  html: string;
  errors: string[];
  warnings: string[];
}

const EMAIL_TAGS = [
  'html', 'head', 'body', 'meta', 'title', 'style', 'center', 'font', 'span', 'div', 'p', 'br', 'hr',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'img', 'b', 'i', 'u', 's', 'strong', 'em', 'small', 'sup', 'sub',
  'ul', 'ol', 'li', 'blockquote', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'colgroup', 'col',
];
const COMMON_ATTRS = [
  'style', 'class', 'id', 'align', 'valign', 'width', 'height', 'bgcolor', 'background', 'border',
  'cellpadding', 'cellspacing', 'role', 'dir', 'lang', 'title', 'colspan', 'rowspan', 'color', 'face', 'size',
];

const SANITIZE: sanitizeHtml.IOptions = {
  allowedTags: EMAIL_TAGS,
  allowedAttributes: {
    '*': COMMON_ATTRS,
    a: [...COMMON_ATTRS, 'href', 'target', 'rel', 'name'],
    img: [...COMMON_ATTRS, 'src', 'alt'],
    meta: ['charset', 'name', 'content', 'http-equiv'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesAppliedToAttributes: ['href', 'src', 'background'],
  allowProtocolRelative: false,
  // <style> is needed for the phone layout (@media); its content is not HTML.
  allowVulnerableTags: true,
  nonTextTags: ['script', 'textarea', 'option', 'noscript'],
};

const PLACEHOLDER_ANY = /\{\{\s*([#/]?)([a-z_]+(?:\.[a-z_]+)*)\s*\}\}/gi;

function unknownIn(text: string, allowed: Set<string>, seen: Set<string>, out: string[]): void {
  for (const [, mark, name] of text.matchAll(PLACEHOLDER_ANY)) {
    const key = name.toLowerCase();
    if (mark || allowed.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(`UNKNOWN:${key}`);
  }
}

export function checkTemplate(input: string): TemplateCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const hadDoctype = /^\s*<!doctype html/i.test(input);
  let html = sanitizeHtml(input, SANITIZE);
  if (hadDoctype) html = `<!DOCTYPE html>\n${html}`;

  const opens = (html.match(/\{\{\s*#properties\s*\}\}/gi) || []).length;
  const closes = (html.match(/\{\{\s*\/properties\s*\}\}/gi) || []).length;
  const loops = html.match(LOOP_RE) || [];
  const nested = loops.some((l) => /\{\{\s*#properties/i.test(l.replace(/^\{\{\s*#properties\s*\}\}/i, '')));
  if (opens !== closes || loops.length !== opens || nested) errors.push('LOOP_UNBALANCED');

  const known = new Set<string>(KNOWN_PLACEHOLDERS);
  const inLoop = new Set<string>([...KNOWN_PLACEHOLDERS, ...PROPERTY_PLACEHOLDERS]);
  const seen = new Set<string>();
  unknownIn(html.replace(LOOP_RE, ''), known, seen, warnings);
  unknownIn(loops.join('\n'), inLoop, seen, warnings);

  if (!/\{\{\s*unsubscribe_link\s*\}\}/i.test(html)) warnings.push('NO_UNSUBSCRIBE');
  if (Buffer.byteLength(html, 'utf8') > MAX_TEMPLATE_BYTES) errors.push('TOO_LARGE');
  return { html, errors, warnings };
}

// The loop markers become comments while juice parses the HTML: plain text
// between table rows would otherwise be moved out of the table.
const OPEN_COMMENT = '<!--spm-loop-open-->';
const CLOSE_COMMENT = '<!--spm-loop-close-->';

export function inlineCss(html: string): string {
  const isDocument = /<html[\s>]/i.test(html);
  const marked = html
    .replace(/\{\{\s*#properties\s*\}\}/gi, OPEN_COMMENT)
    .replace(/\{\{\s*\/properties\s*\}\}/gi, CLOSE_COMMENT);
  let out = juice(marked, { preserveMediaQueries: true, removeStyleTags: true, applyWidthAttributes: true, applyHeightAttributes: true });
  if (!isDocument) {
    const body = out.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    if (body) out = body[1];
  }
  return out.split(OPEN_COMMENT).join('{{#properties}}').split(CLOSE_COMMENT).join('{{/properties}}');
}
```

If juice drops comments with these options, use `<span data-spm-loop="open"></span>` / `<span data-spm-loop="close"></span>` as markers instead (same test).

- [ ] **Step 5: Run the tests**

Run: `cd apps/api && npx jest src/modules/email-campaign/template-check.spec.ts src/modules/email-campaign/campaign-render.spec.ts`
Expected: all PASS.

- [ ] **Step 6: Checkpoint** — `npx tsc --noEmit` clean in `apps/api`.

---

### Task 3: Preview with sample data + check on save

**Files:**
- Modify: `apps/api/src/modules/email-campaign/campaign-content.service.ts`
- Modify: `apps/api/src/modules/email-campaign/email-campaign.service.ts` (`createTemplate`, `updateTemplate`)
- Modify: `apps/api/src/modules/email-campaign/email-campaign.controller.ts`
- Create: `apps/api/src/modules/email-campaign/dto/designer.dto.ts`; modify `dto/index.ts` (`export * from './designer.dto';`)
- Test: `apps/api/src/modules/email-campaign/campaign-content.spec.ts`

**Interfaces:**
- Consumes: `checkTemplate`, `inlineCss` (Task 2); `AgencyInfo` (Task 1).
- Produces:
  - `CampaignContext` gains `agencyInfo: AgencyInfo`.
  - `CampaignContentService.previewSample(tenantId: number, template: { subject: string; bodyHtml: string }): Promise<{ subject: string; html: string; warnings: string[] }>`
  - `POST /api/dashboard/email-templates/render-preview` body `RenderPreviewDto { subject?: string; bodyHtml: string }` → `{ subject, html, warnings }`.
  - Template create/update returns 400 `{ code: 'TEMPLATE_INVALID', errors: string[] }` when `checkTemplate` reports errors; the stored HTML is the sanitized HTML.

- [ ] **Step 1: Write the failing test** — `campaign-content.spec.ts`:

```ts
import { CampaignContentService } from './campaign-content.service';

function service(rows: unknown[] = []) {
  const tenant = { id: 2, name: 'Sun', settings: { companyName: 'Sun Homes', primaryColor: '#112233', logoUrl: 'https://cdn/l.png', contactPhone: '+34 1', contactEmail: 'i@s.es', websiteUrl: 'https://sun.es' } };
  const qb: any = new Proxy({}, { get: (_t, k) => (k === 'getMany' ? async () => rows : () => qb) });
  const tenantRepo = { findOne: async () => tenant } as any;
  const propertyRepo = { createQueryBuilder: () => qb, find: async () => [] } as any;
  return new CampaignContentService(tenantRepo, propertyRepo);
}

describe('CampaignContentService.previewSample', () => {
  it('renders with demo listings, sample contact and agency details, styles inlined', async () => {
    const out = await service().previewSample(2, {
      subject: 'Hi {{contact.first_name}}',
      bodyHtml: '<style>.x{color:#f00}</style><p class="x">{{agency.phone}}</p>{{#properties}}<b>{{property.title}}</b>{{/properties}}{{unsubscribe_link}}<script>bad()</script>',
    });
    expect(out.subject).toBe('Hi Anna');
    expect(out.html).toMatch(/<p class="x" style="color: ?#f00;?">\+34 1<\/p>/);
    expect((out.html.match(/<b>/g) || []).length).toBe(3);
    expect(out.html).not.toContain('bad()');
    expect(out.warnings).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && npx jest src/modules/email-campaign/campaign-content.spec.ts`
Expected: FAIL, `previewSample is not a function`.

- [ ] **Step 3: Implement.**

`campaign-content.service.ts` — imports: `import { checkTemplate, inlineCss } from './template-check';` and add `type AgencyInfo` to the `./campaign-render` import.

Demo listings, below `TEXTS`:

```ts
const demoCard = (id: number, title: string, price: number, beds: number, baths: number, size: number, town: string): BuyerPropertyCard =>
  ({
    id, reference: `DEMO-${id}`, agentReference: null, title: { en: title }, slug: null, listingType: 'sale', status: 'active',
    price, priceTo: null, rentalPeriod: null, currency: 'EUR', priceOnRequest: false,
    bedrooms: beds, bedroomsTo: null, bathrooms: baths, bathroomsTo: null, buildSize: size, buildSizeTo: null,
    plotSize: null, plotSizeTo: null, virtualTourUrl: null, image: null,
    location: { id: 0, name: { en: town } }, propertyType: { id: 0, name: { en: 'Villa' } },
  }) as BuyerPropertyCard;

// Shown in the editor preview when the client has no live listings yet.
const DEMO_CARDS: BuyerPropertyCard[] = [
  demoCard(1, 'Sea-view villa with pool', 1250000, 4, 3, 320, 'Marbella'),
  demoCard(2, 'Modern apartment near the beach', 425000, 2, 2, 110, 'Estepona'),
  demoCard(3, 'Townhouse in the old town', 389000, 3, 2, 150, 'Mijas'),
];
```

`CampaignContext` gains `agencyInfo: AgencyInfo;`. In `context()` return:

```ts
      agencyInfo: { logo: settings.logoUrl, phone: settings.contactPhone, email: settings.contactEmail, website: settings.websiteUrl },
```

In `render()`, add to each mapped card:

```ts
        reference: c.reference,
        beds: c.bedrooms,
        baths: c.bathrooms,
        area: c.buildSize ? `${c.buildSize} m²` : null,
```

and in the `renderCampaignEmail({...})` call use `bodyHtml: this.inline(template.bodyHtml),` and add `agencyInfo: ctx.agencyInfo,`.

New members:

```ts
  // juice is slow-ish and a campaign renders the same body for every contact.
  private readonly inlined = new Map<string, string>();

  private inline(html: string): string {
    const hit = this.inlined.get(html);
    if (hit !== undefined) return hit;
    const out = inlineCss(html);
    if (this.inlined.size >= 20) this.inlined.delete(this.inlined.keys().next().value as string);
    this.inlined.set(html, out);
    return out;
  }

  // The editor preview: the real renderer with a sample contact and the
  // client's 3 newest live listings (demo listings when there are none).
  async previewSample(tenantId: number, template: { subject: string; bodyHtml: string }): Promise<{ subject: string; html: string; warnings: string[] }> {
    const check = checkTemplate(template.bodyHtml);
    const newest = await this.propertyRepository.find({
      where: { tenantId, status: 'active', isPublished: true } as never,
      select: ['id'],
      order: { createdAt: 'DESC' } as never,
      take: 3,
    });
    const ctx = await this.context(tenantId, newest.map((p) => p.id));
    if (!ctx.cards.length) ctx.cards = DEMO_CARDS;
    const out = this.render(
      ctx,
      { subject: template.subject, bodyHtml: check.html },
      { name: 'Anna Smith', email: 'anna@example.com', language: ctx.defaultLang },
      { pixelUrl: null, unsubscribeUrl: '#unsubscribe', propertyUrl: null },
    );
    return { subject: out.subject, html: out.html, warnings: [...check.errors, ...check.warnings] };
  }
```

`dto/designer.dto.ts`:

```ts
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RenderPreviewDto {
  @IsString()
  @IsOptional()
  @MaxLength(255)
  subject?: string;

  @IsString()
  @MaxLength(300_000)
  bodyHtml: string;
}
```

`EmailTemplateController`: inject `private readonly content: CampaignContentService` and add **above** `@Get(':id')`:

```ts
  @Post('render-preview')
  renderPreview(@CurrentTenant() tenantId: number, @Body() dto: RenderPreviewDto) {
    return this.content.previewSample(tenantId, { subject: dto.subject ?? '', bodyHtml: dto.bodyHtml });
  }
```

`email-campaign.service.ts` — import `checkTemplate` and add:

```ts
  // The stored HTML is always the cleaned one; broken loops or huge bodies are refused.
  private cleanBody(bodyHtml: string): string {
    const check = checkTemplate(bodyHtml);
    if (check.errors.length) {
      throw new BadRequestException({ code: 'TEMPLATE_INVALID', errors: check.errors, message: 'The template has errors.' });
    }
    return check.html;
  }
```

In `createTemplate` build with `bodyHtml: this.cleanBody(dto.bodyHtml ?? '')`. In `updateTemplate`, first line after loading: `if (dto.bodyHtml !== undefined) dto.bodyHtml = this.cleanBody(dto.bodyHtml);`.

- [ ] **Step 4: Run the tests**

Run: `cd apps/api && npx jest src/modules/email-campaign`
Expected: all PASS.

- [ ] **Step 5: Checkpoint** — tsc clean; `pnpm --filter api build`, restart the local API; graphify rebuild.

---
### Task 4: Designer tables + template versions

**Files:**
- Create: `apps/api/src/database/entities/email-designer.entity.ts`; modify `apps/api/src/database/entities/index.ts` (`export * from './email-designer.entity';`)
- Create: `apps/api/src/database/migrations/1777410000000-EmailDesigner.ts`
- Create: `apps/api/src/modules/email-campaign/designer/template-version.service.ts`
- Create: `apps/api/src/modules/email-campaign/designer/email-designer.controller.ts`
- Modify: `apps/api/src/modules/email-campaign/email-campaign.service.ts`, `email-campaign.module.ts`
- Test: `apps/api/src/modules/email-campaign/designer/template-version.service.spec.ts`

**Interfaces:**
- Produces entities `EmailTemplateVersion`, `EmailTemplateAiMessage`, `TenantBrandMemory`, `EmailImage` (fields below) and:
  - `TemplateVersionService.record(tenantId: number, templateId: number, v: { bodyHtml: string; subject: string; source: VersionSource }): Promise<EmailTemplateVersion | null>` (null = identical to the latest, nothing stored)
  - `TemplateVersionService.list(tenantId, templateId): Promise<{ id: number; source: VersionSource; subject: string; bytes: number; createdAt: Date }[]>` newest first
  - `TemplateVersionService.get(tenantId, templateId, versionId): Promise<EmailTemplateVersion>` (404 if not this tenant's)
  - `TemplateVersionService.restore(tenantId, templateId, versionId): Promise<EmailTemplate>`
  - `export type VersionSource = 'ai' | 'manual' | 'restore' | 'layout'`
  - Routes: `GET /api/dashboard/email-templates/:id/versions`, `GET /api/dashboard/email-templates/:id/versions/:vid`, `POST /api/dashboard/email-templates/:id/versions/:vid/restore`.

- [ ] **Step 1: Entities** — `email-designer.entity.ts`:

```ts
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Tenant } from './tenant.entity';
import { EmailTemplate } from './email-campaign.entity';

// AI email designer (2026-10-23): template history, the designer chat, the
// client's brand notes and their email image library. All rows are per client.

export type VersionSource = 'ai' | 'manual' | 'restore' | 'layout';

@Entity('email_template_versions')
@Index(['templateId', 'id'])
export class EmailTemplateVersion {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  tenantId: number;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Column()
  templateId: number;

  @ManyToOne(() => EmailTemplate, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'templateId' })
  template: EmailTemplate;

  @Column({ type: 'mediumtext' })
  bodyHtml: string;

  @Column({ length: 255 })
  subject: string;

  @Column({ type: 'enum', enum: ['ai', 'manual', 'restore', 'layout'] })
  source: VersionSource;

  @CreateDateColumn()
  createdAt: Date;
}

@Entity('email_template_ai_messages')
@Index(['templateId', 'id'])
export class EmailTemplateAiMessage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  tenantId: number;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Column()
  templateId: number;

  @ManyToOne(() => EmailTemplate, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'templateId' })
  template: EmailTemplate;

  @Column({ type: 'enum', enum: ['user', 'assistant'] })
  role: 'user' | 'assistant';

  @Column({ type: 'text' })
  content: string;

  // The version this turn produced (assistant turns that changed the design).
  @Column({ type: 'int', nullable: true })
  versionId: number | null;

  @CreateDateColumn()
  createdAt: Date;
}

@Entity('tenant_brand_memory')
export class TenantBrandMemory {
  @PrimaryColumn()
  tenantId: number;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Column({ type: 'json' })
  notes: string[];

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('email_images')
@Index(['tenantId', 'contentHash'], { unique: true })
export class EmailImage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  tenantId: number;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Column({ length: 64 })
  contentHash: string;

  @Column({ length: 500 })
  url: string;

  @Column({ length: 100 })
  mimeType: string;

  @Column({ type: 'int' })
  width: number;

  @Column({ type: 'int' })
  height: number;

  @Column({ type: 'int' })
  bytes: number;

  // Used in a campaign that was sent: never cleaned up (old emails show it).
  @Column({ default: false })
  pinned: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lastUsedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
```

- [ ] **Step 2: Migration** — `1777410000000-EmailDesigner.ts`:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

// AI email designer (2026-10-23): template versions, designer chat, brand
// memory and the email image library.
export class EmailDesigner1777410000000 implements MigrationInterface {
  name = 'EmailDesigner1777410000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('email_template_versions'))) {
      await queryRunner.query(`CREATE TABLE email_template_versions (
        id INT NOT NULL AUTO_INCREMENT,
        tenantId INT NOT NULL,
        templateId INT NOT NULL,
        bodyHtml MEDIUMTEXT NOT NULL,
        subject VARCHAR(255) NOT NULL,
        source ENUM('ai','manual','restore','layout') NOT NULL,
        createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        INDEX IDX_etv_template (templateId, id),
        CONSTRAINT FK_etv_tenant FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
        CONSTRAINT FK_etv_template FOREIGN KEY (templateId) REFERENCES email_templates(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    }
    if (!(await queryRunner.hasTable('email_template_ai_messages'))) {
      await queryRunner.query(`CREATE TABLE email_template_ai_messages (
        id INT NOT NULL AUTO_INCREMENT,
        tenantId INT NOT NULL,
        templateId INT NOT NULL,
        role ENUM('user','assistant') NOT NULL,
        content TEXT NOT NULL,
        versionId INT NULL,
        createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        INDEX IDX_etam_template (templateId, id),
        CONSTRAINT FK_etam_tenant FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
        CONSTRAINT FK_etam_template FOREIGN KEY (templateId) REFERENCES email_templates(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    }
    if (!(await queryRunner.hasTable('tenant_brand_memory'))) {
      await queryRunner.query(`CREATE TABLE tenant_brand_memory (
        tenantId INT NOT NULL,
        notes JSON NOT NULL,
        updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (tenantId),
        CONSTRAINT FK_tbm_tenant FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    }
    if (!(await queryRunner.hasTable('email_images'))) {
      await queryRunner.query(`CREATE TABLE email_images (
        id INT NOT NULL AUTO_INCREMENT,
        tenantId INT NOT NULL,
        contentHash VARCHAR(64) NOT NULL,
        url VARCHAR(500) NOT NULL,
        mimeType VARCHAR(100) NOT NULL,
        width INT NOT NULL,
        height INT NOT NULL,
        bytes INT NOT NULL,
        pinned TINYINT NOT NULL DEFAULT 0,
        lastUsedAt TIMESTAMP NULL DEFAULT NULL,
        createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE INDEX UQ_email_images_hash (tenantId, contentHash),
        CONSTRAINT FK_ei_tenant FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const t of ['email_images', 'tenant_brand_memory', 'email_template_ai_messages', 'email_template_versions']) {
      if (await queryRunner.hasTable(t)) await queryRunner.query(`DROP TABLE ${t}`);
    }
  }
}
```

Check the `tenants` / `email_templates` table names and the id column type (`INT`) in an existing migration before running; match them.

Run: `cd apps/api && pnpm build && npx typeorm migration:run -d dist/config/database.config.js`
Expected: `Migration EmailDesigner1777410000000 has been executed successfully.` Then `docker exec spw-mysql-1 mysql -uroot -pdev-root-password spw_v2_dev -e "SHOW TABLES LIKE 'email_%'"` lists the new tables.

- [ ] **Step 3: Write the failing test** — `template-version.service.spec.ts` (in-memory repo fakes):

```ts
import { TemplateVersionService, MAX_VERSIONS } from './template-version.service';

function fakeRepo<T extends { id?: number }>(rows: T[] = []) {
  let next = rows.length + 1;
  return {
    rows,
    findOne: async ({ where, order }: any) => {
      const match = rows.filter((r: any) => Object.entries(where).every(([k, v]) => r[k] === v));
      if (order?.id === 'DESC') match.sort((a: any, b: any) => b.id - a.id);
      return match[0] ?? null;
    },
    find: async ({ where, order, take, skip }: any) => {
      const match = rows.filter((r: any) => Object.entries(where).every(([k, v]) => r[k] === v)).sort((a: any, b: any) => (order?.id === 'DESC' ? b.id - a.id : a.id - b.id));
      return match.slice(skip ?? 0, (skip ?? 0) + (take ?? match.length));
    },
    create: (r: T) => r,
    save: async (r: any) => { if (!r.id) { r.id = next++; r.createdAt = new Date(); rows.push(r); } return r; },
    delete: async (ids: any) => { const list = ids.id?._value ?? ids; for (const id of [].concat(list)) { const i = rows.findIndex((r: any) => r.id === id); if (i >= 0) rows.splice(i, 1); } },
  };
}

describe('TemplateVersionService', () => {
  const template = { id: 7, tenantId: 2, subject: 'S', bodyHtml: '<p>a</p>' };
  const make = () => {
    const versions = fakeRepo<any>();
    const templates = fakeRepo<any>([{ ...template }]);
    return { versions, templates, svc: new TemplateVersionService(versions as any, templates as any) };
  };

  it('skips a version identical to the latest', async () => {
    const { svc, versions } = make();
    await svc.record(2, 7, { bodyHtml: '<p>a</p>', subject: 'S', source: 'manual' });
    expect(await svc.record(2, 7, { bodyHtml: '<p>a</p>', subject: 'S', source: 'ai' })).toBeNull();
    expect(versions.rows).toHaveLength(1);
  });

  it(`keeps only the newest ${50}`, async () => {
    const { svc, versions } = make();
    for (let i = 0; i < MAX_VERSIONS + 5; i++) await svc.record(2, 7, { bodyHtml: `<p>${i}</p>`, subject: 'S', source: 'ai' });
    expect(versions.rows).toHaveLength(MAX_VERSIONS);
    expect(versions.rows[0].bodyHtml).toBe('<p>5</p>');
  });

  it('restores a version into the template and records it as a restore', async () => {
    const { svc, templates, versions } = make();
    const v = await svc.record(2, 7, { bodyHtml: '<p>old</p>', subject: 'Old', source: 'manual' });
    await svc.record(2, 7, { bodyHtml: '<p>new</p>', subject: 'New', source: 'ai' });
    const t = await svc.restore(2, 7, v!.id);
    expect(t.bodyHtml).toBe('<p>old</p>');
    expect(templates.rows[0].subject).toBe('Old');
    expect(versions.rows.at(-1).source).toBe('restore');
  });

  it("never reads another client's version", async () => {
    const { svc } = make();
    const v = await svc.record(2, 7, { bodyHtml: '<p>x</p>', subject: 'S', source: 'manual' });
    await expect(svc.get(3, 7, v!.id)).rejects.toThrow('Version not found');
  });
});
```

- [ ] **Step 4: Run to verify it fails**

Run: `cd apps/api && npx jest src/modules/email-campaign/designer/template-version.service.spec.ts`
Expected: FAIL, module not found.

- [ ] **Step 5: Implement** `designer/template-version.service.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { EmailTemplate, EmailTemplateVersion, type VersionSource } from '../../../database/entities';

export const MAX_VERSIONS = 50;

// Every saved state of a template, so the editor can undo and restore.
@Injectable()
export class TemplateVersionService {
  constructor(
    @InjectRepository(EmailTemplateVersion)
    private readonly versions: Repository<EmailTemplateVersion>,
    @InjectRepository(EmailTemplate)
    private readonly templates: Repository<EmailTemplate>,
  ) {}

  async record(tenantId: number, templateId: number, v: { bodyHtml: string; subject: string; source: VersionSource }): Promise<EmailTemplateVersion | null> {
    const latest = await this.versions.findOne({ where: { tenantId, templateId }, order: { id: 'DESC' } });
    if (latest && latest.bodyHtml === v.bodyHtml && latest.subject === v.subject) return null;
    const saved = await this.versions.save(this.versions.create({ tenantId, templateId, ...v }));
    const old = await this.versions.find({ where: { tenantId, templateId }, order: { id: 'DESC' }, skip: MAX_VERSIONS, take: 1000, select: ['id'] });
    if (old.length) await this.versions.delete({ id: In(old.map((o) => o.id)) });
    return saved;
  }

  async list(tenantId: number, templateId: number) {
    const rows = await this.versions.find({ where: { tenantId, templateId }, order: { id: 'DESC' }, take: MAX_VERSIONS });
    return rows.map((r) => ({ id: r.id, source: r.source, subject: r.subject, bytes: Buffer.byteLength(r.bodyHtml, 'utf8'), createdAt: r.createdAt }));
  }

  async get(tenantId: number, templateId: number, versionId: number): Promise<EmailTemplateVersion> {
    const row = await this.versions.findOne({ where: { id: versionId, tenantId, templateId } });
    if (!row) throw new NotFoundException('Version not found');
    return row;
  }

  async restore(tenantId: number, templateId: number, versionId: number): Promise<EmailTemplate> {
    const v = await this.get(tenantId, templateId, versionId);
    const template = await this.templates.findOne({ where: { id: templateId, tenantId } });
    if (!template) throw new NotFoundException('Template not found');
    template.bodyHtml = v.bodyHtml;
    template.subject = v.subject;
    await this.templates.save(template);
    await this.record(tenantId, templateId, { bodyHtml: v.bodyHtml, subject: v.subject, source: 'restore' });
    return template;
  }
}
```

The fake repo's `delete` must handle TypeORM's `In(...)` FindOperator: it reads `ids.id._value`. If that's brittle, change the service to `await this.versions.delete(old.map((o) => o.id))` (delete by id array) and the fake to accept an array.

Hand saves record a version: in `EmailCampaignService` inject `TemplateVersionService` and, at the end of `createTemplate` and of `updateTemplate` (after save):

```ts
    await this.versions.record(tenantId, template.id, { bodyHtml: template.bodyHtml, subject: template.subject, source: 'manual' });
```

`designer/email-designer.controller.ts` (later tasks add routes to it):

```ts
import { Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { CurrentTenant, RequiresAddon } from '../../../common/decorators';
import { DashboardAddonGuard, JwtAuthGuard, TenantGuard } from '../../../common/guards';
import { TemplateVersionService } from './template-version.service';

@Controller('api/dashboard/email-templates/:id')
@UseGuards(JwtAuthGuard, TenantGuard, DashboardAddonGuard)
@RequiresAddon('emailCampaign')
export class EmailTemplateDesignController {
  constructor(private readonly versions: TemplateVersionService) {}

  @Get('versions')
  listVersions(@CurrentTenant() tenantId: number, @Param('id', ParseIntPipe) id: number) {
    return this.versions.list(tenantId, id);
  }

  @Get('versions/:vid')
  getVersion(@CurrentTenant() tenantId: number, @Param('id', ParseIntPipe) id: number, @Param('vid', ParseIntPipe) vid: number) {
    return this.versions.get(tenantId, id, vid);
  }

  @Post('versions/:vid/restore')
  restore(@CurrentTenant() tenantId: number, @Param('id', ParseIntPipe) id: number, @Param('vid', ParseIntPipe) vid: number) {
    return this.versions.restore(tenantId, id, vid);
  }
}
```

Module: add the four entities to `TypeOrmModule.forFeature([...])`, `EmailTemplateDesignController` to `controllers`, `TemplateVersionService` to `providers`.

- [ ] **Step 6: Run the tests**

Run: `cd apps/api && npx jest src/modules/email-campaign`
Expected: all PASS.

- [ ] **Step 7: Checkpoint** — tsc clean, API rebuilt and restarted, graphify.

---

### Task 5: Email image library (upload, limits, pin, clean-up)

**Files:**
- Create: `apps/api/src/modules/email-campaign/designer/email-image.service.ts`
- Create: `apps/api/src/modules/email-campaign/designer/designer-cleanup.service.ts`
- Modify: `designer/email-designer.controller.ts` (new `EmailImageController`), `email-campaign.module.ts` (import `UploadModule`), `email-campaign.service.ts` (touch on save), `email-campaign.processor.ts` (pin on send)
- Test: `apps/api/src/modules/email-campaign/designer/email-image.service.spec.ts`

**Interfaces:**
- Consumes: `UploadService.getStorageConfig(tenantId)`, `UploadService.storeBlob(tenantId, buffer, mime, config)`, `UploadService.releaseBlob(tenantId, hash, config)`.
- Produces:
  - `EmailImageService.upload(tenantId: number, file: { buffer: Buffer; mimetype: string }): Promise<EmailImageDto>`
  - `EmailImageService.list(tenantId): Promise<{ images: EmailImageDto[]; usedBytes: number; limitBytes: number; limitCount: number }>`
  - `EmailImageService.remove(tenantId, id): Promise<void>` — 409 `{ code: 'IMAGE_IN_USE' }` when pinned or in a template
  - `EmailImageService.touch(tenantId, html): Promise<void>`, `EmailImageService.pin(tenantId, html): Promise<void>`
  - `EmailImageService.cleanup(now?: Date): Promise<number>`
  - `export interface EmailImageDto { id: number; url: string; width: number; height: number; bytes: number; pinned: boolean; createdAt: Date }`
  - Pure helpers (exported for tests): `optimizeImage(buffer: Buffer, mimetype: string): Promise<{ buffer: Buffer; mimeType: string; width: number; height: number }>`, `imageLimits(settings: { emailImageLimitMb?: unknown } | null): { bytes: number; count: number }`
  - Routes: `GET /api/dashboard/email-images`, `POST /api/dashboard/email-images` (multipart field `file`), `DELETE /api/dashboard/email-images/:id`.

- [ ] **Step 1: Write the failing tests** — `email-image.service.spec.ts`:

```ts
import sharp from 'sharp';
import { optimizeImage, imageLimits } from './email-image.service';

describe('optimizeImage', () => {
  it('shrinks a wide photo to 1200px JPEG', async () => {
    const big = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#336699' } }).png().toBuffer();
    const out = await optimizeImage(big, 'image/png');
    expect(out.mimeType).toBe('image/jpeg');
    expect(out.width).toBe(1200);
    expect(out.height).toBe(800);
  });

  it('keeps PNG when the image has transparency', async () => {
    const logo = await sharp({ create: { width: 400, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    const out = await optimizeImage(logo, 'image/png');
    expect(out.mimeType).toBe('image/png');
    expect(out.width).toBe(400);
  });

  it('turns WebP into JPEG (Outlook cannot show WebP)', async () => {
    const webp = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#ccc' } }).webp().toBuffer();
    expect((await optimizeImage(webp, 'image/webp')).mimeType).toBe('image/jpeg');
  });

  it('refuses other file types', async () => {
    await expect(optimizeImage(Buffer.from('%PDF'), 'application/pdf')).rejects.toThrow('IMAGE_TYPE');
  });
});

describe('imageLimits', () => {
  it('uses 100 MB / 200 images by default and the client override when set', () => {
    expect(imageLimits(null)).toEqual({ bytes: 100 * 1024 * 1024, count: 200 });
    expect(imageLimits({ emailImageLimitMb: 250 }).bytes).toBe(250 * 1024 * 1024);
    expect(imageLimits({ emailImageLimitMb: 'x' }).bytes).toBe(100 * 1024 * 1024);
  });
});
```

Add DB-level behaviour tests with repo fakes (same `fakeRepo` helper as Task 4, copied into this spec) for: over-limit upload throws `IMAGE_LIMIT`; same image uploaded twice returns the same row; `remove` of a pinned image throws `IMAGE_IN_USE`; `cleanup` deletes an unpinned image unused for 31 days and not in any template, keeps a pinned one and one whose URL is in a template body.

```ts
describe('EmailImageService rules', () => {
  const day = 24 * 3600 * 1000;
  const setup = (images: any[], templates: any[] = []) => {
    const imgs = fakeRepo<any>(images);
    const tpls = { find: async () => templates } as any;
    const tenants = { findOne: async () => ({ settings: {} }) } as any;
    const released: string[] = [];
    const upload = { getStorageConfig: async () => null, storeBlob: async () => ({ url: 'https://r2/x.jpg' }), releaseBlob: async (_t: number, h: string) => { released.push(h); } } as any;
    return { imgs, released, svc: new EmailImageService(imgs as any, tpls, tenants, upload) };
  };

  it('cleans up only unpinned images unused for 30 days and not in a template', async () => {
    const now = new Date('2026-11-30T00:00:00Z');
    const old = new Date(now.getTime() - 31 * day);
    const { svc, imgs, released } = setup(
      [
        { id: 1, tenantId: 2, contentHash: 'a', url: 'https://r2/a.jpg', pinned: false, lastUsedAt: old, createdAt: old },
        { id: 2, tenantId: 2, contentHash: 'b', url: 'https://r2/b.jpg', pinned: true, lastUsedAt: old, createdAt: old },
        { id: 3, tenantId: 2, contentHash: 'c', url: 'https://r2/c.jpg', pinned: false, lastUsedAt: old, createdAt: old },
      ],
      [{ tenantId: 2, bodyHtml: '<img src="https://r2/c.jpg">' }],
    );
    expect(await svc.cleanup(now)).toBe(1);
    expect(released).toEqual(['a']);
    expect(imgs.rows.map((r: any) => r.id)).toEqual([2, 3]);
  });

  it('refuses to delete an image used in a sent email', async () => {
    const { svc } = setup([{ id: 2, tenantId: 2, contentHash: 'b', url: 'https://r2/b.jpg', pinned: true }]);
    await expect(svc.remove(2, 2)).rejects.toMatchObject({ response: { code: 'IMAGE_IN_USE' } });
  });
});
```

(Import `EmailImageService` alongside the helpers; extend `fakeRepo.find` to accept `where` arrays or `LessThan` if the service uses them — or have the service filter in JS after `find({ where: { tenantId? , pinned: false } })` as below, which the fake supports.)

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/api && npx jest src/modules/email-campaign/designer/email-image.service.spec.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement** `designer/email-image.service.ts`:

```ts
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import sharp from 'sharp';
import { EmailImage, EmailTemplate, Tenant } from '../../../database/entities';
import { UploadService } from '../../upload/upload.service';

// Pictures clients put in their emails. Shrunk on upload, stored once per
// client (content hash), limited per client, and deleted after 30 days
// unused — except images in sent campaigns, which old emails still show.

export const MAX_INPUT_BYTES = 10 * 1024 * 1024;
const MAX_WIDTH = 1200;
const DEFAULT_LIMIT_MB = Number(process.env.EMAIL_IMAGE_LIMIT_MB) || 100;
const MAX_COUNT = 200;
const UNUSED_DAYS = 30;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export interface EmailImageDto { id: number; url: string; width: number; height: number; bytes: number; pinned: boolean; createdAt: Date }

export function imageLimits(settings: { emailImageLimitMb?: unknown } | null): { bytes: number; count: number } {
  const mb = Number(settings?.emailImageLimitMb);
  return { bytes: (Number.isFinite(mb) && mb > 0 ? mb : DEFAULT_LIMIT_MB) * 1024 * 1024, count: MAX_COUNT };
}

export async function optimizeImage(buffer: Buffer, mimetype: string): Promise<{ buffer: Buffer; mimeType: string; width: number; height: number }> {
  if (!ACCEPTED.includes(mimetype)) throw new BadRequestException({ code: 'IMAGE_TYPE', message: 'IMAGE_TYPE: use a JPEG, PNG, GIF or WebP image.' });
  if (buffer.length > MAX_INPUT_BYTES) throw new BadRequestException({ code: 'IMAGE_TOO_BIG', message: 'Images can be up to 10 MB.' });
  const meta = await sharp(buffer).metadata();
  // Animated GIFs are kept as they are (resizing them breaks the animation).
  if (mimetype === 'image/gif') {
    if (buffer.length > 2 * 1024 * 1024) throw new BadRequestException({ code: 'IMAGE_TOO_BIG', message: 'GIFs can be up to 2 MB.' });
    return { buffer, mimeType: 'image/gif', width: meta.width ?? 0, height: meta.height ?? 0 };
  }
  const base = sharp(buffer).rotate().resize({ width: MAX_WIDTH, withoutEnlargement: true });
  const out = meta.hasAlpha
    ? await base.png({ compressionLevel: 9, palette: true }).toBuffer({ resolveWithObject: true })
    : await base.flatten({ background: '#ffffff' }).jpeg({ quality: 82, progressive: true, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  return { buffer: out.data, mimeType: meta.hasAlpha ? 'image/png' : 'image/jpeg', width: out.info.width, height: out.info.height };
}

const toDto = (r: EmailImage): EmailImageDto => ({ id: r.id, url: r.url, width: r.width, height: r.height, bytes: r.bytes, pinned: r.pinned, createdAt: r.createdAt });

@Injectable()
export class EmailImageService {
  constructor(
    @InjectRepository(EmailImage) private readonly images: Repository<EmailImage>,
    @InjectRepository(EmailTemplate) private readonly templates: Repository<EmailTemplate>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    private readonly upload: UploadService,
  ) {}

  private async limits(tenantId: number) {
    const tenant = await this.tenants.findOne({ where: { id: tenantId }, select: ['id', 'settings'] });
    return imageLimits((tenant?.settings ?? null) as { emailImageLimitMb?: unknown } | null);
  }

  async list(tenantId: number) {
    const rows = await this.images.find({ where: { tenantId }, order: { id: 'DESC' } });
    const limit = await this.limits(tenantId);
    return { images: rows.map(toDto), usedBytes: rows.reduce((s, r) => s + r.bytes, 0), limitBytes: limit.bytes, limitCount: limit.count };
  }

  async upload(tenantId: number, file: { buffer: Buffer; mimetype: string }): Promise<EmailImageDto> {
    const img = await optimizeImage(file.buffer, file.mimetype);
    const hash = createHash('sha256').update(img.buffer).digest('hex');
    const same = await this.images.findOne({ where: { tenantId, contentHash: hash } });
    if (same) return toDto(same);
    const { images: all, usedBytes, limitBytes, limitCount } = await this.list(tenantId);
    if (all.length >= limitCount || usedBytes + img.buffer.length > limitBytes) {
      throw new BadRequestException({ code: 'IMAGE_LIMIT', message: 'Your image library is full. Delete some images first.' });
    }
    const config = await this.upload.getStorageConfig(tenantId);
    const stored = await this.upload.storeBlob(tenantId, img.buffer, img.mimeType, config);
    const row = await this.images.save(this.images.create({
      tenantId, contentHash: hash, url: stored.url, mimeType: img.mimeType,
      width: img.width, height: img.height, bytes: img.buffer.length, pinned: false, lastUsedAt: new Date(),
    }));
    return toDto(row);
  }

  private async inAnyTemplate(tenantId: number, url: string): Promise<boolean> {
    const rows = await this.templates.find({ where: { tenantId }, select: ['id', 'bodyHtml'] });
    return rows.some((t) => t.bodyHtml?.includes(url));
  }

  async remove(tenantId: number, id: number): Promise<void> {
    const row = await this.images.findOne({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('Image not found');
    if (row.pinned || (await this.inAnyTemplate(tenantId, row.url))) {
      throw new ConflictException({ code: 'IMAGE_IN_USE', message: 'This image is used in a template or a sent email.' });
    }
    await this.release(row);
  }

  private async release(row: EmailImage): Promise<void> {
    const config = await this.upload.getStorageConfig(row.tenantId);
    await this.upload.releaseBlob(row.tenantId, row.contentHash, config);
    await this.images.delete(row.id);
  }

  private async rowsIn(tenantId: number, html: string): Promise<EmailImage[]> {
    if (!html) return [];
    const rows = await this.images.find({ where: { tenantId } });
    return rows.filter((r) => html.includes(r.url));
  }

  async touch(tenantId: number, html: string): Promise<void> {
    for (const r of await this.rowsIn(tenantId, html)) {
      r.lastUsedAt = new Date();
      await this.images.save(r);
    }
  }

  async pin(tenantId: number, html: string): Promise<void> {
    for (const r of await this.rowsIn(tenantId, html)) {
      if (r.pinned) continue;
      r.pinned = true;
      r.lastUsedAt = new Date();
      await this.images.save(r);
    }
  }

  async cleanup(now = new Date()): Promise<number> {
    const cutoff = now.getTime() - UNUSED_DAYS * 24 * 3600 * 1000;
    const candidates = (await this.images.find({ where: { pinned: false } })).filter(
      (r) => (r.lastUsedAt ?? r.createdAt).getTime() < cutoff,
    );
    let removed = 0;
    for (const r of candidates) {
      if (await this.inAnyTemplate(r.tenantId, r.url)) continue;
      await this.release(r);
      removed++;
    }
    return removed;
  }
}
```

`designer/designer-cleanup.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { RedisLockService } from '../../../common/redis/redis-lock.service';
import { EmailCampaign, EmailTemplate } from '../../../database/entities';
import { EmailImageService } from './email-image.service';

const LOCK_KEY = 'cron:email-designer-cleanup';
const LOCK_TTL_MS = 30 * 60 * 1000;

// Daily: unused email images (30 days) and empty "Untitled" templates the
// editor created but nobody filled (1 day). One replica runs it (Redis lock).
@Injectable()
export class DesignerCleanupService {
  private readonly logger = new Logger(DesignerCleanupService.name);

  constructor(
    private readonly images: EmailImageService,
    private readonly lock: RedisLockService,
    @InjectRepository(EmailTemplate) private readonly templates: Repository<EmailTemplate>,
    @InjectRepository(EmailCampaign) private readonly campaigns: Repository<EmailCampaign>,
  ) {}

  @Cron('41 3 * * *')
  async run(): Promise<void> {
    const outcome = await this.lock.withLock(LOCK_KEY, LOCK_TTL_MS, async () => {
      const images = await this.images.cleanup();
      const empty = await this.templates.find({ where: { bodyHtml: '', createdAt: LessThan(new Date(Date.now() - 24 * 3600 * 1000)) }, select: ['id'] });
      let templates = 0;
      for (const t of empty) {
        if (await this.campaigns.count({ where: { templateId: t.id } })) continue;
        await this.templates.delete(t.id);
        templates++;
      }
      return { images, templates };
    });
    if (outcome.acquired && outcome.result) this.logger.log(`removed ${outcome.result.images} unused email image(s), ${outcome.result.templates} empty template(s)`);
  }
}
```

(Check `EmailTemplate` has `createdAt`; if not, use `updatedAt`.)

`EmailImageController` (in `email-designer.controller.ts`):

```ts
@Controller('api/dashboard/email-images')
@UseGuards(JwtAuthGuard, TenantGuard, DashboardAddonGuard)
@RequiresAddon('emailCampaign')
export class EmailImageController {
  constructor(private readonly images: EmailImageService) {}

  @Get()
  list(@CurrentTenant() tenantId: number) {
    return this.images.list(tenantId);
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_INPUT_BYTES } }))
  upload(@CurrentTenant() tenantId: number, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException({ code: 'IMAGE_MISSING', message: 'Choose an image.' });
    return this.images.upload(tenantId, { buffer: file.buffer, mimetype: file.mimetype });
  }

  @Delete(':imageId')
  remove(@CurrentTenant() tenantId: number, @Param('imageId', ParseIntPipe) imageId: number) {
    return this.images.remove(tenantId, imageId);
  }
}
```

Wire-up:
- Module: `imports: [..., UploadModule]` (`import { UploadModule } from '../upload/upload.module';`), controllers `EmailImageController`, providers `EmailImageService`, `DesignerCleanupService`.
- `EmailCampaignService`: inject `EmailImageService`; after a template create/update save: `await this.images.touch(tenantId, template.bodyHtml);`.
- `EmailCampaignProcessor.process`: right after the template is loaded and before sending starts, `await this.images.pin(tenantId, template.bodyHtml);` (inject `EmailImageService`).

- [ ] **Step 4: Run the tests**

Run: `cd apps/api && npx jest src/modules/email-campaign`
Expected: all PASS.

- [ ] **Step 5: Manual check** — rebuild + restart the API; on the dashboard (logged in as the test client) run in the console:

```js
const tok = (await (await fetch('/api/auth/session')).json()).accessToken;
const blob = await (await fetch('https://picsum.photos/2400/1600')).blob();
const fd = new FormData(); fd.append('file', blob, 'x.jpg');
await fetch('http://localhost:3001/api/dashboard/email-images', { method: 'POST', headers: { Authorization: 'Bearer ' + tok }, body: fd }).then(r => r.json());
```

Expected: `data.width === 1200`, `data.url` opens the image. Uploading the same blob again returns the same `id`.

- [ ] **Step 6: Checkpoint** — tsc clean, graphify.

---
### Task 6: Starter layouts, design guide and designer tools (pure)

**Files:**
- Create: `apps/api/src/modules/email-campaign/designer/layouts.ts`
- Create: `apps/api/src/modules/email-campaign/designer/design-guide.ts`
- Create: `apps/api/src/modules/email-campaign/designer/designer-tools.ts`
- Test: `apps/api/src/modules/email-campaign/designer/layouts.spec.ts`, `designer-tools.spec.ts`, `design-guide.spec.ts`

**Interfaces:**
- Consumes: `checkTemplate`, `inlineCss` (Task 2), `renderCampaignEmail` (Task 1).
- Produces:
  - `export type LayoutName = 'luxury' | 'modern' | 'minimal' | 'newsletter' | 'new-listing' | 'open-house'`
  - `export const LAYOUTS: { name: LayoutName; subject: string; html: string }[]`; `export function layoutByName(name: string): { name: LayoutName; subject: string; html: string } | null`
  - `export function designerSystemPrompt(input: DesignerPromptInput): string` with `export interface DesignerPromptInput { agency: string; color: string; hasLogo: boolean; phone: string; email: string; website: string; notes: string[]; language: string; currentHtml: string; currentSubject: string }`
  - `export const DESIGNER_TOOLS: ToolDefinition[]` (names `replace_html`, `edit_html`, `use_layout`, `set_subject`, `save_brand_note`)
  - `export interface DesignState { html: string; subject: string; notes: string[]; changed: boolean }`
  - `export function applyEdits(html: string, edits: { find: string; replace: string }[]): { ok: true; html: string } | { ok: false; error: string }`
  - `export function runDesignerTool(state: DesignState, name: string, rawArgs: string): string` — mutates `state`, returns the text sent back to the model as the tool result.

- [ ] **Step 1: Write the failing tests**

`designer-tools.spec.ts`:

```ts
import { applyEdits, runDesignerTool, type DesignState } from './designer-tools';

const state = (html = '<p>Hello</p><a style="background:#000">Go</a>{{unsubscribe_link}}'): DesignState => ({ html, subject: 'S', notes: [], changed: false });

describe('applyEdits', () => {
  it('applies edits that match exactly once, in order', () => {
    expect(applyEdits('<a>1</a><b>2</b>', [{ find: '<a>1</a>', replace: '<a>one</a>' }, { find: '<b>2</b>', replace: '' }])).toEqual({ ok: true, html: '<a>one</a>' });
  });
  it('fails when a find text is missing or appears twice', () => {
    expect(applyEdits('<p>x</p>', [{ find: '<p>y</p>', replace: '' }])).toMatchObject({ ok: false });
    expect(applyEdits('<p>x</p><p>x</p>', [{ find: '<p>x</p>', replace: '' }])).toMatchObject({ ok: false });
  });
});

describe('runDesignerTool', () => {
  it('replace_html swaps the design and marks it changed', () => {
    const s = state();
    expect(runDesignerTool(s, 'replace_html', JSON.stringify({ html: '<p>New</p>{{unsubscribe_link}}' }))).toMatch(/^OK/);
    expect(s.html).toBe('<p>New</p>{{unsubscribe_link}}');
    expect(s.changed).toBe(true);
  });
  it('edit_html reports a failed edit and leaves the design alone', () => {
    const s = state();
    expect(runDesignerTool(s, 'edit_html', JSON.stringify({ edits: [{ find: 'nope', replace: 'x' }] }))).toMatch(/^ERROR/);
    expect(s.changed).toBe(false);
  });
  it('rejects a result with an unbalanced loop, keeping the previous design', () => {
    const s = state();
    expect(runDesignerTool(s, 'replace_html', JSON.stringify({ html: '{{#properties}}<p>x</p>' }))).toMatch(/LOOP_UNBALANCED/);
    expect(s.html).toContain('Hello');
  });
  it('use_layout, set_subject and save_brand_note', () => {
    const s = state();
    expect(runDesignerTool(s, 'use_layout', JSON.stringify({ name: 'luxury' }))).toMatch(/^OK/);
    expect(s.html).toContain('{{#properties}}');
    runDesignerTool(s, 'set_subject', JSON.stringify({ subject: 'New villas for {{contact.first_name}}' }));
    expect(s.subject).toBe('New villas for {{contact.first_name}}');
    runDesignerTool(s, 'save_brand_note', JSON.stringify({ note: 'Prefers dark blue and gold' }));
    expect(s.notes).toEqual(['Prefers dark blue and gold']);
  });
  it('answers unknown tools and bad JSON with an error', () => {
    expect(runDesignerTool(state(), 'nope', '{}')).toMatch(/^ERROR/);
    expect(runDesignerTool(state(), 'replace_html', '{bad')).toMatch(/^ERROR/);
  });
});
```

`layouts.spec.ts`:

```ts
import { LAYOUTS, layoutByName } from './layouts';
import { checkTemplate, inlineCss, MAX_TEMPLATE_BYTES } from '../template-check';
import { renderCampaignEmail } from '../campaign-render';

const card = (i: number) => ({ title: `Villa ${i}`, location: 'Marbella', propertyType: 'Villa', price: '€1,000,000', facts: [], image: `https://img/${i}.jpg`, url: `https://site/p/${i}`, reference: `R${i}`, beds: 3, baths: 2, area: '200 m²' });

describe('starter layouts', () => {
  it.each(LAYOUTS.map((l) => [l.name, l]))('%s is clean, uses the loop and renders without leftovers', (_name, layout) => {
    const check = checkTemplate(layout.html);
    expect(check.errors).toEqual([]);
    expect(check.warnings).toEqual([]);
    expect(layout.html).toContain('{{#properties}}');
    expect(Buffer.byteLength(layout.html)).toBeLessThan(MAX_TEMPLATE_BYTES);
    const out = renderCampaignEmail({
      subject: layout.subject, bodyHtml: inlineCss(check.html), contact: { name: 'Ann Smith', email: 'a@x.es' }, agency: 'Sun Homes', color: '#0055aa',
      agencyInfo: { logo: 'https://cdn/logo.png', phone: '+34 1', email: 'i@s.es', website: 'https://sun.es' },
      properties: [card(1), card(2), card(3)], unsubscribeUrl: 'https://api/u',
    });
    expect(out.html).not.toContain('{{');
    expect(out.html).toContain('https://site/p/3');
    expect(out.html).toContain('https://api/u');
  });

  it('finds layouts by name', () => {
    expect(layoutByName('modern')?.name).toBe('modern');
    expect(layoutByName('x')).toBeNull();
  });
});
```

`design-guide.spec.ts`:

```ts
import { designerSystemPrompt } from './design-guide';

describe('designerSystemPrompt', () => {
  const base = { agency: 'Sun Homes', color: '#0055aa', hasLogo: true, phone: '+34 1', email: 'i@s.es', website: 'https://sun.es', notes: ['No emojis'], language: 'es', currentHtml: '<p>x</p>', currentSubject: 'Hi' };
  it('carries the rules, the brand notes, the language and the current design', () => {
    const p = designerSystemPrompt(base);
    expect(p).toContain('600');
    expect(p).toContain('{{#properties}}');
    expect(p).toContain('No emojis');
    expect(p).toContain('Spanish');
    expect(p).toContain('<p>x</p>');
    expect(p).toContain('luxury');
  });
  it('says there is no design yet for an empty template', () => {
    expect(designerSystemPrompt({ ...base, currentHtml: '' })).toContain('no design yet');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/api && npx jest src/modules/email-campaign/designer`
Expected: the three new specs FAIL (modules not found).

- [ ] **Step 3: Implement `layouts.ts`**

```ts
// Six hand-built starter designs. The AI starts from the closest one and the
// client can pick one in the editor. Email-safe: tables, inline styles, 600px,
// one @media block for phones. Colours and contact details come from
// placeholders so every client's version is their own.

export type LayoutName = 'luxury' | 'modern' | 'minimal' | 'newsletter' | 'new-listing' | 'open-house';

interface Theme { page: string; card: string; text: string; muted: string; accent: string; font: string; heading: string; radius: number }

const SANS = "'Helvetica Neue',Helvetica,Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";

const shell = (t: Theme, inner: string) => `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{{agency.name}}</title>
<style>
@media (max-width:620px){.container{width:100%!important}.stack{display:block!important;width:100%!important;max-width:100%!important}.px{padding-left:20px!important;padding-right:20px!important}.h1{font-size:28px!important;line-height:34px!important}}
</style></head>
<body style="margin:0;padding:0;background:${t.page}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${t.page}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:${t.card};border-radius:${t.radius}px;font-family:${t.font};color:${t.text}">
${inner}
</table>
</td></tr></table>
</body></html>`;

const header = (t: Theme, bg: string, align: 'left' | 'center') => `<tr><td class="px" align="${align}" style="padding:28px 40px;background:${bg}">
<a href="{{agency.website}}" style="text-decoration:none"><img src="{{agency.logo}}" alt="{{agency.name}}" height="40" style="height:40px;border:0;display:inline-block;color:${t.text};font-family:${t.heading};font-size:20px"></a>
</td></tr>`;

const hero = (t: Theme, kicker: string, title: string, text: string) => `<tr><td class="px" style="padding:40px 40px 16px">
<p style="margin:0 0 8px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:${t.accent}">${kicker}</p>
<h1 class="h1" style="margin:0 0 16px;font-family:${t.heading};font-size:34px;line-height:40px;font-weight:normal;color:${t.text}">${title}</h1>
<p style="margin:0;font-size:16px;line-height:26px;color:${t.muted}">${text}</p>
</td></tr>`;

const button = (t: Theme, label: string, href: string, color: string, textColor = '#ffffff') => `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:${t.radius}px;background:${color}">
<a href="${href}" style="display:inline-block;padding:12px 24px;font-family:${t.font};font-size:15px;font-weight:bold;color:${textColor};text-decoration:none;border-radius:${t.radius}px">${label}</a>
</td></tr></table>`;

const stackCards = (t: Theme, buttonColor: string) => `<tr><td class="px" style="padding:16px 40px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
{{#properties}}<tr><td style="padding:0 0 28px">
<a href="{{property.url}}"><img src="{{property.image}}" alt="{{property.title}}" width="520" style="display:block;width:100%;max-width:520px;height:auto;border:0;border-radius:${t.radius}px"></a>
<p style="margin:14px 0 4px;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:${t.muted}">{{property.location}} · {{property.type}}</p>
<p style="margin:0 0 6px;font-family:${t.heading};font-size:21px;line-height:27px;color:${t.text}">{{property.title}}</p>
<p style="margin:0 0 12px;font-size:14px;color:${t.muted}">{{property.beds}} bedrooms · {{property.baths}} bathrooms · {{property.area}}</p>
<p style="margin:0 0 14px;font-size:20px;font-weight:bold;color:${t.accent}">{{property.price}}</p>
${button(t, 'View property', '{{property.url}}', buttonColor)}
</td></tr>{{/properties}}
</table></td></tr>`;

const gridCards = (t: Theme, buttonColor: string) => `<tr><td class="px" style="padding:16px 30px">
{{#properties}}<table role="presentation" class="stack" align="left" width="260" cellpadding="0" cellspacing="0" style="width:260px;margin:0 10px 24px">
<tr><td><a href="{{property.url}}"><img src="{{property.image}}" alt="{{property.title}}" width="260" style="display:block;width:100%;height:auto;border:0;border-radius:${t.radius}px"></a></td></tr>
<tr><td style="padding:12px 2px 0">
<p style="margin:0 0 4px;font-size:16px;font-weight:bold;line-height:21px;color:${t.text}">{{property.title}}</p>
<p style="margin:0 0 6px;font-size:13px;color:${t.muted}">{{property.location}} · {{property.beds}} bed · {{property.area}}</p>
<p style="margin:0 0 12px;font-size:17px;font-weight:bold;color:${t.accent}">{{property.price}}</p>
${button(t, 'View', '{{property.url}}', buttonColor)}
</td></tr></table>{{/properties}}
</td></tr>`;

const contact = (t: Theme, bg: string) => `<tr><td class="px" align="center" style="padding:32px 40px;background:${bg}">
<p style="margin:0 0 6px;font-family:${t.heading};font-size:20px;color:${t.text}">Talk to {{agency.name}}</p>
<p style="margin:0;font-size:15px;line-height:24px;color:${t.muted}"><a href="tel:{{agency.phone}}" style="color:${t.accent};text-decoration:none">{{agency.phone}}</a> · <a href="mailto:{{agency.email}}" style="color:${t.accent};text-decoration:none">{{agency.email}}</a></p>
</td></tr>`;

const footer = (t: Theme) => `<tr><td class="px" align="center" style="padding:24px 40px 32px;font-size:12px;line-height:18px;color:${t.muted}">
{{agency.name}} · <a href="{{agency.website}}" style="color:${t.muted}">{{agency.website}}</a><br>
You receive this email because you subscribed to our property updates. <a href="{{unsubscribe_link}}" style="color:${t.muted}">Unsubscribe</a>
</td></tr>`;

const luxury: Theme = { page: '#0b0b0b', card: '#141414', text: '#f5f1e8', muted: '#b9b2a3', accent: '#c9a227', font: SANS, heading: SERIF, radius: 0 };
const modern: Theme = { page: '#f1f5f9', card: '#ffffff', text: '#0f172a', muted: '#475569', accent: '{{agency.color}}', font: SANS, heading: SANS, radius: 8 };
const minimal: Theme = { page: '#ffffff', card: '#ffffff', text: '#111111', muted: '#666666', accent: '#111111', font: SANS, heading: SANS, radius: 0 };
const newsletter: Theme = { page: '#eef2f6', card: '#ffffff', text: '#1f2937', muted: '#4b5563', accent: '{{agency.color}}', font: SANS, heading: SERIF, radius: 6 };

export const LAYOUTS: { name: LayoutName; subject: string; html: string }[] = [
  {
    name: 'luxury',
    subject: 'Exceptional homes, selected for you',
    html: shell(luxury, [
      header(luxury, '#141414', 'center'),
      hero(luxury, 'Private collection', 'Exceptional homes, selected for you', 'Dear {{contact.first_name}}, a few residences we believe deserve your attention this month.'),
      stackCards(luxury, '#c9a227'),
      contact(luxury, '#1b1b1b'),
      footer(luxury),
    ].join('\n')),
  },
  {
    name: 'modern',
    subject: 'New properties for you, {{contact.first_name}}',
    html: shell(modern, [
      header(modern, '#ffffff', 'left'),
      hero(modern, 'New this week', 'Homes we think you will love', 'Hi {{contact.first_name}}, here are the latest listings matching what our clients ask for most.'),
      gridCards(modern, '{{agency.color}}'),
      `<tr><td class="px" align="center" style="padding:8px 40px 32px">${button(modern, 'See all properties', '{{agency.website}}', '{{agency.color}}')}</td></tr>`,
      contact(modern, '#f8fafc'),
      footer(modern),
    ].join('\n')),
  },
  {
    name: 'minimal',
    subject: 'A short selection for you',
    html: shell(minimal, [
      header(minimal, '#ffffff', 'left'),
      hero(minimal, '{{agency.name}}', 'A short selection', 'Hello {{contact.first_name}}, three homes worth a look.'),
      stackCards(minimal, '#111111'),
      footer(minimal),
    ].join('\n')),
  },
  {
    name: 'newsletter',
    subject: 'Our monthly property update',
    html: shell(newsletter, [
      header(newsletter, '{{agency.color}}', 'center'),
      hero(newsletter, 'Monthly update', 'What is happening in the market', 'Hi {{contact.first_name}}, a quick look at the month: what sold, what is new, and the homes our team recommends.'),
      `<tr><td class="px" style="padding:8px 40px 8px"><p style="margin:0;font-size:15px;line-height:24px;color:#4b5563">Write two or three short paragraphs here about prices, new developments or tips for buyers.</p></td></tr>`,
      gridCards(newsletter, '{{agency.color}}'),
      contact(newsletter, '#f3f4f6'),
      footer(newsletter),
    ].join('\n')),
  },
  {
    name: 'new-listing',
    subject: 'Just listed: {{agency.name}}',
    html: shell(modern, [
      header(modern, '#ffffff', 'center'),
      hero(modern, 'Just listed', 'Be the first to see it', 'Hi {{contact.first_name}}, this property has just come on the market.'),
      stackCards(modern, '{{agency.color}}'),
      contact(modern, '#f8fafc'),
      footer(modern),
    ].join('\n')),
  },
  {
    name: 'open-house',
    subject: 'You are invited: open house',
    html: shell(newsletter, [
      header(newsletter, '#ffffff', 'center'),
      hero(newsletter, 'Open house', 'Come and see it in person', 'Hi {{contact.first_name}}, join us for a viewing. No appointment needed.'),
      `<tr><td class="px" style="padding:8px 40px 16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;border-radius:6px"><tr><td style="padding:20px 24px;font-size:16px;line-height:26px;color:#1f2937"><b>Saturday, 10:00 – 14:00</b><br>Write the address here</td></tr></table></td></tr>`,
      stackCards(newsletter, '{{agency.color}}'),
      `<tr><td class="px" align="center" style="padding:0 40px 32px">${button(newsletter, 'Reply to book a time', 'mailto:{{agency.email}}', '{{agency.color}}')}</td></tr>`,
      footer(newsletter),
    ].join('\n')),
  },
];

export function layoutByName(name: string): { name: LayoutName; subject: string; html: string } | null {
  return LAYOUTS.find((l) => l.name === name) ?? null;
}
```

- [ ] **Step 4: Implement `design-guide.ts`**

```ts
import { LAYOUTS } from './layouts';

// The instructions every design request runs with: the same for every
// client, plus that client's own details and brand notes. Platform-owned.

export interface DesignerPromptInput {
  agency: string;
  color: string;
  hasLogo: boolean;
  phone: string;
  email: string;
  website: string;
  notes: string[];
  language: string;
  currentHtml: string;
  currentSubject: string;
}

const LANGUAGES: Record<string, string> = { en: 'English', es: 'Spanish', nl: 'Dutch', de: 'German', fr: 'French', fi: 'Finnish', sv: 'Swedish' };

export function designerSystemPrompt(i: DesignerPromptInput): string {
  const lang = LANGUAGES[i.language] ?? 'English';
  return `You are a senior email designer for ${i.agency || 'a real estate agency'}. You design HTML email templates for property campaigns inside the SPM dashboard. The client chats with you; you change the template with tools and reply briefly.

HOW TO WORK
- First design, or "start again": call replace_html with the complete template (or use_layout to start from a starter design, then edit_html).
- Changes: call edit_html with small exact find/replace pairs copied from the CURRENT TEMPLATE. If an edit fails, call replace_html with the full corrected template.
- If the client states a lasting preference (colours, tone, always/never include something), call save_brand_note with one short sentence.
- Set the subject line with set_subject when you create a design or the client asks.
- After the tools, reply in ${lang} in 1–3 short sentences saying what you changed. Ask one short question only when the request is truly unclear. Never show HTML in your reply.

EMAIL-SAFE RULES (must follow)
- Layout with <table role="presentation"> only; no flexbox, grid, position, float for layout.
- One centred container 600px wide (class "container"); content cells use class "px" for phone padding.
- Styles inline on each element. One <style> block in <head> may hold only @media (max-width:620px) rules; use class "stack" on side-by-side tables so they stack on phones.
- Web-safe fonts only: 'Helvetica Neue',Helvetica,Arial,sans-serif or Georgia,'Times New Roman',serif. Max 2 fonts.
- Buttons: a table cell with a background colour containing an <a> with padding (bulletproof button). Minimum 44px tall.
- Every <img> has alt text, a width attribute, style="display:block;height:auto;border:0".
- No JavaScript, forms, iframes, video, external CSS, web fonts or background images for important content.
- Text at least 14px (body 15–16px), line-height about 1.5. Good contrast. Keep the whole HTML under 90 KB.

DESIGN PRINCIPLES
- Clear hierarchy: one headline, short intro, the listings, one main call to action, contact, footer.
- Generous spacing (24–40px between sections). Brand colour as accent (buttons, prices, small labels), not as huge background floods, unless asked.
- Real estate: photo-led listing cards, price and location prominent, a "View property" button on every card, an agent/contact block, a calm trustworthy footer.

PLACEHOLDERS (never type the real values — use these)
- {{contact.first_name}} {{contact.name}} for the reader.
- {{agency.name}} {{agency.logo}} (logo image URL) {{agency.phone}} {{agency.email}} {{agency.website}} {{agency.color}} (brand colour).
- Listings: one loop {{#properties}} … {{/properties}}. Inside it: {{property.title}} {{property.price}} {{property.location}} {{property.type}} {{property.reference}} {{property.beds}} {{property.baths}} {{property.area}} {{property.image}} {{property.url}}. The loop repeats per featured listing; put the whole card inside it. Property placeholders only work inside the loop.
- Always keep a footer link to {{unsubscribe_link}}.
- Image URLs the client gives you may be used as they are.

STARTER DESIGNS (use_layout): ${LAYOUTS.map((l) => l.name).join(', ')}.

THIS CLIENT
- Agency: ${i.agency || '(not set)'}; brand colour ${i.color}; logo ${i.hasLogo ? 'set' : 'not set — use the agency name as text instead of {{agency.logo}}'}; phone ${i.phone || '(not set)'}; email ${i.email || '(not set)'}; website ${i.website || '(not set)'}.
- Brand notes (follow them): ${i.notes.length ? i.notes.map((n) => `\n  - ${n}`).join('') : 'none yet'}

CURRENT SUBJECT: ${i.currentSubject || '(none)'}
CURRENT TEMPLATE:
${i.currentHtml.trim() ? i.currentHtml : '(no design yet)'}`;
}
```

- [ ] **Step 5: Implement `designer-tools.ts`**

```ts
import type { ToolDefinition } from '../../ai/ai.service';
import { checkTemplate } from '../template-check';
import { layoutByName, LAYOUTS } from './layouts';

// The tools the AI designer calls, and how they change the design. Every
// change is checked; a change that breaks the template is refused and the
// model is told why, so it can fix it itself.

export interface DesignState { html: string; subject: string; notes: string[]; changed: boolean }

export const DESIGNER_TOOLS: ToolDefinition[] = [
  { type: 'function', function: { name: 'replace_html', description: 'Replace the whole template with a complete new HTML email.', parameters: { type: 'object', properties: { html: { type: 'string', description: 'The complete HTML document.' } }, required: ['html'] } } },
  { type: 'function', function: { name: 'edit_html', description: 'Small changes: each find text must appear exactly once in the current template.', parameters: { type: 'object', properties: { edits: { type: 'array', items: { type: 'object', properties: { find: { type: 'string' }, replace: { type: 'string' } }, required: ['find', 'replace'] } } }, required: ['edits'] } } },
  { type: 'function', function: { name: 'use_layout', description: 'Start from a starter design.', parameters: { type: 'object', properties: { name: { type: 'string', enum: LAYOUTS.map((l) => l.name) } }, required: ['name'] } } },
  { type: 'function', function: { name: 'set_subject', description: 'Set the email subject line (placeholders allowed).', parameters: { type: 'object', properties: { subject: { type: 'string' } }, required: ['subject'] } } },
  { type: 'function', function: { name: 'save_brand_note', description: "Remember one lasting preference of this client's brand (one short sentence).", parameters: { type: 'object', properties: { note: { type: 'string' } }, required: ['note'] } } },
];

export function applyEdits(html: string, edits: { find: string; replace: string }[]): { ok: true; html: string } | { ok: false; error: string } {
  let out = html;
  for (const [i, e] of edits.entries()) {
    if (typeof e?.find !== 'string' || !e.find || typeof e.replace !== 'string') return { ok: false, error: `edit ${i + 1} is malformed` };
    const count = out.split(e.find).length - 1;
    if (count !== 1) return { ok: false, error: `edit ${i + 1}: the find text appears ${count} times (must be exactly once)` };
    out = out.replace(e.find, () => e.replace);
  }
  return { ok: true, html: out };
}

function accept(state: DesignState, html: string): string {
  const check = checkTemplate(html);
  if (check.errors.length) return `ERROR: the result has ${check.errors.join(', ')}. The design was not changed; fix it and try again.`;
  state.html = check.html;
  state.changed = true;
  const warn = check.warnings.length ? ` Warnings: ${check.warnings.join(', ')}.` : '';
  return `OK: design updated.${warn}`;
}

export function runDesignerTool(state: DesignState, name: string, rawArgs: string): string {
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(rawArgs || '{}');
  } catch {
    return 'ERROR: the tool arguments were not valid JSON.';
  }
  switch (name) {
    case 'replace_html':
      return typeof args.html === 'string' && args.html.trim() ? accept(state, args.html) : 'ERROR: html is empty.';
    case 'edit_html': {
      const res = applyEdits(state.html, Array.isArray(args.edits) ? (args.edits as { find: string; replace: string }[]) : []);
      return res.ok ? accept(state, res.html) : `ERROR: ${res.error}. Use replace_html with the full template instead.`;
    }
    case 'use_layout': {
      const layout = layoutByName(String(args.name));
      if (!layout) return `ERROR: unknown layout. Choose one of ${LAYOUTS.map((l) => l.name).join(', ')}.`;
      if (!state.subject.trim()) state.subject = layout.subject;
      return `${accept(state, layout.html)} The layout is now the current template:\n${layout.html}`;
    }
    case 'set_subject': {
      const subject = String(args.subject ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, 255);
      if (!subject) return 'ERROR: subject is empty.';
      state.subject = subject;
      state.changed = true;
      return 'OK: subject set.';
    }
    case 'save_brand_note': {
      const note = String(args.note ?? '').trim().slice(0, 200);
      if (!note) return 'ERROR: note is empty.';
      state.notes.push(note);
      return 'OK: noted.';
    }
    default:
      return `ERROR: unknown tool ${name}.`;
  }
}
```

- [ ] **Step 6: Run the tests**

Run: `cd apps/api && npx jest src/modules/email-campaign/designer`
Expected: all PASS. If a layout test fails on `{{agency.color}}` inside `style` after `inlineCss`, make `inlineCss` protect placeholders inside attributes the same way as the loop markers (replace `{{x}}` with `SPMPH0`, `SPMPH1`… tokens before juice, restore after) and add a test for it in `template-check.spec.ts`.

- [ ] **Step 7: Checkpoint** — tsc clean, graphify.

---

### Task 7: AI designer service, brand memory and routes

**Files:**
- Create: `apps/api/src/modules/email-campaign/designer/brand-memory.service.ts`
- Create: `apps/api/src/modules/email-campaign/designer/email-designer.service.ts`
- Modify: `designer/email-designer.controller.ts`, `dto/designer.dto.ts`, `email-campaign.module.ts` (import `AiModule`)
- Modify: `apps/api/src/modules/ai/ai.service.ts` — add `clientModel()`
- Test: `apps/api/src/modules/email-campaign/designer/email-designer.service.spec.ts`, `brand-memory.service.spec.ts`

**Interfaces:**
- Consumes: `DESIGNER_TOOLS`, `runDesignerTool`, `DesignState` (Task 6); `designerSystemPrompt` (Task 6); `TemplateVersionService.record` (Task 4); `EmailImageService.touch` (Task 5); `CampaignContentService.context` (Task 3, for agency facts); `AiService.chatCompletionWithTools`, `AiService.hasClientKey`.
- Produces:
  - `AiService.clientModel(tenantId: number): Promise<{ provider: 'openrouter' | 'anthropic'; model: string } | null>`
  - `BrandMemoryService.get(tenantId): Promise<string[]>`, `.set(tenantId, notes: string[]): Promise<string[]>`, `.add(tenantId, notes: string[]): Promise<void>`; `export const MAX_NOTES = 20, MAX_NOTE_CHARS = 200`
  - `EmailDesignerService.status(tenantId): Promise<{ hasKey: boolean; provider: string | null; model: string | null; modelOk: boolean }>`
  - `EmailDesignerService.history(tenantId, templateId): Promise<{ id: number; role: 'user' | 'assistant'; content: string; versionId: number | null; createdAt: Date }[]>`
  - `EmailDesignerService.send(tenantId, templateId, input: { message: string; imageUrls?: string[] }): Promise<{ reply: string; changed: boolean; versionId: number | null; bodyHtml: string; subject: string; warnings: string[] }>`
  - `export function isDesignModel(model: string): boolean`
  - Routes: `GET /api/dashboard/email-designer/status`, `GET/PUT /api/dashboard/email-designer/brand-memory`, `GET /api/dashboard/email-designer/layouts`, `GET /api/dashboard/email-templates/:id/ai-chat`, `POST /api/dashboard/email-templates/:id/ai-chat` (body `DesignerMessageDto { message: string (1..4000); imageUrls?: string[] (≤5, https) }`).
  - Error codes (400/409/429 `{ code }`): `NO_AI_KEY`, `DESIGNER_BUSY`, `DESIGNER_RATE_LIMIT`, `DESIGNER_FAILED`.

- [ ] **Step 1: `AiService.clientModel`** — add next to `hasClientKey`:

```ts
  /** Which provider and model the client's own key would use (null = no key). */
  async clientModel(tenantId: number): Promise<{ provider: 'openrouter' | 'anthropic'; model: string } | null> {
    try {
      const r = await this.resolveKeyAndModel(tenantId, undefined, 'client');
      return { provider: r.provider === 'anthropic' ? 'anthropic' : 'openrouter', model: r.model };
    } catch {
      return null;
    }
  }
```

- [ ] **Step 2: Write the failing tests**

`brand-memory.service.spec.ts`:

```ts
import { BrandMemoryService, MAX_NOTES } from './brand-memory.service';

const repo = () => {
  const rows: any[] = [];
  return { rows, findOne: async ({ where }: any) => rows.find((r) => r.tenantId === where.tenantId) ?? null, save: async (r: any) => { const i = rows.findIndex((x) => x.tenantId === r.tenantId); if (i >= 0) rows[i] = r; else rows.push(r); return r; } };
};

describe('BrandMemoryService', () => {
  it('trims, de-duplicates and caps notes, dropping the oldest', async () => {
    const r = repo();
    const svc = new BrandMemoryService(r as any);
    await svc.add(2, ['  Dark blue and gold  ', 'dark blue and gold']);
    expect(await svc.get(2)).toEqual(['Dark blue and gold']);
    await svc.add(2, Array.from({ length: MAX_NOTES + 3 }, (_, i) => `note ${i}`));
    const notes = await svc.get(2);
    expect(notes).toHaveLength(MAX_NOTES);
    expect(notes.at(-1)).toBe(`note ${MAX_NOTES + 2}`);
  });
  it('keeps clients apart', async () => {
    const svc = new BrandMemoryService(repo() as any);
    await svc.set(2, ['A']);
    expect(await svc.get(3)).toEqual([]);
  });
});
```

`email-designer.service.spec.ts` (fake AI that scripts responses):

```ts
import { EmailDesignerService, isDesignModel } from './email-designer.service';

function setup(script: any[], opts: { hasKey?: boolean } = {}) {
  const template: any = { id: 7, tenantId: 2, name: 'T', subject: '', bodyHtml: '' };
  const messages: any[] = [];
  const versions: any[] = [];
  const calls: any[] = [];
  const ai = {
    hasClientKey: async () => opts.hasKey ?? true,
    clientModel: async () => ({ provider: 'openrouter', model: 'anthropic/claude-sonnet-5.5' }),
    chatCompletionWithTools: async (_t: number, msgs: any[], tools: any) => { calls.push({ msgs: [...msgs], tools }); return script.shift(); },
  };
  const deps = {
    templates: { findOne: async () => template, save: async (t: any) => Object.assign(template, t) },
    messages: { find: async () => messages.filter((m) => m.templateId === 7), save: async (m: any) => { m.id = messages.length + 1; messages.push(m); return m; }, create: (m: any) => m },
    ai,
    versions: { record: async (_t: number, _id: number, v: any) => { versions.push(v); return { id: versions.length }; } },
    memory: { get: async () => ['No emojis'], add: async () => undefined },
    images: { touch: async () => undefined },
    content: { context: async () => ({ agency: 'Sun', color: '#0055aa', agencyInfo: { logo: null, phone: '+34', email: 'i@s', website: '' }, defaultLang: 'en' }) },
    lock: { withLock: async (_k: string, _t: number, fn: () => Promise<unknown>) => ({ acquired: true, result: await fn() }) },
    redis: null,
  };
  const svc = new EmailDesignerService(deps.templates as any, deps.messages as any, deps.ai as any, deps.versions as any, deps.memory as any, deps.images as any, deps.content as any, deps.lock as any, deps.redis as any);
  return { svc, template, messages, versions, calls };
}

const tool = (name: string, args: unknown) => ({ id: `c-${name}`, type: 'function', function: { name, arguments: JSON.stringify(args) } });
const answer = (content: string | null, toolCalls: any[] = []) => ({ content, toolCalls, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } });

describe('EmailDesignerService.send', () => {
  it('creates a design, saves it as a version and the chat', async () => {
    const { svc, template, messages, versions, calls } = setup([
      answer(null, [tool('replace_html', { html: '<p>Hi {{contact.first_name}}</p>{{unsubscribe_link}}' }), tool('set_subject', { subject: 'Hello' })]),
      answer('Done: a simple welcome email.'),
    ]);
    const out = await svc.send(2, 7, { message: 'Make a welcome email' });
    expect(out.changed).toBe(true);
    expect(template.bodyHtml).toContain('Hi {{contact.first_name}}');
    expect(template.subject).toBe('Hello');
    expect(versions[0].source).toBe('ai');
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(messages[1].versionId).toBe(1);
    expect(calls[0].msgs[0].content).toContain('No emojis');
  });

  it('falls back from a failed edit to a full rewrite in the same turn', async () => {
    const { svc, template } = setup([
      answer(null, [tool('edit_html', { edits: [{ find: 'missing', replace: 'x' }] })]),
      answer(null, [tool('replace_html', { html: '<p>Fixed</p>{{unsubscribe_link}}' })]),
      answer('Changed the text.'),
    ]);
    template.bodyHtml = '<p>Old</p>{{unsubscribe_link}}';
    const out = await svc.send(2, 7, { message: 'Change the text' });
    expect(out.bodyHtml).toContain('Fixed');
  });

  it('keeps the previous design when the model never produces a valid one', async () => {
    const { svc, template, versions } = setup([
      answer(null, [tool('replace_html', { html: '{{#properties}}<p>x</p>' })]),
      answer(null, [tool('replace_html', { html: '{{#properties}}<p>y</p>' })]),
      answer(null, [tool('replace_html', { html: '{{#properties}}' })]),
      answer('Sorry.'),
    ]);
    template.bodyHtml = '<p>Keep</p>{{unsubscribe_link}}';
    const out = await svc.send(2, 7, { message: 'Break it' });
    expect(out.changed).toBe(false);
    expect(template.bodyHtml).toContain('Keep');
    expect(versions).toHaveLength(0);
  });

  it('refuses without a client key', async () => {
    const { svc } = setup([], { hasKey: false });
    await expect(svc.send(2, 7, { message: 'x' })).rejects.toMatchObject({ response: { code: 'NO_AI_KEY' } });
  });

  it('gives the last round no tools so the model must answer', async () => {
    const { svc, calls } = setup([
      answer(null, [tool('set_subject', { subject: 'a' })]),
      answer(null, [tool('set_subject', { subject: 'b' })]),
      answer(null, [tool('set_subject', { subject: 'c' })]),
      answer('ok'),
    ]);
    await svc.send(2, 7, { message: 'x' });
    expect(calls).toHaveLength(4);
    expect(calls[3].tools).toBeUndefined();
  });
});

describe('isDesignModel', () => {
  it('accepts strong models and rejects small ones', () => {
    expect(isDesignModel('claude-sonnet-5-5')).toBe(true);
    expect(isDesignModel('anthropic/claude-opus-5.5')).toBe(true);
    expect(isDesignModel('openai/gpt-4.1')).toBe(true);
    expect(isDesignModel('google/gemini-2.5-pro')).toBe(true);
    expect(isDesignModel('claude-haiku-5-5')).toBe(false);
    expect(isDesignModel('openai/gpt-4o-mini')).toBe(false);
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `cd apps/api && npx jest src/modules/email-campaign/designer/email-designer.service.spec.ts src/modules/email-campaign/designer/brand-memory.service.spec.ts`
Expected: FAIL, modules not found.

- [ ] **Step 4: Implement `brand-memory.service.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantBrandMemory } from '../../../database/entities';

export const MAX_NOTES = 20;
export const MAX_NOTE_CHARS = 200;

// Short notes about one client's taste ("dark blue and gold", "no emojis")
// that every new design starts with. The client can read and edit them.
@Injectable()
export class BrandMemoryService {
  constructor(@InjectRepository(TenantBrandMemory) private readonly repo: Repository<TenantBrandMemory>) {}

  async get(tenantId: number): Promise<string[]> {
    const row = await this.repo.findOne({ where: { tenantId } });
    return Array.isArray(row?.notes) ? row!.notes : [];
  }

  async set(tenantId: number, notes: string[]): Promise<string[]> {
    const clean: string[] = [];
    for (const raw of notes) {
      const n = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_NOTE_CHARS);
      if (n && !clean.some((c) => c.toLowerCase() === n.toLowerCase())) clean.push(n);
    }
    const kept = clean.slice(-MAX_NOTES);
    await this.repo.save({ tenantId, notes: kept } as TenantBrandMemory);
    return kept;
  }

  async add(tenantId: number, notes: string[]): Promise<void> {
    if (!notes.length) return;
    await this.set(tenantId, [...(await this.get(tenantId)), ...notes]);
  }
}
```

- [ ] **Step 5: Implement `email-designer.service.ts`**

```ts
import { BadRequestException, ConflictException, HttpException, HttpStatus, Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Redis from 'ioredis';
import { EmailTemplate, EmailTemplateAiMessage } from '../../../database/entities';
import { AiService, type ChatMessage } from '../../ai/ai.service';
import { RedisLockService } from '../../../common/redis/redis-lock.service';
import { REDIS_THROTTLER_CLIENT } from '../../../common/throttler/redis-throttler.storage';
import { CampaignContentService } from '../campaign-content.service';
import { checkTemplate } from '../template-check';
import { TemplateVersionService } from './template-version.service';
import { BrandMemoryService } from './brand-memory.service';
import { EmailImageService } from './email-image.service';
import { designerSystemPrompt } from './design-guide';
import { DESIGNER_TOOLS, runDesignerTool, type DesignState } from './designer-tools';

const MAX_ROUNDS = 4;
const HISTORY = 20;
const HOURLY_LIMIT = Number(process.env.EMAIL_DESIGNER_HOURLY_LIMIT) || 30;
const LOCK_TTL_MS = 180_000;

// Models good enough to design an email. Others still work; the editor warns.
export function isDesignModel(model: string): boolean {
  const m = model.toLowerCase();
  if (/mini|nano|haiku|flash-lite|small|8b|7b/.test(m)) return false;
  return /claude-(sonnet|opus)|gpt-4\.1|gpt-5|o3|gemini-(2\.5|3)[-.\w]*pro|grok-4/.test(m);
}

// One designer turn: the client's message, the model's tool calls on the
// template (client's own key only), the checked result saved as a version.
@Injectable()
export class EmailDesignerService {
  private readonly logger = new Logger(EmailDesignerService.name);

  constructor(
    @InjectRepository(EmailTemplate) private readonly templates: Repository<EmailTemplate>,
    @InjectRepository(EmailTemplateAiMessage) private readonly messages: Repository<EmailTemplateAiMessage>,
    private readonly ai: AiService,
    private readonly versions: TemplateVersionService,
    private readonly memory: BrandMemoryService,
    private readonly images: EmailImageService,
    private readonly content: CampaignContentService,
    private readonly lock: RedisLockService,
    @Optional() @Inject(REDIS_THROTTLER_CLIENT) private readonly redis?: Redis | null,
  ) {}

  async status(tenantId: number) {
    const m = await this.ai.clientModel(tenantId);
    return { hasKey: !!m, provider: m?.provider ?? null, model: m?.model ?? null, modelOk: m ? isDesignModel(m.model) : false };
  }

  async history(tenantId: number, templateId: number) {
    await this.template(tenantId, templateId);
    const rows = await this.messages.find({ where: { tenantId, templateId }, order: { id: 'ASC' } });
    return rows.map((r) => ({ id: r.id, role: r.role, content: r.content, versionId: r.versionId, createdAt: r.createdAt }));
  }

  private async template(tenantId: number, templateId: number): Promise<EmailTemplate> {
    const t = await this.templates.findOne({ where: { id: templateId, tenantId } });
    if (!t) throw new NotFoundException('Template not found');
    return t;
  }

  private async countTurn(tenantId: number): Promise<void> {
    if (!this.redis) return;
    const key = `email-designer:${tenantId}:${new Date().toISOString().slice(0, 13)}`;
    const n = await this.redis.incr(key);
    if (n === 1) await this.redis.expire(key, 3600);
    if (n > HOURLY_LIMIT) {
      throw new HttpException({ code: 'DESIGNER_RATE_LIMIT', message: `You can send ${HOURLY_LIMIT} design messages per hour. Please wait a little.` }, HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  async send(tenantId: number, templateId: number, input: { message: string; imageUrls?: string[] }) {
    const template = await this.template(tenantId, templateId);
    if (!(await this.ai.hasClientKey(tenantId))) {
      throw new BadRequestException({ code: 'NO_AI_KEY', message: 'Add your AI key in Settings → AI to use the designer.' });
    }
    await this.countTurn(tenantId);
    const outcome = await this.lock.withLock(`email-designer:${templateId}`, LOCK_TTL_MS, () => this.turn(tenantId, template, input));
    if (!outcome.acquired) throw new ConflictException({ code: 'DESIGNER_BUSY', message: 'The designer is still working on this template.' });
    return outcome.result!;
  }

  private async turn(tenantId: number, template: EmailTemplate, input: { message: string; imageUrls?: string[] }) {
    const images = (input.imageUrls ?? []).filter((u) => /^https:\/\//i.test(u)).slice(0, 5);
    const userText = images.length ? `${input.message}\n\nImages to use:\n${images.join('\n')}` : input.message;
    const past = await this.messages.find({ where: { tenantId, templateId: template.id }, order: { id: 'DESC' }, take: HISTORY });
    await this.messages.save(this.messages.create({ tenantId, templateId: template.id, role: 'user', content: userText, versionId: null }));

    const ctx = await this.content.context(tenantId, []);
    const notes = await this.memory.get(tenantId);
    const state: DesignState = { html: template.bodyHtml || '', subject: template.subject || '', notes: [], changed: false };
    const system = designerSystemPrompt({
      agency: ctx.agency, color: ctx.color, hasLogo: !!ctx.agencyInfo.logo, phone: ctx.agencyInfo.phone ?? '', email: ctx.agencyInfo.email ?? '',
      website: ctx.agencyInfo.website ?? '', notes, language: ctx.defaultLang, currentHtml: state.html, currentSubject: state.subject,
    });
    const messages: ChatMessage[] = [
      { role: 'system', content: system },
      ...past.reverse().map((m) => ({ role: m.role, content: m.content }) as ChatMessage),
      { role: 'user', content: userText },
    ];

    let reply = '';
    for (let round = 0; round < MAX_ROUNDS; round++) {
      let res: Awaited<ReturnType<AiService['chatCompletionWithTools']>>;
      try {
        res = await this.ai.chatCompletionWithTools(tenantId, messages, round < MAX_ROUNDS - 1 ? DESIGNER_TOOLS : undefined, { temperature: 0.4, maxTokens: 16000 });
      } catch (err) {
        this.logger.warn(`Designer AI failed (tenant=${tenantId}, template=${template.id}): ${(err as Error).message}`);
        throw err instanceof HttpException ? err : new BadRequestException({ code: 'DESIGNER_FAILED', message: 'The AI could not be reached. Try again.' });
      }
      if (res.toolCalls.length) {
        messages.push({ role: 'assistant', content: res.content ?? null, tool_calls: res.toolCalls });
        for (const call of res.toolCalls) {
          const result = runDesignerTool(state, call.function.name, call.function.arguments);
          messages.push({ role: 'tool', content: result, tool_call_id: call.id });
        }
        continue;
      }
      reply = (res.content || '').trim();
      break;
    }

    let versionId: number | null = null;
    const final = checkTemplate(state.html);
    if (state.changed && !final.errors.length) {
      template.bodyHtml = final.html;
      template.subject = state.subject || template.subject || template.name;
      await this.templates.save(template);
      const v = await this.versions.record(tenantId, template.id, { bodyHtml: template.bodyHtml, subject: template.subject, source: 'ai' });
      versionId = v?.id ?? null;
      await this.images.touch(tenantId, template.bodyHtml);
    }
    if (state.notes.length) await this.memory.add(tenantId, state.notes);
    if (!reply) reply = state.changed ? 'Done.' : "I couldn't apply that change — try rephrasing it.";
    await this.messages.save(this.messages.create({ tenantId, templateId: template.id, role: 'assistant', content: reply, versionId }));
    return { reply, changed: versionId !== null, versionId, bodyHtml: template.bodyHtml, subject: template.subject, warnings: final.warnings };
  }
}
```

Note the "keeps the previous design" test: three invalid `replace_html` calls leave `state.changed === false`, so nothing is saved. Note the "last round" test: four calls, the fourth with `tools === undefined`.

- [ ] **Step 6: DTOs** — append to `dto/designer.dto.ts`:

```ts
import { ArrayMaxSize, IsArray, IsUrl, MinLength } from 'class-validator';

export class DesignerMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  message: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsUrl({ protocols: ['https'], require_protocol: true }, { each: true })
  imageUrls?: string[];
}

export class BrandMemoryDto {
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  notes: string[];
}
```

(Merge the imports into the single `class-validator` import at the top.)

- [ ] **Step 7: Routes** — in `email-designer.controller.ts`, add to `EmailTemplateDesignController` (inject `EmailDesignerService`):

```ts
  @Get('ai-chat')
  chat(@CurrentTenant() tenantId: number, @Param('id', ParseIntPipe) id: number) {
    return this.designer.history(tenantId, id);
  }

  @Post('ai-chat')
  send(@CurrentTenant() tenantId: number, @Param('id', ParseIntPipe) id: number, @Body() dto: DesignerMessageDto) {
    return this.designer.send(tenantId, id, dto);
  }
```

and a new controller:

```ts
@Controller('api/dashboard/email-designer')
@UseGuards(JwtAuthGuard, TenantGuard, DashboardAddonGuard)
@RequiresAddon('emailCampaign')
export class EmailDesignerController {
  constructor(private readonly designer: EmailDesignerService, private readonly memory: BrandMemoryService) {}

  @Get('status')
  status(@CurrentTenant() tenantId: number) {
    return this.designer.status(tenantId);
  }

  @Get('brand-memory')
  getMemory(@CurrentTenant() tenantId: number) {
    return this.memory.get(tenantId).then((notes) => ({ notes }));
  }

  @Put('brand-memory')
  setMemory(@CurrentTenant() tenantId: number, @Body() dto: BrandMemoryDto) {
    return this.memory.set(tenantId, dto.notes).then((notes) => ({ notes }));
  }

  @Get('layouts')
  layouts() {
    return LAYOUTS.map((l) => ({ name: l.name, subject: l.subject, html: l.html }));
  }
}
```

Module: `imports` add `AiModule` (`import { AiModule } from '../ai/ai.module';`); entities already registered in Task 4; providers `BrandMemoryService`, `EmailDesignerService`; controllers `EmailDesignerController`.

The designer's HTTP request can take up to ~2 minutes: check the API's server timeout (`main.ts`, `server.setTimeout`) and nginx `proxy_read_timeout` on prod (note for DevOps in the handoff if it is under 180 s).

- [ ] **Step 8: Run the tests**

Run: `cd apps/api && npx jest src/modules/email-campaign src/modules/ai`
Expected: all PASS.

- [ ] **Step 9: Checkpoint** — tsc clean, rebuild + restart the API (it must boot: `Nest application successfully started` in the log), graphify.

---
### Task 8: Dashboard editor — code + live preview + insert menu

**Files:**
- Modify: `apps/dashboard/package.json` (add `@uiw/react-codemirror`, `@codemirror/lang-html`)
- Create: `apps/dashboard/src/app/(dashboard)/dashboard/campaigns/templates/_i18n/{index,en,nl,es,fr,de,fi,sv}.ts`
- Create: `.../campaigns/templates/_components/use-template-editor.ts`, `template-editor.tsx`, `code-pane.tsx`, `code-editor-impl.tsx`, `preview-pane.tsx`, `insert-menu.tsx`
- Create: `.../campaigns/templates/new/page.tsx`, `.../campaigns/templates/[id]/page.tsx`
- Modify: `.../campaigns/_components/templates-section.tsx`

**Interfaces:**
- Consumes: `POST /api/dashboard/email-templates/render-preview` (Task 3); `GET/PUT/POST /api/dashboard/email-templates[/:id]`.
- Produces (used by Tasks 9–11):
  - `useTemplateEditor(id: number)` returns `{ draft: { name: string; subject: string; bodyHtml: string }; setDraft(patch: Partial<Draft>): void; loading: boolean; saving: boolean; dirty: boolean; save(): Promise<boolean>; applyServer(t: { subject: string; bodyHtml: string }): void; preview: { subject: string; html: string; warnings: string[] } | null; previewLoading: boolean; reloadKey: number; bumpReload(): void }`
  - `CodePane` props `{ value: string; onChange(v: string): void; onReady(api: { insert(text: string): void }): void }`
  - `useEditorText()` returning `EditorText`.

- [ ] **Step 1: Install**

Run: `cd apps/dashboard && pnpm add @uiw/react-codemirror @codemirror/lang-html`
Check with Context7 that the installed `@uiw/react-codemirror` supports React 18 and the `onCreateEditor` prop; Next must stay 14.1.4 (`node -p "require('next/package.json').version"`).

- [ ] **Step 2: Wording** — `templates/_i18n/en.ts` (the other six files export the same keys translated, typed `EditorText`, so a missing key fails tsc; `index.ts` mirrors `campaigns/_i18n/index.ts` with `useEditorText()`):

```ts
// Template editor + AI designer wording (English). Placeholder names in
// curly braces stay exactly as they are: the client copies them.
export const en = {
  back: 'Back to campaigns',
  untitled: 'Untitled template',
  namePlaceholder: 'Template name',
  subjectPlaceholder: 'Email subject',
  save: 'Save',
  saving: 'Saving…',
  saved: 'Template saved',
  saveFailed: 'Could not save the template',
  invalid: { LOOP_UNBALANCED: 'The listing loop is not closed: every {{#properties}} needs a {{/properties}}.', TOO_LARGE: 'The template is larger than 100 KB.' } as Record<string, string>,
  unsavedLeave: 'You have unsaved changes. Leave anyway?',
  tabs: { chat: 'AI designer', code: 'Code', preview: 'Preview' },
  desktop: 'Desktop',
  phone: 'Phone',
  previewSubject: 'Subject',
  previewNote: 'Preview with a sample contact and your newest listings.',
  warnings: {
    title: 'Check these',
    unknown: (name: string) => `{{${name}}} is not a known placeholder and will be empty.`,
    noUnsubscribe: 'No {{unsubscribe_link}}: an unsubscribe line is added at the bottom automatically.',
  },
  insert: {
    button: 'Insert',
    contact: 'Contact',
    agency: 'Your agency',
    listings: 'Listings',
    other: 'Other',
    items: {
      'contact.first_name': 'First name of the contact',
      'contact.name': 'Full name of the contact',
      'agency.name': 'Agency name',
      'agency.logo': 'Logo image address (Settings)',
      'agency.phone': 'Phone (Settings)',
      'agency.email': 'Email (Settings)',
      'agency.website': 'Website address (Settings)',
      'agency.color': 'Brand colour (Website Design)',
      loop: 'Listing loop: a card per featured listing',
      properties: 'Ready-made listing cards',
      unsubscribe_link: 'Unsubscribe link (required)',
    } as Record<string, string>,
  },
};

export type EditorText = typeof en;
```

(Tasks 9–11 append their keys to the same files.)

- [ ] **Step 3: Editor state hook** — `use-template-editor.ts`:

```ts
'use client';

import { useEffect, useRef, useState } from 'react';
import { useApi } from '@/hooks/use-api';

export interface Draft { name: string; subject: string; bodyHtml: string }
export interface Preview { subject: string; html: string; warnings: string[] }

const unwrap = <T,>(res: unknown): T => ((res as { data?: T })?.data ?? res) as T;

// The template being edited, its saved copy and the live preview. The
// preview is rendered by the API with the real renderer, 400 ms after the
// last change, so what the client sees is what contacts receive.
export function useTemplateEditor(id: number) {
  const api = useApi();
  const [draft, setDraftState] = useState<Draft>({ name: '', subject: '', bodyHtml: '' });
  const [saved, setSaved] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const previewSeq = useRef(0);

  useEffect(() => {
    if (!api.isReady) return;
    let live = true;
    setLoading(true);
    api.get(`/api/dashboard/email-templates/${id}`)
      .then((res) => {
        if (!live) return;
        const t = unwrap<Draft>(res);
        const d = { name: t.name ?? '', subject: t.subject ?? '', bodyHtml: t.bodyHtml ?? '' };
        setDraftState(d);
        setSaved(d);
      })
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [api.isReady, id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!api.isReady || loading) return;
    const seq = ++previewSeq.current;
    const timer = setTimeout(() => {
      setPreviewLoading(true);
      api.post('/api/dashboard/email-templates/render-preview', { subject: draft.subject, bodyHtml: draft.bodyHtml })
        .then((res) => { if (seq === previewSeq.current) setPreview(unwrap<Preview>(res)); })
        .catch(() => {})
        .finally(() => { if (seq === previewSeq.current) setPreviewLoading(false); });
    }, 400);
    return () => clearTimeout(timer);
  }, [api.isReady, loading, draft.subject, draft.bodyHtml]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = !!saved && (saved.name !== draft.name || saved.subject !== draft.subject || saved.bodyHtml !== draft.bodyHtml);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const setDraft = (patch: Partial<Draft>) => setDraftState((d) => ({ ...d, ...patch }));

  // Returns false and leaves the draft as it is when the API refuses it.
  const save = async (): Promise<boolean> => {
    setSaving(true);
    try {
      const res = await api.put(`/api/dashboard/email-templates/${id}`, { name: draft.name, subject: draft.subject, bodyHtml: draft.bodyHtml });
      const t = unwrap<Draft>(res);
      const d = { name: t.name ?? draft.name, subject: t.subject ?? draft.subject, bodyHtml: t.bodyHtml ?? draft.bodyHtml };
      setDraftState(d);
      setSaved(d);
      setReloadKey((k) => k + 1);
      return true;
    } finally {
      setSaving(false);
    }
  };

  // The server already saved this (AI change, restore): editor and saved copy follow.
  const applyServer = (t: { subject: string; bodyHtml: string }) => {
    setDraftState((d) => {
      const next = { ...d, subject: t.subject, bodyHtml: t.bodyHtml };
      setSaved(next);
      return next;
    });
    setReloadKey((k) => k + 1);
  };

  return { draft, setDraft, loading, saving, dirty, save, applyServer, preview, previewLoading, reloadKey, bumpReload: () => setReloadKey((k) => k + 1) };
}
```

`save()` rethrows API errors; the editor catches them and shows `t.invalid[code]` for `TEMPLATE_INVALID` (the API error object carries `errors`; read it the way `campaigns/[id]/page.tsx` reads error codes from `useApi`).

- [ ] **Step 4: Code pane** — `code-editor-impl.tsx` (only loaded in the browser):

```tsx
'use client';

import CodeMirror from '@uiw/react-codemirror';
import { html } from '@codemirror/lang-html';
import { EditorView } from '@codemirror/view';

export interface CodePaneProps {
  value: string;
  onChange: (v: string) => void;
  onReady: (api: { insert: (text: string) => void }) => void;
}

const extensions = [html(), EditorView.lineWrapping];

export default function CodeEditorImpl({ value, onChange, onReady }: CodePaneProps) {
  return (
    <CodeMirror
      value={value}
      height="calc(100vh - 260px)"
      extensions={extensions}
      onChange={onChange}
      basicSetup={{ lineNumbers: true, foldGutter: true }}
      onCreateEditor={(view) =>
        onReady({ insert: (text) => { view.dispatch(view.state.replaceSelection(text)); view.focus(); } })
      }
    />
  );
}
```

(`@codemirror/view` comes with `@uiw/react-codemirror`; if pnpm's strict layout hides it, add it to `package.json` too.)

`code-pane.tsx`:

```tsx
'use client';

import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import type { CodePaneProps } from './code-editor-impl';

// CodeMirror needs the browser; the server renders a spinner in its place.
const CodeEditorImpl = dynamic(() => import('./code-editor-impl'), {
  ssr: false,
  loading: () => <div className="flex h-64 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>,
});

export function CodePane(props: CodePaneProps) {
  return <div className="overflow-hidden rounded-md border text-sm"><CodeEditorImpl {...props} /></div>;
}
```

- [ ] **Step 5: Preview pane** — `preview-pane.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Loader2, Monitor, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Preview } from './use-template-editor';
import { useEditorText } from '../_i18n';

export function PreviewPane({ preview, loading }: { preview: Preview | null; loading: boolean }) {
  const t = useEditorText();
  const [phone, setPhone] = useState(false);
  const warnings = (preview?.warnings ?? []).map((w) =>
    w.startsWith('UNKNOWN:') ? t.warnings.unknown(w.slice(8)) : w === 'NO_UNSUBSCRIBE' ? t.warnings.noUnsubscribe : t.invalid[w] ?? w,
  );
  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm"><span className="text-muted-foreground">{t.previewSubject}: </span>{preview?.subject}</p>
        <div className="flex items-center gap-1">
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <Button size="sm" variant={phone ? 'ghost' : 'secondary'} onClick={() => setPhone(false)} aria-label={t.desktop}><Monitor className="h-4 w-4" /></Button>
          <Button size="sm" variant={phone ? 'secondary' : 'ghost'} onClick={() => setPhone(true)} aria-label={t.phone}><Smartphone className="h-4 w-4" /></Button>
        </div>
      </div>
      {warnings.length > 0 && (
        <div data-testid="preview-warnings" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          <p className="font-medium">{t.warnings.title}</p>
          <ul className="list-disc pl-4">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </div>
      )}
      <div className="flex flex-1 justify-center overflow-auto rounded-md border bg-muted/40 p-3">
        {/* sandbox="" : no scripts, no forms, no same-origin access */}
        <iframe
          title="preview"
          data-testid="template-preview"
          sandbox=""
          srcDoc={preview?.html ?? ''}
          className="h-[calc(100vh-300px)] min-h-[480px] rounded bg-white shadow-sm transition-[width]"
          style={{ width: phone ? 390 : 680, maxWidth: '100%' }}
        />
      </div>
      <p className="text-xs text-muted-foreground">{t.previewNote}</p>
    </div>
  );
}
```

- [ ] **Step 6: Insert menu** — `insert-menu.tsx`:

```tsx
'use client';

import { Braces } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useEditorText } from '../_i18n';

export const LOOP_SNIPPET = `{{#properties}}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px">
  <tr><td><a href="{{property.url}}"><img src="{{property.image}}" alt="{{property.title}}" width="560" style="display:block;width:100%;height:auto;border:0"></a></td></tr>
  <tr><td style="padding:12px 0 0;font-family:Arial,sans-serif">
    <p style="margin:0;font-size:18px;font-weight:bold">{{property.title}}</p>
    <p style="margin:4px 0;color:#64748b">{{property.location}} · {{property.beds}} bed · {{property.area}}</p>
    <p style="margin:0 0 10px;font-size:18px;font-weight:bold;color:{{agency.color}}">{{property.price}}</p>
    <a href="{{property.url}}" style="display:inline-block;padding:10px 18px;background:{{agency.color}};color:#ffffff;text-decoration:none;border-radius:4px">View property</a>
  </td></tr>
</table>
{{/properties}}`;

const GROUPS: { key: 'contact' | 'agency' | 'listings' | 'other'; items: { id: string; snippet: string }[] }[] = [
  { key: 'contact', items: ['contact.first_name', 'contact.name'].map((id) => ({ id, snippet: `{{${id}}}` })) },
  { key: 'agency', items: ['agency.name', 'agency.logo', 'agency.phone', 'agency.email', 'agency.website', 'agency.color'].map((id) => ({ id, snippet: `{{${id}}}` })) },
  { key: 'listings', items: [{ id: 'loop', snippet: LOOP_SNIPPET }, { id: 'properties', snippet: '{{properties}}' }] },
  { key: 'other', items: [{ id: 'unsubscribe_link', snippet: '<a href="{{unsubscribe_link}}">Unsubscribe</a>' }] },
];

export function InsertMenu({ onInsert }: { onInsert: (snippet: string) => void }) {
  const t = useEditorText();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" data-testid="insert-menu"><Braces className="mr-1 h-4 w-4" />{t.insert.button}</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80">
        {GROUPS.map((g, gi) => (
          <div key={g.key}>
            {gi > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel>{t.insert[g.key]}</DropdownMenuLabel>
            {g.items.map((item) => (
              <DropdownMenuItem key={item.id} onSelect={() => onInsert(item.snippet)} className="flex flex-col items-start gap-0.5">
                <code className="text-xs">{item.id === 'loop' ? '{{#properties}} … {{/properties}}' : `{{${item.id}}}`}</code>
                <span className="text-xs text-muted-foreground">{t.insert.items[item.id]}</span>
              </DropdownMenuItem>
            ))}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 7: Editor page** — `template-editor.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useTemplateEditor } from './use-template-editor';
import { CodePane } from './code-pane';
import { PreviewPane } from './preview-pane';
import { InsertMenu } from './insert-menu';
import { useEditorText } from '../_i18n';

function useWide(): boolean {
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
}

// Full-page template editor: AI designer / code on the left, the email as
// contacts will get it on the right. On a phone the three are tabs.
export function TemplateEditor({ id }: { id: number }) {
  const t = useEditorText();
  const { toast } = useToast();
  const ed = useTemplateEditor(id);
  const wide = useWide();
  const [tab, setTab] = useState<'chat' | 'code' | 'preview'>('code');
  const insertRef = useRef<((text: string) => void) | null>(null);

  const onSave = async () => {
    try {
      await ed.save();
      toast({ title: t.saved });
    } catch (err) {
      const errors = (err as { errors?: string[] })?.errors ?? [];
      toast({ title: t.saveFailed, description: errors.map((e) => t.invalid[e] ?? e).join(' '), variant: 'destructive' });
    }
  };

  if (ed.loading) return <div className="flex h-96 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  const code = (
    <div className="space-y-2">
      <InsertMenu onInsert={(s) => insertRef.current?.(s)} />
      <CodePane value={ed.draft.bodyHtml} onChange={(v) => ed.setDraft({ bodyHtml: v })} onReady={(a) => { insertRef.current = a.insert; }} />
    </div>
  );
  const chat = <div className="text-sm text-muted-foreground">{/* Task 11 replaces this with <DesignerChat /> */}</div>;
  const preview = <PreviewPane preview={ed.preview} loading={ed.previewLoading} />;

  return (
    <div className="space-y-4" data-testid="template-editor">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="sm"><Link href="/dashboard/campaigns" onClick={(e) => { if (ed.dirty && !confirm(t.unsavedLeave)) e.preventDefault(); }}><ArrowLeft className="mr-1 h-4 w-4" />{t.back}</Link></Button>
        <Input className="h-9 w-56" value={ed.draft.name} placeholder={t.namePlaceholder} maxLength={100} onChange={(e) => ed.setDraft({ name: e.target.value })} data-testid="template-name" />
        <Input className="h-9 min-w-[16rem] flex-1" value={ed.draft.subject} placeholder={t.subjectPlaceholder} maxLength={255} onChange={(e) => ed.setDraft({ subject: e.target.value })} data-testid="template-subject" />
        {/* Task 9 adds <HistoryMenu /> here */}
        <Button size="sm" onClick={onSave} disabled={!ed.dirty || ed.saving || !ed.draft.name.trim()} data-testid="template-save">
          {ed.saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}{ed.saving ? t.saving : t.save}
        </Button>
      </div>

      {wide ? (
        <div className="grid grid-cols-2 gap-4">
          <Tabs value={tab === 'preview' ? 'code' : tab} onValueChange={(v) => setTab(v as 'chat' | 'code')}>
            <TabsList><TabsTrigger value="chat">{t.tabs.chat}</TabsTrigger><TabsTrigger value="code">{t.tabs.code}</TabsTrigger></TabsList>
            <TabsContent value="chat">{chat}</TabsContent>
            <TabsContent value="code">{code}</TabsContent>
          </Tabs>
          {preview}
        </div>
      ) : (
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList><TabsTrigger value="chat">{t.tabs.chat}</TabsTrigger><TabsTrigger value="code">{t.tabs.code}</TabsTrigger><TabsTrigger value="preview">{t.tabs.preview}</TabsTrigger></TabsList>
          <TabsContent value="chat">{chat}</TabsContent>
          <TabsContent value="code">{code}</TabsContent>
          <TabsContent value="preview">{preview}</TabsContent>
        </Tabs>
      )}
    </div>
  );
}
```

Read how `useApi` errors expose the API body (`campaigns/[id]/page.tsx` handles `NO_EMAIL_CONFIG`) and adapt the `errors` read in `onSave` to it.

- [ ] **Step 8: Routes**

`templates/[id]/page.tsx`:

```tsx
'use client';

import { useParams } from 'next/navigation';
import { TemplateEditor } from '../_components/template-editor';

export default function TemplateEditorPage() {
  const { id } = useParams<{ id: string }>();
  return <TemplateEditor id={Number(id)} />;
}
```

`templates/new/page.tsx` — creates an empty template, then opens it:

```tsx
'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useApi } from '@/hooks/use-api';
import { useEditorText } from '../_i18n';

export default function NewTemplatePage() {
  const api = useApi();
  const router = useRouter();
  const t = useEditorText();
  const started = useRef(false);
  useEffect(() => {
    if (!api.isReady || started.current) return;
    started.current = true;
    api.post('/api/dashboard/email-templates', { name: t.untitled, subject: '', bodyHtml: '', type: 'custom' })
      .then((res) => {
        const id = ((res as { data?: { id: number } })?.data ?? res as { id: number }).id;
        router.replace(`/dashboard/campaigns/templates/${id}`);
      })
      .catch(() => router.replace('/dashboard/campaigns'));
  }, [api.isReady]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="flex h-96 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
}
```

`CreateTemplateDto` requires `subject` with `@IsString()` — `''` passes. If the API rejects an empty name/subject anywhere, relax only `subject` to allow `''`.

- [ ] **Step 9: Templates card** — in `templates-section.tsx` replace the dialog: the "New template" button and the page-header button (`setCreateOpen(true)`) navigate with `router.push('/dashboard/campaigns/templates/new')`; the edit button does `router.push(\`/dashboard/campaigns/templates/${tpl.id}\`)`. Delete stays. Remove the create/edit `Dialog`, `form` state, `STARTER_TEMPLATE` import and now-unused imports. Keep the `createOpen`/`setCreateOpen` props working by navigating when `createOpen` becomes true:

```tsx
  useEffect(() => {
    if (createOpen) { setCreateOpen(false); router.push('/dashboard/campaigns/templates/new'); }
  }, [createOpen]); // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 10: Verify**

Run: `cd apps/dashboard && npx tsc --noEmit && npx next lint --dir "src/app/(dashboard)/dashboard/campaigns"`
Expected: clean.
Then in the browser (dashboard dev on 3020, client login): Campaigns → New template → paste a full HTML email copied from any site → the preview shows it within a second; Insert → Listing loop → the preview shows tenant 2's listings as cards; Save → toast "Template saved"; reload → content still there; switch to Phone → preview narrows to 390 px.

- [ ] **Step 11: Checkpoint** — graphify.

---

### Task 9: Undo / redo and version history in the editor

**Files:**
- Create: `.../campaigns/templates/_components/history-menu.tsx`
- Modify: `template-editor.tsx`, `templates/_i18n/*.ts`

**Interfaces:**
- Consumes: `GET .../versions`, `GET .../versions/:vid`, `POST .../versions/:vid/restore` (Task 4); `useTemplateEditor` (`setDraft`, `applyServer`, `reloadKey`).
- Produces: `HistoryMenu` props `{ templateId: number; reloadKey: number; onLoad(v: { subject: string; bodyHtml: string }): void; onRestored(t: { subject: string; bodyHtml: string }): void }`.

Behaviour: Undo/Redo step through saved versions and put that version in the editor **unsaved** (Save keeps it). The history list shows every version (who made it: AI / you / restored, time, size) with "Restore", which saves immediately. Before an AI message is sent, unsaved changes are saved first (Task 11), so the AI always works on what the client sees.

- [ ] **Step 1: Wording** — add to `en.ts` (and translate in the six others):

```ts
  history: {
    undo: 'Undo',
    redo: 'Redo',
    button: 'History',
    empty: 'No saved versions yet.',
    restore: 'Restore',
    restored: 'Version restored',
    source: { ai: 'AI designer', manual: 'You', restore: 'Restored', layout: 'Starter design' } as Record<string, string>,
  },
```

- [ ] **Step 2: Implement** `history-menu.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { History, Redo2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useApi } from '@/hooks/use-api';
import { useLanguage } from '@/i18n/i18n-provider';
import { useToast } from '@/hooks/use-toast';
import { useEditorText } from '../_i18n';

interface VersionRow { id: number; source: string; subject: string; bytes: number; createdAt: string }
const unwrap = <T,>(res: unknown): T => ((res as { data?: T })?.data ?? res) as T;

export function HistoryMenu({ templateId, reloadKey, onLoad, onRestored }: {
  templateId: number;
  reloadKey: number;
  onLoad: (v: { subject: string; bodyHtml: string }) => void;
  onRestored: (t: { subject: string; bodyHtml: string }) => void;
}) {
  const api = useApi();
  const t = useEditorText();
  const { locale } = useLanguage();
  const { toast } = useToast();
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [pos, setPos] = useState(0); // 0 = newest version

  useEffect(() => {
    if (!api.isReady) return;
    api.get(`/api/dashboard/email-templates/${templateId}/versions`).then((res) => { setVersions(unwrap<VersionRow[]>(res)); setPos(0); }).catch(() => {});
  }, [api.isReady, templateId, reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = async (next: number) => {
    const v = versions[next];
    if (!v) return;
    const full = unwrap<{ subject: string; bodyHtml: string }>(await api.get(`/api/dashboard/email-templates/${templateId}/versions/${v.id}`));
    setPos(next);
    onLoad({ subject: full.subject, bodyHtml: full.bodyHtml });
  };

  const restore = async (id: number) => {
    const tpl = unwrap<{ subject: string; bodyHtml: string }>(await api.post(`/api/dashboard/email-templates/${templateId}/versions/${id}/restore`, {}));
    onRestored({ subject: tpl.subject, bodyHtml: tpl.bodyHtml });
    toast({ title: t.history.restored });
  };

  const time = (d: string) => new Date(d).toLocaleString(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="flex items-center gap-1">
      <Button size="sm" variant="ghost" onClick={() => go(pos + 1)} disabled={pos + 1 >= versions.length} aria-label={t.history.undo} data-testid="undo"><Undo2 className="h-4 w-4" /></Button>
      <Button size="sm" variant="ghost" onClick={() => go(pos - 1)} disabled={pos === 0} aria-label={t.history.redo} data-testid="redo"><Redo2 className="h-4 w-4" /></Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button size="sm" variant="outline" data-testid="history"><History className="mr-1 h-4 w-4" />{t.history.button}</Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-96 w-80 overflow-y-auto">
          <DropdownMenuLabel>{t.history.button}</DropdownMenuLabel>
          {versions.length === 0 && <p className="px-2 py-1.5 text-sm text-muted-foreground">{t.history.empty}</p>}
          {versions.map((v, i) => (
            <DropdownMenuItem key={v.id} className="flex items-center justify-between gap-2" onSelect={(e) => e.preventDefault()}>
              <span className="min-w-0">
                <span className="block truncate text-sm">{t.history.source[v.source] ?? v.source}{i === 0 ? ' ·  ✓' : ''}</span>
                <span className="block text-xs text-muted-foreground">{time(v.createdAt)} · {Math.max(1, Math.round(v.bytes / 1024))} KB</span>
              </span>
              {i > 0 && <Button size="sm" variant="secondary" onClick={() => restore(v.id)}>{t.history.restore}</Button>}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
```

In `template-editor.tsx` replace the `{/* Task 9 … */}` comment with:

```tsx
        <HistoryMenu templateId={id} reloadKey={ed.reloadKey} onLoad={(v) => ed.setDraft(v)} onRestored={ed.applyServer} />
```

- [ ] **Step 3: Verify** — tsc + lint clean. Browser: save three different versions → Undo twice shows the first one (Save button enabled), Redo returns; History → Restore on an older one → toast, the list gets a "Restored" row on top.

- [ ] **Step 4: Checkpoint** — graphify.

---

### Task 10: Image library in the editor

**Files:**
- Create: `.../campaigns/templates/_components/image-library.tsx`
- Modify: `template-editor.tsx`, `templates/_i18n/*.ts`

**Interfaces:**
- Consumes: `GET/POST/DELETE /api/dashboard/email-images` (Task 5).
- Produces: `ImageLibrary` props `{ open: boolean; onOpenChange(o: boolean): void; onPick(url: string): void }`; `export const imageTag = (url: string) => string`.

- [ ] **Step 1: Wording** (en + six translations):

```ts
  images: {
    button: 'Images',
    title: 'Your email images',
    description: 'Upload photos and logos for your emails. Large photos are made smaller automatically.',
    upload: 'Upload image',
    uploading: 'Uploading…',
    usage: (used: string, limit: string) => `${used} of ${limit} used`,
    empty: 'No images yet.',
    pick: 'Use',
    remove: 'Delete',
    inUse: 'This image is used in a template or a sent email, so it cannot be deleted.',
    full: 'Your image library is full. Delete some images first.',
    badType: 'Use a JPEG, PNG, GIF or WebP image (max 10 MB).',
  },
```

- [ ] **Step 2: Implement** `image-library.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { useEditorText } from '../_i18n';

interface Img { id: number; url: string; width: number; height: number; bytes: number; pinned: boolean }
interface Library { images: Img[]; usedBytes: number; limitBytes: number }
const unwrap = <T,>(res: unknown): T => ((res as { data?: T })?.data ?? res) as T;
const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`;

export const imageTag = (url: string) => `<img src="${url}" alt="" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0">`;

export function ImageLibrary({ open, onOpenChange, onPick }: { open: boolean; onOpenChange: (o: boolean) => void; onPick: (url: string) => void }) {
  const api = useApi();
  const t = useEditorText();
  const { toast } = useToast();
  const [lib, setLib] = useState<Library | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => api.get('/api/dashboard/email-images').then((res) => setLib(unwrap<Library>(res))).catch(() => {});
  useEffect(() => { if (open && api.isReady) load(); }, [open, api.isReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const codeMessage = (err: unknown) => {
    const code = (err as { code?: string })?.code;
    return code === 'IMAGE_IN_USE' ? t.images.inUse : code === 'IMAGE_LIMIT' ? t.images.full : t.images.badType;
  };

  const upload = async (file: File) => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const img = unwrap<Img>(await api.post('/api/dashboard/email-images', fd));
      await load();
      onPick(img.url);
    } catch (err) {
      toast({ title: codeMessage(err), variant: 'destructive' });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const remove = async (id: number) => {
    try { await api.delete(`/api/dashboard/email-images/${id}`); await load(); }
    catch (err) { toast({ title: codeMessage(err), variant: 'destructive' }); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>{t.images.title}</DialogTitle><DialogDescription>{t.images.description}</DialogDescription></DialogHeader>
        <div className="flex items-center justify-between">
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" data-testid="image-file" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
          <Button size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>{busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-1 h-4 w-4" />}{busy ? t.images.uploading : t.images.upload}</Button>
          {lib && <span className="text-xs text-muted-foreground">{t.images.usage(mb(lib.usedBytes), mb(lib.limitBytes))}</span>}
        </div>
        {lib && lib.images.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{t.images.empty}</p>}
        <div className="grid max-h-[60vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
          {lib?.images.map((img) => (
            <div key={img.id} className="group relative overflow-hidden rounded-md border" data-testid="library-image">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt="" className="h-32 w-full object-cover" />
              <div className="flex items-center justify-between gap-1 p-1.5">
                <span className="text-xs text-muted-foreground">{img.width}×{img.height}</span>
                <span className="flex gap-1">
                  <Button size="sm" variant="secondary" onClick={() => { onPick(img.url); onOpenChange(false); }}>{t.images.pick}</Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(img.id)} aria-label={t.images.remove}><Trash2 className="h-4 w-4" /></Button>
                </span>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

Read how `useApi` throws on non-2xx (does the thrown error carry `code`?) and adapt `codeMessage`.

In `template-editor.tsx`: state `const [images, setImages] = useState<null | 'code' | 'chat'>(null);` and `const [chatImages, setChatImages] = useState<string[]>([]);`; an "Images" button next to `InsertMenu` opens `setImages('code')`; render

```tsx
<ImageLibrary open={images !== null} onOpenChange={(o) => !o && setImages(null)} onPick={(url) => { if (images === 'chat') setChatImages((l) => [...l, url].slice(0, 5)); else insertRef.current?.(imageTag(url)); }} />
```

(`chatImages` is passed to the chat in Task 11.)

- [ ] **Step 3: Verify** — tsc + lint. Browser: Images → Upload a 4000 px photo → it appears 1200 px wide, inserted at the cursor, shows in the preview; usage text updates; delete an image that is in the template → "used in a template" toast.

- [ ] **Step 4: Checkpoint** — graphify.

---

### Task 11: AI designer chat, starter designs and brand memory in the editor

**Files:**
- Create: `.../templates/_components/designer-chat.tsx`, `layout-picker.tsx`, `brand-memory-dialog.tsx`
- Modify: `template-editor.tsx`, `templates/_i18n/*.ts`

**Interfaces:**
- Consumes: `GET /api/dashboard/email-designer/status|layouts|brand-memory`, `PUT .../brand-memory`, `GET/POST /api/dashboard/email-templates/:id/ai-chat` (Task 7); `render-preview` (Task 3); editor `save`, `dirty`, `applyServer`, `setDraft`.
- Produces: `DesignerChat` props `{ templateId: number; dirty: boolean; saveFirst(): Promise<boolean>; onDesign(t: { subject: string; bodyHtml: string }): void; images: string[]; clearImages(): void; openImages(): void; onLoadVersion(versionId: number): void }`.

- [ ] **Step 1: Wording** (en + six translations):

```ts
  chat: {
    placeholder: 'Describe the email you want, or what to change…',
    send: 'Send',
    designing: 'Designing… this can take up to a minute.',
    you: 'You',
    ai: 'AI designer',
    versionSaved: 'Saved as a new version',
    showVersion: 'Show this version',
    attach: 'Add image',
    noKey: 'The AI designer uses your own AI key. Add it in Settings → AI.',
    noKeyLink: 'Open Settings → AI',
    weakModel: (model: string) => `${model} is not strong enough for good designs. For best results choose Claude Sonnet in Settings → AI.`,
    errors: {
      DESIGNER_BUSY: 'The designer is still working on this template.',
      DESIGNER_RATE_LIMIT: 'You have sent many design messages this hour. Please wait a little.',
      DESIGNER_FAILED: 'The AI could not be reached. Try again.',
      NO_AI_KEY: 'Add your AI key in Settings → AI.',
    } as Record<string, string>,
    genericError: 'Something went wrong. Try again.',
    suggestions: [
      'A monthly newsletter with my logo, a short intro, 3 listings side by side and a contact block',
      'A luxury "just listed" email in dark colours with gold accents',
      'An open house invitation with date, address and a reply button',
      'Use my brand colour for buttons and prices',
    ],
    layouts: 'Starter designs',
    layoutsTitle: 'Start from a starter design',
    layoutsDescription: 'Pick a design to load it into the editor. You can then change everything with the AI or in the code.',
    layoutNames: { luxury: 'Luxury', modern: 'Modern', minimal: 'Minimal', newsletter: 'Newsletter', 'new-listing': 'New listing alert', 'open-house': 'Open house' } as Record<string, string>,
    useLayout: 'Use this design',
    memory: 'Brand memory',
    memoryTitle: 'What the AI remembers about your brand',
    memoryDescription: 'Every new design follows these notes. The AI adds notes when you tell it a lasting preference; you can change or delete them here.',
    memoryAdd: 'Add note',
    memorySave: 'Save notes',
    memorySaved: 'Brand memory saved',
    memoryEmpty: 'No notes yet.',
  },
```

- [ ] **Step 2: Chat** — `designer-chat.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ImagePlus, Loader2, Send, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useApi } from '@/hooks/use-api';
import { cn } from '@/lib/utils';
import { useEditorText } from '../_i18n';

interface Msg { id: number; role: 'user' | 'assistant'; content: string; versionId: number | null }
interface Status { hasKey: boolean; model: string | null; modelOk: boolean }
const unwrap = <T,>(res: unknown): T => ((res as { data?: T })?.data ?? res) as T;

export function DesignerChat({ templateId, dirty, saveFirst, onDesign, images, clearImages, openImages, onLoadVersion }: {
  templateId: number;
  dirty: boolean;
  saveFirst: () => Promise<boolean>;
  onDesign: (t: { subject: string; bodyHtml: string }) => void;
  images: string[];
  clearImages: () => void;
  openImages: () => void;
  onLoadVersion: (versionId: number) => void;
}) {
  const api = useApi();
  const t = useEditorText();
  const [status, setStatus] = useState<Status | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!api.isReady) return;
    api.get('/api/dashboard/email-designer/status').then((r) => setStatus(unwrap<Status>(r))).catch(() => setStatus({ hasKey: false, model: null, modelOk: false }));
    api.get(`/api/dashboard/email-templates/${templateId}/ai-chat`).then((r) => setMsgs(unwrap<Msg[]>(r))).catch(() => {});
  }, [api.isReady, templateId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }); }, [msgs, busy]);

  const send = async (message: string) => {
    if (!message.trim() || busy) return;
    setError('');
    if (dirty && !(await saveFirst().catch(() => false))) return;
    const shown = images.length ? `${message}\n\n${images.join('\n')}` : message;
    setMsgs((m) => [...m, { id: -Date.now(), role: 'user', content: shown, versionId: null }]);
    setText('');
    setBusy(true);
    try {
      const res = unwrap<{ reply: string; versionId: number | null; bodyHtml: string; subject: string; changed: boolean }>(
        await api.post(`/api/dashboard/email-templates/${templateId}/ai-chat`, { message, imageUrls: images }),
      );
      clearImages();
      setMsgs((m) => [...m, { id: Date.now(), role: 'assistant', content: res.reply, versionId: res.versionId }]);
      if (res.changed) onDesign({ subject: res.subject, bodyHtml: res.bodyHtml });
    } catch (err) {
      const code = (err as { code?: string })?.code ?? '';
      setError(t.chat.errors[code] ?? t.chat.genericError);
    } finally {
      setBusy(false);
    }
  };

  if (status && !status.hasKey) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200" data-testid="designer-no-key">
        <p>{t.chat.noKey}</p>
        <Link href="/dashboard/settings?tab=ai" className="mt-2 inline-block font-medium underline">{t.chat.noKeyLink}</Link>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-260px)] min-h-[480px] flex-col rounded-md border" data-testid="designer-chat">
      {status && !status.modelOk && status.model && <p className="border-b bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200" data-testid="weak-model">{t.chat.weakModel(status.model)}</p>}
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {msgs.length === 0 && !busy && (
          <div className="space-y-2">
            {t.chat.suggestions.map((s) => (
              <button key={s} type="button" onClick={() => send(s)} className="block w-full rounded-md border px-3 py-2 text-left text-sm hover:bg-muted">
                <Sparkles className="mr-1 inline h-3.5 w-3.5 text-primary" />{s}
              </button>
            ))}
          </div>
        )}
        {msgs.map((m) => (
          <div key={m.id} className={cn('flex flex-col', m.role === 'user' ? 'items-end' : 'items-start')}>
            <div className={cn('max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm', m.role === 'user' ? 'rounded-br-sm bg-primary text-primary-foreground' : 'rounded-bl-sm bg-muted')}>{m.content}</div>
            {m.versionId && (
              <button type="button" className="mt-0.5 px-1 text-[11px] text-primary underline" onClick={() => onLoadVersion(m.versionId!)}>{t.chat.versionSaved} · {t.chat.showVersion}</button>
            )}
          </div>
        ))}
        {busy && <p className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="designer-busy"><Loader2 className="h-4 w-4 animate-spin" />{t.chat.designing}</p>}
        {error && <p className="text-sm text-destructive" data-testid="designer-error">{error}</p>}
        <div ref={bottom} />
      </div>
      {images.length > 0 && (
        <div className="flex flex-wrap gap-1 border-t px-3 pt-2">
          {images.map((u) => <span key={u} className="flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs">{u.split('/').pop()}<X className="h-3 w-3 cursor-pointer" onClick={clearImages} /></span>)}
        </div>
      )}
      <form className="flex items-end gap-2 border-t p-2" onSubmit={(e) => { e.preventDefault(); void send(text); }}>
        <Button type="button" size="icon" variant="ghost" onClick={openImages} aria-label={t.chat.attach}><ImagePlus className="h-4 w-4" /></Button>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={t.chat.placeholder} rows={2} maxLength={4000} className="min-h-[44px] flex-1 resize-none"
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(text); } }} data-testid="designer-input" />
        <Button type="submit" size="icon" disabled={busy || !text.trim()} aria-label={t.chat.send} data-testid="designer-send"><Send className="h-4 w-4" /></Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Starter designs** — `layout-picker.tsx`: a Dialog that loads `GET /api/dashboard/email-designer/layouts`, renders each through `render-preview` (one request per layout when the dialog opens, cached in state) inside a scaled iframe thumbnail (`<iframe sandbox="" srcDoc=… style={{ width: 600, height: 760, transform: 'scale(0.4)', transformOrigin: 'top left' }}>` inside a `240×304` box), with the name from `t.chat.layoutNames` and a "Use this design" button calling `onPick({ subject, html })`. In the editor `onPick` does `ed.setDraft({ bodyHtml: html, subject: ed.draft.subject || subject })` (unsaved; Save keeps it).

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useApi } from '@/hooks/use-api';
import { useEditorText } from '../_i18n';

interface Layout { name: string; subject: string; html: string }
const unwrap = <T,>(res: unknown): T => ((res as { data?: T })?.data ?? res) as T;

export function LayoutPicker({ open, onOpenChange, onPick }: { open: boolean; onOpenChange: (o: boolean) => void; onPick: (l: { subject: string; html: string }) => void }) {
  const api = useApi();
  const t = useEditorText();
  const [layouts, setLayouts] = useState<Layout[] | null>(null);
  const [rendered, setRendered] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open || !api.isReady || layouts) return;
    api.get('/api/dashboard/email-designer/layouts').then(async (res) => {
      const list = unwrap<Layout[]>(res);
      setLayouts(list);
      for (const l of list) {
        const p = unwrap<{ html: string }>(await api.post('/api/dashboard/email-templates/render-preview', { subject: l.subject, bodyHtml: l.html }));
        setRendered((r) => ({ ...r, [l.name]: p.html }));
      }
    }).catch(() => {});
  }, [open, api.isReady]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader><DialogTitle>{t.chat.layoutsTitle}</DialogTitle><DialogDescription>{t.chat.layoutsDescription}</DialogDescription></DialogHeader>
        {!layouts && <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>}
        <div className="grid max-h-[70vh] grid-cols-1 gap-4 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
          {layouts?.map((l) => (
            <div key={l.name} className="space-y-2 rounded-md border p-2" data-testid={`layout-${l.name}`}>
              <div className="relative h-[304px] w-[240px] overflow-hidden rounded bg-white">
                {rendered[l.name]
                  ? <iframe title={l.name} sandbox="" srcDoc={rendered[l.name]} style={{ width: 600, height: 760, transform: 'scale(0.4)', transformOrigin: 'top left', border: 0 }} />
                  : <Loader2 className="absolute left-1/2 top-1/2 h-4 w-4 animate-spin" />}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{t.chat.layoutNames[l.name] ?? l.name}</span>
                <Button size="sm" onClick={() => { onPick({ subject: l.subject, html: l.html }); onOpenChange(false); }}>{t.chat.useLayout}</Button>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Brand memory** — `brand-memory-dialog.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { useEditorText } from '../_i18n';

const unwrap = <T,>(res: unknown): T => ((res as { data?: T })?.data ?? res) as T;

export function BrandMemoryDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const api = useApi();
  const t = useEditorText();
  const { toast } = useToast();
  const [notes, setNotes] = useState<string[]>([]);

  useEffect(() => {
    if (open && api.isReady) api.get('/api/dashboard/email-designer/brand-memory').then((r) => setNotes(unwrap<{ notes: string[] }>(r).notes)).catch(() => {});
  }, [open, api.isReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    const res = unwrap<{ notes: string[] }>(await api.put('/api/dashboard/email-designer/brand-memory', { notes: notes.filter((n) => n.trim()) }));
    setNotes(res.notes);
    toast({ title: t.chat.memorySaved });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{t.chat.memoryTitle}</DialogTitle><DialogDescription>{t.chat.memoryDescription}</DialogDescription></DialogHeader>
        <div className="space-y-2" data-testid="brand-memory">
          {notes.length === 0 && <p className="text-sm text-muted-foreground">{t.chat.memoryEmpty}</p>}
          {notes.map((n, i) => (
            <div key={i} className="flex gap-2">
              <Input value={n} maxLength={200} onChange={(e) => setNotes((l) => l.map((x, j) => (j === i ? e.target.value : x)))} />
              <Button size="icon" variant="ghost" onClick={() => setNotes((l) => l.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
          {notes.length < 20 && <Button size="sm" variant="outline" onClick={() => setNotes((l) => [...l, ''])}><Plus className="mr-1 h-4 w-4" />{t.chat.memoryAdd}</Button>}
        </div>
        <DialogFooter><Button onClick={save}>{t.chat.memorySave}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: Wire into the editor** — in `template-editor.tsx`:

```tsx
  const [layoutsOpen, setLayoutsOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const api = useApi();

  const loadVersion = async (versionId: number) => {
    const res = await api.get(`/api/dashboard/email-templates/${id}/versions/${versionId}`);
    const v = ((res as { data?: { subject: string; bodyHtml: string } })?.data ?? res) as { subject: string; bodyHtml: string };
    ed.setDraft({ subject: v.subject, bodyHtml: v.bodyHtml });
  };

  const chat = (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => setLayoutsOpen(true)} data-testid="open-layouts">{t.chat.layouts}</Button>
        <Button size="sm" variant="outline" onClick={() => setMemoryOpen(true)} data-testid="open-memory">{t.chat.memory}</Button>
      </div>
      <DesignerChat
        templateId={id}
        dirty={ed.dirty}
        saveFirst={ed.save}
        onDesign={ed.applyServer}
        images={chatImages}
        clearImages={() => setChatImages([])}
        openImages={() => setImages('chat')}
        onLoadVersion={loadVersion}
      />
    </div>
  );
```

and render `<LayoutPicker open={layoutsOpen} onOpenChange={setLayoutsOpen} onPick={(l) => ed.setDraft({ bodyHtml: l.html, subject: ed.draft.subject || l.subject })} />` and `<BrandMemoryDialog open={memoryOpen} onOpenChange={setMemoryOpen} />`. The default left tab becomes `'chat'` (`useState<…>('chat')`). A new empty template opens on the chat tab with the suggestions.

- [ ] **Step 6: Verify** — tsc + lint clean. Browser with the fake OpenRouter (Task 12, Step 1) or a real client key on tenant 2: type "A luxury just-listed email" → "Designing…" → the reply appears, the preview shows the new design, History has an "AI designer" row; "make the buttons green" → quick change; Brand memory dialog shows any note the AI saved; Starter designs → pick Newsletter → preview changes, Save enabled. Remove the key → the chat shows "Add it in Settings → AI" and Code still works.

- [ ] **Step 7: Checkpoint** — graphify.

---

### Task 12: End-to-end tests and real-mailbox check

**Files:**
- Create (scratchpad, not committed): `<scratchpad>/fake-openrouter-designer.js`, `<scratchpad>/e2e-designer.js`

**Interfaces:**
- Consumes everything above. The API reads the OpenRouter URL from `openRouterBase()` (`apps/api/src/modules/ai/ai-models.ts`); point it at the fake with the same env variable the existing `e2e-chat.js` fake used (look it up in that script / `ai-models.ts`).

- [ ] **Step 1: Fake provider** — a small Node `http` server on port 58990 answering `POST /chat/completions`: when the request has `tools` and the last message is the user's, reply with a `tool_calls` entry: `use_layout {name:"luxury"}` for messages containing "luxury", else `replace_html` with a short valid template; when the last message is a `tool` result, reply `{ content: "Done: <short text>" }`; for messages containing "green", reply `edit_html` replacing `#c9a227` → `#16a34a` (exactly once — make the fake read the current template from the system prompt and pick a string that occurs once). Log every request body to a file so the test can assert the system prompt contains brand notes.

- [ ] **Step 2: E2E script** (puppeteer, client login as in `map-dash.js`):
  1. Campaigns → New template → editor opens on the chat tab with 4 suggestions.
  2. Send "A luxury just listed email" → busy text → reply → preview iframe `srcdoc` contains a listing title from tenant 2 and the gold colour.
  3. Send "make the buttons green" → preview contains `#16a34a`; History lists 2 AI versions.
  4. Undo → editor code contains `#c9a227`; Save → History top row "You".
  5. Code tab: paste an HTML email with `<script>` → Save → reload → the script is gone.
  6. Insert → Listing loop → preview shows 3 cards.
  7. Images → upload a 3000×2000 PNG → library shows 1200×800, `<img` with the R2/local URL inserted.
  8. Brand memory: add "No emojis" → save → next chat request body (fake log) contains "No emojis".
  9. Phone width (390×844): tabs Chat | Code | Preview; no horizontal scroll.
  10. Without the client key (clear `openrouterApiKey` for tenant 2 in MySQL, restore after): chat panel shows the no-key note; Code + Preview work.
  11. Tenant isolation: as tenant 2, `GET /api/dashboard/email-templates/<id of another tenant's template>/ai-chat` → 404.
  Expected: all checks pass; zero page errors.

- [ ] **Step 3: Send check** — create a campaign with the saved AI template and 3 featured listings, send a test to Mailpit (127.0.0.1:58025): the email shows the designed cards with links; HTML source has inline styles (no `class`-only styling); text version lists the listings. Open each of the 6 starter designs the same way. Note in the handoff: the user checks one in Gmail web + Outlook before release.

- [ ] **Step 4: Full suites** — `cd apps/api && npx jest` (all green), `npx tsc --noEmit` in api + dashboard, dashboard lint on campaigns.

---

### Task 13: Release notes and handoff (no build — the user builds when ready)

**Files:**
- Modify: `D:\VirtualOffice\_Shared\handoffs\spw-fullstack-handoff.md` (new dated section at the top, ≤150 lines)
- Modify: memory `project_campaigns_ai_chat.md` (or a new `project_ai_email_designer.md` + MEMORY.md line)

- [ ] **Step 1: Deploy notes for the next release**
  - **Server npm install first** (API has new packages `sanitize-html`, `juice`; dashboard has `@uiw/react-codemirror`, `@codemirror/lang-html` but those are bundled into `.next`): same procedure as 10-23c — upload `pnpm-lock.yaml` + `apps/api/package.json` (+ `apps/dashboard/package.json`), run the per-release install script, check `apps/api/node_modules/sanitize-html/package.json` and `juice` exist.
  - **One migration**: `1777410000000-EmailDesigner`.
  - API + dashboard; widget and WP plugin unchanged.
  - Check the dashboard build has no server-side `require("@uiw/react-codemirror")`: `grep -rl "react-codemirror" apps/dashboard/.next/server | head` — matches must be bundled chunks, not `require()` of the package name.
  - Nginx `proxy_read_timeout` for `api.spw-ai.com` ≥ 180 s (designer turns can take up to ~2 minutes) → **For DevOps** if lower.
  - New env (optional): `EMAIL_DESIGNER_HOURLY_LIMIT` (default 30), `EMAIL_IMAGE_LIMIT_MB` (default 100).
- [ ] **Step 2: Handoff** — what was built, files, how to verify (the E2E list), open items: Gmail/Outlook manual check; Super Admin may raise a client's image limit via `settings.emailImageLimitMb`.
- [ ] **Step 3: Graphify rebuild**; nothing committed (user commits after manual test).
