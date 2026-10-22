# Buyer Match B — Wishlist, matching, suggested, email, PDF

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** an agent edits a buyer's wishlist and immediately sees scored matches from the live listings. They tick properties to send them by branded email in the buyer's language, or to add them to a hand-picked Suggested list. The Suggested list can be annotated, sent, and downloaded as one PDF.

**Architecture:** the API work lives in `apps/api/src/modules/lead/buyer/`:
- the pure match logic in `buyer-match.ts` (mapping and scoring, unit-tested)
- `BuyerMatchService` for the SQL, which calls `PropertySearchService.applyFilters` (now public)
- `BuyerSuggestionService` for `lead_suggestions`
- `BuyerMailService` for the email (built like FormMailService)
- `BuyerMatchController`, registered before BuyerController

The PDF comes from `BrochureService.renderSelection` (new). It reuses layout-v1's sections and the puppeteer pool. Settings grow `weights` and `propertyUrlPatterns`. On the dashboard, the record gets Wishlist / Matched / Suggested tabs, and the property table is pulled out into `components/property-rows-table.tsx`.

**Tech stack:** NestJS 10 + TypeORM (MySQL), class-validator, Puppeteer (existing pool), Next 14 + React Query, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-10-21-buyer-match-phase1-design.md` (Data model → `lead_suggestions`, `BuyerMatchSettings`; Matching; Sending; Dashboard). The A1 plan's Global Constraints apply.

## Global Constraints
- All `api/dashboard/buyers/*` routes: `JwtAuthGuard, TenantGuard, DashboardAddonGuard, RolesGuard` + `@RequiresAddon('buyerMatch')`. Every buyer is reached through `BuyerService.get` (the visibility rule). A buyer the viewer can't see → 404.
- Request bodies are class DTOs. Nested objects/arrays use `@ValidateNested` + `@Type`. Dynamic-key maps (`propertyUrlPatterns`, `featureOverrides`) are `@IsObject` and checked entry by entry in the settings service.
- Never `save()` a row loaded with relations to change an `*Id`. Use `update()` with only the changed keys.
- Settings are written only by `PUT /buyers/settings` (no widget syncVersion bump).
- Dashboard: React Query keys under `'buyers'` with `useTenantQueryScope`. Query functions call `api.*` inline and are never wrapped in `useCallback`.
- All dashboard wording goes in `buyers/_i18n/en.ts`. All email/PDF wording goes in DEFAULT_LABELS `buyer_email_*` / `buyer_pdf_*` (en + es; other languages from translation memory).
- No AI. No commit. Never stage `.claude/settings.json` or `docs/locations-rosvan.csv`.

## Decisions taken while planning
- **Must-haves (SQL):** wishlist listing types ∩ the site's enabled listing types (if the intersection is empty, nothing matches). Locations and types with descendants (via `applyFilters`). Budget as range overlap: `price > 0 AND priceOnRequest = 0 AND COALESCE(NULLIF(priceTo,0), price) >= budgetMin AND price <= budgetMax`. With a budget, unpriced listings never match. The site's minimum prices also apply. The base is active + published.
- **Candidates:** the newest 500 must-have matches (`createdAt DESC`). They are scored in memory, sorted by score and then newest, and paginated. The response carries `total` (all must-have matches) and `capped`.
- **Wishes scored:**
  - `minBedrooms` / `minBathrooms` are met when `COALESCE(xTo, x) >= min`.
  - Build / plot size is met when the listing's range overlaps [min, max]. A missing size counts as missed.
  - Each feature is met when `features` contains its id.
  - Weights default to bedrooms 3, bathrooms 2, buildSize 2, plotSize 1, feature 1. `featureOverrides[id]` replaces the feature weight.
  - `score = round(100·met/asked)`. It is 100 when nothing is asked or the asked weights sum to 0.
- `met` / `missed` hold keys `bedrooms | bathrooms | buildSize | plotSize | feature:<id>`. The dashboard turns them into words.
- **Suggestions:**
  - Added by `propertyIds` or `references` (reference or agent reference). Only the tenant's active, published listings can be added; the rest come back in `notFound`.
  - Re-adding an existing one is a no-op (unique key).
  - Status changes are free. `sentAt` is set by sending.
- **Sending:**
  - `POST /buyers/:id/send {propertyIds (1–30), recipients ['buyer'|'agent'], message?, lang?}`.
  - `lang` = dto.lang → buyer.language → tenant defaultLanguage → `en`.
  - The buyer's email is `contact.email` and the agent's is `assignedToUser.email`. A recipient without an address → 400 `NO_RECIPIENT`.
  - The mail is awaited. Delivered, or log-only in dev (`no-transport`), counts as sent. `error` → 502 `EMAIL_FAILED`, and nothing is marked.
  - On success: the suggestions are upserted (`status=sent` unless already visited/interested/not_interested, `sentAt=now`), plus a `suggestion_sent` activity with `{propertyIds, references, recipients, lang}`.
  - `POST /buyers/:id/send/preview` (same body) returns `{subject, html}` without sending. The dashboard shows it in the send dialog.
- **Property link:** `propertyUrlPatterns[lang] || propertyUrlPatterns.default`. `{lang}`, `{segment}` and `{ref}` are replaced, and `segment` = `propertyUrlSegment` (title, location and type in `lang`, `settings.slugFormat`). With no pattern there is no link, and the send dialog shows a hint pointing to Settings.
- The suggestion note is internal (not in the email). The virtual tour link is shown in the email when set.
- **PDF:** `GET /buyers/:id/suggestions.pdf?lang&ids=` uses the suggested properties (optionally only `ids`), capped at 30. The cover carries the agency logo/name, "Selected properties for {name}", the date and the agent. Then each property's three layout-v1 sections. A branded header without a QR code, and page numbers.
- Labels get a new category `buyer` ("Buyer emails & PDF", prefix `buyer_`) in LABEL_CATEGORIES and on the dashboard Labels page. Memory fill: a `buyer_*` default missing in `lang` (with no client text) is looked up in translation memory, else falls back to English.

## Tasks

### 1. Shared types + migration + entity
**Files:** `packages/shared/src/types/buyer.types.ts`, `apps/api/src/database/migrations/1777250000000-BuyerMatchSuggestions.ts`, `apps/api/src/database/entities/lead-suggestion.entity.ts`, `entities/index.ts`, `lead.module.ts`.
- `BuyerMatchWeights {bedrooms, bathrooms, buildSize, plotSize, feature, featureOverrides: Record<string, number>}`. `BuyerMatchSettings` gains `weights` and `propertyUrlPatterns: Record<string,string>`. The defaults are updated.
- `SUGGESTION_STATUSES = ['suggested','sent','visited','interested','not_interested']`, plus `type SuggestionStatus`.
- `lead_suggestions(id, tenantId FK CASCADE, leadId FK leads CASCADE, propertyId FK properties CASCADE, note TEXT NULL, virtualTourUrl VARCHAR(500) NULL, visitDate DATETIME NULL, status ENUM DEFAULT 'suggested', sentAt DATETIME NULL, createdBy FK users SET NULL, createdAt, updatedAt)`, `UNIQUE uq_lead_suggestions (leadId, propertyId)`, `INDEX (tenantId)`.
- [ ] `pnpm --filter @spm/shared build`, then run the migration and revert + run.

### 2. Settings: weights + URL patterns (TDD on normalize)
**Files:** `buyer-settings.service.ts` (+ new `buyer-settings.service.spec.ts`), `dto/buyer.dto.ts`.
- `normalize` clamps weights to integers 0–10 and drops unknown/invalid overrides. It keeps patterns only where the key matches `^(default|[a-z]{2})$` and the value is an `https?://` URL containing `{segment}` or `{ref}`, with at most 500 characters.
- `update` rejects an invalid pattern with 400 `{code:'BAD_URL_PATTERN', details:{lang}}` (rather than dropping it silently).
- DTO: `BuyerWeightsDto` (nested, each optional int 0–10, `featureOverrides` @IsObject) and `propertyUrlPatterns` @IsObject.
- Spec: defaults filled in; a bad override is dropped; a bad pattern → 400; a merge keeps the other fields.

### 3. Match logic (TDD) + reusable search filters
**Files:** `buyer/buyer-match.ts`, `buyer/buyer-match.spec.ts`, `property/property-search.service.ts` (`applyFilters` → public), `buyer/buyer-match.service.ts`.
- `cleanWishlist(raw): BuyerWishlist`: numbers coerced, invalid values dropped, ids deduped.
- `mustHaveDto(w, site): { dto: SearchPropertyDto-like; listingTypes: string[] | null; empty: boolean }`.
- `scoreProperty(w, p, weights): { score, met, missed }`.
- `BuyerMatchService.match(tenantId, wishlist, {page, limit, suggestedIds}) → { data: MatchItem[], total, capped, page, limit, asked }`. It is pure on the wishlist (no lead), so Phase 2 can reuse it.
- `MatchItem` = the property row (`id, reference, title, listingType, price, priceTo, rentalPeriod, currency, priceOnRequest, bedrooms, bathrooms, buildSize, plotSize, images[0], location {id,name}, propertyType {id,name}, status`) + `score, met, missed, suggested`.
- Spec: score maths (none asked → 100, weights, overrides, zero weights), ranges for developments, size overlap, cleanWishlist coercion, the listing type intersection is empty → empty.

### 4. Wishlist + matches + suggestions API
**Files:** `buyer/buyer-suggestion.service.ts` (+ spec), `buyer/buyer-match.controller.ts`, `dto/buyer-match.dto.ts`, `buyer.service.ts` (`setWishlist`), `lead.module.ts`.
- `PUT buyers/:id/wishlist {…WishlistDto}` saves `cleanWishlist` with `guessed=false` (an empty wishlist → null) and returns the buyer.
- `GET buyers/:id/matches?page&limit`.
- `GET buyers/:id/suggestions`, `POST buyers/:id/suggestions {propertyIds?, references?}` → `{added, existing, notFound}`.
- `PUT buyers/suggestions/:sid {note?, virtualTourUrl?, visitDate?, status?}` and `DELETE buyers/suggestions/:sid`, both checked through the buyer's visibility.
- Spec: unknown references go to notFound; re-adding is a no-op; another tenant's suggestion → 404.

### 5. Email
**Files:** `buyer/buyer-mail.ts` (pure `buildBuyerEmail` + `propertyLink`, with spec), `buyer/buyer-mail.service.ts`, `label/default-labels.ts`, dashboard `labels/page.tsx` (category).
- Labels (en + es): `buyer_email_subject` "{company}: properties selected for you", `buyer_email_heading` "Properties selected for you", `buyer_email_greeting` "Dear {name},", `buyer_email_greeting_anon` "Hello,", `buyer_email_intro` "We have selected these properties for you. Click a property to see all photos and details.", `buyer_email_view` "View property", `buyer_email_virtual_tour` "Virtual tour", `buyer_email_ref` "Ref.", `buyer_email_beds` "bed", `buyer_email_baths` "bath", `buyer_email_closing` "Kind regards,", `buyer_email_agent_copy` "Copy of the selection sent to {name}", `buyer_pdf_cover_title` "Selected properties for {name}", `buyer_pdf_prepared_by` "Prepared by {agent}", `buyer_pdf_properties` "{n} properties".
- `BuyerMailService.compose(tenant, buyer, properties, lang, message)` → `{subject, html, text}`. `send(...)` → per-recipient result.
- Spec: link from the pattern per language with default fallback; no pattern → no link; HTML escapes the title/message; no platform name anywhere.

### 6. Send route
**Files:** `buyer-match.controller.ts`, `buyer-suggestion.service.ts` (`markSent`).
- `POST buyers/:id/send` and `POST buyers/:id/send/preview`, as in the Decisions above.

### 7. PDF
**Files:** `brochure/templates/layout-v1.ts` (split out `renderLayoutV1Sections` + export the CSS), `brochure/templates/selection-v1.ts` (cover + documents), `brochure/brochure.service.ts` (`renderSelection`), `lead.module.ts` (import BrochureModule), `buyer-match.controller.ts` (`GET :id/suggestions.pdf`).
- `renderBrochure` output is unchanged (same HTML from the split functions).
- Check: the PDF of 3 suggestions has ≥ 7 pages and contains the buyer's name (pdf text via `pdf-parse` if present, else the page count from `/Type /Page`).

### 8. Dashboard
**Files:**
- `components/property-rows-table.tsx` (shared): `rows`, `columns` subset, `selectable`/`selected`/`onToggle`, `extraColumns`, `actions`
- `properties/page.tsx` uses it
- `buyers/use-buyer-match.ts`
- `buyers/[id]/_components/{wishlist-tab, multi-picker, matched-tab, suggested-tab, send-dialog, match-labels}.tsx`
- `buyers/[id]/page.tsx` (tabs order: Details, Wishlist, Matched, Suggested, Contacts, Notes, Visit, Tasks, Files, Activity)
- `buyers/settings/_components/{match-weights-settings, url-pattern-settings}.tsx`, `settings/page.tsx` (tab `weights`; URL patterns under General)
- `_i18n/en.ts`
- **Wishlist:**
  - listing type checkboxes
  - Locations multi-picker (indented tree, search, any level) and Types multi-picker
  - min beds/baths (Any, 1–6+), budget from/to, build and plot min/max
  - features grouped by category as toggle chips
  - "Send matched properties to" buyer/agent/both
  - "Guessed from an enquiry" badge
  - save bar
- **Matched:**
  - the shared table + score badge + met/missed chips + "Suggested" badge, checkboxes, pagination
  - "Send selected" (send dialog) and "Add to Suggested"
  - empty states: no wishlist (link to the Wishlist tab), no matches
- **Suggested:**
  - add by reference
  - rows with photo/ref/title/price, status select, note, tour link, visit date (saved on blur/change), remove
  - tick + "Send selected", "Download PDF"
- **Send dialog:** recipients (default from `sendMatchesTo`), language (tenant languages, default buyer.language), message, preview iframe, Send. Hints when there is no URL pattern or no buyer/agent email.

### 9. Verify
- API jest (all) and the API + dashboard builds.
- API E2E `b-api.js`: settings round trip and bad pattern; wishlist save → guessed false; matches (must-haves exclude, score order, met/missed); suggestions add by id/ref/notFound/duplicate; update/delete; preview html (link, language es); send → status sent + activity; PDF bytes (`%PDF`, pages); agent visibility (404 on another agent's buyer); another tenant's suggestion → 404.
- Test data: extra tenant-2 listings (sale + rent + development, varied beds/sizes/features/towns) created by the E2E script through the dashboard property API, and deleted at the end.
- Puppeteer: edit wishlist + reload persists; Matched shows scores; tick 2 → Add to Suggested → Suggested tab lists them; status change persists; send dialog preview → Send → toast + status Sent + activity; PDF download is a non-empty response; settings weights save; properties page still renders the table.
- Update the handoff + memory. No commit.
