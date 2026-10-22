# Buyer Match — Phase 2 technical design (E–H)

2026-10-22 · Client plan: https://claude.ai/code/artifact/6d33412a-752e-4673-ac7f-c5ae0ea0fa61 ("Phase 2 – Beyond Odoo" + "The personal buyer page").
Builds on Phase 1 (`2026-10-21-buyer-match-phase1-design.md`, deployed 2026-10-21). In scope: E tracking + never send twice + change log, F personal buyer page, G near misses + reverse match, H new-listing alerts. Out of scope (later milestones): viewings/trips, agent daily email, agent home, agency dashboard, housekeeping, 2FA, Meta leads.

## Decisions (made while the user was away, 2026-10-22)

- **Timeline lives on `lead_suggestions`** (one row per buyer + property, as in Phase 1) as timestamps (`openedAt`, `clickedAt`, `likedAt`, `rejectedAt`, `viewingAt`, `offerAt`), plus an append-only `lead_suggestion_events` log for the per-property timeline. `status` stays and is kept in step (liked/viewing/offer → `interested`, rejected → `not_interested`), so Phase 1 screens keep working.
- **Opens are per email, clicks per property.** One email holds several properties, so an open marks every property in that email as opened. Apple Mail and some webmail clients pre-load images, so "Opened" can be early; clicks and buyer-page reactions are the reliable signals.
- **Tokens:** `<payload>.<mac>`, payload = base64url of the send id (+ property id for clicks), HMAC-SHA256 with a key derived from `JWT_SECRET` (`BUYER_LINK_SECRET` overrides), truncated to 128 bits. No email, name or tenant in a URL. Agent copies carry no pixel and plain links (agents' opens would pollute the buyer's timeline).
- **Never send twice:** properties already sent to the buyer, or rejected by them, are hidden from Matched and Near misses (a "Show all" toggle brings them back, marked). `POST send` skips them unless `allowResend` is set; the send dialog says how many were skipped and offers to include them.
- **Change log** is a separate table (`lead_changes`, one row per save with `[{field, from, to}]`), shown in a new History tab. Ids are stored with their display text at write time (stage, agent, places, types, features), so history stays readable after renames or deletes.
- **Buyer page code:** a random 16-character base62 code (~95 bits) per buyer in `leads.pageCode` (not a signed token), so the agent can switch it off (`pageEnabled`) or replace it. Created on the first send.
- **Buyer page address:** per-language setting `buyerPageUrls` (like `propertyUrlPatterns`); the code is appended as `?t=`. The WP plugin creates the page and reports its address; a reported page is used only when its host is the agency's own domain or websiteUrl (the report comes with the public widget key). With no address, links use the SPM fallback.
- **Fallback page on the API host:** `https://api.spw-ai.com/p/<code>`, server-rendered with the agency's logo and colour. spw-ai.com is a plain webroot with no app routing; the base is env `BUYER_PAGE_FALLBACK_BASE` (default `${API_URL}/p/`), so a later nginx rule can serve it as `spw-ai.com/p/<code>` without code changes.
- **Agent notices:** a viewing request emails the agent at once. Likes and rejects are batched: one email per buyer per 10 minutes (BuyerMatch BullMQ queue, delayed job with a dedupe id), so a buyer clicking through 8 properties sends one email.
- **Buyer page shows** every property sent to the buyer that is still live, newest first; sold or unpublished ones are left out.
- **Near misses** fail exactly one must-have by a little: budget (within `budgetPercent`, default 10 %) or place (a town within `nearbyKm`, default 10 km, of a wished place, using town coordinates; a sibling town under the same parent when coordinates are missing). Wish misses (bedrooms, bathrooms, sizes, features) are not near-miss reasons on their own: such properties are already in Matched with a lower score. Both lists now show readable reasons ("€15k over budget", "next town over: Benahavís", "1 bedroom short", "no Pool").
- **Reverse match** evaluates each buyer's wishlist against the one property in code (`wishlistAccepts`), mirroring the SQL must-haves, then scores the wishes. Buyers in a won/lost stage, merged rows and buyers without a wishlist are left out. "Send to all" uses the normal send flow per buyer, with the buyer's `sendMatchesTo`, and skips buyers who already got it.
- **Alerts are detected by a scan, not hooks:** every 10 minutes a BullMQ job compares live listings with `buyer_alert_prices` (the last price the scanner saw). That catches feed imports, manual creates and edits alike, with no in-memory state. The first scan for a tenant only records prices, so switching alerts on never floods the queue.
- **Alerts always wait for the agent** (client decision). Approve → sent in the next daily digest (default) or at once ("Send now", or delivery = instant). A price-drop alert may go out for a property sent before (the price is news), but never for a rejected one, and never twice for the same new price.
- **BullMQ:** one queue `buyer-match` with job schedulers `alert-scan` (every 10 min) and `alert-digest` (every 15 min), plus delayed `feedback-notice` jobs. Schedulers are upserted at boot (idempotent across the 2 pm2 processes). The digest runs once per tenant per day through an `INSERT IGNORE` claim row in `buyer_alert_runs`, at the tenant's `digestTime` in its `settings.timezone`.

## Data model

### E — migration `1777260000000-BuyerMatchTracking`
- `lead_suggestions` + `openedAt`, `clickedAt`, `likedAt`, `rejectedAt`, `rejectReason varchar(255)`, `viewingAt`, `offerAt` (all DATETIME NULL).
- `buyer_sends`: `id, tenantId, leadId, recipient enum(buyer, agent), kind enum(selection, alert), propertyIds JSON, lang, createdBy NULL, createdAt, openedAt, clickedAt`. One row per email delivered.
- `lead_suggestion_events`: `id, tenantId, leadId, propertyId, sendId NULL, event enum(sent, opened, clicked, liked, rejected, cleared, viewing, offer), source enum(email, page, agent, alert), userId NULL, note varchar(500), createdAt DATETIME(6)`; index `(leadId, propertyId, id)`.
- `lead_changes`: `id, tenantId, leadId, userId NULL, source enum(dashboard, website, import, system), changes JSON, createdAt DATETIME(6)`; index `(leadId, id)`.
- `lead_activities.type` + `buyer_feedback`, `viewing_request`, `alert_sent` (all of Phase 2 at once, so the send code shared by E and H compiles against one enum).

### F — migration `1777270000000-BuyerMatchPage`
- `leads` + `pageCode varchar(16) NULL UNIQUE`, `pageEnabled tinyint NOT NULL DEFAULT 1` (the UPDATE-free `ALTER` keeps `updatedAt`).

### H — migration `1777280000000-BuyerMatchAlerts`
- `buyer_alerts`: `id, tenantId, leadId, propertyId, kind enum(new_listing, price_drop), oldPrice, newPrice decimal(15,2), score, status enum(pending, approved, rejected, sent, skipped), dedupeKey varchar(80) UNIQUE, decidedBy, decidedAt, sentAt, sendId, createdAt, updatedAt`. `dedupeKey` = `lead:property:kind[:newPrice]`.
- `buyer_alert_prices`: `propertyId PK, tenantId, price decimal(15,2) NULL, seenAt`.
- `buyer_alert_runs`: `(tenantId, kind, day) PK` — the once-a-day digest claim.

### Settings (`BuyerMatchSettings`, no migration)
`buyerPageUrls: Record<'default'|lang, url>` (F) · `nearMiss: {enabled, budgetPercent 0–50, nearbyKm 0–100}` (G) · `alerts: {enabled false, delivery 'digest'|'instant', digestTime 'HH:MM', priceDropPercent 1–90}` (H). Written only through `PUT /buyers/settings`.

## Pure modules (TDD)

| File | What |
|---|---|
| `buyer/tracking/link-token.ts` | `signLinkToken(secret, {sendId, propertyId?})`, `verifyLinkToken` (constant-time, rejects tampered/short/garbage) |
| `buyer/tracking/timeline.ts` | `applyEvent(state, event)` → new timestamps; `stageOf(state)` (offer > viewing > liked/rejected > clicked > opened > sent > suggested); `statusAfter(status, event)` |
| `buyer/change-log.ts` | `diffFields(before, after, fields)` with value normalising (dates, decimals, id sets, JSON) |
| `buyer/near-miss.ts` | `nearMissOf(wishlist, listing, ctx, thresholds)` → one must-have miss with reason, or null; `wishReasons(missed, wishlist, listing)` |
| `buyer/reverse-match.ts` | `wishlistAccepts(wishlist, listing, ctx)` mirroring the SQL must-haves |
| `buyer/alerts/alert-rules.ts` | `priceDropOf(old, new, percent)`, `alertAllowed(kind, suggestion, existing)`, `digestDue(now, timezone, digestTime)` |

## API (all dashboard routes: add-on `buyerMatch` + A1 visibility)

| Milestone | Routes |
|---|---|
| E | `GET /buyers/:id/matches?all=1` (adds `hiddenCount`; hidden rows carry `hiddenReason`) · `POST /buyers/:id/send` gains `allowResend` and returns `skipped[]` · `GET /buyers/:id/suggestions/:sid/timeline` · `GET /buyers/:id/changes` · public `GET /api/t/o/:token` (1×1 gif, always 200) and `GET /api/t/c/:token` (302 to the property page, else the buyer page, else the agency website) |
| F | `GET/POST /buyers/:id/page` (status + link; actions `enable`, `disable`, `renew`) · public `GET /api/v1/buyer-page/:code?lang` · `POST /api/v1/buyer-page/:code/feedback {propertyId, action like|reject|clear|viewing, reason?, message?}` (30/min per IP; an `x-api-key` sent must belong to the same tenant) · `GET /p/:code` fallback HTML (`X-Robots-Tag: noindex, nofollow`, `Cache-Control: no-store`, `Referrer-Policy: no-referrer`) |
| G | `GET /buyers/:id/near-misses?page&all=1` · `GET /buyers/reverse/:propertyId` · `POST /buyers/reverse/:propertyId/send {leadIds}` |
| H | `GET /buyers/alerts?status&page` (+ `pendingCount`) · `POST /buyers/alerts/decide {ids, action approve|reject|send_now}` |

Every write path records changes: `BuyerService.update/setStage/setWishlist/setAnswers` (source dashboard), `BuyerIntakeService` (website), Odoo import (import).

## Email changes
- The buyer's copy gets a 1×1 pixel and every property link (and image) goes through `/api/t/c/<token>`; the agent's copy is unchanged.
- A **View my properties** button (`buyer_email_view_page`) under the list when the buyer's page is on (F).
- Alert emails reuse the same builder with `buyer_alert_*` wording (heading, intro, "Price reduced from X to Y").

## Widget `buyer-page` (F)
- `registerComponent('buyer-page', …)` → `components/buyer-page/RsBuyerPage.tsx`; reads `t` from the page URL, adds `<meta name="robots" content="noindex,nofollow">`, and runs no property search (`onlyFormBlocks` covers it).
- Cards link to the website's own property page (the widget's detail URL helper). Like / Not for me (+ optional reason) / Request a viewing (+ optional message); state shown and toggleable.
- Labels in a new `buyer_page` category (en/es/nl, the rest from translation memory), editable in Labels.

## WP plugin 2.9.12 (F)
`[spm_buyer_page]` shortcode; page type `buyer` ("My properties", slug `my-properties`) created by the page generator; `noindex` through `wp_robots`, left out of the sitemap and of page caches (it is personal). The Pages screen shows the address to paste into Buyer Match settings.

## Dashboard
- Record: **Matched** gets "Show all (N hidden)" + reason lines; **Near misses** tab (G); **Suggested** shows the timeline chips per property (Sent → Opened → Clicked → Liked/Rejected → Viewing → Offer, with dates; click for the full event list) and agent buttons for Viewing/Offer; a **Buyer page** card (copy, open, off/on, new link); **History** tab (change log).
- Send dialog: "N already sent were left out — include them" checkbox.
- Property edit page: "N buyers match this property" card + dialog with Send to all (G), only when the add-on is on.
- `/dashboard/buyers/alerts`: pending alerts grouped by buyer, Approve / Reject / Send now, bulk; sub-nav tab with the pending count (H).
- Settings: General gets "Buyer page address"; a new **Alerts & near misses** tab.

## Testing
- Jest specs for every pure module above, plus send skip rules and settings normalising.
- API E2E per milestone in the session scratchpad, creating and removing their own data.
- Puppeteer: dashboard screens (admin + agent), widget `buyer-page` at 1280 px and 390 px, fallback page, WP harness page.
- `pnpm build` for api, dashboard, widget. Nothing committed.
