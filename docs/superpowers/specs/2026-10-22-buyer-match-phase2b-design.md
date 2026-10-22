# Buyer Match — Phase 2b technical design (I–K)

2026-10-22 · Client plan: https://claude.ai/code/artifact/6d33412a-752e-4673-ac7f-c5ae0ea0fa61 ("Phase 2 – Beyond Odoo", the rows not built in E–H).
Builds on Phase 1 and Phase 2 E–H (`2026-10-22-buyer-match-phase2-design.md`). In scope: I viewings & trips + agent daily email + agent home + hot buyers, J agency dashboard + housekeeping + two-factor login, K Facebook / Instagram lead forms. Phase 3 (AI) stays out, except the plan's "Hot buyer flag", which is simple rules and is needed by the agent email.

## Decisions (made while the user was deploying, 2026-10-22)

- **Trips and viewings are their own rows.** `buyer_trips` (a visiting period: from–to, notes) and `buyer_viewings` (date/time, property, agent, meeting point, status, feedback, buyer's interest 1–5). The record's "Visiting period" tab becomes **Trips & viewings**; `leads.visitStart/visitEnd` keep mirroring the next (or latest) trip, so the Odoo import, list filters and the stale rules keep working.
- **A viewing done** moves the property's timeline to `viewing` (E) and its suggestion status to `visited`, creating the suggestion when the property was never suggested. Feedback text is stored on the viewing and copied as an activity.
- **Reminders:** the agent of a viewing gets an email `viewingReminderMinutes` (default 60) before it. A BullMQ scheduler (`buyer-viewing-reminders`, every 5 min) claims each reminder with `UPDATE … SET reminderSentAt = NOW() WHERE reminderSentAt IS NULL` (no double email across the 2 pm2 processes).
- **Itinerary PDF** for the buyer, in their language: agency cover, trip dates, then day by day each viewing (time, property photo, title, place, price, meeting point, map link, agent contact). Rendered with the existing Puppeteer pool. "Email the itinerary" sends it as an attachment (SystemMailer gains `attachments`).
- **Hot buyers** = simple rules over the last 14 days, no AI: viewing request 5, like 3, enquiry / wishlist form 3, click 1, open 0.5 (opens capped at 2 points); hot at ≥ 6 (setting `hotScore`). Computed in SQL for the page of buyers shown (list badge, filter `?hot=1`, home, daily email); nothing stored.
- **Agent daily email** at `agentDigestTime` (default 07:30, agency time zone), once per agent per day (claim row in `buyer_alert_runs`, kind `agent:<userId>`): overdue + today's tasks, viewings today, buyers waiting for a reply, hot buyers, alerts waiting for approval. Waiting for a reply = the newest activity came from the buyer (enquiry, wishlist form, page feedback, viewing request) and no agent activity since, or the Odoo "Waiting for Reply" date has passed. Only agents with something to report get an email; each agent can switch it off (`users.buyerDigest`).
- **Agent home** = new first tab "My day" in the Buyers section: my pipeline (count per stage), tasks, viewings this week, waiting for reply, hot buyers, alerts to approve. Agents (role `user`) land on it from the sidebar; managers keep the list first and can pick an agent.
- **Agency dashboard** (managers): new buyers per source per month (last 12 months), funnel of buyers who reached each stage (from stage-change activities + current stage), results per agent (buyers, won, won value, conversion %, median first-response time), expected revenue = Σ deal value × stage probability. Stages get a `probability` % (editable; defaults spread by stage order, won 100, lost 0).
- **Merge duplicates:** a "Possible duplicates" list (same phone digits, or same first + last name) and a Merge action: the second buyer's suggestions, tasks, files, related agents, viewings, trips, sends, events and alerts move to the kept one (duplicates by property kept once, the furthest timeline wins), it gets `mergedIntoId` (the Phase 1 soft-merge), and both records log a `merge` activity + change. Nothing is deleted.
- **GDPR:** `leads.consentAt/consentSource` (set by the website forms, which already require privacy consent, and by hand); `leads.unsubscribedAt`. Every buyer email gets an unsubscribe link (signed token, like the tracking links); an unsubscribed buyer gets no selection or alert email (send → 400 `UNSUBSCRIBED`, alerts skipped) until an agent re-subscribes them. **Erase** (managers only, typed confirmation) anonymises the buyer and their contact (names, email, phone, address, ID, notes, answers, files, page code; activities' free text) and keeps the anonymous pipeline numbers.
- **CSV export:** managers, the current list filters, UTF-8 with BOM (Excel), one row per buyer with the main fields, wishlist in words and answers.
- **Two-factor login:** TOTP (RFC 6238, 30 s, 6 digits, SHA-1) implemented on Node `crypto` (no new npm package), secret encrypted at rest (AES-256-GCM, key from `JWT_SECRET` or `TWO_FACTOR_KEY`), QR from the existing `qrcode` package, 8 one-time recovery codes (bcrypt). Login: password OK + 2FA on → 401 `TWO_FACTOR_REQUIRED` until the request carries a valid `code`; 5 wrong codes → 15-minute lock. Agency setting `require2fa`: users without it get tokens marked `mfaSetup`, which the global JWT guard only lets through to `/api/auth/2fa/*`, `/api/auth/me` and logout; the dashboard sends them to the setup page. Super Admin impersonation is not affected.
- **Facebook / Instagram leads by polling, not webhooks:** a client gives a Page id and a long-lived Page access token (stored encrypted). Every 15 minutes a BullMQ job reads the page's lead forms and new leads through the Graph API (`META_GRAPH_URL`, default `https://graph.facebook.com/v21.0`) since the last seen lead time, and each lead goes through the website intake (one buyer per email, agent assignment, `enquiry`-style activity with every answer). Source `facebook` / `instagram` (by the lead's `platform`). A webhook needs a Meta app review per client; polling only needs the token. "Test connection" and "Import now" buttons. Without the client's real token this is tested against a fake Graph server.

### Decisions made while building (2026-10-22, see the plans i/j/k for detail)
- **2FA secret:** the existing `common/crypto/secret-cipher.ts` (`encryptedColumn`, AES-256-GCM) is reused instead of a new `secret-box.ts`. `users` already had unused `twoFactorSecret` (VARCHAR 100) + `twoFactorEnabled` from the first schema: the migration widens the secret column and reuses both; no `twoFactorEnabledAt`.
- **`require2fa` is a tenant column** (`tenants.require2fa`), not a Buyer Match setting: it guards every dashboard login, also for agencies without the add-on. Super Admin sets it on the client edit page (Features tab); the agency admin can switch it on under Profile & security once their own 2FA is on.
- **After setting up 2FA with an `mfaSetup` token the user logs in again** (no token upgrade route). The dashboard keeps such users on `/dashboard/profile`; the API refuses everything but `/api/auth/me` and `/api/auth/2fa/*`. Refresh keeps the flag. Impersonation tokens can't change the client's 2FA.
- **Unsubscribe link** = link token purpose `u` signing the buyer id; opening it only asks (mail scanners open links), the button POSTs. Unsubscribing also stops the contact's newsletters (`contacts.subscribed = 0`); subscribing again only restores property emails. A merged buyer's old link acts on the kept record; an erased buyer's link is dead.
- **Erase** also deletes the change history (`lead_changes`) of the buyer, because it holds old names/phones as text, and wipes viewing feedback, trip notes and suggestion notes. Tasks are kept. The contact email becomes `erased-<id>@erased.invalid` unless another buyer still uses it.
- **Merge** fills the kept buyer's empty fields from the merged one and appends its notes; the merged record's page link stops working.
- **Hot badge** sits next to the stage on cards (beside the name it squeezed long names).
- **Waiting for a reply** compares activity ids, not times (two activities in the same second).

## Data model (one migration per milestone)

### I — `1777290000000-BuyerMatchViewings`
- `buyer_trips`: `id, tenantId, leadId, startDate DATE, endDate DATE, notes TEXT, createdBy, createdAt, updatedAt`.
- `buyer_viewings`: `id, tenantId, leadId, tripId NULL (SET NULL), propertyId NULL (SET NULL), title VARCHAR(255) NULL (for a viewing of a property not in SPM), startsAt DATETIME, durationMin SMALLINT DEFAULT 60, agentId NULL, meetingPoint VARCHAR(500), status ENUM(planned, done, cancelled, no_show), feedback TEXT, interest TINYINT NULL (1–5), reminderSentAt DATETIME NULL, createdBy, createdAt, updatedAt`; index `(tenantId, startsAt)`.
- `users.buyerDigest TINYINT DEFAULT 1`.
- `lead_activities.type` + `viewing_planned`, `viewing_done`.

### J — `1777300000000-BuyerMatchHousekeeping`
- `buyer_stages.probability TINYINT NULL`.
- `leads.consentAt, consentSource VARCHAR(30), unsubscribedAt, erasedAt`.
- `users.twoFactorSecret VARCHAR(255) NULL, twoFactorEnabledAt, twoFactorRecovery JSON NULL, twoFactorFailures TINYINT DEFAULT 0, twoFactorLockedUntil DATETIME NULL`.
- `lead_activities.type` + `erase`, `unsubscribe`.

### K — `1777310000000-BuyerMatchMetaLeads`
- `leads.source` enum + `facebook`, `instagram`.
- `meta_lead_sources`: `id, tenantId UNIQUE, pageId, pageName, accessToken (encrypted), enabled, lastLeadAt, lastRunAt, lastError VARCHAR(500), createdAt, updatedAt`.
- `meta_leads`: `leadgenId VARCHAR(40) PK, tenantId, leadId NULL, createdAt` (never import twice).

### Settings (`BuyerMatchSettings`)
`viewingReminderMinutes` (0 = off), `agentDigestTime` ('HH:MM'), `hotScore`, `require2fa` (bool).

## Pure modules (TDD)

| File | What |
|---|---|
| `buyer/viewings/itinerary.ts` | groups viewings by day in the agency time zone; the itinerary HTML |
| `buyer/hot.ts` | `hotScore(counts)`, `isHot` |
| `buyer/digest/agent-digest.ts` | `waitingForReply(lastBuyerAt, lastAgentAt, waitingReplyAt, today)`, the agent email |
| `buyer/reports/reports.ts` | funnel from stage history, expected revenue, monthly buckets, median response |
| `buyer/housekeeping/duplicates.ts` | phone digits / name keys, grouping |
| `buyer/housekeeping/merge-plan.ts` | which child rows move, which collide and who wins |
| `buyer/housekeeping/csv.ts` | CSV escaping (incl. `=+-@` formula guard), BOM |
| `auth/two-factor/totp.ts` | base32, HOTP/TOTP (RFC 4226/6238 vectors), window ±1, recovery codes |
| `auth/two-factor/secret-box.ts` | AES-256-GCM encrypt/decrypt |
| `lead/meta/meta-lead.ts` | Graph lead → intake fields (email, names, phone, wishlist hints, answers) |

## API (dashboard routes: add-on `buyerMatch` + A1 visibility unless noted)

| Milestone | Routes |
|---|---|
| I | `GET/POST buyers/:id/trips`, `PUT/DELETE buyers/trips/:tid`, `GET buyers/:id/trips/:tid/itinerary.pdf?lang`, `POST …/itinerary/send`; `GET/POST buyers/:id/viewings`, `PUT/DELETE buyers/viewings/:vid`, `GET buyers/viewings?from&to&agentId` (calendar list); `GET buyers/home?agentId`; `PUT /api/dashboard/users/me/buyer-digest` |
| J | `GET buyers/reports?months` (admin); `GET buyers/duplicates`, `POST buyers/:id/merge {sourceId}` (admin); `PUT buyers/:id/consent`, `POST buyers/:id/unsubscribe|resubscribe`, `POST buyers/:id/erase {confirm}` (admin); `GET buyers/export.csv?…filters` (admin); public `GET /api/t/u/:token` (unsubscribe page); auth `GET/POST /api/auth/2fa/setup`, `POST /api/auth/2fa/enable {code}`, `POST /api/auth/2fa/disable {password, code}`, `POST /api/auth/2fa/recovery-codes`; login accepts `code` |
| K | `GET/PUT buyers/meta` (admin; token write-only), `POST buyers/meta/test`, `POST buyers/meta/import` |

## Dashboard
- Record: **Trips & viewings** tab (trips with their viewings, add/edit a viewing, mark done with feedback + interest, itinerary PDF / email). Hot badge on cards and the record header; "Hot" filter.
- Buyers sub-nav: **My day** (first), Buyers, Board, To do today, Alerts, **Reports** (managers), Settings, Import. Settings → General: reminder minutes, agent email time, hot threshold; Stages: probability %; new **Housekeeping** tab (duplicates + merge, CSV export); **Facebook & Instagram** tab.
- Record header menu: Unsubscribe / Re-subscribe, Consent, Erase.
- Account (all users): **Security** page with two-factor set-up (QR, code, recovery codes), off; login page asks for the code when needed. Super Admin client edit: "Require two-factor login".

## Testing
Jest for every pure module; API E2E per milestone (own data, cleaned up; Meta against a fake Graph server on a local port); puppeteer for every new screen + the login with 2FA; builds; one deploy package for I–K in the user's format.
