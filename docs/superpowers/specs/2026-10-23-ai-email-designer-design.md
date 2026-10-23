# AI Email Designer — design

Date: 2026-10-23 · Status: approved 2026-10-23 (plan: docs/superpowers/plans/2026-10-23-ai-email-designer.md) · Area: Dashboard → Email Campaigns

## 1. Goal

Clients design email templates in two ways, in one editor:

1. **Code + live preview** — paste or edit HTML on the left, see the email exactly as our
   system sends it on the right (sample contact + sample listings filled in).
2. **AI designer chat** — describe the email ("monthly newsletter, logo on top, 3 villas side
   by side, dark blue and gold"); the AI builds it, the preview updates, and the client keeps
   chatting ("make the button green") until happy, then saves.

Decisions taken in brainstorming:

| Topic | Decision |
|---|---|
| Hand editing | Code + live preview (no drag-and-drop builder). Click-to-edit text may come later. |
| Listing cards | New listing loop so the AI (or client) designs the cards; `{{properties}}` stays as the simple option. |
| Chat history | Saved per template; reopen and continue later. |
| Memory | Per template chat + one **brand memory** per client (visible, editable). Never shared between clients. |
| Design quality | Built-in email design guide + starter layouts + automatic check/repair after every change. |
| Images | Upload in the editor to R2, with a per-client library, limits and automatic clean-up. |
| How the AI edits | First design = full HTML; later changes = small find-and-replace edits, with automatic fall-back to a full rewrite. |
| Undo | Every AI change is a saved version; step back or restore any earlier one. |
| Who can use it | Clients with the **Email Campaigns** add-on **and** their own AI key (OpenRouter, or Anthropic if chosen in Settings → AI). Never the platform key. Without a key the code + preview editor still works; the chat says to add a key. |

## 2. Out of scope (YAGNI)

- Drag-and-drop block builder, click-to-edit text in the preview.
- AI-generated images.
- Shared templates between clients / a public template marketplace.
- Rewriting existing templates automatically.

## 3. Template language

Existing placeholders keep working unchanged:
`{{contact.first_name}} {{contact.name}} {{contact.email}} {{agency.name}} {{properties}} {{unsubscribe_link}}`.

New **listing loop** (in `campaign-render.ts`):

```html
{{#properties}}
  <img src="{{property.image}}" alt="{{property.title}}">
  {{property.title}} · {{property.price}} · {{property.location}}
  {{property.beds}} beds · {{property.baths}} baths · {{property.area}}
  {{property.reference}} · {{property.type}}
  <a href="{{property.url}}">View</a>
{{/properties}}
```

- The block repeats once per featured listing of the campaign (same list `{{properties}}` uses).
- Values are HTML-escaped; `property.image` and `property.url` must be http(s) or they become empty.
- Missing values become empty (no "undefined"). No listings → the whole block is removed.
- One loop per email (a second one renders the same listings; documented, not prevented).
- Plain-text version: the loop becomes "title — price — url" lines.

New agency placeholders, so the AI never hard-codes them: `{{agency.logo}}`, `{{agency.phone}}`,
`{{agency.email}}`, `{{agency.website}}`, `{{agency.color}}` (from tenant settings; empty when unset).

## 4. Editor (dashboard)

Replaces today's textarea dialog with a full-page editor:
`/dashboard/campaigns/templates/new` and `/dashboard/campaigns/templates/[id]`.

Layout (desktop): **left** = tabs *AI chat* | *Code*; **right** = preview with Desktop/Phone switch.
Top bar: name, subject, Undo/Redo, version history, Save (tests are sent from the campaign page).
Phone width: tabs *Chat* | *Code* | *Preview*.

- **Code** — CodeMirror 6 (HTML mode, line numbers). Preview refreshes 400 ms after typing stops.
- **Preview** — sandboxed `iframe srcdoc` (no scripts, no same-origin). Rendered by the **server**
  (`POST /email-templates/render-preview`) with the real renderer, a sample contact and the
  client's 3 newest published listings (or demo listings if none), so preview = sent email.
- **Images** — "Add image" opens the client's image library (upload / pick / delete); picking one
  inserts its URL at the cursor (Code) or attaches it to the next chat message (Chat).
- **Placeholders** — an "Insert" menu lists every placeholder and the listing loop with a one-line
  explanation each.
- Leaving with unsaved changes asks for confirmation.
- 7 dashboard languages (en, nl, es, fr, de, fi, sv) like the rest of Campaigns.

## 5. AI designer

### 5.1 Chat flow

1. Client sends a message (optionally with picked image URLs).
2. API builds the request: design guide (5.2) + brand memory + agency facts (name, colour, logo,
   contact) + current template HTML + this template's chat history (last 20 turns).
3. The model answers with text and **tool calls** (5.3), run in a loop of at most 4 rounds.
4. The resulting HTML goes through the check/repair step (5.4), is saved as a new **version**, and
   is returned (plain POST, no streaming — the HTML must be complete and checked before it is shown)
   with the AI's short reply. The editor shows "Designing…" meanwhile; the preview refreshes.

Model: the client's chosen model; the editor warns when it is not on a "good for design" list
(Claude Sonnet / Opus class, GPT-4.1+ class, Gemini 2.5 Pro class). Recommended: Claude Sonnet.

### 5.2 Design guide (system prompt, platform-owned, same for every client)

- **Email-safe rules**: table layout, 600 px max width, inline styles only, web-safe font stacks,
  no JS/forms/iframes/background video, bulletproof buttons, `alt` on every image, mobile stacking
  via one `@media` block, dark-mode-friendly colours, total HTML under 100 KB.
- **Design principles**: clear hierarchy, generous spacing, max 2 fonts, one primary call to action,
  brand colour as accent not background flood.
- **Real-estate patterns**: photo-led cards, price + location prominent, "View property" button per
  card, agent/contact block, trust footer.
- **Placeholders**: must use the agency placeholders and the listing loop instead of typing values;
  must keep `{{unsubscribe_link}}`.
- **Starter layouts**: 6 hand-built, tested templates (Luxury, Modern, Minimal, Newsletter,
  New listing alert, Open house) in `apps/api/src/modules/email-campaign/designer/layouts/`.
  The AI starts from the closest one; the client can also pick one directly in the editor.
- **Behaviour**: reply in the client's language, keep replies to 1–3 sentences, ask one short
  question only when the request is truly ambiguous, never invent prices/addresses.

### 5.3 Tools the AI can call

| Tool | Effect |
|---|---|
| `replace_html(html)` | Full new design (first draft or "redo"). |
| `edit_html(edits: [{find, replace}])` | Small changes. Each `find` must match exactly once; otherwise the whole call fails and the model is told to retry with `replace_html`. |
| `use_layout(name)` | Loads a starter layout as the new base. |
| `save_brand_note(note)` | Adds a short note to the client's brand memory (e.g. "prefers dark blue and gold"). Max 20 notes × 200 chars; oldest dropped. |

Tool format reuses the existing chatbot tool loop (`AiService.chatCompletionWithTools`, Anthropic
conversion in `anthropic-tools.ts`).

### 5.4 Check and repair (after every change, AI or hand edit on save)

1. Sanitize (`sanitize-html` allow-list): remove scripts, event handlers, forms, iframes,
   `javascript:` URLs, external stylesheets.
2. Validate placeholders: unknown `{{…}}` listed as warnings; unbalanced listing loop = error.
3. Ensure `{{unsubscribe_link}}` exists (append the standard footer if missing — existing behaviour).
4. Inline CSS (`juice`), keeping the `@media` block — done when rendering (preview + send), so the stored code stays readable.
5. Size check (100 KB).

An error from step 2 or 5 is sent back to the model once to fix by itself; if it still fails, the
previous version stays and the client sees "The AI couldn't apply that change — try rephrasing".

### 5.5 Versions and undo

Every AI change and every Save creates a version (HTML + subject + who/what made it).
Undo/Redo walks versions; the history panel restores any version (restoring = new version).
Keep the last 50 versions per template.

## 6. Data model (one migration)

- `email_template_versions` — id, tenantId, templateId, bodyHtml (mediumtext), subject,
  source (`ai`|`manual`|`restore`|`layout`), createdAt. Index (templateId, id).
- `email_template_ai_messages` — id, tenantId, templateId, role (`user`|`assistant`), content (text),
  versionId (nullable, the version this turn produced), createdAt.
- `tenant_brand_memory` — tenantId (PK), notes JSON (string[]), updatedAt.
- `email_images` — id, tenantId, blobId (→ `media_blobs`, reused dedup by content hash), url,
  width, height, bytes, lastUsedAt, createdAt.
- `email_templates` — unchanged (current HTML stays there; versions are history).

All rows carry `tenantId`; every query is scoped by the signed-in client's tenant. Deleting a
template deletes its versions and chat.

## 7. Images

- Upload: JPEG/PNG/GIF/WebP in, max 10 MB in; `sharp` resizes to ≤ 1200 px wide and stores
  **JPEG** (PNG kept for transparency, GIF kept as is) — no WebP output (Outlook).
- Stored in R2 via the existing blob storage (content-hash dedup), served from the R2 public URL.
- Limits per client: 200 images / 100 MB (`EMAIL_IMAGE_LIMIT_MB`; per client `settings.emailImageLimitMb`).
  Over the limit → refused with a clear message.
- `lastUsedAt` updated when a template is saved; images in a campaign are pinned when it starts sending.
- Daily clean-up job: delete images not referenced by any template or campaign and unused for
  30 days. Never delete an image referenced by a sent campaign.

## 8. API (all under `JwtAuthGuard` + `TenantGuard` + Email Campaigns add-on check)

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/dashboard/email-templates/render-preview` | `{ bodyHtml, subject }` → rendered HTML with sample data |
| GET | `/api/dashboard/email-templates/:id/versions` | version list |
| POST | `/api/dashboard/email-templates/:id/versions/:vid/restore` | restore |
| GET | `/api/dashboard/email-templates/:id/ai-chat` | chat history |
| POST | `/api/dashboard/email-templates/:id/ai-chat` | send message → `{ reply, changed, versionId, bodyHtml, subject, warnings }` |
| GET/PUT | `/api/dashboard/email-designer/brand-memory` | view/edit notes |
| GET | `/api/dashboard/email-designer/layouts` | starter layouts (name, thumbnail, html) |
| GET/POST/DELETE | `/api/dashboard/email-images` | library |
| GET | `/api/dashboard/email-designer/status` | `{ addon, hasKey, model, modelOk }` for the editor banner |

A new template is created with `POST /email-templates` when the editor opens (name "Untitled",
empty body allowed); it gets its body from the first AI turn or the first Save. Untitled templates
with an empty body older than 1 day are removed by the daily clean-up job.

Rate limit: 30 AI messages / client / hour (config), per-template lock so two tabs can't run turns
at once.

## 9. Errors

- No add-on → editor page shows the lock like other add-on pages.
- No client key → chat panel replaced by "Add your AI key in Settings → AI" (Code + Preview still work).
- Provider error / credit error → plain message in the chat, nothing saved, previous version kept.
- Anthropic workspace error → the existing clear message (from 10-23d).
- Timeout 120 s per turn → "The AI took too long — try a shorter request".

## 10. Testing

- **Unit (jest)**: listing loop + new placeholders (escaping, unsafe URLs, empty lists, text version);
  `edit_html` apply (exact-once rule); check/repair (sanitize, loop balance, unsubscribe, inline CSS,
  size); tool loop with a fake provider (replace → edit → failed edit falls back); brand-memory cap;
  image limits; clean-up job never deletes images of sent campaigns; tenant isolation of every query.
- **E2E (puppeteer, local, fake OpenRouter like e2e-chat.js)**: paste HTML → preview matches;
  chat creates a design → edit → undo → restore; upload image → appears in library and preview;
  no-key and no-add-on states; phone width layout.
- **Render check**: the 6 starter layouts sent to Mailpit and opened; manual check in Gmail web
  + Outlook before release.

## 11. Rollout

- New npm packages for the API: `sanitize-html`, `juice` → server `pnpm install` step at deploy
  (same procedure as `@anthropic-ai/sdk` in 10-23c).
- Dashboard: `@uiw/react-codemirror` + `@codemirror/lang-html` (bundled into `.next`).
- One migration. Widget and WP plugin unchanged.

## 12. Build order

1. Listing loop + agency placeholders + render-preview endpoint.
2. Full-page editor: Code + live preview + Insert menu (useful on its own).
3. Images: upload, library, limits, clean-up.
4. Versions + undo.
5. AI designer: guide, layouts, tools, check/repair, chat UI, brand memory.

## 13. Adjustments made during the build

- Added a `set_subject` AI tool (the AI sets the subject, not only the body).
- Starter designs live in one file `designer/layouts.ts`; no layout thumbnails, previews come from `render-preview`.
- `email_images` is keyed by `contentHash` + `mimeType` + `pinned` (the same image uploaded twice is stored once).
- Status endpoint has no required add-on field; it does return `addon: true`.
- Turn deadline is 90 s, not 120 s: Cloudflare cuts proxied requests at 100 s. Nginx `proxy_read_timeout` for the API must be at least 120 s. If the API is not behind the Cloudflare proxy, the limit could be raised later.
- A starter design picked in the layout picker is saved as a `manual` version; only the AI `use_layout` tool records `layout`.
- Images must be real jpeg/png/gif/webp; the format is checked by content, not by name. GIFs are kept as-is up to the 10 MB input cap.
- `{{placeholders}}` inside `style` attributes are protected during sanitize (sanitize-html otherwise drops the whole attribute).
- The editor is locked (name, subject, code, save) while the AI designs; the chat stays mounted across tab switches so the lock survives.
- The chat saves the user and assistant rows together only after a successful turn; a provider error or timeout saves nothing.
- Abandoned-template clean-up matches an empty body, `updatedAt` older than 1 day and no campaign (the "Untitled" name is localized).
- Dependencies are pinned exact: `sanitize-html` 2.17.0 and `juice` 11.1.1 (newer versions are ESM-only and break the CommonJS runtime and jest).
