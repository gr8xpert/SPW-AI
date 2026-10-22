# Buyer Match F — Personal buyer page

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** each buyer gets a private link, no login, to a page listing every property their agent sent them. On each one they can Like, choose "Not for me" (optional reason) or Request a viewing. Each click lands on the buyer record and the property timeline, and the agent is told. The page lives on the agency's own site (WP plugin page or `data-spm-widget="buyer-page"` snippet), with an SPM fallback page with the agency's branding. Emails get a "View my properties" button.

**Architecture:**
- API `apps/api/src/modules/lead/buyer/page/`:
  - `page-code.ts` (pure): `newPageCode()`, `validPageCode()`, `buyerPageLink(code, lang, settings, pluginUrl, fallbackBase)`
  - `buyer-page.service.ts`: code lifecycle, link, public view, feedback (timeline + activity + notice)
  - `buyer-page-notice.ts` (pure) + `buyer-page-mail.service.ts`: the agent's notice email (one per viewing request; batched likes/rejects)
  - `buyer-page.controller.ts`: `GET/POST api/dashboard/buyers/:id/page`
  - `buyer-page-public.controller.ts`: `GET api/v1/buyer-page/:code`, `POST api/v1/buyer-page/:code/feedback`, `GET p/:code` (fallback HTML)
  - `buyer-page-html.ts` (pure): the fallback page
  - `buyer-match.queue.ts` + `buyer-match.processor.ts`: queue `buyer-match`, job `feedback-notice`
- Migration `1777270000000-BuyerMatchPage`: `leads.pageCode`, `leads.pageEnabled`, `site_checkins.buyerPageUrl`.
- `PublicSyncMetaController` reads `x-spm-buyer-page`; `SiteCheckinService.record` stores it.
- Email: `BuyerMailInput.pageUrl` → "View my properties" button (`buyer_email_view_page`).
- Labels: `buyer_page_*` (category `buyer_page`, en/es/nl), dashboard Labels page category.
- Widget: `components/buyer-page/RsBuyerPage.tsx`, registered `buyer-page`, in `FORM_COMPONENTS` (no search).
- WP plugin 2.9.12: `[spm_buyer_page]`, page type `buyer`, noindex, no cache, not in sitemap, sends `x-spm-buyer-page`.
- Dashboard: Buyer page card on the record (Suggested tab top), General settings "Buyer page address".

**Spec:** `docs/superpowers/specs/2026-10-22-buyer-match-phase2-design.md` (F rows). E plan's Global Constraints apply.

## Global Constraints
- The page code is the only secret: 16 base62 characters from `crypto.randomBytes` (~95 bits; raised from 10 after a security review); codes are unique (unique index, retry on clash). Unknown, disabled or merged buyer → the same 404 `{code: 'PAGE_NOT_FOUND'}`; nothing tells a stranger whether a code ever existed.
- Public responses carry the buyer's first name only (no email, phone, notes, wishlist).
- Feedback only on properties that were sent to this buyer (`sentAt IS NOT NULL`); anything else → 404.
- Rate limits: the public routes use the default per-IP throttlers (no API key needed; the fallback page has none). Feedback also has `@Throttle({ default: { limit: 30, ttl: 60_000 } })`.
- An `x-api-key` sent with a public call must belong to the code's tenant (403 otherwise), so one agency's site can't show another's buyers.
- `noindex`: fallback sends `X-Robots-Tag: noindex, nofollow` + meta; widget adds the meta tag; WP page adds it through `wp_robots`.
- No add-on check on the public routes (links already sent keep working); the dashboard routes keep `buyerMatch`.

## Decisions
- **Link order:** `buyerPageUrls[lang]` → `buyerPageUrls.default` → the WP plugin's reported page (latest plugin check-in with a `buyerPageUrl`, seen in the last 30 days) → fallback `${BUYER_PAGE_FALLBACK_BASE || API_URL + '/p/'}<code>`. The code is added as `t=<code>` (kept with any query the address already has).
- **Code lifecycle:** made on the first send (any email to the buyer) or when the agent opens the card and clicks "Create link". `disable` keeps the code but the page answers 404; `enable` turns it back on; `renew` makes a new code (the old link dies). Each is logged in the change log (`pageEnabled`, `pageCode` shown as "new link").
- **What the page shows:** live (active + published) properties with `sentAt`, newest sent first, max 100; each with its reaction state. A property sold since is left out.
- **Feedback actions:** `like` → `liked`; `reject` (+reason ≤255) → `rejected`; `clear` → `cleared`; `viewing` (+message ≤1000) → `viewing`. All with source `page`. Activities: `buyer_feedback` {propertyId, reference, action, reason} for like/reject/clear; `viewing_request` {propertyId, reference, message} (counts as contact, so `lastContactAt` moves).
- **Notices:** viewing request → email at once to the assigned agent (else `inquiryNotificationEmails`), English (dashboard language), with the property, the buyer's message and a dashboard link. Likes/rejects → BullMQ job `feedback-notice`, jobId `fb-<leadId>-<10-minute window>`, delay to the window's end + 5 s, `removeOnComplete: true`; it emails the reactions logged in that window (none left → no email). Pure `noticeLines()` builds the text.
- **Fallback page:** server-rendered HTML in the buyer's language from the same labels, agency logo/colour/name, cards with photo, title, place, facts, price, a link to the property page (pattern) when there is one, and the three buttons. A small inline script posts feedback and updates the card. Disabled/unknown code → 404 page "This link is no longer active".
- **Widget block:** works on any page with `?t=`; no `t` or a dead code → a short "This link is not active" message (label). Cards link to the site's own property page (`buildPropertyUrl` with the API's `urlSegment` in the page language). Reasons: optional text box under "Not for me"; viewing: optional message box. Buttons show the current state and toggle (Liked again → clear).
- **WP plugin:** page type `buyer` ("My properties", slug `my-properties`, content `[spm_buyer_page]`); created with the other pages by the generator only when asked (Pages screen button "Create My properties page"), and listed in health. `wp_robots` noindex + `nocache_headers()` + `DONOTCACHEPAGE` on that page; excluded from the SPM sitemap. The page URL is sent as `x-spm-buyer-page` with sync-meta.
- **Email button:** on the buyer's copy only, when the page is enabled; tracked like a click? No — the button goes straight to the page link (the page itself records reactions; no click event for the page).

## Tasks

### Task 1: Pure parts (TDD)
- [ ] `page/page-code.spec.ts`: code shape/uniqueness over 1 000, validPageCode, buyerPageLink order (lang → default → plugin → fallback), existing query string kept, bad patterns ignored.
- [ ] `page/buyer-page-notice.spec.ts`: lines for like / reject with reason / clear, grouped per property, latest action wins.
- [ ] `page/buyer-page-html.spec.ts`: escapes buyer/property text, noindex meta, no email/phone of the buyer, buttons per card, empty state.

### Task 2: Migration + entity columns + check-in header
- [ ] `1777270000000-BuyerMatchPage.ts` (+ revert); `Lead.pageCode/pageEnabled`; `SiteCheckin.buyerPageUrl`.
- [ ] `SiteCheckinService.record(..., buyerPageUrl?)` (same host as the site, http(s), ≤500); sync-meta reads `x-spm-buyer-page`.

### Task 3: Service + routes
- [ ] `BuyerPageService`: `ensureCode`, `status`, `act`, `linkFor(tenant, lead, lang)`, `resolve(code, apiKey?)`, `view`, `feedback`.
- [ ] Dashboard + public controllers, registered before `BuyerController`.
- [ ] Queue `buyer-match` registered in LeadModule; `BuyerMatchProcessor` handles `feedback-notice`.
- [ ] `BuyerSendService.deliver`: ensure the code, pass `pageUrl` to the buyer's copy.
- [ ] Settings: `buyerPageUrls` (normalize + validate like URL patterns; no `{segment}` needed).

### Task 4: Labels + email button
- [ ] `buyer_page_*` + `buyer_email_view_page` labels (en/es/nl).
- [ ] `buildBuyerEmail` button; spec case.

### Task 5: Widget block
- [ ] `RsBuyerPage.tsx` + styles; registry + `FORM_COMPONENTS`; test page `test-buyer-page.html`.

### Task 6: WP plugin 2.9.12
- [ ] Shortcode, page type, finder marker, health line, robots/no-cache, sitemap exclusion, header, version bump + readme changelog; zip `dist/wordpress-plugin/spm-2.9.12.zip`.

### Task 7: Dashboard
- [ ] `buyer-page-card.tsx` on the record; activity rows for `buyer_feedback` / `viewing_request`; settings "Buyer page address" per language; Labels page category `buyer_page`.

### Task 8: Verify
- [ ] jest; API build + restart; `f-api.js` (codes, link order incl. plugin check-in, view, feedback rules, 404s, cross-tenant key 403, disable/renew, notices in the log, email button); puppeteer: dashboard card, widget page at 1280/390, fallback page at 390, WP harness page.
