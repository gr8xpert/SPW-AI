# Buyer Match C — Website intake + wishlist form

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** every enquiry and every "email my favourites" (with a sender) lands on one buyer per email, assigned to an agent, with a guessed wishlist when the agent hasn't set one. A new `wishlist-form` block (any site, plus WP `[spm_wishlist_form]`) lets a visitor fill in their own wishlist, buyer questions and contact details. The buyer gets that exact wishlist, the agent gets a notice and the visitor gets a branded confirmation in the page language.

**Architecture:**
- API, `apps/api/src/modules/lead/buyer/`:
  - `buyer-intake.ts`: pure `guessWishlist`, `mergeGuess`, `pickRotationAgent`, `townOf` (unit-tested)
  - `buyer-intake.service.ts`: `BuyerIntakeService.upsertFromWebsite` (dedupe, assign, guess, log) and `submitWishlistForm`
  - `buyer-form-mail.ts` + `BuyerMailService.wishlistForm*`: the two emails
  - `buyer-public.controller.ts`: `GET /api/v1/buyer-questions`, `POST /api/v1/buyer-wishlist`
- `website-forms.controller.ts` calls the intake instead of `LeadService.create` (which goes).
- Widget: `components/wishlist-form/RsWishlistForm.tsx` + pickers exported from `RsLocation` / `RsPropertyType` / `RsFeatures`, `core/visitor-country.ts`, `useFacets` learns a "facets off" context.
- WP plugin 2.9.11: `[spm_wishlist_form]`.
- Dashboard: activity rows for enquiry / favourites / wishlist form / auto-assignment.

**Spec:** `docs/superpowers/specs/2026-10-21-buyer-match-phase1-design.md` (Website intake, Widget wishlist-form). The A1 plan's Global Constraints apply.

## Global Constraints
- Public routes: `x-api-key` → `findActiveWidgetTenantByApiKey`; `ApiKeyThrottlerGuard` 30/min on POST; reCAPTCHA through the same `requireRecaptcha` as the inquiry form (moved to `common/security/recaptcha.ts`). Never GET for writes. No add-on check (intake runs for every tenant).
- Class DTOs; the nested wishlist reuses B's `WishlistDto` with `@ValidateNested` + `@Type`. Dynamic `answers` is `@IsObject` and cleaned by `BuyerQuestionService.clean`.
- Responses never echo a stored buyer (`{ success: true }` only).
- Never `save()` a loaded lead to change an `*Id`; `update()` with the changed keys only.
- Widget labels all come from DEFAULT_LABELS (`wishlist_form_*`, new category `wishlist_form`, en/es/nl). Dashboard text in `buyers/_i18n/en.ts`.
- No migration needed (all columns/enums exist since A1). No commit.

## Decisions
- **Dedupe:** contact by email (lower-cased) → its unmerged lead. A lead exists → update; else create (source `widget_inquiry` for enquiries, `website` for favourites and the wishlist form; stage = default stage).
- **Fields on an existing buyer:** an enquiry fills only empty fields (phone, names). The wishlist form overwrites the contact fields it sends (names, phone, preferred contact, language), because the visitor typed them just now.
- **Assignment (new buyers only):**
  - `default` → `defaultAgentId` when that user is still active, else unassigned.
  - `round_robin` → active rotation agents; the one whose latest *auto* assignment is oldest (never-assigned first, in rotation order) wins. An empty rotation falls back to the default agent.
  - "Oldest" is the highest `lead_activities.id` per agent, not `createdAt`: the column has second precision, so buyers arriving in the same second all tied and went to the first agent (found by the 4-at-once E2E).
  - Nobody fits → unassigned (the managers see it in the list).
  - The pick and the `assignment` activity (`{from:null,to,auto:true,mode}`) run under MySQL `GET_LOCK('spm_buyer_rr_<tenant>', 5)` on one connection, so 2 pm2 processes can't hand two buyers to the same agent at once. No in-memory state.
- **Guess:** only when the buyer has no wishlist or a guessed one, and only from this tenant's properties named in the request.
  - listing types = the properties' (`sale|rent|holiday_rent|development`)
  - types = their property types
  - towns = each location walked up to level `town` (a location above town level stays as it is)
  - budget = min price × 0.8 … max(priceTo or price) × 1.2, rounded to whole units, priced listings only (POA / 0 skipped)
  - minBedrooms = the lowest bedrooms > 0
  - currency = the first property's, `guessed: true`
  - With an earlier guessed wishlist the two are merged (union of lists, the wider budget, the lower bedrooms), so enquiring about a villa and then an apartment keeps both.
- **Activities:**
  - enquiry → `enquiry` with `{propertyId, reference, title, source:'widget_inquiry', pageUrl}`, description = message
  - favourites → `enquiry` with `{kind:'favorites', propertyId:null, propertyIds, references, recipient, source:'website'}`, description = the visitor's message
  - wishlist form → `wishlist_form` with `{previousWishlist, wishlist, answers, pageUrl, language}`, description = the visitor's notes
  - guess → included in the enquiry's metadata as `guessedWishlist: true`
  - The 10-minute duplicate guard (`findRecentDuplicateInquiry`) stays as it is.
- **Wishlist form:**
  - The submitted wishlist replaces the old one (`guessed:false`), even an agent-edited one: it is the visitor's own.
  - Answers replace the answers to questions shown on the form; answers to other questions stay.
  - Visitor notes go in the activity, never over the agent's internal notes.
  - `found_us` fills an empty `referredBy` with the chosen option's label (English).
  - The same email submitting again within 2 minutes updates the buyer but sends no second pair of emails.
  - `privacyAccepted` must be `true` (400 otherwise).
- **Emails:**
  - The agent's notice goes to the assigned agent's email, else `inquiryNotificationEmails`. It is in English (the dashboard's language) and lists the wishlist in words plus a dashboard link to the buyer.
  - The visitor's confirmation uses the page `lang`, `wishlist_form_email_*` labels, client branding, and a summary of what they asked for (location / type / feature names in that language).
  - The memory fill in `BuyerMailService.labels` now covers `buyer_` and `wishlist_form_` keys.
  - Both are fire-and-forget after the response is decided (like the inquiry form).
- **Public questions:** `GET /api/v1/buyer-questions?lang` → `[{key, label, multiple, options:[{key,label}]}]`, active + showOnForm, labels resolved in `lang` → en → first. Seeds the defaults on first use (as the dashboard does).
- **Widget form:**
  - Sections: what you're looking for (listing type chips, locations, types, beds/baths min, budget from/to, build/plot min, features by category) → about you (buyer questions) → contact (first/last name, email, phone with country code, preferred contact, language, notes, privacy consent, reCAPTCHA) → submit.
  - Budget options = `config.priceOptions[firstPickedListingType || 'sale']`; beds/baths options = `config.bedroomOptions` / `bathroomOptions`; build/plot = fixed m² steps like RsBuiltArea/RsPlotSize use.
  - Listing types = the site's enabled ones (`config.enabledListingTypes` when present, as RsListingType does).
  - Language choices = the site's languages from config, else en/es/nl/de/fr.
  - Pickers render with `facets={false}`: no live counts, nothing hidden, no global filters touched.
  - Success replaces the form with the `wishlist_form_success` text.
- **Page setup:** when every block on the page is a form block (`wishlist-form`), no early search, no saved results peek and no first search run.
- **Built later (decided while building):**
  - The privacy line reuses the inquiry form's `inquiry_privacy_*` labels (one privacy URL per site). Listing type chips reuse `listing_type_*`.
  - The visitor's location / type / feature ids are checked against the tenant (a foreign id is dropped silently).
  - `LeadService.create` and `CreateLeadDto` are gone; the recaptcha / widget-key helpers moved to `lead/website-form-guard.ts`.
  - WP: `SPM_Page_Finder` matched any page containing `[spm_wishlist`, which would have made a `[spm_wishlist_form]` page "the wishlist page". The markers are now `[spm_wishlist]` and `[spm_wishlist ` (2.9.11).
  - The form's own state never touches `useFilters`; pickers inside it sit under `FacetsEnabled=false` (no facet request, no counts, nothing hidden).
  - Feature category headings show the stored category key (as the property page does); it isn't translated.

## Tasks

### 1. Pure intake logic (TDD)
**Files:** `buyer/buyer-intake.ts`, `buyer/buyer-intake.spec.ts`.
- `townOf(locationId, byId)`, `guessWishlist(props, townOf)`, `mergeGuess(old, next)`, `pickRotationAgent(rotation, lastAuto: Map<number, Date>)`.
- Specs: town walk (urbanization → town, area stays, cycle-safe), budget ×0.8/×1.2 with ranges and POA skipped, beds lowest > 0, empty input → null, merge union/widen, round-robin (never-assigned first, oldest next, order ties).

### 2. Intake service + website forms
**Files:** `buyer/buyer-intake.service.ts`, `website-forms.controller.ts`, `lead.service.ts` (drop `create`), `lead.module.ts`, `common/security/recaptcha.ts`.
- `upsertFromWebsite(tenant, {email, name?, phone?, message?, propertyIds[], source, kind, pageUrl?, recipient?})` → `{lead, created}`.
- Spec (`buyer-intake.service.spec.ts`, mocked repos): new buyer gets the default agent; an agent-edited wishlist is untouched; a guessed one is merged.

### 3. Public API: questions + wishlist form + emails
**Files:** `buyer/buyer-public.controller.ts`, `buyer/dto/buyer-public.dto.ts`, `buyer/buyer-form-mail.ts` (+ spec), `buyer/buyer-mail.service.ts`, `label/default-labels.ts` (+ `wishlist_form` category), dashboard `labels/page.tsx`.
- Labels (en/es/nl): title, intro, section headings, every field label/placeholder, options (any, call/email/whatsapp), submit/sending/success/error, privacy, email subject/heading/greeting/intro/summary rows/closing.

### 4. Widget
**Files:** `hooks/useFacets.ts` (context), `components/search/{RsLocation,RsPropertyType,RsFeatures}.tsx` (exported pickers), `core/visitor-country.ts` (moved `askVisitorCountry`), `components/detail/RsDetailInquiryForm.tsx`, `components/wishlist-form/RsWishlistForm.tsx`, `registry/component-registry.ts`, `index.ts` (form-only pages), `styles/components.css`, `types/labels.ts` if keys are typed, a test page `test-wishlist-form.html`.

### 5. WP plugin 2.9.11
**Files:** `apps/wordpress-plugin/spm/includes/class-spw-shortcode.php` (or wherever the shortcodes live), Blocks page, `spm.php`, `readme.txt`; `node scripts/build-wp-plugin.mjs`.

### 6. Dashboard
**Files:** `buyers/[id]/_components/activity-tab.tsx`, `_i18n/en.ts`, `use-buyers.ts` (types if needed).
- Enquiry: property ref + title (link to the property edit page) + message + page link. Favourites: the references + recipient. Wishlist form: "Filled in the wishlist form" + notes. Assignment with `auto` → "Assigned automatically to X (round-robin / default agent)".

### 7. Verify
- API jest (all); API, dashboard, widget builds.
- API E2E `c-api.js`: inquiry → new buyer (assigned, guessed wishlist, enquiry activity) · second inquiry → merged guess · agent-edited wishlist untouched · round-robin over 2 agents · favourites with sender → buyer + guess · buyer-questions (lang es) · wishlist form → exact wishlist, answers, contact fields, previous wishlist in metadata, referredBy · privacy false → 400 · nested bad value → 400 · GET on buyer-wishlist → 404/405 · tenant without the add-on still gets intake.
- Puppeteer: widget form on the test page (desktop + 390 px), submit → success, then the dashboard record shows the wishlist, answers and activity; activity tab rendering; guessed banner.
- WP harness: `[spm_wishlist_form]` renders the form.
