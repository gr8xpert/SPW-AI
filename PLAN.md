# Feature batch plan

Written 2026-09-01. Five items. Each has: goal → files → data model → API → UI → open questions.

---

## 1. Top bar: credit balance always visible + Buy button always there

### Current state
`apps/dashboard/src/components/layout/credit-balance-badge.tsx` shows **either** the balance chip (when > 0) **or** the "Buy Credit Hours" button (when ≤ 0/null). Never both.

### Goal
Always render: `[Balance chip: 0h 15m] [Buy button]` side by side. Balance chip visible even if 0 / negative (styled red/muted). Buy button never disappears.

### Files
- `apps/dashboard/src/components/layout/credit-balance-badge.tsx` — collapse if/else, render both, add negative/zero red styling on chip.

### No API / schema changes.

### Rules
- Webmaster role: still hide (they don't own billing). Unchanged.
- Loading skeleton: still show, but placeholder for chip + button.
- Negative balance: red variant, still linkable to `/dashboard/billing`.

---

## 2. Multi-file upload on tickets (create + reply, staff + customer)

### Current state — ALREADY IMPLEMENTED
Verified — all three surfaces already have `<input type="file" multiple />`:
- Customer create dialog: `apps/dashboard/src/app/(dashboard)/dashboard/tickets/page.tsx` (dialog)
- Customer reply: same file (reply section in detail dialog)
- Webmaster reply: `apps/dashboard/src/app/(dashboard)/dashboard/webmaster/tickets/[id]/page.tsx` line 485–487

Backend: `CreateTicketDto.attachments: AttachmentDto[]` array; `TicketMessage.attachments` JSON column; `addMessage` and `create` both persist arrays. Upload endpoint (`POST /api/dashboard/upload`) is single-file; UI loops per file.

### Confirmed goal: **UX improvement — drag-and-drop + hint**

Add a reusable `<AttachmentDropzone>` component that wraps the existing file input logic:
- Dashed-border drop zone with icon + text "Drag files here or click to browse (Ctrl/Cmd-click to select multiple)"
- Handle `onDrop` / `onDragOver` events, call the same `uploadFiles(FileList)` helper
- Chip previews for uploaded files (already exists — reuse)
- Loading spinner during upload

### Files
- `apps/dashboard/src/components/tickets/attachment-dropzone.tsx` — new shared component
- `apps/dashboard/src/app/(dashboard)/dashboard/tickets/page.tsx` — swap create + reply file inputs for dropzone
- `apps/dashboard/src/app/(dashboard)/dashboard/webmaster/tickets/[id]/page.tsx` — swap webmaster reply file input for dropzone

No API or DTO changes.

---

## 3. Per-property SEO section: add SEO Schema + AI SEO

### Current SEO tab (`.../properties/[id]/edit/page.tsx` line 995–1020)
- `pageTitle`, `metaTitle`, `metaDescription`, `metaKeywords` (all multilingual)

### Goal
Two new subsections in the SEO tab:

#### 3a. **SEO Schema (JSON-LD)**
Two modes:
- **Auto (default)** — server generates `RealEstateListing` JSON-LD from property fields at widget render time; no DB storage.
- **Custom override** — new column `seoSchemaJson: text NULL` where user pastes/edits JSON-LD; widget prefers custom over auto.

Fields on the form:
- Toggle: "Use custom JSON-LD schema" (off = auto)
- If on: `<Textarea>` for JSON with client-side JSON.parse validation

#### 3b. **AI SEO**
Button: **"Generate SEO with AI"** in the SEO tab header.

- Calls new endpoint `POST /api/dashboard/ai-seo/property/:id` with `{ languages: string[] }`
- Server uses AiService (same OpenRouter integration as translation) to generate `pageTitle` / `metaTitle` / `metaDescription` / `metaKeywords` per language from `title`, `description`, price, location.
- Returns `{ [lang]: { pageTitle, metaTitle, metaDescription, metaKeywords } }`
- Client patches formData; user reviews and saves.
- **Gated by same `aiTranslation` addon** (see #5) — since it's an AI feature using OpenRouter credits.

### Files
- `apps/api/src/database/entities/property.entity.ts` — add `seoSchemaJson: string | null`
- New migration `<ts>-PropertySeoSchema.ts` — `ADD COLUMN seoSchemaJson TEXT NULL`
- `apps/api/src/modules/property/dto/create-property.dto.ts` + update DTO — add optional `seoSchemaJson`
- New module: `apps/api/src/modules/ai-seo/` with `ai-seo.controller.ts` + `ai-seo.service.ts`
- `apps/api/src/app.module.ts` — register AiSeoModule
- Widget rendering side (WP plugin / widget bundle) — read `seoSchemaJson` if present, else compute default. **Deferred to widget-side task; server just stores the value.**
- `apps/dashboard/src/app/(dashboard)/dashboard/properties/[id]/edit/page.tsx` — SEO tab: add toggle + textarea + "Generate SEO with AI" button

### Confirmed: generates for all tenant languages at once (like AI Translate).

---

## 4. Property media: multiple floor plans (renamed from "External Link")

### Current state
`property.externalLink: string | null` — single URL. Rendered on frontend as "Floor Plan". `floorPlanUrl: string | null` also exists (likely legacy from a feed field).

### Confirmed target: `floorPlanUrl` (not `externalLink`)
`externalLink` stays as-is. Only `floorPlanUrl` becomes multiple.

### Goal
Multiple floor plans per property. Each entry: `{ url: string; label?: string }`.

### Files
- `apps/api/src/database/entities/property.entity.ts` — add `floorPlans: Array<{url:string;label?:string}> | null` as JSON column. Keep `floorPlanUrl` string for backwards-compat + auto-mirror `floorPlans[0].url` on write.
- New migration — `ADD COLUMN floorPlans JSON NULL`, backfill: `UPDATE properties SET floorPlans = JSON_ARRAY(JSON_OBJECT('url', floorPlanUrl)) WHERE floorPlanUrl IS NOT NULL`
- `apps/api/src/modules/property/dto/create-property.dto.ts` + update-property.dto — add validated `floorPlans?: Array<{url:string;label?:string}>`
- `apps/api/src/modules/property/property.service.ts` — on save, sync `floorPlanUrl = floorPlans?.[0]?.url ?? null`
- `apps/dashboard/src/app/(dashboard)/dashboard/properties/[id]/edit/page.tsx` Media tab — replace single "Floor Plan URL" input with repeater: Add row / Remove row, each row = URL input + upload button + optional label. Upload uses existing `/api/dashboard/upload`.
- Widget/frontend rendering — needs a follow-up to render list instead of single URL. **Widget/PDF/detail rendering deferred; API stores the array.**

### Backwards compat
- Feed importers writing `floorPlanUrl` still work — will populate `floorPlans[0]` on next save (or add migration to backfill on read)
- Widget/PDF reading `floorPlanUrl` still gets first floor plan URL

---

## 5. AI translation = premium add-on (super admin unlocks per client)

### Current state
`handleTranslate` in property edit page (line 488) fires unconditionally. Same UX in features, labels, property-types pages. `TranslationController` has no addon guard.

### Goal
Add 6th add-on: `aiTranslation`. Locked by default. Super admin unlocks per client via existing add-ons section on `/admin/clients/[id]/edit`.

### Files
- `packages/shared/src/types/tenant.types.ts` — add `aiTranslation: boolean` to `DashboardAddons`; set `false` in `DEFAULT_DASHBOARD_ADDONS`, `true` in `ALL_ENABLED_DASHBOARD_ADDONS`
- Rebuild shared: `pnpm --filter @spm/shared build`
- New migration `<ts>-AiTranslationAddon.ts` — MySQL JSON `JSON_SET(dashboardAddons, '$.aiTranslation', false)` where key missing
- `apps/dashboard/src/hooks/use-dashboard-addons.ts` — add `aiTranslation: false` to `DashboardAddons` interface + `ALL_LOCKED`
- `apps/dashboard/src/app/(admin)/admin/clients/[id]/edit/page.tsx` — add row: `{ name: 'dashboardAddons.aiTranslation', label: 'AI Translation', description: 'AI-powered content translation for properties, features, labels, and property types' }` + include in form.reset()
- `apps/dashboard/src/app/(admin)/admin/clients/create/page.tsx` — same field in create form
- `apps/api/src/modules/translation/translation.controller.ts` — add `@UseGuards(DashboardAddonGuard)` + `@RequiresAddon('aiTranslation')` at class level
- `apps/api/src/modules/ai-seo/ai-seo.controller.ts` (from #3) — same guard
- Client-side gating: replace each `handleTranslate` button with a version that reads `useDashboardAddons()`. When locked: show button with lock icon + tooltip "Contact support to unlock AI translation"; disable click. Pages affected:
  - `.../properties/[id]/edit/page.tsx`
  - `.../features/page.tsx`
  - `.../labels/page.tsx`
  - `.../property-types/page.tsx`

---

## Execution order

1. **#5** (add-on infrastructure) — establishes `aiTranslation` gate before #3's AI SEO reuses it
2. **#1** (trivial UI edit — credit balance always visible)
3. **#4** (schema + UI — multiple floor plans on `floorPlanUrl`)
4. **#3** (largest — schema + new AI SEO module + JSON-LD schema field + UI)
5. **#2** (dropzone UX for ticket attachments)

All open questions resolved. Ready to implement top-to-bottom.
